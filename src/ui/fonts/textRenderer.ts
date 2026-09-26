import { configureTextBuilder } from "troika-three-text";
import plexSansJp from "../../assets/fonts/IBMPlexSansJP-Regular.ttf?url";

// Text drawn in the 3D and 2D canvases takes a character its own font lacks
// - Japanese in a Latin typeface - from IBM Plex Sans JP, which comes with
// Meno, before looking any further afield. This has to be set before the
// first text is drawn, so it is imported first thing.
configureTextBuilder({ defaultFontURL: plexSansJp });
