import { useCallback, useMemo } from "react";
import { writeClipboard } from "../../../lib/clipboard";
import { styleOf } from "../../../lib/chem/style";
import { useAppSettings } from "../../../lib/settings/appSettings";
import { chemMolblock } from "../../../lib/rdkit/molblock";
import { chemWorker } from "../../../lib/rdkit/worker";
import { forFlatReaders } from "./chem/drawing";
import { structureOnClipboard } from "./chem/fromClipboard";
import { pictureItems } from "./picture";
import type { EditorStore } from "./store";
import { centredAt, clipItems, partToCopy } from "./utils/copyPaste";

type Pt = { x: number; y: number };

/**
 * Copy, cut and paste, for the keys and the menu alike.
 *
 * - What is copied is the selection - or, with nothing selected, the
 *   structure under the pointer - with pictures of it, drawn in the style
 *   the canvas is drawn in, for Office and other programs (picture.ts).
 * - A paste goes where it is asked to go (the pointer, or where the menu
 *   was opened), selected, so that it can be dragged straight on; one undo
 *   step.
 * - `copySmiles` puts the SMILES alone on the clipboard, as plain text.
 */
export function useClipboardActions(
  store: EditorStore,
  onError: (message: string) => void,
) {
  const busy = useCallback(() => {
    const st = store.getState();
    return st.labelEdit.active || st.moveDrag.active || st.extend.active;
  }, [store]);

  const part = useCallback(() => {
    const { model, sel, hovered } = store.getState();
    const around =
      hovered.atomId ?? model.bonds.find((b) => b.id === hovered.bondId)?.a ?? null;
    return partToCopy(model, sel, around);
  }, [store]);

  const copy = useCallback(async () => {
    const p = part();
    if (!p || busy()) return false;
    try {
      const state = store.getState();
      // (the structure is copied, pictures or no)
      const pictures = await pictureItems(
        p,
        state,
        styleOf(state.docStyle ?? useAppSettings.getState().drawingStyle),
      ).catch((e: unknown) => {
        console.warn("the structure is copied without its pictures", e);
        return [];
      });
      await writeClipboard([...clipItems(p), ...pictures]).catch(async (e: unknown) => {
        // a picture the system would not take is left out, not the structure
        if (!pictures.length) throw e;
        console.warn("the structure is copied without its pictures", e);
        await writeClipboard(clipItems(p));
      });
      return true;
    } catch (e) {
      onError(`Copy failed: ${e instanceof Error ? e.message : String(e)}`);
      return false;
    }
  }, [part, busy, onError, store]);

  const cut = useCallback(async () => {
    const p = part();
    if (!p || !(await copy())) return;
    const st = store.getState();
    // what was copied is what goes: the selection, or the structure
    st.setSel({ atoms: new Set(p.atoms.map((a) => a.id)), bonds: new Set(p.bonds.map((b) => b.id)) });
    st.deleteSelection();
  }, [part, copy, store]);

  const paste = useCallback(
    async (at: Pt) => {
      if (busy()) return;
      try {
        const found = await structureOnClipboard();
        if (!found || !found.atoms.length) {
          onError("There is nothing on the clipboard that reads as a structure.");
          return;
        }
        store.getState().pasteModel(centredAt(found, at));
      } catch (e) {
        onError(`Paste failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
    [busy, store, onError],
  );

  const copySmiles = useCallback(async () => {
    const p = part();
    if (!p) return;
    try {
      const c = await chemWorker();
      const { smiles } = await c.request("to_smiles", { molblock: chemMolblock(forFlatReaders(p)) });
      await writeClipboard([{ flavor: "text", text: smiles }]);
    } catch (e) {
      onError(`Copy as SMILES failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [part, onError]);

  return useMemo(() => ({ copy, cut, paste, copySmiles }), [copy, cut, paste, copySmiles]);
}
