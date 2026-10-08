import type { ReactNode } from "react";
import type { StepIcon } from "./kinds";

/**
 * Each kind of step's icon (docs/WORKFLOWS.md, *Kinds of step*), drawn for
 * Meno on a 20-unit square in the current colour: on a step's card and in
 * Quick Add.
 */
const PATHS: Record<StepIcon, ReactNode> = {
  // a cube
  cube: (
    <>
      <path d="M10 2.8 L16.5 6.4 V13.6 L10 17.2 L3.5 13.6 V6.4 Z" />
      <path d="M3.5 6.4 L10 10 L16.5 6.4 M10 10 V17.2" />
    </>
  ),
  // three rings, stacked
  rings: (
    <>
      <path d="M3 9 L6 6 H10 L13 9" />
      <path d="M5 12 L8 9 H12 L15 12" />
      <path d="M7 15 L10 12 H14 L17 15" />
    </>
  ),
  // a curve down to its lowest point
  curve: (
    <>
      <path d="M3 4 C 6 15, 9 15.5, 10 15.5 C 11 15.5, 14 15, 17 4" />
      <circle cx="10" cy="15.5" r="1.4" fill="currentColor" />
    </>
  ),
  // E and a level
  level: (
    <>
      <path d="M8 4.5 H3.5 V13.5 H8 M3.5 9 H7" />
      <path d="M10.5 13.5 H17" />
    </>
  ),
  // a wave
  wave: <path d="M2.5 10 C 4.5 4, 6.5 4, 8 10 S 11.5 16, 13 10 S 16 4, 17.5 10" />,
  // a band between two lines
  band: (
    <>
      <path d="M3 6.5 H17 M3 13.5 H17" />
      <path d="M6 10 H8 M10 10 H12 M14 10 H16" />
    </>
  ),
  // two rings, one dashed
  twins: (
    <>
      <circle cx="7.2" cy="10" r="4.2" />
      <circle cx="12.8" cy="10" r="4.2" strokeDasharray="1.8 1.6" />
    </>
  ),
  // falling bars
  bars: <path d="M4.5 16 V4.5 M8.5 16 V8 M12.5 16 V11 M16.5 16 V13.5" />,
  // three rings, one boxed
  "boxed-rings": (
    <>
      <path d="M3.5 7.5 L5.5 5.5 H8 L10 7.5" />
      <path d="M3.5 11.5 L5.5 9.5 H8 L10 11.5" />
      <rect x="11.5" y="5" width="6" height="10" rx="1.5" />
      <path d="M12.6 11.5 L13.6 10.2 H15.4 L16.4 11.5" />
    </>
  ),
};

export function StepGlyph({ icon, size = 20 }: { icon: StepIcon; size?: number }) {
  return (
    <svg viewBox="0 0 20 20" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {PATHS[icon]}
    </svg>
  );
}

/** Quick Add's button for calculations: a small graph of two joined boxes. */
export function CalculationsGlyph({ size = 20 }: { size?: number }) {
  return (
    <svg viewBox="0 0 20 20" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="2.5" y="4.5" width="5.5" height="5.5" rx="1.3" />
      <rect x="12" y="10" width="5.5" height="5.5" rx="1.3" />
      <path d="M8 7.25 C 10.5 7.25, 9.5 12.75, 12 12.75" />
    </svg>
  );
}
