import { ARIAL } from "../arial";
import { registerLabelFont } from "../labelFonts";
import { IBM_PLEX_SANS } from "./ibmPlexSans";

// Arial first: it is what a typeface without metrics of its own is set by.
// Helvetica is drawn to Arial's widths.
registerLabelFont(ARIAL, "Helvetica");
// Meno's own typeface, bundled with the app.
registerLabelFont(IBM_PLEX_SANS);
