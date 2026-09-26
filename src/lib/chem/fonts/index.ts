import { ARIAL } from "../arial";
import { registerGlyphs, tableGlyphs } from "../labelFonts";
import { IBM_PLEX_SANS } from "./ibmPlexSans";

// The letters that matter most, written ahead of time so that a label is
// placed the same way before a font file has been read, and in tests.
// Helvetica is set by Arial's widths; its own file adds what Arial's table
// has not.
registerGlyphs("Arial", tableGlyphs(ARIAL), "Helvetica");
registerGlyphs("IBM Plex Sans", tableGlyphs(IBM_PLEX_SANS));
