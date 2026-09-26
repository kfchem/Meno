// The part of troika-three-text Meno uses directly; drei, which draws the
// text, brings the rest. The package has no types of its own.
declare module "troika-three-text" {
  export function configureTextBuilder(config: {
    defaultFontURL?: string | null;
    unicodeFontsURL?: string | null;
    sdfGlyphSize?: number;
    useWorker?: boolean;
  }): void;
}
