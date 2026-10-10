#!/usr/bin/env node
/**
 * troika-three-text, which draws the text on the canvas, as Meno needs it
 * (docs/ARCHITECTURE.md, *Directory map*, ui/fonts) - run after every install
 * (`postinstall`), so that `npm ci` in CI and in the release builds it too.
 *
 * troika places a run's letters by its font's GPOS lookups - all of them,
 * whatever feature each belongs to, where a browser applies to horizontal
 * text only kerning and marks' places (`kern`, `mark`, `mkmk`). IBM Plex
 * Sans JP's half-width and proportional forms (`halt`, `palt`, and their
 * vertical `vhal`, `vpal`) were applied with them: its ideographic comma
 * took a fifth of its width, and the letters after it lay over it. Here
 * troika applies the lookups of those three features alone, as GSUB's are
 * already chosen by feature.
 *
 * And troika takes each letter from the font the one before it came from,
 * where that font has it - so after a Japanese letter, the Latin ones and
 * the signs that follow came from IBM Plex Sans JP, a degree sign there a
 * full em wide, where Meno measured them in the label's own typeface
 * (lib/chem/labelFonts). Here, as a browser does, each letter is taken
 * from the first of the fonts that has it - a space alone going on in the
 * one before.
 *
 * It changes troika's own files in node_modules, as they are for the
 * version Meno takes: a version, or a text, other than those it knows
 * stops it, to be looked at again. A file already changed is left as it is.
 */
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "node_modules", "troika-three-text");
const VERSION = "0.52.5";
const FILES = ["dist/troika-three-text.esm.js", "dist/troika-three-text.umd.js"];
const SIGN = "meno: GPOS by feature";
const SIGN_FONTS = "meno: each letter from the first font";

/** The loop over GPOS's lookups, and the line it begins with. */
const LOOP = /const llist = gpos\.lookupList;(\s*\n)(\s*)for \(let i = 0; i < llist\.length; i\+\+\) \{\n/;
/** A letter taken from the font the one before came from, where that has it. */
const CARRY = /\(prevCharResult === RESOLVED && fontResolutions\[charResolutions\[i - 1\]\]\.supportsCodePoint\(codePoint\)\) \|\|/;

if (!existsSync(root)) process.exit(0);
const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
if (version !== VERSION) {
  console.error(`scripts/patch-troika.mjs: troika-three-text is ${version}, not ${VERSION} - see whether it still applies every GPOS lookup, and change this script to suit.`);
  process.exit(1);
}
let changed = false;
for (const file of FILES) {
  const path = join(root, file);
  let text = readFileSync(path, "utf8");
  if (!text.includes(SIGN_FONTS)) {
    if (!CARRY.test(text)) {
      console.error(`scripts/patch-troika.mjs: ${file} takes letters from fonts other than as ${VERSION} does - look at it again.`);
      process.exit(1);
    }
    text = text.replace(CARRY, `/* ${SIGN_FONTS} (scripts/patch-troika.mjs) */`);
    writeFileSync(path, text);
    changed = true;
  }
  if (text.includes(SIGN)) continue;
  if (!LOOP.test(text)) {
    console.error(`scripts/patch-troika.mjs: ${file} has no loop over GPOS's lookups as ${VERSION}'s - look at it again.`);
    process.exit(1);
  }
  const out = text.replace(
    LOOP,
    (_, nl, indent) =>
      `const llist = gpos.lookupList;\n` +
      `${indent}/* ${SIGN}: kern, mark and mkmk alone, as a browser applies them (scripts/patch-troika.mjs) */\n` +
      `${indent}const menoUsed = gpos.menoUsed || (gpos.menoUsed = (gpos.featureList || []).reduce((used, f) => { if (/^(kern|mark|mkmk)$/.test(f.tag)) for (let t = 0; t < f.tab.length; t++) used[f.tab[t]] = true; return used; }, []));${nl}` +
      `${indent}for (let i = 0; i < llist.length; i++) {\n` +
      `${indent}  if (!menoUsed[i]) continue;\n`,
  );
  writeFileSync(path, out);
  changed = true;
}
// (what the dev server made of the files before, made again)
if (changed) rmSync(join(root, "..", ".vite"), { recursive: true, force: true });
