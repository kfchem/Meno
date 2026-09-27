import { useEffect, useMemo, useState } from "react";
import { chemMolblock } from "../../../../lib/rdkit/molblock";
import { chemAtHand, chemWorker, useChem } from "../../../../lib/rdkit/worker";
import { useAppSettings } from "../../../../lib/settings/appSettings";
import type { Model } from "../store/types";
import { marksOf, NO_MARKS, type ChemMarks } from "./marks";

/** How long the structure has to stay as it is before RDKit is asked. */
const SETTLE_MS = 150;

/**
 * The marks RDKit puts on a structure, as far as the settings ask for them,
 * brought up to date a moment after it stops changing. Only while RDKit can
 * be had without asking: a structure being drawn never sets RDKit up by
 * itself. Marks for an earlier version stay up until the new ones come, so
 * nothing flickers.
 */
export function useChemMarks(model: Model, active: boolean): ChemMarks | null {
  const { valenceWarnings, stereoLabels } = useAppSettings((s) => s.chemistry);
  const chem = useChem();
  const [atHand, setAtHand] = useState(false);
  const [marks, setMarks] = useState<ChemMarks | null>(null);
  const wanted =
    active && (valenceWarnings || stereoLabels) && model.atoms.length > 0;
  const ready = chem.state === "ready";
  const failed = chem.state === "failed";

  // whether RDKit is set up: asked once it matters, and again once it is
  useEffect(() => {
    if (!wanted || atHand) return;
    let live = true;
    void chemAtHand().then((v) => {
      if (live) setAtHand(v);
    });
    return () => {
      live = false;
    };
  }, [wanted, atHand, ready]);

  useEffect(() => {
    if (!wanted || failed || !(atHand || ready)) return;
    let live = true;
    const t = setTimeout(() => {
      void chemWorker()
        .then((c) => c.request("analyse", { molblock: chemMolblock(model) }))
        .then((r) => {
          if (live) setMarks(marksOf(model, r));
        })
        .catch(() => {
          // RDKit could not make sense of it, or has stopped: no marks
          if (live) setMarks(NO_MARKS);
        });
    }, SETTLE_MS);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [model, wanted, failed, atHand, ready]);

  return useMemo(
    () =>
      wanted && marks
        ? {
            valence: valenceWarnings ? marks.valence : NO_MARKS.valence,
            centres: stereoLabels ? marks.centres : NO_MARKS.centres,
            doubleBonds: stereoLabels
              ? marks.doubleBonds
              : NO_MARKS.doubleBonds,
          }
        : null,
    [wanted, marks, valenceWarnings, stereoLabels],
  );
}
