import clsx from "clsx";
import { useEffect, useState } from "react";
import { chemAtHand, chemWorker, useChem } from "../../../lib/rdkit/worker";
import {
  useAppSettings,
  type ChemistrySettings as Settings,
} from "../../../lib/settings/appSettings";

const SWITCHES: { key: keyof Settings; name: string; detail: string }[] = [
  {
    key: "valenceWarnings",
    name: "Point out atoms with too many bonds",
    detail:
      "A mark round any atom with more bonds than it can have - a carbon with five, say - " +
      "saying what is wrong while the pointer is on it.",
  },
  {
    key: "stereoLabels",
    name: "Show R and S",
    detail:
      "R or S beside each stereocentre, E or Z beside each double bond that is one or " +
      "the other, and Ra or Sa beside an axis (BINAP's), as the Cahn-Ingold-Prelog rules give them. The R/S button on a canvas " +
      "does the same.",
  },
];

/**
 * Chemistry in Settings: what RDKit points out on a structure as it is
 * drawn, and whether RDKit is there to do it.
 */
export default function ChemistrySettings() {
  const chemistry = useAppSettings((s) => s.chemistry);
  const setChemistry = useAppSettings((s) => s.setChemistry);
  const chem = useChem();
  const [atHand, setAtHand] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void chemAtHand().then((v) => {
      if (live) setAtHand(v);
    });
    return () => {
      live = false;
    };
  }, [chem.state]);

  const status =
    chem.state === "ready"
      ? `RDKit ${chem.rdkit} is running.`
      : chem.state === "setting-up"
        ? "Setting up RDKit…"
        : chem.state === "starting"
          ? "Starting RDKit…"
          : atHand
            ? "RDKit is set up, and starts when a structure is drawn."
            : atHand === false
              ? "RDKit is not set up yet. Meno sets it up - asking before it downloads - the " +
                "first time something needs it: SMILES, clean-up or R and S. Until then " +
                "nothing is pointed out."
              : "";

  return (
    <div className="space-y-3">
      {SWITCHES.map((s) => (
        <div
          key={s.key}
          className="rounded-lg border border-gh-line bg-white px-4 py-3 flex items-start gap-4"
        >
          <div className="flex-1">
            <div className="text-sm text-gh-black">{s.name}</div>
            <p className="text-xs text-gh-gray mt-0.5">{s.detail}</p>
          </div>
          <button
            role="switch"
            aria-checked={chemistry[s.key]}
            aria-label={s.name}
            onClick={() =>
              setChemistry({ ...chemistry, [s.key]: !chemistry[s.key] })
            }
            className={clsx(
              "relative h-6 w-11 shrink-0 rounded-full transition-colors",
              chemistry[s.key] ? "bg-accel-base" : "bg-gh-line",
            )}
          >
            <span
              className={clsx(
                "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all",
                chemistry[s.key] ? "left-[1.375rem]" : "left-0.5",
              )}
            />
          </button>
        </div>
      ))}
      <div className="flex items-start gap-3 px-1 pt-1 text-xs text-gh-gray">
        <p key={`${chem.state}-${!!error}`} className="flex-1 meno-fade-in">
          {status}
          {chem.state === "failed" && (
            <span className="text-accel-accent">
              RDKit could not start: {chem.message}
            </span>
          )}
          {error && <span className="block text-accel-accent">{error}</span>}
        </p>
        {atHand === false && chem.state === "idle" && (
          <button
            onClick={() => {
              setError(null);
              chemWorker().catch((e: unknown) =>
                setError(e instanceof Error ? e.message : String(e)),
              );
            }}
            className="h-7 shrink-0 rounded-md border border-gh-line bg-white px-3 text-xs text-gh-black hover:bg-gh-base meno-fade-in"
          >
            Set up RDKit
          </button>
        )}
      </div>
    </div>
  );
}
