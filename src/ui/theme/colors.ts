export const COLORS = {
  // Accent color for hover/highlight overlays in 2D editors
  highlight: "#1e90ff", // DodgerBlue

  // Base drawing colors (kept here for centralization)
  bond: "#000000",
  label: "#000000",
  background: "#ffffff",
} as const;

export type ColorKey = keyof typeof COLORS;

// Opacity tokens for UI elements
export const ALPHA = {
  highlight: 0.6,
} as const;
