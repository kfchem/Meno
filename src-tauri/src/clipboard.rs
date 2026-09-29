//! The system clipboard, with the kinds of data a structure travels in -
//! Meno's own, a MOL file, plain text - under the names each platform and
//! the chemistry programs on it know them by. The webview's own clipboard
//! reaches plain text only.
//!
//! Every kind is text for now; the pictures for Office come later.

use serde::{Deserialize, Serialize};

/// One kind of data, as the page names it, and its text.
#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
pub struct ClipItem {
    pub flavor: String,
    pub text: String,
}

/// What the page's kinds are called on this platform, most preferred first.
/// A kind the platform has no name for is left out.
fn names(flavor: &str) -> &'static [&'static str] {
    #[cfg(target_os = "macos")]
    {
        match flavor {
            "meno" => &["com.kfchem.meno.structure"],
            "mol" => &["chemical/x-mdl-molfile"],
            "text" => &["public.utf8-plain-text"],
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
    let mut entries: Vec<(&'static str, &str)> = Vec::new();
    for item in &items {
        for name in names(&item.flavor) {
            entries.push((name, item.text.as_str()));
        }
    }
    platform::write(&entries)
}

/// The first of `flavors` the clipboard holds, and its text.
#[tauri::command]
pub fn clipboard_read(flavors: Vec<String>) -> Result<Option<ClipItem>, String> {
    for flavor in &flavors {
        for name in names(flavor) {
            if let Some(text) = platform::read(name)? {
                return Ok(Some(ClipItem { flavor: flavor.clone(), text }));
            }
        }
    }
    Ok(None)
}

#[cfg(target_os = "macos")]
mod platform {
    use objc2_app_kit::NSPasteboard;
    use objc2_foundation::{NSArray, NSData, NSString};

    pub fn write(entries: &[(&str, &str)]) -> Result<(), String> {
        let names: Vec<_> = entries.iter().map(|(n, _)| NSString::from_str(n)).collect();
        // SAFETY: the general pasteboard may be used from any thread, and
        // every object passed is a live one of the type asked for.
        unsafe {
            let pb = NSPasteboard::generalPasteboard();
            pb.clearContents();
            pb.declareTypes_owner(&NSArray::from_retained_slice(&names), None);
            for ((_, text), name) in entries.iter().zip(&names) {
                let data = NSData::with_bytes(text.as_bytes());
                if !pb.setData_forType(Some(&data), name) {
                    return Err(format!("the clipboard would not take {name}"));
                }
            }
        }
        Ok(())
    }

    pub fn read(name: &str) -> Result<Option<String>, String> {
        // SAFETY: as for `write`.
        let data = unsafe { NSPasteboard::generalPasteboard().dataForType(&NSString::from_str(name)) };
        Ok(data.map(|d| String::from_utf8_lossy(&d.to_vec()).into_owned()))
    }
}

#[cfg(target_os = "windows")]
mod platform {
    use super::{from_mdlct, to_mdlct};
    use std::ptr::null_mut;
    use windows_sys::Win32::Foundation::{GlobalFree, HANDLE};
    use windows_sys::Win32::System::DataExchange::{
        CloseClipboard, EmptyClipboard, GetClipboardData, IsClipboardFormatAvailable, OpenClipboard,
        RegisterClipboardFormatW, SetClipboardData,
    };
    use windows_sys::Win32::System::Memory::{GlobalAlloc, GlobalLock, GlobalSize, GlobalUnlock, GMEM_MOVEABLE};
    use windows_sys::Win32::System::Ole::CF_UNICODETEXT;

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
        if name == "CF_UNICODETEXT" {
            return CF_UNICODETEXT as u32;
        }
        let wide: Vec<u16> = name.encode_utf16().chain(Some(0)).collect();
        // SAFETY: a NUL-terminated wide string.
        unsafe { RegisterClipboardFormatW(wide.as_ptr()) }
    }

    fn bytes(name: &str, text: &str) -> Vec<u8> {
        match name {
            "CF_UNICODETEXT" => text.encode_utf16().chain(Some(0)).flat_map(u16::to_le_bytes).collect(),
            "MDLCT" => to_mdlct(text),
            _ => text.bytes().chain(Some(0)).collect(),
        }
    }

    fn text(name: &str, bytes: &[u8]) -> Option<String> {
        match name {
            "CF_UNICODETEXT" => {
                let wide: Vec<u16> = bytes.chunks_exact(2).map(|c| u16::from_le_bytes([c[0], c[1]])).collect();
                let end = wide.iter().position(|&c| c == 0).unwrap_or(wide.len());
                Some(String::from_utf16_lossy(&wide[..end]))
            }
            "MDLCT" => from_mdlct(bytes),
            _ => {
                let end = bytes.iter().position(|&b| b == 0).unwrap_or(bytes.len());
                Some(String::from_utf8_lossy(&bytes[..end]).into_owned())
            }
        }
    }

    pub fn write(entries: &[(&str, &str)]) -> Result<(), String> {
        let _open = Open::new()?;
        // SAFETY: the clipboard is open; each block is allocated movable,
        // filled while locked, and the clipboard owns it once taken.
        unsafe {
            if EmptyClipboard() == 0 {
                return Err("the clipboard could not be emptied".into());
            }
            for (name, text) in entries {
                let data = bytes(name, text);
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

    pub fn read(name: &str) -> Result<Option<String>, String> {
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
            Ok(text(name, &data))
        }
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
mod platform {
    pub fn write(_: &[(&str, &str)]) -> Result<(), String> {
        Err("the clipboard is not reached on this platform".into())
    }
    pub fn read(_: &str) -> Result<Option<String>, String> {
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
            assert!(!names("meno").is_empty());
            assert!(!names("mol").is_empty());
            assert!(!names("text").is_empty());
        }
        assert!(names("nonsense").is_empty());
    }
}
