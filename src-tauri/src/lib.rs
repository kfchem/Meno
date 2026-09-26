// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    io::{BufRead, BufReader, Read, Write},
    path::{Component, Path, PathBuf},
    process::{Child, ChildStdin, Command, Stdio},
    sync::{Mutex, MutexGuard, PoisonError},
};
use tauri::path::BaseDirectory;
use tauri::{AppHandle, Emitter, Manager, RunEvent, State};
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

// The webview supplies every path these commands use, so each one is checked
// here: the uv binary must be the bundled one, lock files must be bundled
// resources, venvs must live under the app data dir, and sidecars may only run
// a venv's Python on a bundled worker script. See docs/ARCHITECTURE.md.

/// The bundled uv binary, relative to the resource dir.
const UV_REL: &str = if cfg!(windows) {
    "resources/py/uv.exe"
} else {
    "resources/py/uv"
};
/// Python interpreter file names a sidecar may be started with.
const PYTHON_NAMES: &[&str] = &["python", "python3", "python.exe"];
/// Interpreter flags allowed before the worker script.
const PYTHON_FLAGS: &[&str] = &["-u", "-B"];

/// Parse `p` as a path relative to some base directory, rejecting anything
/// that could escape it: absolute paths, drive/UNC prefixes, `.` and `..`.
fn safe_relative(p: &str) -> Result<PathBuf, String> {
    if p.is_empty() {
        return Err("empty path".into());
    }
    let mut out = PathBuf::new();
    for c in Path::new(p).components() {
        match c {
            Component::Normal(s) => out.push(s),
            _ => return Err(format!("path must be relative without '..': {p}")),
        }
    }
    Ok(out)
}

fn valid_python_version(v: &str) -> bool {
    !v.is_empty()
        && v.len() <= 16
        && v.split('.')
            .all(|part| !part.is_empty() && part.bytes().all(|b| b.is_ascii_digit()))
}

/// `PyEnvInfo` paths after validation; all relative to their base directory.
#[derive(Debug)]
struct ValidatedEnv {
    uv: PathBuf,
    lock: PathBuf,
    venv_home: PathBuf,
    venv_python_rel: PathBuf,
}

fn validate_env_info(info: &PyEnvInfo) -> Result<ValidatedEnv, String> {
    let uv = safe_relative(&info.uv)?;
    if uv.as_path() != Path::new(UV_REL) {
        return Err(format!("unexpected uv path: {}", info.uv));
    }
    let lock = safe_relative(&info.lock_path)?;
    if !lock.starts_with("resources/py")
        || lock.extension().and_then(|e| e.to_str()) != Some("lock")
    {
        return Err(format!("unexpected lock file: {}", info.lock_path));
    }
    let venv_home = safe_relative(&info.venv_home)?;
    if !venv_home.starts_with("uv") || venv_home.as_path() == Path::new("uv") {
        return Err(format!("unexpected venv location: {}", info.venv_home));
    }
    let venv_python_rel = safe_relative(&info.venv_python_rel)?;
    if !valid_python_version(&info.python_version) {
        return Err(format!("invalid Python version: {}", info.python_version));
    }
    Ok(ValidatedEnv {
        uv,
        lock,
        venv_home,
        venv_python_rel,
    })
}

/// Check a sidecar request: `entry` must be a Python interpreter inside
/// `venv_root`, and `args` must be allowed interpreter flags followed by a
/// `.py` script inside `workers_root` (arguments after the script are passed
/// to it untouched). Both roots must already be canonical. Returns the
/// script's directory, used as the working directory.
fn validate_sidecar(
    entry: &Path,
    args: &[String],
    venv_root: &Path,
    workers_root: &Path,
) -> Result<PathBuf, String> {
    let name = entry.file_name().and_then(|n| n.to_str()).unwrap_or("");
    if !entry.is_absolute() || !PYTHON_NAMES.contains(&name) {
        return Err("sidecar entry must be a Python interpreter path".into());
    }
    // Canonicalize the directory, not the file: a venv's bin/python is
    // usually a symlink to the base interpreter outside the venv.
    let entry_dir = entry
        .parent()
        .ok_or("sidecar entry has no parent directory")?
        .canonicalize()
        .map_err(|e| format!("sidecar entry: {e}"))?;
    if !entry_dir.starts_with(venv_root) {
        return Err("sidecar entry must be inside the app's Python environments".into());
    }

    let script = args
        .iter()
        .find(|a| !PYTHON_FLAGS.contains(&a.as_str()))
        .ok_or("sidecar needs a worker script")?;
    let script = Path::new(script);
    let is_py = script.extension().and_then(|e| e.to_str()) == Some("py");
    if !script.is_absolute() || !is_py {
        return Err("sidecar script must be an absolute path to a .py file".into());
    }
    let canonical = script
        .canonicalize()
        .map_err(|e| format!("sidecar script: {e}"))?;
    if !canonical.starts_with(workers_root) {
        return Err("sidecar script must be one of the bundled workers".into());
    }
    script
        .parent()
        .map(Path::to_path_buf)
        .ok_or_else(|| "sidecar script has no parent directory".into())
}

fn resource_path(app: &AppHandle, rel: &Path) -> Result<PathBuf, String> {
    app.path()
        .resolve(rel, BaseDirectory::Resource)
        .map_err(|e| format!("resolve resource {}: {e}", rel.display()))
}

fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| format!("app data dir: {e}"))
}

#[cfg(windows)]
use std::os::windows::process::CommandExt;
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[cfg(windows)]
fn no_window(cmd: &mut Command) {
    cmd.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(windows))]
fn no_window(_cmd: &mut Command) {}

#[tauri::command]
async fn py_env_python_path_uv(app: AppHandle, payload: PyEnvInfo) -> Result<String, String> {
    let env = validate_env_info(&payload)?;
    let venv = app_data_dir(&app)?
        .join(&env.venv_home)
        .join(&env.venv_python_rel);
    Ok(venv.to_string_lossy().into_owned())
}

/// A command running the bundled `uv`, with everything it keeps - the Python
/// it downloads, its cache - under the app's own data directory rather than
/// the user's, and deaf to any uv settings of the user's: Meno's environments
/// are Meno's, and removing the app's data removes them.
fn uv_command(uv: &Path, data: &Path) -> Command {
    let mut cmd = Command::new(uv);
    cmd.env("UV_PYTHON_INSTALL_DIR", data.join("uv").join("python"))
        .env("UV_CACHE_DIR", data.join("uv").join("cache"))
        .env("UV_PYTHON_PREFERENCE", "only-managed")
        .env("UV_NO_CONFIG", "1");
    cmd
}

#[tauri::command]
async fn py_env_setup_uv(app: AppHandle, payload: PyEnvInfo) -> Result<(), String> {
    let env = validate_env_info(&payload)?;
    let uv = resource_path(&app, &env.uv)?;
    let lock = resource_path(&app, &env.lock)?;
    let data = app_data_dir(&app)?;
    let venv_dir = data.join(&env.venv_home);
    std::fs::create_dir_all(&venv_dir).map_err(|e| e.to_string())?;

    // 1) uv venv <venv_dir> --python <version>
    let mut cmd1 = uv_command(&uv, &data);
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
    let venv_py = venv_dir.join(&env.venv_python_rel);
    let mut cmd2 = uv_command(&uv, &data);
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

// Pipe stdout/stderr from child processes to Tauri events. Reading is
// blocking, so it runs on a dedicated OS thread rather than an async worker
// (which it would otherwise tie up for the lifetime of the child).
fn pipe_logs<R: Read + Send + 'static>(app: &AppHandle, stream: R, ch: &'static str) {
    let app2 = app.clone();
    std::thread::spawn(move || {
        for s in BufReader::new(stream).lines().map_while(Result::ok) {
            let _ = app2.emit(ch, s);
        }
    });
}

// Python sidecar: spawn process and handle IO

type Procs = HashMap<String, (Child, Option<ChildStdin>)>;

struct ProcState(Mutex<Procs>);

impl ProcState {
    /// Lock the process table. A panic while the lock was held cannot leave
    /// the map inconsistent, so recover from poisoning instead of panicking
    /// on every later call.
    fn lock(&self) -> MutexGuard<'_, Procs> {
        self.0.lock().unwrap_or_else(PoisonError::into_inner)
    }

    /// Remove a sidecar, kill it if it is still running and wait for it so
    /// no process handle is leaked. Returns false if it was already gone.
    fn reap(&self, id: &str) -> bool {
        let entry = self.lock().remove(id);
        match entry {
            Some((mut child, stdin)) => {
                drop(stdin);
                let _ = child.kill();
                let _ = child.wait();
                true
            }
            None => false,
        }
    }

    fn kill_all(&self) {
        let all: Vec<_> = self.lock().drain().collect();
        for (_, (mut child, _)) in all {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

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
    let venv_root = app_data_dir(&app)?
        .join("uv")
        .canonicalize()
        .map_err(|_| "the Python environment is not set up".to_string())?;
    let workers_root = resource_path(&app, Path::new("resources/workers"))?
        .canonicalize()
        .map_err(|e| format!("worker directory: {e}"))?;
    let entry = PathBuf::from(&payload.entry);
    let cwd = validate_sidecar(&entry, &payload.args, &venv_root, &workers_root)?;

    let mut cmd = Command::new(&entry);
    cmd.args(&payload.args).current_dir(cwd);
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
    // Register before the reader threads start so an immediate exit can be
    // reaped.
    state.lock().insert(id.clone(), (child, stdin));

    // stdout -> ext:stdout; EOF means the sidecar is gone: reap it, then
    // announce the exit (unless ext_kill already did).
    {
        let app2 = app.clone();
        let id2 = id.clone();
        std::thread::spawn(move || {
            for s in BufReader::new(stdout).lines().map_while(Result::ok) {
                let _ = app2.emit(
                    "ext:stdout",
                    serde_json::json!({"id": id2, "line": s}).to_string(),
                );
            }
            if app2.state::<ProcState>().reap(&id2) {
                let _ = app2.emit("ext:exit", serde_json::json!({"id": id2}).to_string());
            }
        });
    }

    // stderr -> ext:stderr
    {
        let app2 = app.clone();
        let id2 = id.clone();
        std::thread::spawn(move || {
            for s in BufReader::new(stderr).lines().map_while(Result::ok) {
                let _ = app2.emit(
                    "ext:stderr",
                    serde_json::json!({"id": id2, "line": s}).to_string(),
                );
            }
        });
    }

    Ok(id)
}

#[tauri::command]
async fn ext_stdin(id: String, data: String, state: State<'_, ProcState>) -> Result<(), String> {
    if let Some((_child, optin)) = state.lock().get_mut(&id) {
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
    if state.reap(&id) {
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
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            // Don't leave Python sidecars running after the window closes.
            if let RunEvent::Exit = event {
                app.state::<ProcState>().kill_all();
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn uv_keeps_its_python_and_cache_under_the_app_data() {
        let data = Path::new("/data/Meno");
        let cmd = uv_command(Path::new("/app/uv"), data);
        let envs: HashMap<_, _> = cmd
            .get_envs()
            .map(|(k, v)| (k.to_owned(), v.map(|v| v.to_owned())))
            .collect();
        let get = |k: &str| envs.get(std::ffi::OsStr::new(k)).cloned().flatten();
        let under = |leaf: &str| Some(data.join("uv").join(leaf).into_os_string());
        assert_eq!(get("UV_PYTHON_INSTALL_DIR"), under("python"));
        assert_eq!(get("UV_CACHE_DIR"), under("cache"));
        assert_eq!(get("UV_PYTHON_PREFERENCE"), Some("only-managed".into()));
        assert_eq!(get("UV_NO_CONFIG"), Some("1".into()));
    }

    fn env_info(uv: &str, lock: &str, venv: &str, py: &str) -> PyEnvInfo {
        PyEnvInfo {
            _os: String::new(),
            uv: uv.into(),
            lock_path: lock.into(),
            venv_home: venv.into(),
            venv_python_rel: if cfg!(windows) {
                "Scripts/python.exe".into()
            } else {
                "bin/python".into()
            },
            _stamp_path: String::new(),
            python_version: py.into(),
        }
    }

    const LOCK: &str = "resources/py/requirements.console.lock";

    #[test]
    fn safe_relative_rejects_escapes() {
        assert!(safe_relative("uv/console/venv").is_ok());
        for bad in ["", "../x", "uv/../../x", "./x", "/etc/passwd"] {
            assert!(safe_relative(bad).is_err(), "{bad} should be rejected");
        }
        if cfg!(windows) {
            for bad in [
                r"C:\Windows\System32\cmd.exe",
                r"uv\..\..\x",
                r"\\server\share",
            ] {
                assert!(safe_relative(bad).is_err(), "{bad} should be rejected");
            }
        }
    }

    #[test]
    fn python_version_format() {
        assert!(valid_python_version("3.12"));
        assert!(valid_python_version("3.12.4"));
        for bad in ["", "3.", ".12", "3.12; rm -rf /", "latest", "3..12"] {
            assert!(!valid_python_version(bad), "{bad} should be rejected");
        }
    }

    #[test]
    fn env_info_accepts_the_frontend_payload() {
        let env = validate_env_info(&env_info(UV_REL, LOCK, "uv/console/venv", "3.12"))
            .expect("frontend payload must validate");
        assert_eq!(env.venv_home, Path::new("uv/console/venv"));
        assert!(validate_env_info(&env_info(
            UV_REL,
            "resources/py/requirements.lock",
            "uv/node/venv",
            "3.12"
        ))
        .is_ok());
    }

    #[test]
    fn env_info_rejects_foreign_paths() {
        let cases = [
            env_info(
                "C:/Windows/System32/cmd.exe",
                LOCK,
                "uv/console/venv",
                "3.12",
            ),
            env_info("/bin/sh", LOCK, "uv/console/venv", "3.12"),
            env_info("resources/py/../../evil", LOCK, "uv/console/venv", "3.12"),
            env_info(UV_REL, "resources/py/notes.txt", "uv/console/venv", "3.12"),
            env_info(UV_REL, "../outside.lock", "uv/console/venv", "3.12"),
            env_info(UV_REL, LOCK, "../../elsewhere", "3.12"),
            env_info(UV_REL, LOCK, "uv", "3.12"),
            env_info(UV_REL, LOCK, "other/venv", "3.12"),
            env_info(UV_REL, LOCK, "uv/console/venv", "3.12 --index-url x"),
        ];
        for info in &cases {
            assert!(
                validate_env_info(info).is_err(),
                "should reject uv={} lock={} venv={} py={}",
                info.uv,
                info.lock_path,
                info.venv_home,
                info.python_version
            );
        }
    }

    /// Temporary tree: <root>/uv/console/venv/<bin>/python, <root>/workers/w.py
    /// and look-alikes outside both roots.
    struct Sandbox {
        root: PathBuf,
    }

    impl Sandbox {
        fn new() -> Self {
            let root = std::env::temp_dir().join(format!("meno-test-{}", Uuid::new_v4()));
            let bin = if cfg!(windows) { "Scripts" } else { "bin" };
            for dir in [
                format!("uv/console/venv/{bin}"),
                "workers".into(),
                "outside".into(),
            ] {
                fs::create_dir_all(root.join(dir)).unwrap();
            }
            for file in [
                format!("uv/console/venv/{bin}/python"),
                format!("uv/console/venv/{bin}/cmd.exe"),
                "workers/w.py".into(),
                "outside/python".into(),
                "outside/evil.py".into(),
            ] {
                fs::write(root.join(file), "").unwrap();
            }
            Sandbox {
                root: root.canonicalize().unwrap(),
            }
        }

        fn p(&self, rel: &str) -> PathBuf {
            self.root.join(rel)
        }

        fn python(&self) -> PathBuf {
            self.p(if cfg!(windows) {
                "uv/console/venv/Scripts/python"
            } else {
                "uv/console/venv/bin/python"
            })
        }

        fn check(&self, entry: &Path, args: &[&str]) -> Result<PathBuf, String> {
            let args: Vec<String> = args.iter().map(|s| s.to_string()).collect();
            validate_sidecar(entry, &args, &self.p("uv"), &self.p("workers"))
        }
    }

    impl Drop for Sandbox {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.root);
        }
    }

    #[test]
    fn sidecar_accepts_venv_python_on_bundled_worker() {
        let sb = Sandbox::new();
        let worker = sb.p("workers/w.py");
        let worker = worker.to_str().unwrap();
        let cwd = sb.check(&sb.python(), &["-u", worker, "--script-arg"]);
        assert_eq!(cwd, Ok(sb.p("workers")));
    }

    #[test]
    fn sidecar_rejects_other_executables_and_scripts() {
        let sb = Sandbox::new();
        let worker = sb.p("workers/w.py");
        let worker = worker.to_str().unwrap();
        let evil = sb.p("outside/evil.py");
        let evil = evil.to_str().unwrap();
        let cmd = sb.python().with_file_name("cmd.exe");

        // interpreter outside the venv root, or not an interpreter at all
        assert!(sb.check(&sb.p("outside/python"), &["-u", worker]).is_err());
        assert!(sb.check(&cmd, &["-u", worker]).is_err());
        assert!(sb.check(Path::new("python"), &["-u", worker]).is_err());
        // script outside the workers root, missing, or not a script
        assert!(sb.check(&sb.python(), &["-u", evil]).is_err());
        assert!(sb.check(&sb.python(), &["-u"]).is_err());
        assert!(sb.check(&sb.python(), &["-c", "import os"]).is_err());
        assert!(sb.check(&sb.python(), &["-m", "http.server"]).is_err());
        // traversal out of the workers dir
        let traversal = sb.p("workers/../outside/evil.py");
        assert!(sb
            .check(&sb.python(), &["-u", traversal.to_str().unwrap()])
            .is_err());
    }

    #[test]
    fn reap_removes_and_reports_once() {
        let state = ProcState(Mutex::new(HashMap::new()));
        let child = if cfg!(windows) {
            Command::new("cmd").args(["/C", "exit 0"]).spawn()
        } else {
            Command::new("true").spawn()
        }
        .expect("spawn a trivial process");
        state.lock().insert("a".into(), (child, None));
        assert!(state.reap("a"));
        assert!(!state.reap("a"));
        assert!(state.lock().is_empty());
    }
}
