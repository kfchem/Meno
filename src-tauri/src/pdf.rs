//! PDFs (docs/PDF.md): PDFium, in a process of its own.
//!
//! A PDF a workspace holds is kept in Meno's cache, `pdf/<sha256>.pdf`,
//! known by its SHA-256 - written there once, when it is first held - and a
//! workspace's file keeps its bytes (`pdf_bytes`). Meno's executable
//! started as `--pdf <cache>` is the reader: it binds PDFium, opens a PDF
//! from the cache the first time it is asked about it, takes requests a
//! line of JSON each on its standard input, and answers on its standard
//! output, each answer a frame - its JSON, then its bytes: a part of a
//! page drawn, RGBA as a WebGL texture takes it, or that picture as a PNG.
//! Meno starts the reader the first time a PDF is wanted, and starts it
//! again if it has gone: a PDF that breaks PDFium breaks the reader alone.
use pdfium_render::prelude::*;
use serde::Serialize;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Instant;
use tauri::Manager;

pub const PDF_FLAG: &str = "--pdf";

/// The most a PDF held may come to, as a workspace's file holds any one file.
const MOST: u64 = 1024 * 1024 * 1024;

/// Where PDFium's library is: inside the app on a Mac, among Meno's
/// resources beside the program on Windows and Linux - or, built for
/// development, where the build fetched it (scripts/fetch-pdfium.mjs).
fn library_dir() -> PathBuf {
    let exe = std::env::current_exe().unwrap_or_default();
    let beside = exe.parent().map(|p| p.to_path_buf()).unwrap_or_default();
    let system = if cfg!(target_os = "macos") { "macos" } else if cfg!(windows) { "windows" } else { "linux" };
    let bundled = if cfg!(target_os = "macos") { beside.join("../Frameworks") } else { beside.join("pdfium").join(system) };
    for dir in [bundled, beside.clone()] {
        if dir.join(Pdfium::pdfium_platform_library_name()).exists() {
            return dir;
        }
    }
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("pdfium").join(system)
}

/// Meno started as the PDF reader: that, and nothing else.
pub fn pdf_mode() -> Option<i32> {
    let mut args = std::env::args_os().skip(1);
    if args.next()? != PDF_FLAG {
        return None;
    }
    Some(run_reader(&PathBuf::from(args.next()?)))
}

fn write_frame(out: &mut impl Write, head: &Value, bytes: &[u8]) -> std::io::Result<()> {
    let head = serde_json::to_vec(head).unwrap_or_default();
    out.write_all(&(head.len() as u32).to_le_bytes())?;
    out.write_all(&head)?;
    out.write_all(&(bytes.len() as u32).to_le_bytes())?;
    out.write_all(bytes)?;
    out.flush()
}

fn read_frame(r: &mut impl Read) -> std::io::Result<(Value, Vec<u8>)> {
    let mut n = [0u8; 4];
    r.read_exact(&mut n)?;
    let mut head = vec![0u8; u32::from_le_bytes(n) as usize];
    r.read_exact(&mut head)?;
    r.read_exact(&mut n)?;
    let mut bytes = vec![0u8; u32::from_le_bytes(n) as usize];
    r.read_exact(&mut bytes)?;
    Ok((serde_json::from_slice(&head).unwrap_or(Value::Null), bytes))
}

fn ms(t: Instant) -> f64 {
    t.elapsed().as_secs_f64() * 1000.0
}

/// Whether `sha` is a SHA-256 written out, as the cache names its PDFs by.
fn is_sha(sha: &str) -> bool {
    sha.len() == 64 && sha.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

/// A picture as a PNG: quick to make - a page is mostly white - and taken
/// apart by the window off its main thread.
fn png_of(rgba: &[u8], w: u32, h: u32) -> Result<Vec<u8>, String> {
    let mut out = Vec::with_capacity(rgba.len() / 8);
    {
        let mut enc = png::Encoder::new(&mut out, w, h);
        enc.set_color(png::ColorType::Rgba);
        enc.set_depth(png::BitDepth::Eight);
        enc.set_compression(png::Compression::Fast);
        enc.set_filter(png::FilterType::Sub);
        let mut writer = enc.write_header().map_err(|e| e.to_string())?;
        writer.write_image_data(rgba).map_err(|e| e.to_string())?;
    }
    Ok(out)
}

/// A request answered: its JSON, and its bytes.
fn answer(docs: &mut HashMap<String, PdfDocument<'static>>, pdfium: &'static Pdfium, cache: &Path, ask: &Value) -> Result<(Value, Vec<u8>), String> {
    let t = Instant::now();
    let sha = ask["sha"].as_str().unwrap_or("").to_string();
    if !is_sha(&sha) {
        return Err("no such PDF".into());
    }
    if !docs.contains_key(&sha) {
        let doc = pdfium.load_pdf_from_file(&cache.join(format!("{sha}.pdf")), None).map_err(|e| format!("it could not be read ({e})"))?;
        docs.insert(sha.clone(), doc);
    }
    let doc = &docs[&sha];
    match ask["op"].as_str().unwrap_or("") {
        "pages" => {
            let sizes: Vec<[f32; 2]> = doc.pages().iter().map(|p| [p.width().value, p.height().value]).collect();
            Ok((json!({"pages": sizes, "ms": ms(t)}), vec![]))
        }
        "render" => {
            let page = doc.pages().get(ask["page"].as_i64().unwrap_or(0) as i32).map_err(|_| "no such page".to_string())?;
            let scale = ask["scale"].as_f64().unwrap_or(1.0).clamp(0.01, 64.0) as f32;
            let full = ((page.width().value * scale).ceil() as i64, (page.height().value * scale).ceil() as i64);
            let x = ask["x"].as_i64().unwrap_or(0).clamp(0, full.0 - 1);
            let y = ask["y"].as_i64().unwrap_or(0).clamp(0, full.1 - 1);
            let w = ask["w"].as_i64().unwrap_or(full.0).min(full.0 - x).clamp(1, 8192) as i32;
            let h = ask["h"].as_i64().unwrap_or(full.1).min(full.1 - y).clamp(1, 8192) as i32;
            let mut bm = PdfBitmap::empty(w, h, PdfBitmapFormat::BGRA).map_err(|e| e.to_string())?;
            // (the page placed by its top left in the bitmap, which PDFium takes on
            // the path that draws forms as well; white under it, as paper is)
            let cfg = PdfRenderConfig::new()
                .scale_page_by_factor(scale)
                .set_origin(-(x as i32), -(y as i32))
                .set_reverse_byte_order(true)
                .set_clear_color(PdfColor::WHITE)
                .render_annotations(true);
            page.render_into_bitmap_with_config(&mut bm, &cfg).map_err(|e| e.to_string())?;
            let rgba = bm.as_raw_bytes();
            let drawn_ms = ms(t);
            let packed = ask["packed"].as_bool().unwrap_or(false);
            let bytes = if packed { png_of(&rgba, w as u32, h as u32)? } else { rgba };
            Ok((json!({"w": w, "h": h, "packed": packed, "drawn_ms": drawn_ms, "ms": ms(t)}), bytes))
        }
        "close" => {
            docs.remove(&sha);
            Ok((json!({}), vec![]))
        }
        other => Err(format!("unknown request {other}")),
    }
}

fn run_reader(cache: &Path) -> i32 {
    let started = Instant::now();
    let mut out = std::io::stdout().lock();
    let bindings = match Pdfium::bind_to_library(Pdfium::pdfium_platform_library_name_at_path(&library_dir())) {
        Ok(b) => b,
        Err(e) => {
            let _ = write_frame(&mut out, &json!({"id": 0, "ok": false, "why": format!("PDFium could not be loaded: {e}")}), &[]);
            return 1;
        }
    };
    // (the documents opened borrow PDFium for as long as the reader runs)
    let pdfium: &'static Pdfium = Box::leak(Box::new(Pdfium::new(bindings)));
    let _ = write_frame(&mut out, &json!({"id": 0, "ok": true, "bound_ms": ms(started)}), &[]);
    let mut docs: HashMap<String, PdfDocument<'static>> = HashMap::new();
    for line in std::io::stdin().lock().lines() {
        let Ok(line) = line else { break };
        let Ok(ask) = serde_json::from_str::<Value>(&line) else { continue };
        let id = ask["id"].as_u64().unwrap_or(0);
        let (head, bytes) = match answer(&mut docs, pdfium, cache, &ask) {
            Ok((mut head, bytes)) => {
                head["id"] = json!(id);
                head["ok"] = json!(true);
                (head, bytes)
            }
            Err(why) => (json!({"id": id, "ok": false, "why": why}), vec![]),
        };
        if write_frame(&mut out, &head, &bytes).is_err() {
            break;
        }
    }
    0
}

type Waiting = Arc<Mutex<HashMap<u64, tokio::sync::oneshot::Sender<(Value, Vec<u8>)>>>>;

/// The reader, as Meno sees it: started when first wanted, asked, answered.
struct Reader {
    child: Child,
    stdin: ChildStdin,
    waiting: Waiting,
    next: AtomicU64,
}

impl Drop for Reader {
    fn drop(&mut self) {
        let _ = self.child.kill();
    }
}

impl Reader {
    fn start(cache: &Path) -> Result<Reader, String> {
        let exe = std::env::current_exe().map_err(|e| e.to_string())?;
        let mut command = Command::new(exe);
        command.arg(PDF_FLAG).arg(cache).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            // (no console window of its own)
            command.creation_flags(0x0800_0000);
        }
        let mut child = command.spawn().map_err(|e| format!("the PDF reader could not start: {e}"))?;
        let stdin = child.stdin.take().ok_or("the PDF reader takes no input")?;
        let mut stdout = BufReader::with_capacity(1 << 20, child.stdout.take().ok_or("the PDF reader gives no output")?);
        let (first, _) = read_frame(&mut stdout).map_err(|e| format!("the PDF reader said nothing: {e}"))?;
        if first["ok"] != json!(true) {
            let _ = child.kill();
            return Err(first["why"].as_str().unwrap_or("the PDF reader failed").to_string());
        }
        let waiting: Waiting = Arc::new(Mutex::new(HashMap::new()));
        let w = waiting.clone();
        std::thread::spawn(move || {
            while let Ok((head, bytes)) = read_frame(&mut stdout) {
                let id = head["id"].as_u64().unwrap_or(0);
                if let Some(tx) = w.lock().unwrap().remove(&id) {
                    let _ = tx.send((head, bytes));
                }
            }
            // (the reader is gone: whoever waits is told so)
            w.lock().unwrap().clear();
        });
        Ok(Reader { child, stdin, waiting, next: AtomicU64::new(1) })
    }

    fn ask(&mut self, mut req: Value) -> Result<tokio::sync::oneshot::Receiver<(Value, Vec<u8>)>, String> {
        let id = self.next.fetch_add(1, Ordering::Relaxed);
        req["id"] = json!(id);
        let (tx, rx) = tokio::sync::oneshot::channel();
        self.waiting.lock().unwrap().insert(id, tx);
        let mut line = serde_json::to_vec(&req).map_err(|e| e.to_string())?;
        line.push(b'\n');
        self.stdin.write_all(&line).and_then(|_| self.stdin.flush()).map_err(|e| format!("the PDF reader is gone: {e}"))?;
        Ok(rx)
    }
}

/// The reader Meno has started, if any.
#[derive(Default)]
pub struct PdfState(Mutex<Option<Reader>>);

fn cache_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_cache_dir().map_err(|e| e.to_string())?.join("pdf");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

async fn ask(app: &tauri::AppHandle, req: Value) -> Result<(Value, Vec<u8>), String> {
    let rx = {
        let state = app.state::<PdfState>();
        let mut guard = state.0.lock().unwrap();
        // (started the first time, and again where it has gone)
        if guard.as_mut().map(|r| matches!(r.child.try_wait(), Ok(Some(_)))).unwrap_or(true) {
            *guard = Some(Reader::start(&cache_dir(app)?)?);
        }
        guard.as_mut().unwrap().ask(req)?
    };
    let (head, bytes) = rx.await.map_err(|_| "the PDF reader stopped".to_string())?;
    if head["ok"] != json!(true) {
        return Err(head["why"].as_str().unwrap_or("the PDF reader failed").to_string());
    }
    Ok((head, bytes))
}

/// A PDF held: what it is known by, its size, and each page's width and height, in points.
#[derive(Serialize)]
pub struct Held {
    sha256: String,
    size: u64,
    pages: Vec<[f32; 2]>,
}

/// Whether `bytes` begin as a PDF does (some carry a little before it).
fn looks_like_pdf(bytes: &[u8]) -> bool {
    bytes[..1024.min(bytes.len())].windows(5).any(|w| w == b"%PDF-")
}

/// `bytes` held: written to the cache under their SHA-256 (once), and asked of the reader.
async fn hold(app: &tauri::AppHandle, bytes: &[u8]) -> Result<Held, String> {
    if bytes.len() as u64 > MOST {
        return Err("it is too large".into());
    }
    if !looks_like_pdf(bytes) {
        return Err("it is not a PDF".into());
    }
    let sha = format!("{:x}", Sha256::digest(bytes));
    let path = cache_dir(app)?.join(format!("{sha}.pdf"));
    if std::fs::metadata(&path).map(|m| m.len()).ok() != Some(bytes.len() as u64) {
        // (written whole, then put in place: never read half written)
        let part = path.with_extension("part");
        std::fs::write(&part, bytes).map_err(|e| e.to_string())?;
        std::fs::rename(&part, &path).map_err(|e| e.to_string())?;
    }
    let (head, _) = ask(app, json!({"op": "pages", "sha": sha})).await?;
    let pages: Vec<[f32; 2]> = serde_json::from_value(head["pages"].clone()).unwrap_or_default();
    Ok(Held { sha256: sha, size: bytes.len() as u64, pages })
}

/// A PDF on the disk, held.
#[tauri::command]
pub async fn pdf_hold_path(app: tauri::AppHandle, path: String) -> Result<Held, String> {
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    hold(&app, &bytes).await
}

/// A PDF's bytes, sent as they are, held.
#[tauri::command]
pub async fn pdf_hold_bytes(app: tauri::AppHandle, request: tauri::ipc::Request<'_>) -> Result<Held, String> {
    match request.body() {
        tauri::ipc::InvokeBody::Raw(bytes) => hold(&app, bytes).await,
        _ => Err("a PDF is sent as its bytes".into()),
    }
}

/// A PDF held, as its bytes: what a workspace's file keeps.
#[tauri::command]
pub async fn pdf_bytes(app: tauri::AppHandle, sha: String) -> Result<tauri::ipc::Response, String> {
    if !is_sha(&sha) {
        return Err("no such PDF".into());
    }
    let bytes = std::fs::read(cache_dir(&app)?.join(format!("{sha}.pdf"))).map_err(|_| "it is no longer held".to_string())?;
    Ok(tauri::ipc::Response::new(bytes))
}

/// A part of a page drawn at `scale` pixels a point: after 16 bytes - its
/// width and height (u32), how long it took (f32 ms) and whether it is a
/// PNG (u32: 1) - its pixels, RGBA, top row first, or its PNG.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn pdf_render(
    app: tauri::AppHandle,
    sha: String,
    page: u32,
    scale: f64,
    x: i64,
    y: i64,
    w: Option<i64>,
    h: Option<i64>,
    packed: bool,
) -> Result<tauri::ipc::Response, String> {
    let (head, bytes) = ask(&app, json!({"op": "render", "sha": sha, "page": page, "scale": scale, "x": x, "y": y, "w": w, "h": h, "packed": packed})).await?;
    let mut out = Vec::with_capacity(16 + bytes.len());
    out.extend_from_slice(&(head["w"].as_u64().unwrap_or(0) as u32).to_le_bytes());
    out.extend_from_slice(&(head["h"].as_u64().unwrap_or(0) as u32).to_le_bytes());
    out.extend_from_slice(&(head["ms"].as_f64().unwrap_or(0.0) as f32).to_le_bytes());
    out.extend_from_slice(&u32::from(head["packed"] == json!(true)).to_le_bytes());
    out.extend_from_slice(&bytes);
    Ok(tauri::ipc::Response::new(out))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_pdf_is_known_by_its_start() {
        assert!(looks_like_pdf(b"%PDF-1.7\n..."));
        assert!(looks_like_pdf(b"\xef\xbb\xbf%PDF-1.4"));
        assert!(!looks_like_pdf(b"<html>"));
        assert!(!looks_like_pdf(b""));
    }

    #[test]
    fn only_a_sha256_names_a_held_pdf() {
        assert!(is_sha(&"a".repeat(64)));
        assert!(!is_sha(&"A".repeat(64)));
        assert!(!is_sha("../../etc/passwd"));
        assert!(!is_sha(&"a".repeat(63)));
    }

    #[test]
    fn a_picture_packs_as_a_png_that_reads_back() {
        let (w, h) = (64u32, 32u32);
        let rgba: Vec<u8> = (0..w * h).flat_map(|i| [(i % 251) as u8, 255, 255, 255]).collect();
        let png = png_of(&rgba, w, h).unwrap();
        let mut reader = png::Decoder::new(std::io::Cursor::new(png)).read_info().unwrap();
        let mut buf = vec![0; reader.output_buffer_size()];
        let info = reader.next_frame(&mut buf).unwrap();
        assert_eq!((info.width, info.height), (w, h));
        assert_eq!(&buf[..info.buffer_size()], &rgba[..]);
    }
}
