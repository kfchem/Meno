/**
 * Whether a fit is the one a canvas opens with - shown whole, on its middle,
 * at the zoom the canvas opens at or as far out as it needs, never further
 * in: what it holds as its view first comes up, or - read off the page, as
 * a file is now (lib/io/structures, in Meno's worker) - the first thing it
 * is given to show, arriving after the view came up empty. Anything drawn
 * there first asks for no fit; a fit asked for after that fits whole.
 */
export function opensWith(at: { firstView: boolean; firstContent: boolean; asked: boolean; fittedBefore: boolean }): boolean {
  return at.firstView || (at.firstContent && at.asked && !at.fittedBefore);
}
