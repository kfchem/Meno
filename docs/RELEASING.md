# Releasing Meno

A release is a draft on the project's GitHub Releases, built by
`.github/workflows/release.yml` from a tag. The Menos already installed
look for `latest.json` there (`src-tauri/src/update.rs`) and update
themselves - so nothing reaches them until the draft is published.

## Once: the updater's signing key

Every update is signed, and an installed Meno installs only what its
public key (`plugins.updater.pubkey` in `src-tauri/tauri.conf.json`)
checks. The private key is the maintainer's, and stays out of the
repository.

1. Make the key pair, choosing a password when asked:

   ```bash
   npx tauri signer generate -w "$HOME/.tauri/meno-updater.key"
   ```

   This writes the private key (`meno-updater.key`) and the public key
   (`meno-updater.key.pub`).
2. Keep the private key and its password somewhere safe, with a copy
   elsewhere. Losing them means the Menos installed can no longer be
   updated: they would have to be installed again by hand. (A new key can
   be brought in by an update signed with the old one, which carries the
   new public key.)
3. On GitHub, under Settings › Secrets and variables › Actions, add two
   repository secrets: `TAURI_SIGNING_PRIVATE_KEY` (the private key file's
   contents) and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (its password).
4. Put the public key file's contents in `plugins.updater.pubkey`.

This is not code signing (Authenticode, Apple's Developer ID): without
that, Windows' SmartScreen warns about an installer downloaded for the
first time, and macOS asks before opening an app from the internet.
Updates themselves are checked with the updater's key, whether or not the
installers are code-signed, and code signing can be taken up, or dropped,
at any release.

## Each release

1. On a branch: raise the version, the same in both `package.json` and
   `src-tauri/Cargo.toml` (the app takes its version from `package.json`),
   and merge it into `main` as usual.
2. Tag `main` with the version, prefixed `v`, and push the tag:

   ```bash
   git tag v0.2.0 origin/main
   git push origin v0.2.0
   ```

   The workflow refuses a tag that is not the version in both files.
3. The workflow builds the Windows installer (NSIS, per user) and its
   update, signs the update, and puts both on a **draft** release with
   `latest.json`. It then checks that the update's signature names the
   version it is released as (see below).
4. If the run passed: try the draft's installer, write the release notes
   on the release page if you like, and publish it. The Menos installed
   find it the next time they look - as they start, and every few hours.
   Never publish the draft of a run that failed. (Editing the notes does
   not change `latest.json`, whose `notes` were written as the workflow
   ran; Meno does not show them for now.)

An installed Meno checks more than the signature itself: the signature's
trusted comment must carry the version `latest.json` announces
(`requireSignedVersion` in `tauri.conf.json`), so that an older release
cannot be passed off as a newer one. The Tauri CLI writes that version
from 2.12 on; an update signed without it is refused by every Meno from
0.1.1 on, which is what the workflow's last step guards against.

A Mac build is to be added to the workflow as a job of its own, with the
Apple signing it needs; its update goes into the same `latest.json`.

## What an installed Meno does

- It looks only when the user has allowed it (the `app-update` purpose,
  asked once) and Meno is not offline; each connection is shown and
  recorded like any other (`docs/ARCHITECTURE.md`, The network).
- A newer version is downloaded in the background and checked against the
  public key; it is installed as Meno quits (on Windows, the NSIS
  installer, quietly), or at once through a restart the user asks for.
- The installer registers Meno's class for Office again (its
  `--register-ole` hook), so structures in documents keep opening in the
  Meno installed.
- The installer it ran stays in the temporary folder
  (`%TEMP%\Meno-<version>-updater-…`, some 17 MB), since Meno has ended
  by then; the next Meno to start takes it away, once it is ten minutes
  old.
