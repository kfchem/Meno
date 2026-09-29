//! The system clipboard, with the kinds of data a structure travels in -
//! Meno's own, a MOL file, plain text, and the pictures Office takes - under
//! the names each platform and the programs on it know them by. The
//! webview's own clipboard reaches plain text only.

use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::{Deserialize, Serialize};

/// One kind of data, as the page names it: text, or bytes as base64.
#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
pub struct ClipItem {
    pub flavor: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub base64: Option<String>,
}

/// What goes on the clipboard under one name.
pub enum Payload<'a> {
    Text(&'a str),
    Bytes(Vec<u8>),
}

/// Kinds that are bytes, not text: pictures.
fn is_binary(flavor: &str) -> bool {
    matches!(flavor, "gvml" | "png" | "emf")
}

/// What the page's kinds are called on this platform, most preferred first.
/// A kind the platform has no name for is left out.
///
/// `gvml` is Office's own clip format: a zip whose picture Word and
/// PowerPoint keep byte for byte, on either system, and hand back when the
/// picture is copied - where a structure carried in it survives.
fn names(flavor: &str) -> &'static [&'static str] {
    #[cfg(target_os = "macos")]
    {
        match flavor {
            "meno" => &["com.kfchem.meno.structure"],
            "mol" => &["chemical/x-mdl-molfile"],
            "text" => &["public.utf8-plain-text"],
            "gvml" => &["com.microsoft.Art--GVML-ClipFormat"],
            "png" => &["public.png"],
            _ => &[],
        }
    }
    #[cfg(target_os = "windows")]
    {
        match flavor {
            "meno" => &["Meno Structure"],
            // MDLCT is what the chemistry programs on Windows exchange
            "mol" => &["MDLCT", "chemical/x-mdl-molfile"],
            "text" => &["CF_UNICODETEXT"],
            "gvml" => &["Art::GVML ClipFormat"],
            "png" => &["PNG"],
            "emf" => &["CF_ENHMETAFILE"],
            _ => &[],
        }
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = flavor;
        &[]
    }
}

/// A MOL file as MDLCT has it: each line after a byte giving its length,
/// with no line ends. (Windows only; tested everywhere.)
#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
pub fn to_mdlct(mol: &str) -> Vec<u8> {
    let mut out = Vec::with_capacity(mol.len() + 64);
    for line in mol.trim_end_matches(['\r', '\n']).split('\n') {
        let line = line.trim_end_matches('\r').as_bytes();
        let line = &line[..line.len().min(255)];
        out.push(line.len() as u8);
        out.extend_from_slice(line);
    }
    out
}

/// A MOL file out of MDLCT; None if the bytes do not read as it.
#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
pub fn from_mdlct(bytes: &[u8]) -> Option<String> {
    let mut lines = Vec::new();
    let mut i = 0;
    while i < bytes.len() {
        let n = bytes[i] as usize;
        let line = bytes.get(i + 1..i + 1 + n)?;
        lines.push(String::from_utf8_lossy(line).into_owned());
        i += 1 + n;
    }
    let mol = lines.join("\n") + "\n";
    mol.contains("M  END").then_some(mol)
}

/// Puts `items` on the clipboard, in place of whatever was there.
#[tauri::command]
pub fn clipboard_write(items: Vec<ClipItem>) -> Result<(), String> {
    let mut entries: Vec<(&'static str, Payload)> = Vec::new();
    for item in &items {
        for name in names(&item.flavor) {
            let payload = match (&item.text, &item.base64) {
                (_, Some(b64)) => Payload::Bytes(STANDARD.decode(b64).map_err(|e| e.to_string())?),
                (Some(text), None) => Payload::Text(text),
                (None, None) => return Err(format!("nothing given for {}", item.flavor)),
            };
            entries.push((name, payload));
        }
    }
    platform::write(&entries)
}

/// The first of `flavors` the clipboard holds: its text, or its bytes as base64.
#[tauri::command]
pub fn clipboard_read(flavors: Vec<String>) -> Result<Option<ClipItem>, String> {
    for flavor in &flavors {
        for name in names(flavor) {
            if let Some(bytes) = platform::read(name)? {
                let (text, base64) = if is_binary(flavor) {
                    (None, Some(STANDARD.encode(&bytes)))
                } else {
                    (Some(String::from_utf8_lossy(&bytes).into_owned()), None)
                };
                return Ok(Some(ClipItem { flavor: flavor.clone(), text, base64 }));
            }
        }
    }
    Ok(None)
}

#[cfg(target_os = "macos")]
mod platform {
    use super::Payload;
    use objc2_app_kit::NSPasteboard;
    use objc2_foundation::{NSArray, NSData, NSString};

    pub fn write(entries: &[(&str, Payload)]) -> Result<(), String> {
        let names: Vec<_> = entries.iter().map(|(n, _)| NSString::from_str(n)).collect();
        // SAFETY: the general pasteboard may be used from any thread, and
        // every object passed is a live one of the type asked for.
        unsafe {
            let pb = NSPasteboard::generalPasteboard();
            pb.clearContents();
            pb.declareTypes_owner(&NSArray::from_retained_slice(&names), None);
            for ((_, payload), name) in entries.iter().zip(&names) {
                let data = match payload {
                    Payload::Text(text) => NSData::with_bytes(text.as_bytes()),
                    Payload::Bytes(bytes) => NSData::with_bytes(bytes),
                };
                if !pb.setData_forType(Some(&data), name) {
                    return Err(format!("the clipboard would not take {name}"));
                }
            }
        }
        Ok(())
    }

    /// What is on the clipboard under `name`, as it is there.
    pub fn read(name: &str) -> Result<Option<Vec<u8>>, String> {
        // SAFETY: as for `write`.
        let data = unsafe { NSPasteboard::generalPasteboard().dataForType(&NSString::from_str(name)) };
        Ok(data.map(|d| d.to_vec()))
    }
}

#[cfg(target_os = "windows")]
mod platform {
    use super::{from_mdlct, to_mdlct, Payload};
    use std::ptr::null_mut;
    use windows_sys::Win32::Foundation::{GlobalFree, HANDLE};
    use windows_sys::Win32::Graphics::Gdi::{DeleteEnhMetaFile, SetEnhMetaFileBits};
    use windows_sys::Win32::System::DataExchange::{
        CloseClipboard, EmptyClipboard, GetClipboardData, IsClipboardFormatAvailable, OpenClipboard,
        RegisterClipboardFormatW, SetClipboardData,
    };
    use windows_sys::Win32::System::Memory::{GlobalAlloc, GlobalLock, GlobalSize, GlobalUnlock, GMEM_MOVEABLE};
    use windows_sys::Win32::System::Ole::{CF_ENHMETAFILE, CF_UNICODETEXT};

    /// The clipboard, open until this is dropped. Another program may hold
    /// it for a moment, so opening it is tried a few times.
    struct Open;
    impl Open {
        fn new() -> Result<Self, String> {
            for _ in 0..10 {
                // SAFETY: no window owns what is put on it.
                if unsafe { OpenClipboard(null_mut()) } != 0 {
                    return Ok(Open);
                }
                std::thread::sleep(std::time::Duration::from_millis(20));
            }
            Err("the clipboard is in use by another program".into())
        }
    }
    impl Drop for Open {
        fn drop(&mut self) {
            // SAFETY: opened by `new`.
            unsafe { CloseClipboard() };
        }
    }

    fn format(name: &str) -> u32 {
        match name {
            "CF_UNICODETEXT" => CF_UNICODETEXT as u32,
            "CF_ENHMETAFILE" => CF_ENHMETAFILE as u32,
            _ => {
                let wide: Vec<u16> = name.encode_utf16().chain(Some(0)).collect();
                // SAFETY: a NUL-terminated wide string.
                unsafe { RegisterClipboardFormatW(wide.as_ptr()) }
            }
        }
    }

    /// The bytes a kind is kept in on the clipboard.
    fn stored(name: &str, payload: &Payload) -> Vec<u8> {
        match payload {
            Payload::Bytes(bytes) => bytes.clone(),
            Payload::Text(text) => match name {
                "CF_UNICODETEXT" => text.encode_utf16().chain(Some(0)).flat_map(u16::to_le_bytes).collect(),
                "MDLCT" => to_mdlct(text),
                _ => text.bytes().chain(Some(0)).collect(),
            },
        }
    }

    /// What a kind's bytes on the clipboard hold: text as UTF-8, pictures as they are.
    fn held(name: &str, bytes: &[u8]) -> Option<Vec<u8>> {
        match name {
            "CF_UNICODETEXT" => {
                let wide: Vec<u16> = bytes.chunks_exact(2).map(|c| u16::from_le_bytes([c[0], c[1]])).collect();
                let end = wide.iter().position(|&c| c == 0).unwrap_or(wide.len());
                Some(String::from_utf16_lossy(&wide[..end]).into_bytes())
            }
            "MDLCT" => from_mdlct(bytes).map(String::into_bytes),
            "Meno Structure" | "chemical/x-mdl-molfile" => {
                let end = bytes.iter().position(|&b| b == 0).unwrap_or(bytes.len());
                Some(bytes[..end].to_vec())
            }
            _ => Some(bytes.to_vec()),
        }
    }

    pub fn write(entries: &[(&str, Payload)]) -> Result<(), String> {
        let _open = Open::new()?;
        // SAFETY: the clipboard is open; each block is allocated movable,
        // filled while locked, and the clipboard owns it once taken - as it
        // does an enhanced metafile's handle.
        unsafe {
            if EmptyClipboard() == 0 {
                return Err("the clipboard could not be emptied".into());
            }
            for (name, payload) in entries {
                let data = stored(name, payload);
                if *name == "CF_ENHMETAFILE" {
                    let emf = SetEnhMetaFileBits(data.len() as u32, data.as_ptr());
                    if emf.is_null() {
                        return Err("the picture is not an enhanced metafile Windows reads".into());
                    }
                    if SetClipboardData(format(name), emf as HANDLE).is_null() {
                        DeleteEnhMetaFile(emf);
                        return Err("the clipboard would not take the picture".into());
                    }
                    continue;
                }
                let block = GlobalAlloc(GMEM_MOVEABLE, data.len().max(1));
                if block.is_null() {
                    return Err("out of memory for the clipboard".into());
                }
                let at = GlobalLock(block) as *mut u8;
                if at.is_null() {
                    GlobalFree(block);
                    return Err("out of memory for the clipboard".into());
                }
                std::ptr::copy_nonoverlapping(data.as_ptr(), at, data.len());
                GlobalUnlock(block);
                if SetClipboardData(format(name), block as HANDLE).is_null() {
                    GlobalFree(block);
                    return Err(format!("the clipboard would not take {name}"));
                }
            }
        }
        Ok(())
    }

    /// What is on the clipboard under `name`: text as UTF-8, pictures as they are.
    pub fn read(name: &str) -> Result<Option<Vec<u8>>, String> {
        // (Office hands an enhanced metafile back drawn afresh, without what
        // was carried in it: the picture is read out of its own clip format)
        if name == "CF_ENHMETAFILE" {
            return Ok(None);
        }
        let fmt = format(name);
        // SAFETY: asking needs no open clipboard.
        if unsafe { IsClipboardFormatAvailable(fmt) } == 0 {
            return Ok(None);
        }
        let _open = Open::new()?;
        // SAFETY: the clipboard is open, and the block it hands out is
        // read only while locked, within its size.
        unsafe {
            let block = GetClipboardData(fmt);
            if block.is_null() {
                return Ok(None);
            }
            let at = GlobalLock(block) as *const u8;
            if at.is_null() {
                return Ok(None);
            }
            let data = std::slice::from_raw_parts(at, GlobalSize(block)).to_vec();
            GlobalUnlock(block);
            Ok(held(name, &data))
        }
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
mod platform {
    use super::Payload;
    pub fn write(_: &[(&str, Payload)]) -> Result<(), String> {
        Err("the clipboard is not reached on this platform".into())
    }
    pub fn read(_: &str) -> Result<Option<Vec<u8>>, String> {
        Ok(None)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mdlct_is_each_line_after_its_length() {
        let mol = "\n  Meno\n\n  0  0  0  0  0  0  0  0  0  0999 V2000\nM  END\n";
        let ct = to_mdlct(mol);
        assert_eq!(&ct[..8], &[0, 6, b' ', b' ', b'M', b'e', b'n', b'o']);
        assert!(!ct.contains(&b'\n'));
        assert_eq!(from_mdlct(&ct).as_deref(), Some(mol));
        // not a MOL file
        assert_eq!(from_mdlct(&[3, b'a', b'b']), None);
        assert_eq!(from_mdlct(&to_mdlct("hello\n")), None);
    }

    #[test]
    fn a_kind_has_its_platforms_names() {
        #[cfg(any(target_os = "macos", target_os = "windows"))]
        {
            for flavor in ["meno", "mol", "text", "gvml", "png"] {
                assert!(!names(flavor).is_empty(), "{flavor}");
            }
        }
        assert!(names("nonsense").is_empty());
    }

    #[test]
    fn pictures_travel_as_base64_and_text_as_text() {
        assert!(is_binary("gvml") && is_binary("png") && is_binary("emf"));
        assert!(!is_binary("meno") && !is_binary("mol") && !is_binary("text"));
        let item: ClipItem = serde_json::from_str(r#"{"flavor":"png","base64":"iVBO"}"#).unwrap();
        assert_eq!(item.text, None);
        assert_eq!(serde_json::to_string(&ClipItem { flavor: "mol".into(), text: Some("x".into()), base64: None }).unwrap(), r#"{"flavor":"mol","text":"x"}"#);
    }
}
