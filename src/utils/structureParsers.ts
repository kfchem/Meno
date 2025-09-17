import { elements } from "./atomUtils";

export type Atom = {
  x: number;
  y: number;
  z: number;
  element: string;
};

export type Bond = {
  a1: number;
  a2: number;
  order: number;
  stereoCode?: number;
};

export type Molecule = {
  atoms: Atom[];
  bonds: Bond[];
};

export function parseSDF(sdf: string): Molecule[] {
  const norm = sdf.replace(/\r\n?/g, "\n");
  const blocks = norm
    .split(/\${4,}/)
    .map((b) => b.trim())
    .filter((b) => b.length > 0);

  const out: Molecule[] = [];
  for (const block of blocks) {
    if (/\bV3000\b/.test(block)) {
      const m = parseMolV3000(block);
      if (m) out.push(m);
      continue;
    }
    const lines = block.split("\n");
    let countsIdx = 3;
    let atomCount = Number.parseInt(lines[3]?.slice(0, 3));
    let bondCount = Number.parseInt(lines[3]?.slice(3, 6));
    if (!Number.isFinite(atomCount) || !Number.isFinite(bondCount)) {
      countsIdx = -1;
      const LIM = Math.min(16, lines.length);
      for (let i = 0; i < LIM; i++) {
        const L = lines[i] || "";
        const a = Number.parseInt(L.slice(0, 3));
        const b = Number.parseInt(L.slice(3, 6));
        if (Number.isFinite(a) && Number.isFinite(b)) {
          countsIdx = i;
          atomCount = a;
          bondCount = b;
          break;
        }
        const m = L.trim().match(/^(\d{1,3})\s+(\d{1,3})\b/);
        if (m) {
          countsIdx = i;
          atomCount = Number.parseInt(m[1]);
          bondCount = Number.parseInt(m[2]);
          break;
        }
      }
    }
    const atoms: Atom[] = [];
    const bonds: Bond[] = [];
    if (
      Number.isFinite(atomCount) &&
      Number.isFinite(bondCount) &&
      countsIdx >= 0
    ) {
      const firstAtom = countsIdx + 1;
      for (let i = 0; i < atomCount; i++) {
        const line = lines[firstAtom + i] || "";
        let x = Number.parseFloat(line.slice(0, 10));
        let y = Number.parseFloat(line.slice(10, 20));
        let z = Number.parseFloat(line.slice(20, 30));
        let element = (line.slice(31, 34) || "").trim();
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
          const toks = line.trim().split(/\s+/);
          x = Number.parseFloat(toks[0] ?? "0");
          y = Number.parseFloat(toks[1] ?? "0");
          z = Number.parseFloat(toks[2] ?? "0");
          element = (toks[3] ?? element ?? "C").trim();
        }
        atoms.push({ x, y, z, element: element || "C" });
      }
      const firstBond = firstAtom + atomCount;
      for (let i = 0; i < bondCount; i++) {
        const line = lines[firstBond + i] || "";
        let a1 = Number.parseInt(line.slice(0, 3)) - 1;
        let a2 = Number.parseInt(line.slice(3, 6)) - 1;
        let order = Number.parseInt(line.slice(6, 9));
        let stereoRaw = Number.parseInt(line.slice(9, 12));
        if (
          !Number.isFinite(a1) ||
          !Number.isFinite(a2) ||
          !Number.isFinite(order)
        ) {
          const toks = line.trim().split(/\s+/);
          a1 = (Number.parseInt(toks[0] ?? "1") - 1) | 0;
          a2 = (Number.parseInt(toks[1] ?? "2") - 1) | 0;
          order = Number.parseInt(toks[2] ?? "1") | 1;
          stereoRaw = Number.parseInt(toks[3] ?? "0");
        }
        const stereoCode = Number.isFinite(stereoRaw) ? stereoRaw : undefined;
        if (
          Number.isFinite(a1) &&
          Number.isFinite(a2) &&
          Number.isFinite(order)
        )
          bonds.push({ a1, a2, order, stereoCode });
      }
    }
    out.push({ atoms, bonds });
  }
  return out;
}

export function parseXYZ(xyz: string): Molecule[] {
  const lines = xyz.trim().split("\n");
  const frames: Molecule[] = [];

  let i = 0;
  while (i < lines.length) {
    const atomCount = parseInt(lines[i].trim());
    const atomLines = lines.slice(i + 2, i + 2 + atomCount);

    const atoms: Atom[] = atomLines.map((line) => {
      const [element, x, y, z] = line.trim().split(/\s+/);
      return {
        element,
        x: parseFloat(x),
        y: parseFloat(y),
        z: parseFloat(z),
      };
    });

    const bonds: Bond[] = [];
    for (let m = 0; m < atoms.length; m++) {
      for (let n = m + 1; n < atoms.length; n++) {
        const a1 = atoms[m];
        const a2 = atoms[n];
        const r1 = elements.find((e) => e.symbol === a1.element)?.single ?? 1.5;
        const r2 = elements.find((e) => e.symbol === a2.element)?.single ?? 1.5;
        const threshold = (r1 + r2) * 1.1;

        const dx = a1.x - a2.x;
        const dy = a1.y - a2.y;
        const dz = a1.z - a2.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (dist < threshold) {
          bonds.push({ a1: m, a2: n, order: 1 });
        }
      }
    }

    frames.push({ atoms, bonds });
    i += 2 + atomCount;
  }

  return frames;
}

function parseMolV3000(block: string): Molecule | null {
  const raw = block.replace(/\r\n?/g, "\n");
  const lines0 = raw.split("\n");
  const lines: string[] = [];
  for (let i = 0; i < lines0.length; i++) {
    const L = lines0[i];
    if (L.endsWith("-")) {
      const next = (lines0[i + 1] || "").trimStart();
      lines.push(L.slice(0, -1) + next);
      i++;
    } else {
      lines.push(L);
    }
  }
  const atoms: Atom[] = [];
  const bonds: Bond[] = [];
  let inAtom = false;
  let inBond = false;
  for (const line of lines) {
    const s = line.trim();
    if (/^M\s+V30\s+BEGIN\s+ATOM/.test(s)) {
      inAtom = true;
      inBond = false;
      continue;
    }
    if (/^M\s+V30\s+END\s+ATOM/.test(s)) {
      inAtom = false;
      continue;
    }
    if (/^M\s+V30\s+BEGIN\s+BOND/.test(s)) {
      inBond = true;
      inAtom = false;
      continue;
    }
    if (/^M\s+V30\s+END\s+BOND/.test(s)) {
      inBond = false;
      continue;
    }
    if (inAtom && /^M\s+V30\s+/.test(s)) {
      const body = s.replace(/^M\s+V30\s+/, "");
      const toks = body.trim().split(/\s+/);
      if (toks.length >= 5) {
        const element = toks[1];
        const x = parseFloat(toks[2]);
        const y = parseFloat(toks[3]);
        const z = parseFloat(toks[4]);
        atoms.push({ element, x, y, z });
      }
      continue;
    }
    if (inBond && /^M\s+V30\s+/.test(s)) {
      const body = s.replace(/^M\s+V30\s+/, "");
      const toks = body.trim().split(/\s+/);
      if (toks.length >= 4) {
        const order = parseInt(toks[1]);
        const a1 = parseInt(toks[2]) - 1;
        const a2 = parseInt(toks[3]) - 1;
        let stereoCode: number | undefined = undefined;
        const props = toks.slice(4).join(" ");
        const mCfg = props.match(/\bCFG\s*=\s*(\d+)/i);
        if (mCfg) {
          const cfg = parseInt(mCfg[1]);
          if (cfg === 1) stereoCode = 1;
          else if (cfg === 3) stereoCode = 6;
          else if (cfg === 2) stereoCode = 3;
        }
        const mStereo = props.match(/\bSTEREO\s*=\s*(UP|DOWN|EITHER)/i);
        if (mStereo) {
          const v = mStereo[1].toUpperCase();
          if (v === "UP") stereoCode = 1;
          else if (v === "DOWN") stereoCode = 6;
          else if (v === "EITHER") stereoCode = 3;
        }
        if (
          Number.isFinite(a1) &&
          Number.isFinite(a2) &&
          Number.isFinite(order)
        )
          bonds.push({ a1, a2, order, stereoCode });
      }
      continue;
    }
  }
  if (atoms.length === 0) return { atoms: [], bonds: [] };
  return { atoms, bonds };
}
