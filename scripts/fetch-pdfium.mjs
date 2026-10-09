// The PDF trial (docs/PDF.md, step 0): PDFium's prebuilt library for this
// system, fetched from bblanchon/pdfium-binaries at a pinned release, checked
// against its SHA-256, and put in src-tauri/pdfium/<system>/ with its
// licences - where the build carries it from. Nothing here is kept in git.
//
//   node scripts/fetch-pdfium.mjs
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync, copyFileSync, cpSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const RELEASE = "chromium/8086";
const PINNED = {
  macos: { asset: "pdfium-mac-arm64.tgz", sha256: "e98679e052c07edbb5a627980902abb823d4b3f35744d877bd21668bd9fc13ab", lib: "lib/libpdfium.dylib" },
  windows: { asset: "pdfium-win-x64.tgz", sha256: "1fd8af952832dbb0eb16d9249f68fe09e5f5ebf7c3dd9f6066ea2720cc28487d", lib: "bin/pdfium.dll" },
  linux: { asset: "pdfium-linux-x64.tgz", sha256: "588577cf52dabc1a444988bac841920df54cc2f141801424de97ab04f4fbb935", lib: "lib/libpdfium.so" },
};

const system = process.platform === "darwin" ? "macos" : process.platform === "win32" ? "windows" : "linux";
const pin = PINNED[system];
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "src-tauri", "pdfium", system);

const url = `https://github.com/bblanchon/pdfium-binaries/releases/download/${encodeURIComponent(RELEASE)}/${pin.asset}`;
const res = await fetch(url);
if (!res.ok) throw new Error(`${url}: ${res.status}`);
const bytes = Buffer.from(await res.arrayBuffer());
const sha = createHash("sha256").update(bytes).digest("hex");
if (sha !== pin.sha256) throw new Error(`${pin.asset}: SHA-256 ${sha}, not the pinned ${pin.sha256}`);

const work = mkdtempSync(join(tmpdir(), "pdfium-"));
const archive = join(work, pin.asset);
writeFileSync(archive, bytes);
execFileSync("tar", ["-xzf", archive, "-C", work]);
mkdirSync(out, { recursive: true });
copyFileSync(join(work, pin.lib), join(out, pin.lib.split("/").pop()));
cpSync(join(work, "licenses"), join(out, "licenses"), { recursive: true });
copyFileSync(join(work, "LICENSE"), join(out, "licenses", "pdfium-binaries.txt"));
rmSync(work, { recursive: true, force: true });
console.log(`PDFium ${RELEASE} for ${system} in ${out}`);
