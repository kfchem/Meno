/**
 * Fails when the Tauri Rust crates and their npm counterparts drift apart on
 * major.minor. `tauri build` refuses to run in that case (`tauri dev` only
 * warns), so without this check a release build can be broken while every CI
 * job still passes.
 */
import { readFileSync } from "node:fs";

const PAIRS = [
  ["@tauri-apps/api", "tauri"],
  ["@tauri-apps/plugin-fs", "tauri-plugin-fs"],
  ["@tauri-apps/plugin-os", "tauri-plugin-os"],
  ["@tauri-apps/plugin-opener", "tauri-plugin-opener"],
];

/** Crate name -> version, read from the lock file without parsing full TOML. */
function lockedCrates() {
  const lock = readFileSync(
    new URL("../src-tauri/Cargo.lock", import.meta.url),
    "utf8",
  );
  const versions = new Map();
  let name = null;
  for (const raw of lock.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('name = "')) {
      name = line.slice('name = "'.length, -1);
    } else if (name && line.startsWith('version = "')) {
      versions.set(name, line.slice('version = "'.length, -1));
      name = null;
    }
  }
  return versions;
}

function installedNpmVersion(pkg) {
  try {
    const json = readFileSync(
      new URL(`../node_modules/${pkg}/package.json`, import.meta.url),
      "utf8",
    );
    return JSON.parse(json).version;
  } catch {
    return undefined;
  }
}

const crates = lockedCrates();
const minor = (v) => v.split(".").slice(0, 2).join(".");
const problems = [];

for (const [pkg, crate] of PAIRS) {
  const npmVersion = installedNpmVersion(pkg);
  const crateVersion = crates.get(crate);
  if (!npmVersion) {
    problems.push(`${pkg}: not installed (run npm ci first)`);
  } else if (!crateVersion) {
    problems.push(`${crate}: not found in src-tauri/Cargo.lock`);
  } else if (minor(npmVersion) !== minor(crateVersion)) {
    problems.push(
      `${crate} ${crateVersion} vs ${pkg} ${npmVersion} (major.minor must match)`,
    );
  }
}

if (problems.length) {
  console.error("Tauri crate/npm version mismatch:");
  for (const p of problems) console.error("  " + p);
  console.error(
    "\nFix in src-tauri/ with: cargo update -p <crate> --precise <version>",
  );
  process.exit(1);
}

console.log("Tauri crate and npm package versions are aligned.");
