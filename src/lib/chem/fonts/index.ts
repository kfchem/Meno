import { ARIAL } from "../arial";
import { registerLabelFont } from "../labelFonts";

// Arial first: it is what a typeface without metrics of its own is set by.
// Helvetica is drawn to Arial's widths.
registerLabelFont(ARIAL, "Helvetica");
