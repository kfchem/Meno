import {
  exists,
  readTextFile,
  writeTextFile,
  BaseDirectory,
  mkdir,
} from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import { arch, platform } from "@tauri-apps/plugin-os";
import { pixiDownload, pixiPlatform } from "./pixiLock";
import { askToConnect } from "./net/network";
import { READER_PLUGINS, type PythonReader } from "./calc/catalog";

async function sha256(s: string) {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(s)
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
/**
 * A Python environment of Meno's own: the console's, workflows', RDKit's,
 * or a calculation reader plugin's (lib/calc/catalog), each from its lock.
 */
export type PyProfile = "console" | "node" | "chem" | `reader-${string}`;

/** The reader plugin a profile is the environment of; none, for Meno's own. */
const readerOf = (profile: PyProfile) => READER_PLUGINS.find((p): p is PythonReader => !p.builtin && p.profile === profile);

async function ensureDir(rel: string, baseDir: BaseDirectory) {
  const parts = rel.split("/").filter(Boolean);
  let cur = "";
  for (const p of parts) {
    cur = cur ? `${cur}/${p}` : p;
    const has = await exists(cur, { baseDir }).catch(() => false);
    if (!has) {
      try {
        await mkdir(cur, { baseDir });
      } catch {
        /* Ignore EEXIST, etc. */
      }
    }
  }
}

async function writeJsonSafe(
  rel: string,
  data: unknown,
  baseDir: BaseDirectory
) {
  const parent = rel.split("/").slice(0, -1).join("/");
  if (parent) await ensureDir(parent, baseDir);
  await writeTextFile(rel, JSON.stringify(data, null, 2), { baseDir });
}

type PyEnvInfo = {
  os: "windows" | "macos" | "linux";
  /** What makes it: uv, or pixi - a reader's whose environment needs conda-forge. */
  host: "uv" | "pixi";
  lockPath: string;
  venvHome: string;
  venvPythonRel: string;
  stampPath: string;
  pythonVersion: string;
  /** What its downloads are for, as the user allows them, and in words. */
  purpose: string;
  label: string;
};

/** What each profile is for, in words. */
const PROFILE_USE: Record<"console" | "node" | "chem", string> = {
  console: "the console",
  node: "workflows",
  chem: "chemistry",
};
const purposeOf = (profile: PyProfile) =>
  readerOf(profile) ? `reading calculations with ${readerOf(profile)!.name}` : PROFILE_USE[profile as keyof typeof PROFILE_USE];

/** Each profile's lock file, among the app's resources. */
const lockOf = (profile: PyProfile) => readerOf(profile)?.lock ?? `resources/py/requirements.${profile}.lock`;

async function baseInfo(
  profile: PyProfile,
  lockPath: string,
  pyVer = "3.12"
): Promise<PyEnvInfo> {
  const os = await platform();
  const pixi = readerOf(profile)?.env === "pixi";
  return {
    os: os as any,
    host: pixi ? "pixi" : "uv",
    lockPath,
    // (pixi's environments kept where pixi makes them: `.pixi/envs/default` beside the manifest)
    venvHome: pixi ? `pixi/${profile}` : `uv/${profile}/venv`,
    venvPythonRel: pixi
      ? os === "windows"
        ? ".pixi/envs/default/python.exe"
        : ".pixi/envs/default/bin/python"
      : os === "windows"
        ? "Scripts/python.exe"
        : "bin/python",
    stampPath: pixi ? `pixi/stamps/${profile}.json` : `uv/stamps/${profile}.json`,
    pythonVersion: pyVer,
    purpose: `python-env:${profile}`,
    label:
      profile === "chem"
        ? "Setting up RDKit for chemistry"
        : readerOf(profile)
          ? `Setting up ${readerOf(profile)!.name} for reading calculations`
          : `Setting up Python for ${purposeOf(profile)}`,
  };
}

type EnvOptions = { lockPath?: string; pythonVersion?: string };

/** Where a profile's environment stands, and whether it needs setting up. */
async function envState(profile: PyProfile, opts?: EnvOptions) {
  const defaultLock = lockOf(profile);
  const fallbackLock = "resources/py/requirements.lock";
  const useDefault = await exists(defaultLock, {
    baseDir: BaseDirectory.Resource,
  });
  const lockPath = opts?.lockPath ?? (useDefault ? defaultLock : fallbackLock);

  const info = await baseInfo(profile, lockPath, opts?.pythonVersion ?? "3.12");

  const lockText = await readTextFile(info.lockPath, {
    baseDir: BaseDirectory.Resource,
  });
  const lockSha = await sha256(lockText);

  const stampExists = await exists(info.stampPath, {
    baseDir: BaseDirectory.AppData,
  });

  let stamp: { lockSha?: string; py?: string } = {};
  if (stampExists) {
    try {
      stamp = JSON.parse(
        await readTextFile(info.stampPath, { baseDir: BaseDirectory.AppData })
      );
    } catch {}
  }

  const venvPy = await invoke<string>("py_env_python_path_uv", {
    payload: info,
  });

  // (made: its interpreter there - or, for pixi's, the activation kept once
  // it is made; the interpreter there is a link the webview's file scope
  // cannot follow, and in a folder whose name starts with a dot)
  const made = info.host === "pixi" ? `${info.venvHome}/activation.json` : `${info.venvHome}/${info.venvPythonRel}`;
  const needSetup =
    !(await exists(made, {
      baseDir: BaseDirectory.AppData,
    })) ||
    stamp.lockSha !== lockSha ||
    stamp.py !== info.pythonVersion;

  return { info, lockText, lockSha, venvPy, needSetup };
}

/**
 * Whether a profile's environment is set up as its lock file now says - so
 * that using it needs nothing downloaded. Sets nothing up, and asks nothing.
 */
export async function pyEnvReady(profile: PyProfile): Promise<boolean> {
  try {
    return !(await envState(profile)).needSetup;
  } catch {
    return false;
  }
}

export async function ensurePyEnv(
  profile: PyProfile,
  opts?: EnvOptions
): Promise<string> {
  const { info, lockText, lockSha, venvPy, needSetup } = await envState(
    profile,
    opts
  );
  await ensureDir(info.host === "pixi" ? "pixi/stamps" : "uv/stamps", BaseDirectory.AppData);

  if (needSetup && info.host === "pixi") {
    // (a conda-forge environment: what pixi downloads on this computer, from its lock)
    const reader = readerOf(profile)!;
    const download = pixiDownload(lockText, pixiPlatform(info.os, arch()));
    const mb = Math.round(download.bytes / 1e6 / 10) * 10;
    const allowed = await askToConnect({
      purpose: info.purpose,
      title: `Download ${reader.name} for reading calculations?`,
      detail:
        `${reader.name} reads calculation programs' output for Meno, in a Python of its own ` +
        `with the ${download.packages} packages it needs` +
        (mb ? ` (about ${mb} MB)` : "") +
        `, in its data folder. pixi, fetched the first time it is needed, downloads them - once, ` +
        `every file checked against the fingerprint Meno carries for it:`,
      sources: [
        "pixi the first time, from its makers' releases (github.com)",
        "the packages, from conda-forge (conda.anaconda.org)",
        ...(download.pypi ? ["the rest, from the Python Package Index (pypi.org, files.pythonhosted.org)"] : []),
      ],
    });
    if (!allowed) {
      throw new Error(`${info.label} needs the network, and was not allowed it (Meno is offline, or the download was declined).`);
    }
    await invoke("py_env_setup_pixi", { payload: info });
    await writeJsonSafe(info.stampPath, { lockSha, py: info.pythonVersion }, BaseDirectory.AppData);
  } else if (needSetup) {
    // The first time, the user says whether it may download at all.
    const packages = lockText
      .split(/\r?\n/)
      .filter((line) => /^[A-Za-z0-9_.-]+==/.test(line)).length;
    const hashed = /^\s*--hash=/m.test(lockText);
    const allowed = await askToConnect({
      purpose: info.purpose,
      title:
        profile === "chem"
          ? "Download RDKit for chemistry?"
          : readerOf(profile)
            ? `Download ${readerOf(profile)!.name} for reading calculations?`
            : `Download Python for ${purposeOf(profile)}?`,
      detail:
        (profile === "chem"
          ? "Meno's chemistry - hydrogens and valence, SMILES, clean-up, stereo labels - " +
            `runs on RDKit, in a Python ${info.pythonVersion} of its own `
          : readerOf(profile)
            ? `${readerOf(profile)!.name} reads calculation programs' output for Meno, ` +
              `in a Python ${info.pythonVersion} of its own `
            : `To run Python, Meno sets up a Python ${info.pythonVersion} of its own, `) +
        `with the ${packages} packages it needs, in its data folder. ` +
        `Astral's uv, fetched the first time it is needed, downloads them - once` +
        (hashed ? ", every file checked against the fingerprint Meno carries for it:" : ":"),
      sources: [
        "uv the first time, and Python itself, from Astral, who make uv (releases.astral.sh)",
        "the packages, from the Python Package Index (pypi.org, files.pythonhosted.org)",
      ],
    });
    if (!allowed) {
      throw new Error(
        `${info.label} needs the network, and was not allowed it` +
          " (Meno is offline, or the download was declined).",
      );
    }
    await invoke("py_env_setup_uv", { payload: info });
    await writeJsonSafe(
      info.stampPath,
      { lockSha, py: info.pythonVersion },
      BaseDirectory.AppData
    );
  }

  return venvPy as string;
}

/**
 * Takes a reader plugin's environment away, and its record of being set
 * up: what Settings' *Plugins* removes. Meno's own environments
 * are not taken away this way.
 */
export async function removePyEnv(profile: PyProfile): Promise<void> {
  if (!readerOf(profile)) throw new Error(`${profile} is not a reader's environment`);
  await invoke("py_env_remove", { payload: await baseInfo(profile, lockOf(profile)) });
}
