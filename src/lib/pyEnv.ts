import {
  exists,
  readTextFile,
  writeTextFile,
  BaseDirectory,
  mkdir,
} from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import { platform } from "@tauri-apps/plugin-os";

async function sha256(s: string) {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(s)
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
export type PyProfile = "console" | "node";

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
  };
}

export async function ensurePyEnv(
  profile: PyProfile,
  opts?: { lockPath?: string; pythonVersion?: string }
): Promise<string> {
  const defaultLock =
    profile === "console"
      ? "resources/py/requirements.console.lock"
      : "resources/py/requirements.node.lock";
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

  await ensureDir("uv/stamps", BaseDirectory.AppData);

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

  if (needSetup) {
    await invoke("py_env_setup_uv", { payload: info });
    await writeJsonSafe(
      info.stampPath,
      { lockSha, py: info.pythonVersion },
      BaseDirectory.AppData
    );
  }

  return venvPy as string;
}
