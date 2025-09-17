// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    io::{BufRead, BufReader, Read, Write},
    path::{Path, PathBuf},
    process::{Child, ChildStdin, Command, Stdio},
    sync::Mutex,
};
use tauri::path::BaseDirectory;
use tauri::{AppHandle, Emitter, Manager, State};
use uuid::Uuid;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

// uv-based Python env helpers
#[derive(Deserialize, Clone)]
struct PyEnvInfo {
    #[serde(rename = "os")]
    _os: String,
    #[serde(rename = "uv")]
    uv: String,
    #[serde(rename = "lockPath")]
    lock_path: String,
    #[serde(rename = "venvHome")]
    venv_home: String,
    #[serde(rename = "venvPythonRel")]
    venv_python_rel: String,
    #[serde(rename = "stampPath")]
    _stamp_path: String,
    #[serde(rename = "pythonVersion")]
    python_version: String,
}

fn res(app: &AppHandle, p: &str) -> PathBuf {
    if Path::new(p).is_absolute() {
        PathBuf::from(p)
    } else {
        app.path()
            .resolve(p, BaseDirectory::Resource)
            .unwrap_or_else(|_| PathBuf::from(p))
    }
}

fn appdata_path(app: &AppHandle, rel: &str) -> PathBuf {
    app.path().app_data_dir().expect("app_data_dir").join(rel)
}

#[cfg(windows)]
use std::os::windows::process::CommandExt;
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

fn no_window(cmd: &mut Command) {
    #[cfg(windows)]
    {
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
}

#[tauri::command]
async fn py_env_python_path_uv(app: AppHandle, payload: PyEnvInfo) -> Result<String, String> {
    let venv = appdata_path(&app, &payload.venv_home).join(&payload.venv_python_rel);
    Ok(venv.to_string_lossy().into_owned())
}

#[tauri::command]
async fn py_env_setup_uv(app: AppHandle, payload: PyEnvInfo) -> Result<(), String> {
    let uv = res(&app, &payload.uv);
    let lock = res(&app, &payload.lock_path);
    let venv_dir = appdata_path(&app, &payload.venv_home);
    std::fs::create_dir_all(&venv_dir).map_err(|e| e.to_string())?;

    // 1) uv venv <venv_dir> --python <version>
    let mut cmd1 = Command::new(&uv);
    cmd1.arg("venv")
        .arg(&venv_dir)
        .arg("--python")
        .arg(&payload.python_version)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    no_window(&mut cmd1);
    let mut child1 = cmd1.spawn().map_err(|e| format!("spawn uv venv: {}", e))?;
    pipe_logs(&app, child1.stdout.take().unwrap(), "uv:log");
    pipe_logs(&app, child1.stderr.take().unwrap(), "uv:err");
    let st1 = child1.wait().map_err(|e| e.to_string())?;
    if !st1.success() {
        return Err("uv venv failed".into());
    }

    // 2) uv pip install --python <venv_py> -r requirements.lock --upgrade --no-deps
    let venv_py = venv_dir.join(&payload.venv_python_rel);
    let mut cmd2 = Command::new(&uv);
    cmd2.arg("pip")
        .arg("install")
        .arg("--python")
        .arg(&venv_py)
        .arg("-r")
        .arg(&lock)
        .arg("--upgrade")
        .arg("--no-deps")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    no_window(&mut cmd2);
    let mut child2 = cmd2.spawn().map_err(|e| format!("spawn uv pip: {}", e))?;
    pipe_logs(&app, child2.stdout.take().unwrap(), "uv:log");
    pipe_logs(&app, child2.stderr.take().unwrap(), "uv:err");
    let st2 = child2.wait().map_err(|e| e.to_string())?;
    if !st2.success() {
        return Err("uv pip install failed".into());
    }
    Ok(())
}

// Pipe stdout/stderr from child processes to Tauri events
fn pipe_logs<R: Read + Send + 'static>(app: &AppHandle, stream: R, ch: &'static str) {
    let app2 = app.clone();
    tauri::async_runtime::spawn(async move {
        let r = BufReader::new(stream);
        for l in r.lines() {
            if let Ok(s) = l {
                let _ = app2.emit(ch, s);
            }
        }
    });
}

// Python sidecar: spawn process and handle IO

struct ProcState(Mutex<HashMap<String, (Child, Option<ChildStdin>)>>);

#[derive(Serialize, Deserialize)]
struct SpawnArgs {
    entry: String,
    args: Vec<String>,
}

#[tauri::command]
async fn ext_spawn_sidecar(
    app: AppHandle,
    payload: SpawnArgs,
    state: State<'_, ProcState>,
) -> Result<String, String> {
    let exe = if Path::new(&payload.entry).is_absolute() {
        PathBuf::from(&payload.entry)
    } else {
        res(&app, &payload.entry)
    };

    // If args contain an absolute path to a script, use its parent as cwd
    let mut cmd = Command::new(exe);
    let mut cwd: Option<PathBuf> = None;
    for a in &payload.args {
        cmd.arg(a);
        if a.ends_with(".py") {
            let p = if Path::new(a).is_absolute() {
                PathBuf::from(a)
            } else {
                res(&app, a)
            };
            cwd = p.parent().map(|x| x.to_path_buf());
        }
    }
    if let Some(dir) = cwd {
        cmd.current_dir(dir);
    }
    no_window(&mut cmd);
    let mut child = cmd
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;

    let id = Uuid::new_v4().to_string();
    let stdout = child.stdout.take().ok_or("no stdout")?;
    let stderr = child.stderr.take().ok_or("no stderr")?;
    let stdin = child.stdin.take();

    // stdout -> ext:stdout
    {
        let app2 = app.clone();
        let id2 = id.clone();
        tauri::async_runtime::spawn(async move {
            let reader = BufReader::new(stdout);
            for line in reader.lines() {
                match line {
                    Ok(s) => {
                        let _ = app2.emit(
                            "ext:stdout",
                            serde_json::json!({"id": id2, "line": s}).to_string(),
                        );
                    }
                    Err(_) => break,
                }
            }
            let _ = app2.emit("ext:exit", serde_json::json!({"id": id2}).to_string());
        });
    }

    // ★ stderr -> ext:stderr
    {
        let app2 = app.clone();
        let id2 = id.clone();
        tauri::async_runtime::spawn(async move {
            let reader = BufReader::new(stderr);
            for line in reader.lines() {
                if let Ok(s) = line {
                    let _ = app2.emit(
                        "ext:stderr",
                        serde_json::json!({"id": id2, "line": s}).to_string(),
                    );
                } else {
                    break;
                }
            }
        });
    }

    state.0.lock().unwrap().insert(id.clone(), (child, stdin));
    Ok(id)
}

#[tauri::command]
async fn ext_stdin(id: String, data: String, state: State<'_, ProcState>) -> Result<(), String> {
    if let Some((_child, optin)) = state.0.lock().unwrap().get_mut(&id) {
        if let Some(stdin) = optin {
            stdin
                .write_all(data.as_bytes())
                .map_err(|e| e.to_string())?;
            stdin.flush().map_err(|e| e.to_string())?;
            Ok(())
        } else {
            Err("no stdin".into())
        }
    } else {
        Err("not found".into())
    }
}

#[tauri::command]
async fn ext_kill(app: AppHandle, id: String, state: State<'_, ProcState>) -> Result<(), String> {
    if let Some((mut child, _)) = state.0.lock().unwrap().remove(&id) {
        let _ = child.kill();
        let _ = app.emit("ext:exit", serde_json::json!({"id": id}).to_string());
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_fs::init())
        .manage(ProcState(Mutex::new(HashMap::new())))
        .invoke_handler(tauri::generate_handler![
            greet,
            // uv + env
            py_env_python_path_uv,
            py_env_setup_uv,
            // python sidecar
            ext_spawn_sidecar,
            ext_stdin,
            ext_kill
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
