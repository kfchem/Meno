//! Keeping Meno up to date, by itself: a newer Meno is looked for on the
//! project's GitHub Releases, downloaded in the background, and installed
//! as Meno quits - or when the user asks to restart into it.
//!
//! It goes on the network only as Meno's network lets it (net.rs): as a
//! task with the "app-update" purpose - refused when Meno is offline, or
//! until the user has allowed it - whose requests go through Meno's proxy,
//! so that each connection is shown as it is made and kept on the record.
//! The download is checked against the signing key in tauri.conf.json
//! before anything is installed. A development build, and a Meno Windows
//! started for Office, neither look nor install.

use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_updater::{Update, UpdaterExt};

use crate::net::Net;

/// The purpose Meno's network knows updating by.
pub const PURPOSE: &str = "app-update";

/// Where the updater is, as the page shows it ("update:state").
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateState {
    /// This Meno's version.
    pub current: String,
    /// "idle", "checking", "downloading", "ready" (installed as Meno quits),
    /// "current" (nothing newer), "failed", or "unavailable" (this Meno
    /// does not update itself).
    pub phase: &'static str,
    /// The newer version, once one is found.
    pub version: Option<String>,
    /// What its release says about it.
    pub notes: Option<String>,
    /// When GitHub was last asked (milliseconds since the epoch).
    pub checked: Option<u64>,
    /// Why the last look failed.
    pub error: Option<String>,
}

/// The updater's state, managed by the app.
pub struct Updates {
    state: Mutex<UpdateState>,
    /// A newer Meno, downloaded and checked, waiting to be installed.
    ready: Mutex<Option<(Update, Vec<u8>)>>,
    /// Whether a look is under way.
    busy: AtomicBool,
    /// Whether Meno starts again once the update is installed.
    restart: AtomicBool,
}

impl Updates {
    pub fn new(current: String) -> Self {
        let phase = if updates_itself() { "idle" } else { "unavailable" };
        Self {
            state: Mutex::new(UpdateState { current, phase, version: None, notes: None, checked: None, error: None }),
            ready: Mutex::new(None),
            busy: AtomicBool::new(false),
            restart: AtomicBool::new(false),
        }
    }
}

/// Whether this Meno updates itself: not a development build, and not one
/// Windows started for Office (it goes again as the document is done).
fn updates_itself() -> bool {
    #[cfg(windows)]
    if crate::ole::started_for_office() {
        return false;
    }
    !cfg!(debug_assertions)
}

fn now_ms() -> u64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

/// Changes the state, and tells the page.
fn set(app: &AppHandle, change: impl FnOnce(&mut UpdateState)) -> UpdateState {
    let updates = app.state::<Updates>();
    let state = {
        let mut s = updates.state.lock().unwrap();
        change(&mut s);
        s.clone()
    };
    let _ = app.emit("update:state", state.clone());
    state
}

#[tauri::command]
pub fn update_state(app: AppHandle) -> UpdateState {
    app.state::<Updates>().state.lock().unwrap().clone()
}

/// Asks GitHub for a newer Meno, through Meno's network, and downloads it
/// when there is one, to be installed as Meno quits.
#[tauri::command]
pub async fn update_check(app: AppHandle) -> UpdateState {
    let updates = app.state::<Updates>();
    if !updates_itself() || updates.ready.lock().unwrap().is_some() || updates.busy.swap(true, Ordering::SeqCst) {
        return updates.state.lock().unwrap().clone();
    }
    let state = look(&app).await;
    app.state::<Updates>().busy.store(false, Ordering::SeqCst);
    state
}

async fn look(app: &AppHandle) -> UpdateState {
    let failed = |app: &AppHandle, e: String| {
        set(app, |s| {
            s.phase = "failed";
            s.error = Some(e);
        })
    };
    // (refused here when Meno is offline, or updating is not allowed)
    let task = match app.state::<Net>().begin(PURPOSE, "Keeping Meno up to date") {
        Ok(task) => task,
        Err(e) => return failed(app, e),
    };
    set(app, |s| {
        s.phase = "checking";
        s.error = None;
    });
    let Some(proxy) = task.proxy_url().and_then(|p| tauri::Url::parse(&p).ok()) else {
        return failed(app, "Meno's network is not up".into());
    };
    let updater = match app.updater_builder().proxy(proxy).build() {
        Ok(updater) => updater,
        Err(e) => return failed(app, e.to_string()),
    };
    let found = updater.check().await;
    set(app, |s| s.checked = Some(now_ms()));
    let update = match found {
        Ok(Some(update)) => update,
        // (nothing newer - or no release published at all yet: the endpoint
        // answered, with nothing to offer)
        Ok(None) | Err(tauri_plugin_updater::Error::ReleaseNotFound) => {
            task.finish(true);
            return set(app, |s| s.phase = "current");
        }
        Err(e) => {
            task.finish(false);
            return failed(app, e.to_string());
        }
    };
    set(app, |s| {
        s.phase = "downloading";
        s.version = Some(update.version.clone());
        s.notes = update.body.clone();
    });
    // (checked against the signing key as it is downloaded)
    match update.download(|_, _| {}, || {}).await {
        Ok(bytes) => {
            task.finish(true);
            *app.state::<Updates>().ready.lock().unwrap() = Some((update, bytes));
            set(app, |s| s.phase = "ready")
        }
        Err(e) => {
            task.finish(false);
            failed(app, e.to_string())
        }
    }
}

/// The user asks to restart into the update downloaded: it is installed as
/// Meno quits, and Meno started again after it. (The page then closes the
/// window, as a quit - so that unsaved work is asked about first.)
#[tauri::command]
pub fn update_restart_after_quit(app: AppHandle) {
    app.state::<Updates>().restart.store(true, Ordering::SeqCst);
}

/// As Meno quits: the update downloaded, if there is one, is installed -
/// quietly - and Meno started again only if the user asked for that.
pub fn install_on_exit(app: &AppHandle) {
    let updates = app.state::<Updates>();
    if !updates_itself() {
        return;
    }
    let Some((update, bytes)) = updates.ready.lock().unwrap().take() else { return };
    let restart = updates.restart.load(Ordering::SeqCst);
    // (on Windows the installer is started and this process ends here)
    if let Err(e) = update.restart_after_install(restart).install(bytes) {
        eprintln!("the update could not be installed: {e}");
        return;
    }
    if restart {
        app.restart();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_development_build_does_not_update_itself() {
        // (tests are built with debug assertions, as a development build is)
        let updates = Updates::new("0.1.0".into());
        let state = updates.state.lock().unwrap();
        assert_eq!((state.phase, state.current.as_str()), ("unavailable", "0.1.0"));
        assert!(updates.ready.lock().unwrap().is_none());
    }
}
