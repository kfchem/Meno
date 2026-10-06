import { useCallback, useMemo } from "react";
import { writeClipboard } from "../../../lib/clipboard";
import { styleOf } from "../../../lib/chem/style";
import { useAppSettings } from "../../../lib/settings/appSettings";
import { chemMolblock } from "../../../lib/roles/molblock";
import { chemWorker } from "../../../lib/roles/worker";
import { forFlatReaders } from "./chem/drawing";
import { structureOnClipboard } from "./chem/fromClipboard";
import { drawnOf } from "./fileActions";
import { pictureItems } from "./picture";
import type { EditorStore } from "./store";
import type { Carried3D, Drawn } from "./store/types";
import { centredAt, clipItems, partToCopy } from "./utils/copyPaste";

type Pt = { x: number; y: number };

/**
 * Copy, cut and paste, for the keys and the menu alike.
 *
 * - What is copied is the selection, with the reaction arrows and "+"
 *   signs among it - or, with nothing selected, the structure under the
 *   pointer - with pictures of it, drawn in the style the canvas is drawn
 *   in, for Office and other programs (picture.ts).
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

  // What a copy takes: the drawing's part, and the molecules in 3D - those
  // selected, or with nothing selected the one under the pointer - as they
  // are shown; and those molecules' ids, for a cut.
  // (`only`: one molecule in 3D, alone - what its own menu was opened on)
  const part = useCallback((only?: number): { part: Drawn; ids3d: number[] } | null => {
    const state = store.getState();
    const { model, sel, hovered, sel3d, hovered3d, molecules3d, turns3d, frames3d } = state;
    const around =
      hovered.atomId ?? model.bonds.find((b) => b.id === hovered.bondId)?.a ?? null;
    const drawn = only != null ? null : partToCopy(drawnOf(state), sel, around);
    const nothingSelected = !sel.atoms.size && !sel.bonds.size && !sel3d.size;
    const ids3d =
      only != null ? [only] : sel3d.size ? [...sel3d] : nothingSelected && hovered3d && !drawn ? [hovered3d.id] : [];
    const carried: Carried3D[] = molecules3d
      .filter((m) => ids3d.includes(m.id))
      .map(({ id, ...m }) => ({ ...m, ...(turns3d[id] ? { turn: turns3d[id] } : {}), ...(frames3d[id] ? { frame: frames3d[id] } : {}) }));
    if (!drawn && !carried.length) return null;
    return {
      part: { ...(drawn ?? { atoms: [], bonds: [] }), ...(carried.length ? { molecules3d: carried } : {}) },
      ids3d: molecules3d.filter((m) => ids3d.includes(m.id)).map((m) => m.id),
    };
  }, [store]);

  const copy = useCallback(async (only?: number) => {
    const taken = part(only);
    if (!taken || busy()) return false;
    const p = taken.part;
    try {
      const state = store.getState();
      // (the structure is copied, pictures or no: the drawing's and the
      // molecules' in 3D, as they are seen)
      const pictures = !p.atoms.length && !p.molecules3d?.length
        ? []
        : await pictureItems(
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

  const cut = useCallback(async (only?: number) => {
    const taken = part(only);
    if (!taken || !(await copy(only))) return;
    // what was copied is what goes: the selection, or the structure, and
    // the arrows and pluses that went with it, and the molecules in 3D
    store.getState().deleteDrawn(taken.part, taken.ids3d);
  }, [part, copy, store]);

  const paste = useCallback(
    async (at: Pt) => {
      if (busy()) return;
      try {
        const found = await structureOnClipboard();
        if (!found || (!found.atoms.length && !found.molecules3d?.length)) {
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
    const p = part()?.part;
    if (!p?.atoms.length) return;
    try {
      const c = await chemWorker("smiles");
      const { smiles } = await c.request("to_smiles", { molblock: chemMolblock(forFlatReaders(p)) });
      await writeClipboard([{ flavor: "text", text: smiles }]);
    } catch (e) {
      onError(`Copy as SMILES failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [part, onError]);

  return useMemo(() => ({ copy, cut, paste, copySmiles }), [copy, cut, paste, copySmiles]);
}
