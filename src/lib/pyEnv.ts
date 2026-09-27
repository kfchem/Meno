import {
  exists,
  readTextFile,
  writeTextFile,
  BaseDirectory,
  mkdir,
} from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import { platform } from "@tauri-apps/plugin-os";
import { askToConnect } from "./net/network";

async function sha256(s: string) {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(s)
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
export type PyProfile = "console" | "node" | "chem";

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
  uv: string;
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
const PROFILE_USE: Record<PyProfile, string> = {
  console: "the console",
  node: "workflows",
  chem: "chemistry",
};

/** Each profile's lock file, among the app's resources. */
const PROFILE_LOCK: Record<PyProfile, string> = {
  console: "resources/py/requirements.console.lock",
  node: "resources/py/requirements.node.lock",
  chem: "resources/py/requirements.chem.lock",
};

async function baseInfo(
  profile: PyProfile,
  lockPath: string,
  pyVer = "3.12"
): Promise<PyEnvInfo> {
  const os = await platform();
  return {
    os: os as any,
    uv: os === "windows" ? "resources/py/uv.exe" : "resources/py/uv",
    lockPath,
    venvHome: `uv/${profile}/venv`,
    venvPythonRel: os === "windows" ? "Scripts/python.exe" : "bin/python",
    stampPath: `uv/stamps/${profile}.json`,
    pythonVersion: pyVer,
    purpose: `python-env:${profile}`,
    label:
      profile === "chem"
        ? "Setting up RDKit for chemistry"
        : `Setting up Python for ${PROFILE_USE[profile]}`,
  };
}

type EnvOptions = { lockPath?: string; pythonVersion?: string };

/** Where a profile's environment stands, and whether it needs setting up. */
async function envState(profile: PyProfile, opts?: EnvOptions) {
  const defaultLock = PROFILE_LOCK[profile];
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

  const needSetup =
    !(await exists(info.venvHome + "/" + info.venvPythonRel, {
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
  await ensureDir("uv/stamps", BaseDirectory.AppData);

  if (needSetup) {
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
          : `Download Python for ${PROFILE_USE[profile]}?`,
      detail:
        (profile === "chem"
          ? "Meno's chemistry - hydrogens and valence, SMILES, clean-up, stereo labels - " +
            `runs on RDKit, in a Python ${info.pythonVersion} of its own `
          : `To run Python, Meno sets up a Python ${info.pythonVersion} of its own, `) +
        `with the ${packages} packages it needs, in its data folder. ` +
        `uv, which comes with Meno, downloads them - once` +
        (hashed ? ", every file checked against the fingerprint Meno carries for it:" : ":"),
      sources: [
        "Python itself, from Astral, who make uv (releases.astral.sh)",
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
