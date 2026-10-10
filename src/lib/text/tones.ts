/**
 * What a part of a text is, as it is coloured (docs/PDF.md, *A text*):
 * the tones Meno draws (TextEditor/linePictures `TONES`), as a grammar's
 * parts are given them - Lezer's own, and a plugin's (lib/plugins/manifest
 * `GrammarDecl`). `value` is no tone of its own: a value Meno colours as a
 * number where it is one, and leaves as it is where it is not.
 */
export const TONE_NAMES = ["keyword", "string", "number", "comment", "name", "tag", "attribute", "property", "landmark", "success", "warning", "error", "value"] as const;
export type Tone = (typeof TONE_NAMES)[number];

/** A number as programs write it: a sign, a point, an exponent - a Fortran D's too. */
const NUMBER = /^[-+]?(?:\d+\.\d*|\.\d+|\d+)(?:[eEdD][-+]?\d+)?$/;

/** Whether a value is a number, as programs write them. */
export const isNumber = (text: string): boolean => NUMBER.test(text);
