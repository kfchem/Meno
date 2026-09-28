/**
 * Typing a label: which key starts one, and what the text typed becomes.
 *
 * With an input method on (Japanese, say), a key pressed over an atom comes
 * as the input method's own - `key` is "Process" or the kana it will make,
 * and `keyCode` 229 - but the key the hand pressed is still in `code`. A
 * label is chemistry, typed in Latin letters, so that key is what starts
 * it. And while the input method is composing, the text in the box is its
 * own: changing it under it (capitalising the first letter) makes it put
 * its text in again, several times over. The label's own rules are applied
 * once the text is committed.
 */

type KeyLike = { key: string; code?: string; keyCode?: number; isComposing?: boolean };

/** The letter a key pressed over an atom starts its label with, or null. */
export function labelKey(e: KeyLike): string | null {
  if (e.key && e.key.length === 1 && /[a-zA-Z]/.test(e.key) && !e.isComposing && e.keyCode !== 229) {
    return e.key;
  }
  // an input method's key: the letter on the key pressed
  if (e.isComposing || e.keyCode === 229) {
    const m = /^Key([A-Z])$/.exec(e.code ?? "");
    return m ? m[1].toLowerCase() : null;
  }
  return null;
}

/**
 * The label as typed, once committed: full-width letters and digits as the
 * ordinary ones (an input method's ＣＯＯＨ is COOH), and the first letter
 * capitalised where it is to be.
 */
export function typedLabel(value: string, autoCap: boolean): string {
  const v = value.normalize("NFKC");
  if (!v.length || !autoCap) return v;
  return v[0].toUpperCase() + v.slice(1);
}
