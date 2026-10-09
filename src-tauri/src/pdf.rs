//! The PDF trial (docs/PDF.md, step 0): PDFium in a process of its own.
//!
//! Meno's executable started as `--pdf` is the reader: it binds PDFium,
//! takes requests a line of JSON each on its standard input, and answers on
//! its standard output, each answer a frame - its JSON, then its bytes (a
//! picture's pixels, RGBA, as a WebGL texture takes them). Meno starts one
//! reader the first time a PDF is asked for, and its commands wait on the
//! answers. A PDF that breaks PDFium breaks the reader alone.
// (a trial: kept short rather than tidy)
#![allow(clippy::type_complexity, clippy::too_many_arguments, clippy::map_entry)]
use pdfium_render::prelude::*;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Instant;

pub const PDF_FLAG: &str = "--pdf";

/// Where PDFium's library is: inside the app on a Mac, beside the program
/// elsewhere - or, built for development, where the build fetched it.
fn library_dir() -> PathBuf {
    if let Some(dir) = std::env::var_os("MENO_PDFIUM") {
        return PathBuf::from(dir);
    }
    let exe = std::env::current_exe().unwrap_or_default();
    let beside = exe.parent().map(|p| p.to_path_buf()).unwrap_or_default();
    let system = if cfg!(target_os = "macos") { "macos" } else if cfg!(windows) { "windows" } else { "linux" };
    // (a Mac's app carries it among its frameworks; Windows' installer among Meno's resources, beside the program)
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
    if std::env::args_os().nth(1)? != PDF_FLAG {
        return None;
    }
    Some(run_reader())
}

fn write_frame(out: &mut impl Write, head: &Value, bytes: &[u8]) -> std::io::Result<()> {
    let head = serde_json::to_vec(head).unwrap_or_default();
    out.write_all(&(head.len() as u32).to_le_bytes())?;
    out.write_all(&head)?;
    out.write_all(&(bytes.len() as u32).to_le_bytes())?;
    out.write_all(bytes)?;
    out.flush()
}

fn ms(t: Instant) -> f64 {
    t.elapsed().as_secs_f64() * 1000.0
}

/// A page's text as the trial searches it: each letter, and the text with a
/// line's end read as a space and a word broken at a line's end by a hyphen
/// read whole - each letter of it pointing back to the page's letter.
fn searchable(chars: &[(char, [f32; 4])]) -> (Vec<char>, Vec<usize>) {
    let mut text = vec![];
    let mut back = vec![];
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i].0;
        // (PDFium marks a hyphen at a line's end as U+0002, then "\r\n")
        if c == '\u{2}' || (c == '-' && chars.get(i + 1).map(|x| x.0) == Some('\r')) {
            i += 1;
            while i < chars.len() && (chars[i].0 == '\r' || chars[i].0 == '\n') {
                i += 1;
            }
            continue;
        }
        if c == '\r' || c == '\n' {
            if text.last() != Some(&' ') {
                text.push(' ');
                back.push(i);
            }
            i += 1;
            continue;
        }
        text.extend(c.to_lowercase());
        for _ in c.to_lowercase() {
            back.push(i);
        }
        i += 1;
    }
    (text, back)
}

fn run_reader() -> i32 {
    let started = Instant::now();
    let bindings = match Pdfium::bind_to_library(Pdfium::pdfium_platform_library_name_at_path(&library_dir())) {
        Ok(b) => b,
        Err(e) => {
            let _ = write_frame(&mut std::io::stdout().lock(), &json!({"id": 0, "ok": false, "why": format!("PDFium could not be loaded: {e}")}), &[]);
            return 1;
        }
    };
    let pdfium: &'static Pdfium = Box::leak(Box::new(Pdfium::new(bindings)));
    let mut out = std::io::stdout().lock();
    let _ = write_frame(&mut out, &json!({"id": 0, "ok": true, "bound_ms": ms(started)}), &[]);
    let mut docs: HashMap<u64, PdfDocument<'static>> = HashMap::new();
    let mut texts: HashMap<(u64, i32), Vec<(char, [f32; 4])>> = HashMap::new();
    let mut next = 1u64;
    for line in std::io::stdin().lock().lines() {
        let Ok(line) = line else { break };
        let Ok(ask) = serde_json::from_str::<Value>(&line) else { continue };
        let id = ask["id"].as_u64().unwrap_or(0);
        let t = Instant::now();
        let fail = |why: String| json!({"id": id, "ok": false, "why": why});
        let mut bytes: Vec<u8> = vec![];
        let head = match ask["op"].as_str().unwrap_or("") {
            "open" => match pdfium.load_pdf_from_file(ask["path"].as_str().unwrap_or(""), None) {
                Ok(doc) => {
                    let sizes: Vec<[f32; 2]> = doc.pages().iter().map(|p| [p.width().value, p.height().value]).collect();
                    let doc_id = next;
                    next += 1;
                    docs.insert(doc_id, doc);
                    json!({"id": id, "ok": true, "doc": doc_id, "pages": sizes, "ms": ms(t)})
                }
                Err(e) => fail(format!("{e}")),
            },
            "render" => {
                let page = docs.get(&ask["doc"].as_u64().unwrap_or(0)).and_then(|d| d.pages().get(ask["page"].as_i64().unwrap_or(0) as i32).ok());
                match page {
                    None => fail("no such page".into()),
                    Some(page) => {
                        let scale = ask["scale"].as_f64().unwrap_or(1.0) as f32;
                        let (x, y) = (ask["x"].as_i64().unwrap_or(0) as i32, ask["y"].as_i64().unwrap_or(0) as i32);
                        let full = ((page.width().value * scale).ceil() as i32, (page.height().value * scale).ceil() as i32);
                        let w = ask["w"].as_i64().map(|v| v as i32).unwrap_or(full.0).min(full.0 - x).max(1);
                        let h = ask["h"].as_i64().map(|v| v as i32).unwrap_or(full.1).min(full.1 - y).max(1);
                        match PdfBitmap::empty(w, h, PdfBitmapFormat::BGRA) {
                            Err(e) => fail(format!("{e}")),
                            Ok(mut bm) => {
                                let cfg = PdfRenderConfig::new()
                                    .scale_page_by_factor(scale)
                                    .set_origin(-x, -y)
                                    .set_reverse_byte_order(true)
                                    // (the page placed by its top left in the bitmap - set_origin - which
                                    // PDFium takes only on the path that also draws forms)
                                    .render_annotations(true);
                                match page.render_into_bitmap_with_config(&mut bm, &cfg) {
                                    Err(e) => fail(format!("{e}")),
                                    Ok(()) => {
                                        bytes = bm.as_raw_bytes();
                                        json!({"id": id, "ok": true, "w": w, "h": h, "ms": ms(t)})
                                    }
                                }
                            }
                        }
                    }
                }
            }
            "text" => {
                let key = (ask["doc"].as_u64().unwrap_or(0), ask["page"].as_i64().unwrap_or(0) as i32);
                match page_chars(&docs, &mut texts, key) {
                    None => fail("no such page".into()),
                    Some(chars) => {
                        let list: Vec<Value> = chars.iter().map(|(c, b)| json!([c.to_string(), b])).collect();
                        json!({"id": id, "ok": true, "chars": list, "ms": ms(t)})
                    }
                }
            }
            "search" => {
                let doc_id = ask["doc"].as_u64().unwrap_or(0);
                let q: Vec<char> = ask["q"].as_str().unwrap_or("").to_lowercase().chars().collect();
                let n = docs.get(&doc_id).map(|d| d.pages().len()).unwrap_or(0);
                let mut hits = vec![];
                for p in 0..n {
                    let Some(chars) = page_chars(&docs, &mut texts, (doc_id, p)) else { continue };
                    let (text, back) = searchable(chars);
                    if q.is_empty() || text.len() < q.len() {
                        continue;
                    }
                    for s in 0..=(text.len() - q.len()) {
                        if text[s..s + q.len()] == q[..] {
                            let boxes: Vec<[f32; 4]> = (s..s + q.len()).map(|k| chars[back[k]].1).collect();
                            hits.push(json!({"page": p, "boxes": boxes}));
                        }
                    }
                }
                json!({"id": id, "ok": true, "hits": hits, "ms": ms(t)})
            }
            "close" => {
                let doc_id = ask["doc"].as_u64().unwrap_or(0);
                docs.remove(&doc_id);
                texts.retain(|k, _| k.0 != doc_id);
                json!({"id": id, "ok": true})
            }
            other => fail(format!("unknown request {other}")),
        };
        if write_frame(&mut out, &head, &bytes).is_err() {
            break;
        }
    }
    0
}

/// A page's letters, each with its box on the page (left, bottom, right, top, in points) - read once.
fn page_chars<'a>(
    docs: &HashMap<u64, PdfDocument<'static>>,
    texts: &'a mut HashMap<(u64, i32), Vec<(char, [f32; 4])>>,
    key: (u64, i32),
) -> Option<&'a Vec<(char, [f32; 4])>> {
    if !texts.contains_key(&key) {
        let page = docs.get(&key.0)?.pages().get(key.1).ok()?;
        let text = page.text().ok()?;
        let chars: Vec<(char, [f32; 4])> = text
            .chars()
            .iter()
            .map(|c| {
                let b = c.loose_bounds().map(|r| [r.left().value, r.bottom().value, r.right().value, r.top().value]).unwrap_or([0.0; 4]);
                (c.unicode_char().unwrap_or(' '), b)
            })
            .collect();
        texts.insert(key, chars);
    }
    texts.get(&key)
}

type Waiting = Arc<Mutex<HashMap<u64, tokio::sync::oneshot::Sender<(Value, Vec<u8>)>>>>;

/// The reader, as Meno sees it: started when first wanted, asked, answered.
pub struct Reader {
    child: Child,
    stdin: ChildStdin,
    waiting: Waiting,
    next: AtomicU64,
    pub bound_ms: f64,
}

impl Drop for Reader {
    fn drop(&mut self) {
        let _ = self.child.kill();
    }
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

impl Reader {
    fn start() -> Result<Reader, String> {
        let exe = std::env::current_exe().map_err(|e| e.to_string())?;
        let mut child = Command::new(exe)
            .arg(PDF_FLAG)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| format!("the PDF reader could not start: {e}"))?;
        let stdin = child.stdin.take().ok_or("no input")?;
        let mut stdout = BufReader::with_capacity(1 << 20, child.stdout.take().ok_or("no output")?);
        let (first, _) = read_frame(&mut stdout).map_err(|e| format!("the PDF reader said nothing: {e}"))?;
        if first["ok"] != json!(true) {
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
        Ok(Reader { child, stdin, waiting, next: AtomicU64::new(1), bound_ms: first["bound_ms"].as_f64().unwrap_or(0.0) })
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

#[derive(Default)]
pub struct PdfState(pub Mutex<Option<Reader>>);

async fn ask(state: &PdfState, req: Value) -> Result<(Value, Vec<u8>), String> {
    let rx = {
        let mut guard = state.0.lock().unwrap();
        if guard.as_mut().map(|r| matches!(r.child.try_wait(), Ok(Some(_)))).unwrap_or(true) {
            *guard = Some(Reader::start()?);
        }
        guard.as_mut().unwrap().ask(req)?
    };
    let (head, bytes) = rx.await.map_err(|_| "the PDF reader stopped".to_string())?;
    if head["ok"] != json!(true) {
        return Err(head["why"].as_str().unwrap_or("the PDF reader failed").to_string());
    }
    Ok((head, bytes))
}

#[tauri::command]
pub async fn pdf_open(state: tauri::State<'_, PdfState>, path: String) -> Result<Value, String> {
    let t = Instant::now();
    let (mut head, _) = ask(&state, json!({"op": "open", "path": path})).await?;
    head["round_ms"] = json!(ms(t));
    head["bound_ms"] = json!(state.0.lock().unwrap().as_ref().map(|r| r.bound_ms).unwrap_or(0.0));
    Ok(head)
}

/// A part of a page drawn: its pixels, RGBA, after 16 bytes - its width and
/// height (u32), and how long PDFium took (f64 ms), little-endian.
#[tauri::command]
pub async fn pdf_render(
    state: tauri::State<'_, PdfState>,
    doc: u64,
    page: u32,
    scale: f64,
    x: i64,
    y: i64,
    w: Option<i64>,
    h: Option<i64>,
) -> Result<tauri::ipc::Response, String> {
    let (head, bytes) = ask(&state, json!({"op": "render", "doc": doc, "page": page, "scale": scale, "x": x, "y": y, "w": w, "h": h})).await?;
    let mut out = Vec::with_capacity(16 + bytes.len());
    out.extend_from_slice(&(head["w"].as_u64().unwrap_or(0) as u32).to_le_bytes());
    out.extend_from_slice(&(head["h"].as_u64().unwrap_or(0) as u32).to_le_bytes());
    out.extend_from_slice(&head["ms"].as_f64().unwrap_or(0.0).to_le_bytes());
    out.extend_from_slice(&bytes);
    Ok(tauri::ipc::Response::new(out))
}

#[tauri::command]
pub async fn pdf_text(state: tauri::State<'_, PdfState>, doc: u64, page: u32) -> Result<Value, String> {
    Ok(ask(&state, json!({"op": "text", "doc": doc, "page": page})).await?.0)
}

#[tauri::command]
pub async fn pdf_search(state: tauri::State<'_, PdfState>, doc: u64, q: String) -> Result<Value, String> {
    Ok(ask(&state, json!({"op": "search", "doc": doc, "q": q})).await?.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_word_broken_by_a_hyphen_at_a_lines_end_reads_whole() {
        let chars: Vec<(char, [f32; 4])> = "confor\u{2}\r\nmational analysis".chars().map(|c| (c, [0.0; 4])).collect();
        let (text, back) = searchable(&chars);
        let s: String = text.iter().collect();
        assert_eq!(s, "conformational analysis");
        assert_eq!(back.len(), text.len());
        assert_eq!(chars[back[6]].0, 'm');
    }

    #[test]
    fn a_lines_end_reads_as_a_space() {
        let chars: Vec<(char, [f32; 4])> = "rotational\r\nbarrier".chars().map(|c| (c, [0.0; 4])).collect();
        let s: String = searchable(&chars).0.iter().collect();
        assert_eq!(s, "rotational barrier");
    }
}
