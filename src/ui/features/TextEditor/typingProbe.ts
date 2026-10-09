/**
 * For the trial only: how long typing takes to show, to set the field
 * typed through an EditContext beside the textarea (docs/PDF.md, step 5).
 * For each key, from the key: when the text had it, when a frame drew it,
 * and the next frame - by then on the screen. Read in the developer
 * tools: `__menoTyping` holds the latest 40, in ms from the key.
 */
type Sample = { got: number; drawn: number; shown: number | null };

const samples: Sample[] = [];
let keyAt = 0;
let gotAt = 0;
let renderedAt = 0;

export const typingProbe = {
  /** A key went down. */
  key(): void {
    keyAt = performance.now();
    gotAt = 0;
  },
  /** The text, or what the IME composes, changed with it. */
  got(): void {
    if (keyAt && !gotAt) gotAt = performance.now();
  },
  /** The scene was laid out again, with what the text is now. */
  rendered(): void {
    if (gotAt) renderedAt = performance.now();
  },
  /** A frame drew the text: the change with the last key in it, once the scene has it, if not drawn yet. */
  drawn(): void {
    if (!keyAt || !gotAt || renderedAt < gotAt) return;
    const s: Sample = { got: gotAt - keyAt, drawn: performance.now() - keyAt, shown: null };
    const from = keyAt;
    keyAt = 0;
    gotAt = 0;
    samples.push(s);
    if (samples.length > 40) samples.shift();
    requestAnimationFrame(() => (s.shown = performance.now() - from));
  },
};

if (typeof window !== "undefined") (window as unknown as { __menoTyping: Sample[] }).__menoTyping = samples;
