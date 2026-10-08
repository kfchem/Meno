/**
 * How large a workflow's parts are on the page (docs/WORKFLOWS.md, *How
 * each looks*): in world units, at the page's scale - so they zoom with it,
 * as all on the page does. The specification's sizes are in pixels at the
 * zoom a canvas opens at in the default style; `PX` is one of them.
 */
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";

/** One of the specification's pixels: a bond is 48 of them, as a canvas opens in ACS 1996 style. */
export const PX = NOMINAL_BOND_LENGTH / 48;
/** drei's Html, drawing a pixel as `PX` world units (it draws one as distanceFactor / 400). */
export const HTML_DISTANCE = PX * 400;

/** A step's card: how wide, how tall closed, and how far below its top its ports stand. */
export const CARD_W = 208 * PX;
export const CARD_H = 84 * PX;
export const PORT_DOWN = 28 * PX;
/** A port's diameter. */
export const PORT = 11 * PX;

/** How far inside a set what it holds stays from its frame, and how far below its top - under its tab - it begins. */
export const SET_PAD = 18 * PX;
export const SET_TOP = 30 * PX;
/** A result set's distance from its step, and between molecules in it. */
export const GAP = 64 * PX;
export const BETWEEN = 24 * PX;
/** The room a molecule's frames chip takes below it, where it has one. */
export const CHIP = 30 * PX;
/** A set's list of entries: a row's height, and its width. */
export const ROW = 17 * PX;
export const LIST_W = 196 * PX;
/** How many of a compound's entries its list shows, and of those set aside, before it says how many more. */
export const LIST_MOST = 3;
export const ASIDE_MOST = 2;
