//! Drags from other programs that the page cannot read, on Windows: an
//! object or a picture dragged out of Word or PowerPoint. WebView2 takes
//! every drop on the page in a process of its own and hands the page only
//! files and text; Office's own kinds - its object with Meno's record in
//! it, its clip format - reach neither the page nor Meno.
//!
//! So when such a drag comes into the window - the page says so
//! (`drop_catch`): a drag from outside the page, not of files - Meno lays a
//! window of its own over the page, clear to the eye. Windows hands a drag
//! to whatever window is under it, so from the next move on the drag is
//! this window's: it reads what is dragged, tells the page where the drag
//! is and where it ends ("native-drag"), and goes as the drag leaves or
//! ends. What it read is what `drag_read` reads (clipboard.rs). Files, and
//! drags that start in the page, are left to the webview.

use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Emitter, Manager};
use windows::core::{implement, w, Ref};
use windows::Win32::Foundation::{COLORREF, HWND, LPARAM, LRESULT, POINT, POINTL, RECT, WPARAM};
use windows::Win32::Graphics::Gdi::{ClientToScreen, ScreenToClient};
use std::mem::ManuallyDrop;
use windows::Win32::System::Com::StructuredStorage::{CreateILockBytesOnHGlobal, StgCreateDocfileOnILockBytes};
use windows::Win32::System::Com::{
    IDataObject, IStream, DVASPECT_CONTENT, FORMATETC, STATFLAG_NONAME, STATSTG, STGMEDIUM, STGMEDIUM_0, STGM_CREATE, STGM_READWRITE, STGM_SHARE_EXCLUSIVE,
    STREAM_SEEK_SET, TYMED_HGLOBAL, TYMED_ISTORAGE, TYMED_ISTREAM,
};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::System::Memory::{GlobalLock, GlobalSize, GlobalUnlock};
use windows::Win32::System::Ole::{IDropTarget, IDropTarget_Impl, RegisterDragDrop, ReleaseStgMedium, RevokeDragDrop, DROPEFFECT, DROPEFFECT_COPY, DROPEFFECT_NONE};
use windows::Win32::System::SystemServices::MODIFIERKEYS_FLAGS;
use windows::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_LBUTTON, VK_MBUTTON, VK_RBUTTON};
use windows::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, DestroyWindow, GetClientRect, KillTimer, RegisterClassExW, SetLayeredWindowAttributes, SetTimer, ShowWindow,
    LWA_ALPHA, MA_NOACTIVATE, SW_HIDE, SW_SHOWNOACTIVATE, WM_MOUSEACTIVATE, WM_TIMER, WNDCLASSEXW, WS_EX_LAYERED, WS_EX_NOACTIVATE,
    WS_EX_TOOLWINDOW, WS_POPUP,
};

/// The kinds read out of a drag, by their clipboard names (clipboard.rs).
const KINDS: [&str; 7] = ["Meno Structure", "MDLCT", "chemical/x-mdl-molfile", "chemical/x-mdl-rxnfile", "Art::GVML ClipFormat", "PNG", "CF_UNICODETEXT"];
/// Where an object Office drags keeps its storage, Meno's record in it.
const OBJECTS: [&str; 2] = ["Embedded Object", "Embed Source"];

/// What a drag carried, as it was read.
#[derive(Default)]
struct Dragged {
    kinds: Vec<(&'static str, Vec<u8>)>,
    record: Option<String>,
}

static DRAGGED: Mutex<Option<Dragged>> = Mutex::new(None);
/// Whether the page takes the drag where it is now (`drop_takes`).
static TAKES: AtomicBool = AtomicBool::new(false);
/// The window over the page, while there is one; and where the page is.
static OVER: Mutex<Option<Over>> = Mutex::new(None);
static APP: OnceLock<AppHandle> = OnceLock::new();

struct Over {
    hwnd: isize,
    page: isize,
    scale: f64,
    /// Whether the drag has come to it yet.
    entered: bool,
}

/// How often the window over the page looks for a drag that ended without
/// reaching it (let go of before the next move, say), to go too.
const LOOK_MS: u32 = 200;

pub fn start(app: &AppHandle) {
    let _ = APP.set(app.clone());
}

/// Where a drag the page cannot read is, in the page's own coordinates.
#[derive(Clone, Serialize)]
struct NativeDrag {
    phase: &'static str,
    x: f64,
    y: f64,
}

/// Part of the page, in its own coordinates.
#[derive(Clone, Copy)]
pub struct Area {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

/// A drag from another program, not of files, has come over a part of the
/// page that takes such drags (`area`): the window that takes it from the
/// webview is laid over that part (once). Elsewhere the webview keeps it -
/// text dragged into a field, say.
pub fn catch(area: Area) -> Result<(), String> {
    let app = APP.get().ok_or("not started")?;
    let window = app.get_webview_window("main").ok_or("no window")?;
    // (Tauri's handle is of the windows crate Tauri is built on, which need
    // not be the version this crate uses: the same window, as a pointer)
    let page = HWND(window.hwnd().map_err(|e| e.to_string())?.0);
    let scale = window.scale_factor().map_err(|e| e.to_string())?;
    let mut over = OVER.lock().unwrap();
    if over.is_some() {
        return Ok(());
    }
    // SAFETY: a window of this thread's own, over the page's, freed in `release`.
    unsafe {
        let mut rect = RECT::default();
        GetClientRect(page, &mut rect).map_err(|e| e.to_string())?;
        let mut corner = POINT::default();
        let _ = ClientToScreen(page, &mut corner);
        // the part of the page, in the screen's pixels, within the page
        let px = |v: f64| (v * scale).round() as i32;
        let (left, top) = (px(area.x).clamp(0, rect.right), px(area.y).clamp(0, rect.bottom));
        let (right, bottom) = (px(area.x + area.width).clamp(left, rect.right), px(area.y + area.height).clamp(top, rect.bottom));
        let class = w!("MenoDropCatcher");
        let instance = GetModuleHandleW(None).map_err(|e| e.to_string())?;
        static CLASS: OnceLock<()> = OnceLock::new();
        CLASS.get_or_init(|| {
            let wc = WNDCLASSEXW {
                cbSize: std::mem::size_of::<WNDCLASSEXW>() as u32,
                lpfnWndProc: Some(window_proc),
                hInstance: instance.into(),
                lpszClassName: class,
                ..Default::default()
            };
            RegisterClassExW(&wc);
        });
        let hwnd = CreateWindowExW(
            WS_EX_LAYERED | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE,
            class,
            None,
            WS_POPUP,
            corner.x + left,
            corner.y + top,
            right - left,
            bottom - top,
            Some(page),
            None,
            Some(instance.into()),
            None,
        )
        .map_err(|e| e.to_string())?;
        // (all but clear: a window no one can see through is one Windows
        // passes over, drags and all)
        let _ = SetLayeredWindowAttributes(hwnd, COLORREF(0), 1, LWA_ALPHA);
        let target: IDropTarget = Catcher.into();
        if let Err(e) = RegisterDragDrop(hwnd, &target) {
            let _ = DestroyWindow(hwnd);
            return Err(e.to_string());
        }
        let _ = ShowWindow(hwnd, SW_SHOWNOACTIVATE);
        SetTimer(Some(hwnd), 1, LOOK_MS, None);
        *over = Some(Over { hwnd: hwnd.0 as isize, page: page.0 as isize, scale, entered: false });
    }
    *DRAGGED.lock().unwrap() = None;
    TAKES.store(false, Ordering::SeqCst);
    Ok(())
}

/// The window over the page goes (if there is one), and the page has the
/// pointer again.
pub fn release() {
    if let Some(over) = OVER.lock().unwrap().take() {
        let hwnd = HWND(over.hwnd as *mut _);
        // SAFETY: the window `catch` made, on this thread.
        unsafe {
            let _ = KillTimer(Some(hwnd), 1);
            let _ = RevokeDragDrop(hwnd);
            let _ = DestroyWindow(hwnd);
        }
    }
}

/// Whether the page takes the drag where it now is: the pointer shows it.
pub fn takes(takes: bool) {
    TAKES.store(takes, Ordering::SeqCst);
}

/// What the last drag carried under a clipboard name, as it was read.
pub fn dragged(name: &str) -> Option<Vec<u8>> {
    let d = DRAGGED.lock().unwrap();
    d.as_ref()?.kinds.iter().find(|(n, _)| *n == name).map(|(_, b)| b.clone())
}

/// Meno's record in an object the last drag carried.
pub fn dragged_record() -> Option<String> {
    DRAGGED.lock().unwrap().as_ref()?.record.clone()
}

unsafe extern "system" fn window_proc(hwnd: HWND, msg: u32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    match msg {
        // (it never takes the focus from the page)
        WM_MOUSEACTIVATE => LRESULT(MA_NOACTIVATE as isize),
        // No button held and no drag here: whatever drag there was ended
        // without coming to this window - it goes
        WM_TIMER => {
            let held = [VK_LBUTTON, VK_RBUTTON, VK_MBUTTON].iter().any(|k| GetAsyncKeyState(k.0 as i32) as u16 & 0x8000 != 0);
            let entered = OVER.lock().unwrap().as_ref().is_some_and(|o| o.entered);
            if !held && !entered {
                release();
                emit("gone", None);
            }
            LRESULT(0)
        }
        _ => DefWindowProcW(hwnd, msg, wparam, lparam),
    }
}

/// Tells the page where the drag is (`at` on the screen), in the page's
/// coordinates.
fn emit(phase: &'static str, at: Option<&POINTL>) {
    let (page, scale) = match OVER.lock().unwrap().as_ref() {
        Some(o) => (o.page, o.scale),
        None => (0, 1.0),
    };
    let mut p = POINT { x: at.map_or(0, |a| a.x), y: at.map_or(0, |a| a.y) };
    if page != 0 {
        // SAFETY: the page's window, alive while Meno is.
        let _ = unsafe { ScreenToClient(HWND(page as *mut _), &mut p) };
    }
    if let Some(app) = APP.get() {
        let _ = app.emit_to("main", "native-drag", NativeDrag { phase, x: f64::from(p.x) / scale, y: f64::from(p.y) / scale });
    }
}

/// A copy, where the page takes it: never a move, which would take the
/// object out of the document it was dragged from.
fn effect(allowed: *mut DROPEFFECT) -> DROPEFFECT {
    // SAFETY: the caller's effects.
    let allowed = unsafe { allowed.as_ref() }.copied().unwrap_or(DROPEFFECT_NONE);
    if TAKES.load(Ordering::SeqCst) && allowed.0 & DROPEFFECT_COPY.0 != 0 {
        DROPEFFECT_COPY
    } else {
        DROPEFFECT_NONE
    }
}

fn set(out: *mut DROPEFFECT, value: DROPEFFECT) {
    // SAFETY: the caller's effect, written once.
    if let Some(o) = unsafe { out.as_mut() } {
        *o = value;
    }
}

/// The window over the page goes once the call that ends the drag has
/// returned (not within it: Windows is still calling the window).
fn release_soon() {
    if let Some(over) = OVER.lock().unwrap().as_ref() {
        // SAFETY: the window `catch` made; hidden at once, freed after.
        unsafe {
            let _ = ShowWindow(HWND(over.hwnd as *mut _), SW_HIDE);
        }
    }
    if let Some(app) = APP.get() {
        let _ = app.run_on_main_thread(release);
    }
}

#[implement(IDropTarget)]
struct Catcher;

impl IDropTarget_Impl for Catcher_Impl {
    fn DragEnter(&self, data: Ref<'_, IDataObject>, _: MODIFIERKEYS_FLAGS, pt: &POINTL, effects: *mut DROPEFFECT) -> windows::core::Result<()> {
        if let Some(data) = data.as_ref() {
            *DRAGGED.lock().unwrap() = Some(read(data));
        }
        if let Some(o) = OVER.lock().unwrap().as_mut() {
            o.entered = true;
        }
        emit("enter", Some(pt));
        set(effects, effect(effects));
        Ok(())
    }
    fn DragOver(&self, _: MODIFIERKEYS_FLAGS, pt: &POINTL, effects: *mut DROPEFFECT) -> windows::core::Result<()> {
        emit("over", Some(pt));
        set(effects, effect(effects));
        Ok(())
    }
    fn DragLeave(&self) -> windows::core::Result<()> {
        emit("leave", None);
        release_soon();
        Ok(())
    }
    fn Drop(&self, data: Ref<'_, IDataObject>, _: MODIFIERKEYS_FLAGS, pt: &POINTL, effects: *mut DROPEFFECT) -> windows::core::Result<()> {
        // (read again: what Office renders late is there by now)
        if let Some(data) = data.as_ref() {
            let again = read(data);
            let mut d = DRAGGED.lock().unwrap();
            if again.record.is_some() || !again.kinds.is_empty() {
                *d = Some(again);
            }
        }
        let chosen = effect(effects);
        set(effects, chosen);
        emit(if chosen == DROPEFFECT_COPY { "drop" } else { "leave" }, Some(pt));
        release_soon();
        Ok(())
    }
}

/// What `data` carries of the kinds Meno reads, as bytes, and Meno's record
/// out of an object's storage.
fn read(data: &IDataObject) -> Dragged {
    let mut out = Dragged::default();
    for name in KINDS {
        // (a block of memory, else a stream - asked for one at a time: Word
        // hands a picture it drags over nothing when asked for either)
        for tymed in [TYMED_HGLOBAL, TYMED_ISTREAM] {
            let format = FORMATETC {
                cfFormat: crate::clipboard::clip_format(name) as u16,
                ptd: std::ptr::null_mut(),
                dwAspect: DVASPECT_CONTENT.0,
                lindex: -1,
                tymed: tymed.0 as u32,
            };
            // SAFETY: the drag's data object, for the length of the call that
            // handed it over; a medium released once read.
            let Ok(mut medium) = (unsafe { data.GetData(&format) }) else { continue };
            let bytes = medium_bytes(&medium);
            unsafe { ReleaseStgMedium(&mut medium) };
            if let Some(bytes) = bytes.and_then(|b| crate::clipboard::held(name, &b)) {
                out.kinds.push((name, bytes));
                break;
            }
        }
    }
    for name in OBJECTS {
        let format = FORMATETC {
            cfFormat: crate::clipboard::clip_format(name) as u16,
            ptd: std::ptr::null_mut(),
            dwAspect: DVASPECT_CONTENT.0,
            lindex: -1,
            tymed: TYMED_ISTORAGE.0 as u32,
        };
        let record = object_record(data, &format);
        if record.is_some() {
            out.record = record;
            break;
        }
    }
    out
}

/// Meno's record out of an object a drag carries as a storage: handed over
/// (`GetData`), or - as Word hands one over - written into a storage of
/// Meno's own (`GetDataHere`).
fn object_record(data: &IDataObject, format: &FORMATETC) -> Option<String> {
    // SAFETY: the drag's data object, for the length of the call that
    // handed it over; mediums released once read.
    unsafe {
        if let Ok(mut medium) = data.GetData(format) {
            let record = if medium.tymed == TYMED_ISTORAGE.0 as u32 {
                medium.u.pstg.as_ref().and_then(crate::ole::record_in_storage)
            } else {
                None
            };
            ReleaseStgMedium(&mut medium);
            if record.is_some() {
                return record;
            }
        }
        let bytes = CreateILockBytesOnHGlobal(None, true).ok()?;
        let stg = StgCreateDocfileOnILockBytes(&bytes, STGM_CREATE | STGM_READWRITE | STGM_SHARE_EXCLUSIVE, 0).ok()?;
        let mut medium = STGMEDIUM {
            tymed: TYMED_ISTORAGE.0 as u32,
            u: STGMEDIUM_0 { pstg: ManuallyDrop::new(Some(stg.clone())) },
            pUnkForRelease: ManuallyDrop::new(None),
        };
        let written = data.GetDataHere(format, &mut medium);
        ReleaseStgMedium(&mut medium);
        written.ok()?;
        crate::ole::record_in_storage(&stg)
    }
}

/// A medium's bytes: a block of memory's, or a stream's.
fn medium_bytes(medium: &STGMEDIUM) -> Option<Vec<u8>> {
    // SAFETY: the medium as handed over, read within its size.
    unsafe {
        if medium.tymed == TYMED_HGLOBAL.0 as u32 {
            let block = medium.u.hGlobal;
            let at = GlobalLock(block) as *const u8;
            if at.is_null() {
                return None;
            }
            let bytes = std::slice::from_raw_parts(at, GlobalSize(block)).to_vec();
            let _ = GlobalUnlock(block);
            return Some(bytes);
        }
        if medium.tymed == TYMED_ISTREAM.0 as u32 {
            let stream: &IStream = medium.u.pstm.as_ref()?;
            let mut stat = STATSTG::default();
            stream.Stat(&mut stat, STATFLAG_NONAME).ok()?;
            stream.Seek(0, STREAM_SEEK_SET, None).ok()?;
            let mut bytes = vec![0u8; stat.cbSize as usize];
            let mut got = 0u32;
            stream.Read(bytes.as_mut_ptr().cast(), bytes.len() as u32, Some(&mut got)).ok().ok()?;
            bytes.truncate(got as usize);
            return Some(bytes);
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ole::ClipData;
    use windows::core::{BOOL, HRESULT};
    use windows::Win32::Foundation::{DV_E_FORMATETC, E_NOTIMPL, OLE_E_ADVISENOTSUPPORTED};
    use windows::Win32::System::Com::{IAdviseSink, IDataObject_Impl, IEnumFORMATETC, IEnumSTATDATA};

    /// A Meno object as Word hands one over in a drag: written into a
    /// storage the taker makes (`GetDataHere`), never handed out.
    #[implement(IDataObject)]
    struct WritesOnAsking(String);

    impl IDataObject_Impl for WritesOnAsking_Impl {
        fn GetData(&self, _: *const FORMATETC) -> windows::core::Result<STGMEDIUM> {
            Err(DV_E_FORMATETC.into())
        }
        fn GetDataHere(&self, _: *const FORMATETC, medium: *mut STGMEDIUM) -> windows::core::Result<()> {
            // SAFETY: the taker's medium, a storage it made.
            let stg = unsafe { medium.as_ref().and_then(|m| m.u.pstg.as_ref()) }.ok_or(DV_E_FORMATETC)?;
            crate::ole::write_object(stg, &self.0, &crate::ole::test_emf())
        }
        fn QueryGetData(&self, _: *const FORMATETC) -> HRESULT {
            DV_E_FORMATETC
        }
        fn GetCanonicalFormatEtc(&self, _: *const FORMATETC, _: *mut FORMATETC) -> HRESULT {
            E_NOTIMPL
        }
        fn SetData(&self, _: *const FORMATETC, _: *const STGMEDIUM, _: BOOL) -> windows::core::Result<()> {
            Err(E_NOTIMPL.into())
        }
        fn EnumFormatEtc(&self, _: u32) -> windows::core::Result<IEnumFORMATETC> {
            Err(E_NOTIMPL.into())
        }
        fn DAdvise(&self, _: *const FORMATETC, _: u32, _: Ref<'_, IAdviseSink>) -> windows::core::Result<u32> {
            Err(OLE_E_ADVISENOTSUPPORTED.into())
        }
        fn DUnadvise(&self, _: u32) -> windows::core::Result<()> {
            Err(OLE_E_ADVISENOTSUPPORTED.into())
        }
        fn EnumDAdvise(&self) -> windows::core::Result<IEnumSTATDATA> {
            Err(OLE_E_ADVISENOTSUPPORTED.into())
        }
    }

    #[test]
    fn a_dragged_object_gives_up_its_record_and_the_rest_their_bytes() {
        // SAFETY: this test's own thread.
        let _ = unsafe { windows::Win32::System::Ole::OleInitialize(None) };
        let record = r#"{"format":"meno-structure","version":1,"atoms":[],"bonds":[]}"#;
        let object = crate::ole::embed_source(record, &crate::ole::test_emf()).unwrap();
        let fmt = |n: &str| crate::clipboard::clip_format(n) as u16;
        let data = crate::ole::clip_object(vec![
            (fmt("Embed Source"), ClipData::Storage(object)),
            (fmt("Art::GVML ClipFormat"), ClipData::Bytes(vec![1, 2, 3])),
            (fmt("Meno Structure"), ClipData::Bytes(b"{\"x\":1}\0".to_vec())),
        ]);
        let got = read(&data);
        assert_eq!(got.record.as_deref(), Some(record));
        let kind = |n: &str| got.kinds.iter().find(|(k, _)| *k == n).map(|(_, b)| b.clone());
        assert_eq!(kind("Art::GVML ClipFormat").as_deref(), Some(&[1u8, 2, 3][..]));
        // (text as it reads, the block's closing NUL left behind)
        assert_eq!(kind("Meno Structure").as_deref(), Some(&b"{\"x\":1}"[..]));
        assert!(kind("PNG").is_none());
    }

    #[test]
    fn an_object_word_writes_on_asking_gives_up_its_record_too() {
        // SAFETY: this test's own thread.
        let _ = unsafe { windows::Win32::System::Ole::OleInitialize(None) };
        let record = r#"{"format":"meno-structure","version":1,"atoms":[],"bonds":[]}"#;
        let data: IDataObject = WritesOnAsking(record.to_string()).into();
        let format = FORMATETC {
            cfFormat: crate::clipboard::clip_format("Embedded Object") as u16,
            ptd: std::ptr::null_mut(),
            dwAspect: DVASPECT_CONTENT.0,
            lindex: -1,
            tymed: TYMED_ISTORAGE.0 as u32,
        };
        assert_eq!(object_record(&data, &format).as_deref(), Some(record));
    }

    /// A picture as Word drags one: its bytes handed out only when asked for
    /// in a block of memory, and nothing asked for "either".
    #[implement(IDataObject)]
    struct OneMediumAtATime(Vec<u8>);

    impl IDataObject_Impl for OneMediumAtATime_Impl {
        fn GetData(&self, format: *const FORMATETC) -> windows::core::Result<STGMEDIUM> {
            // SAFETY: the taker's FORMATETC.
            let f = unsafe { format.as_ref() }.ok_or(DV_E_FORMATETC)?;
            if f.cfFormat != crate::clipboard::clip_format("Art::GVML ClipFormat") as u16 || f.tymed != TYMED_HGLOBAL.0 as u32 {
                return Err(DV_E_FORMATETC.into());
            }
            // SAFETY: memory of its own, filled while locked; the taker's once handed over.
            unsafe {
                let g = windows::Win32::System::Memory::GlobalAlloc(windows::Win32::System::Memory::GMEM_MOVEABLE, self.0.len())?;
                let at = GlobalLock(g) as *mut u8;
                std::ptr::copy_nonoverlapping(self.0.as_ptr(), at, self.0.len());
                let _ = GlobalUnlock(g);
                Ok(STGMEDIUM { tymed: TYMED_HGLOBAL.0 as u32, u: STGMEDIUM_0 { hGlobal: g }, pUnkForRelease: ManuallyDrop::new(None) })
            }
        }
        fn GetDataHere(&self, _: *const FORMATETC, _: *mut STGMEDIUM) -> windows::core::Result<()> {
            Err(E_NOTIMPL.into())
        }
        fn QueryGetData(&self, _: *const FORMATETC) -> HRESULT {
            DV_E_FORMATETC
        }
        fn GetCanonicalFormatEtc(&self, _: *const FORMATETC, _: *mut FORMATETC) -> HRESULT {
            E_NOTIMPL
        }
        fn SetData(&self, _: *const FORMATETC, _: *const STGMEDIUM, _: BOOL) -> windows::core::Result<()> {
            Err(E_NOTIMPL.into())
        }
        fn EnumFormatEtc(&self, _: u32) -> windows::core::Result<IEnumFORMATETC> {
            Err(E_NOTIMPL.into())
        }
        fn DAdvise(&self, _: *const FORMATETC, _: u32, _: Ref<'_, IAdviseSink>) -> windows::core::Result<u32> {
            Err(OLE_E_ADVISENOTSUPPORTED.into())
        }
        fn DUnadvise(&self, _: u32) -> windows::core::Result<()> {
            Err(OLE_E_ADVISENOTSUPPORTED.into())
        }
        fn EnumDAdvise(&self) -> windows::core::Result<IEnumSTATDATA> {
            Err(OLE_E_ADVISENOTSUPPORTED.into())
        }
    }

    #[test]
    fn a_program_that_hands_over_one_medium_at_a_time_is_asked_so() {
        let data: IDataObject = OneMediumAtATime(vec![7, 8, 9]).into();
        let got = read(&data);
        let gvml = got.kinds.iter().find(|(k, _)| *k == "Art::GVML ClipFormat").map(|(_, b)| b.clone());
        assert_eq!(gvml.as_deref(), Some(&[7u8, 8, 9][..]));
    }

    #[test]
    fn only_a_copy_is_offered_and_only_where_the_page_takes_it() {
        let mut allowed = DROPEFFECT(DROPEFFECT_COPY.0 | 2); // copy or move
        TAKES.store(false, Ordering::SeqCst);
        assert_eq!(effect(&mut allowed), DROPEFFECT_NONE);
        TAKES.store(true, Ordering::SeqCst);
        assert_eq!(effect(&mut allowed), DROPEFFECT_COPY);
        let mut move_only = DROPEFFECT(2);
        assert_eq!(effect(&mut move_only), DROPEFFECT_NONE);
        TAKES.store(false, Ordering::SeqCst);
    }
}
