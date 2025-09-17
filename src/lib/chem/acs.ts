import type { Atom as LAtom, Bond as LBond, LayoutOptions } from "./layout2d";

export const ACS_RATIOS = {
  lineWidth: 0.05,
  doubleOffset: 0.2,
  doubleShorten: 0.1,
  tripleOffset: 0.04,
  wedgeWidth: 0.28,
  wedgeLength: 0.62,
  hashStart: 0.12,
  hashEnd: 0.04,
  wavyAmp: 0.07,
  wavyFreq: 1.4,
  font: 0.6,
  paddingPx: 48,
  minLinePx: 1,
} as const;

// Fixed nominal bond length in world units used by StructureEditor
// This replaces on-the-fly averaging for interactive operations.
export const NOMINAL_BOND_LENGTH = 1.8; // world units

// Fixed nominal bond length in pixels used for styling (labels, widths, gaps)
export const NOMINAL_BOND_PX = 24;

export function averageBondLengthWorld(atoms: LAtom[], bonds: LBond[]): number {
  let sum = 0,
    cnt = 0;
  for (const b of bonds) {
    const p1 = atoms[b.a1];
    const p2 = atoms[b.a2];
    if (!p1 || !p2) continue;
    const dx = p2.x - p1.x,
      dy = p2.y - p1.y;
    const d = Math.hypot(dx, dy);
    if (d > 1e-6) {
      sum += d;
      cnt++;
    }
  }
  return cnt > 0 ? sum / cnt : 1.8;
}

export function acsWorldOptions(
  _atoms: LAtom[],
  _bonds: LBond[],
  overrides?: Partial<LayoutOptions>
): LayoutOptions {
  const units = overrides?.units ?? "world";
  // When units='world', interpret L as world baseline (previous behavior).
  // When units='px', interpret L as pixel baseline for styles that will be converted per-zoom.
  const L = units === "px" ? NOMINAL_BOND_PX : NOMINAL_BOND_LENGTH;
  const o: LayoutOptions = {
    lineWidthPx: L * ACS_RATIOS.lineWidth,
    doubleOffsetPx: L * ACS_RATIOS.doubleOffset,
    doubleShortenPx: L * ACS_RATIOS.doubleShorten,
    tripleOffsetPx: L * ACS_RATIOS.tripleOffset,
    wedgeWidthPx: L * ACS_RATIOS.wedgeWidth,
    wedgeLengthPx: L * ACS_RATIOS.wedgeLength,
    hashCount: 8,
    hashStartPx: L * ACS_RATIOS.hashStart,
    hashEndPx: L * ACS_RATIOS.hashEnd,
    wavyAmpPx: L * ACS_RATIOS.wavyAmp,
    wavyFreq: ACS_RATIOS.wavyFreq,
    fontPx: L * ACS_RATIOS.font,
    paddingPx: ACS_RATIOS.paddingPx,
    showCarbonLabels: false,
    units,
    minLinePx: ACS_RATIOS.minLinePx,
  };
  return { ...o, ...(overrides ?? {}) };
}

export function acsPxOptions(
  nominalBondPx = 36,
  overrides?: Partial<LayoutOptions>
): LayoutOptions {
  const Lpx = nominalBondPx;
  const o: LayoutOptions = {
    lineWidthPx: Lpx * ACS_RATIOS.lineWidth,
    doubleOffsetPx: Lpx * ACS_RATIOS.doubleOffset,
    doubleShortenPx: Lpx * ACS_RATIOS.doubleShorten,
    tripleOffsetPx: Lpx * ACS_RATIOS.tripleOffset,
    wedgeWidthPx: Lpx * ACS_RATIOS.wedgeWidth,
    wedgeLengthPx: Lpx * ACS_RATIOS.wedgeLength,
    hashCount: 8,
    hashStartPx: Lpx * ACS_RATIOS.hashStart,
    hashEndPx: Lpx * ACS_RATIOS.hashEnd,
    wavyAmpPx: Lpx * ACS_RATIOS.wavyAmp,
    wavyFreq: ACS_RATIOS.wavyFreq,
    fontPx: Lpx * ACS_RATIOS.font,
    paddingPx: ACS_RATIOS.paddingPx,
    showCarbonLabels: false,
    units: "px",
    minLinePx: ACS_RATIOS.minLinePx,
  };
  return { ...o, ...(overrides ?? {}) };
}
