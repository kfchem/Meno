/**
 * A structure laid out by Meno's own engine (lib/layout, docs/LAYOUT-2D.md):
 * what the engine is given - the graph, and the stereochemistry the drawing
 * shows, read out of it - and what its layout comes to as edits to the
 * drawing.
 *
 * The engine draws an H where a stereocentre needs one to carry its wedge,
 * and leaves it out elsewhere, so an H drawn on a stereocentre is taken as
 * that centre's H, not as an atom: laid out, it is kept if the engine draws
 * one there, and taken away if not. A cage comes out in perspective, its
 * atoms with a depth, its stereocentres shown by the drawing itself.
 *
 * The new drawing is read back before anything is changed: it has to say
 * the stereochemistry the old one said.
 */
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { readStereo, sameConfiguration } from "../../../../lib/layout/drawn";
import type { Layout2D, LayoutInput } from "../../../../lib/layout/engine";
import type { CisTrans } from "../../../../lib/layout/perceive";
import type { Tetrahedral } from "../../../../lib/layout/stereo";
import { relayout, emptyStructureDocument, type Relayout } from "../document";
import type { Bond, Model } from "../store/types";
import { degrees, drawingOf, orientFor } from "./drawing";

export type LayoutJob = {
  input: LayoutInput;
  /** The model atom each of the input's atoms is. */
  ids: number[];
  /** The H atoms taken as their centre's own H, by the centre's input index. */
  folded: Map<number, number[]>;
};

/**
 * What the engine is given for `part`: its atoms (but for the H of its
 * stereocentres), their H, bonds and charges - none, as the editor has
 * none yet - and the stereochemistry the drawing shows.
 */
export function layoutJob(part: Model): LayoutJob {
  const drawing = drawingOf(part);
  const { tetra, cisTrans } = readStereo(drawing.atoms, drawing.bonds);
  const bondsOf = new Map<number, number[]>();
  drawing.bonds.forEach((b, k) => {
    bondsOf.set(b.a, [...(bondsOf.get(b.a) ?? []), k]);
    bondsOf.set(b.b, [...(bondsOf.get(b.b) ?? []), k]);
  });
  // A wedge at an atom that could be a stereocentre, but says nothing the
  // engine can take - wedge and hashes drawn opposite each other, or an
  // atom with a lone pair for its fourth group (a sulfoxide's S): laid out,
  // it would be lost, so it is not laid out.
  for (const b of drawing.bonds) {
    const c = b.wedge?.narrow;
    if (c == null || tetra.has(c)) continue;
    if ((bondsOf.get(c)?.length ?? 0) >= 3 && drawing.atoms[c].hs <= 1) {
      throw new Error(
        `the wedges at ${part.atoms[c].el} do not say its configuration in a way Clean-up can keep ` +
          "(drawn crossed, or on an atom with a lone pair), so nothing was moved",
      );
    }
  }
  // an H on a stereocentre, bonded to nothing else: the centre's own
  const foldedInto = new Map<number, number>();
  part.atoms.forEach((a, h) => {
    const mine = bondsOf.get(h) ?? [];
    if (a.el !== "H" || mine.length !== 1) return;
    const b = drawing.bonds[mine[0]];
    const c = b.a === h ? b.b : b.a;
    if (b.order === 1 && part.atoms[c].el !== "H" && tetra.has(c)) foldedInto.set(h, c);
  });
  const kept = part.atoms.map((_, i) => i).filter((i) => !foldedInto.has(i));
  const at = new Map(kept.map((i, k) => [i, k]));
  const folded = new Map<number, number[]>();
  for (const [h, c] of foldedInto) folded.set(at.get(c)!, [...(folded.get(at.get(c)!) ?? []), part.atoms[h].id]);

  const configuration = (c: number): Tetrahedral | undefined => {
    const t = tetra.get(c);
    if (!t) return undefined;
    const order = t.neighbours.map((n) => (n === -1 || foldedInto.has(n) ? -1 : at.get(n)!));
    // the H last, as the engine has it: each place it moves turns the sense
    const h = order.indexOf(-1);
    if (h < 0) return { neighbours: order, volume: t.volume };
    const moves = order.length - 1 - h;
    const neighbours = [...order.slice(0, h), ...order.slice(h + 1), -1];
    return { neighbours, volume: (moves % 2 ? -t.volume : t.volume) as 1 | -1 };
  };
  const input: LayoutInput = {
    atoms: kept.map((i) => {
      const t = configuration(i);
      return {
        el: part.atoms[i].el,
        hs: drawing.atoms[i].hs + (folded.get(at.get(i)!)?.length ?? 0),
        ...(t ? { tetra: t } : {}),
      };
    }),
    bonds: drawing.bonds.flatMap((b, k) => {
      if (foldedInto.has(b.a) || foldedInto.has(b.b)) return [];
      const ct = cisTrans.get(k);
      const stereo: CisTrans | undefined =
        ct && at.has(ct.refs[0]) && at.has(ct.refs[1])
          ? { refs: [at.get(ct.refs[0])!, at.get(ct.refs[1])!], cis: ct.cis }
          : undefined;
      return [{ a: at.get(b.a)!, b: at.get(b.b)!, order: b.order, ...(stereo ? { stereo } : {}) }];
    }),
  };
  return { input, ids: kept.map((i) => part.atoms[i].id), folded };
}

/**
 * The engine's layout of `job` as edits to `model`: the part where it was
 * - its middle kept - but laid out afresh, at the drawing's own bond length;
 * its wedges, and only those, the ones the engine draws; each H the engine
 * draws the centre's own, where it had one, and new where not; the rest of
 * its H taken away. Throws, changing nothing, if the new drawing would not
 * say the stereochemistry the old one said.
 */
export function relayoutFrom(model: Model, part: Model, job: LayoutJob, laid: Layout2D): Relayout {
  const { input, ids } = job;
  const n = input.atoms.length;
  const byId = new Map(model.atoms.map((a) => [a.id, a]));
  // at the drawing's own bond length
  const lengths = part.bonds
    .map((b) => {
      const p = byId.get(b.a);
      const q = byId.get(b.b);
      return p && q ? Math.hypot(p.x - q.x, p.y - q.y) : 0;
    })
    .filter((l) => l > 0)
    .sort((p, q) => p - q);
  const k = lengths[lengths.length >> 1] || NOMINAL_BOND_LENGTH;
  const was = ids.map((id) => byId.get(id)!);
  const mid = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / (xs.length || 1);
  const ox = mid(was.map((a) => a.x));
  const oy = mid(was.map((a) => a.y));
  const nx = mid(laid.x.slice(0, n));
  const ny = mid(laid.y.slice(0, n));
  const place = (x: number, y: number) => ({ x: ox + (x - nx) * k, y: oy + (y - ny) * k });

  const atoms: Relayout["atoms"] = ids.map((id, i) => ({
    id,
    ...place(laid.x[i], laid.y[i]),
    ...(laid.depth[i] != null ? { z: laid.depth[i]! * k } : {}),
    ...(laid.solid[i] && input.atoms[i].tetra ? { stereoCentre: true } : {}),
  }));
  // the H the engine draws: a centre's own where it had one
  const spare = new Map([...job.folded].map(([c, hs]) => [c, [...hs]]));
  const hydrogenOf = new Map<number, number | { added: number }>();
  const added: NonNullable<Relayout["added"]> = [];
  for (const h of laid.hydrogens) {
    const own = spare.get(h.on)?.shift();
    const p = place(h.at.x, h.at.y);
    if (own != null) {
      atoms.push({ id: own, ...p });
      hydrogenOf.set(h.on, own);
    } else {
      hydrogenOf.set(h.on, { added: added.length });
      added.push({ ...p, on: ids[h.on], stereo: "none", stereoOrient: "principle" });
    }
  }
  const removed = [...spare.values()].flat();

  // the wedges: those the engine draws, and no others in the part
  const gone = new Set(removed);
  const inPart = new Set(part.atoms.map((a) => a.id));
  const finalBonds: Pick<Bond, "a" | "b">[] = [
    ...model.bonds.filter((b) => !gone.has(b.a) && !gone.has(b.b)),
    ...added.map((h, i) => ({ a: h.on, b: -1 - i })),
  ];
  const degree = degrees(finalBonds);
  const wedgeOn = new Map<number, { stereo: "up" | "down"; narrow: number }>();
  for (const w of laid.wedges) {
    const from = ids[w.from];
    const to = w.to === -1 ? hydrogenOf.get(w.from)! : ids[w.to];
    if (typeof to === "object") {
      const h = added[to.added];
      h.stereo = w.stereo;
      h.stereoOrient = orientFor({ a: h.on, b: -1 - to.added, order: 1 }, from, degree);
      continue;
    }
    const bond = model.bonds.find((b) => (b.a === from && b.b === to) || (b.a === to && b.b === from));
    if (bond) wedgeOn.set(bond.id, { stereo: w.stereo, narrow: from });
  }
  const bonds: Relayout["bonds"] = model.bonds.flatMap((b): Relayout["bonds"] => {
    if (!inPart.has(b.a) || !inPart.has(b.b) || gone.has(b.a) || gone.has(b.b)) return [];
    const w = wedgeOn.get(b.id);
    if (w) return [{ id: b.id, stereo: w.stereo, stereoOrient: orientFor(b, w.narrow, degree) }];
    if (b.stereo === "up" || b.stereo === "down") return [{ id: b.id, stereo: "none", stereoOrient: "principle" }];
    return [];
  });
  const change: Relayout = { atoms, bonds, added, removed };
  if (!saysTheSame(part, change)) {
    throw new Error("the structure could not be laid out keeping its stereochemistry, so nothing was moved");
  }
  return change;
}

/** Whether `part`, changed as `change` has it, shows the stereochemistry it shows now. */
function saysTheSame(part: Model, change: Relayout): boolean {
  const doc = { ...emptyStructureDocument(), model: part, nextId: nextFree(part) };
  const before = stereoOf(part);
  const now = stereoOf(relayout(doc, change).model);
  for (const [c, t] of before.centres) {
    const u = now.centres.get(c);
    if (!u || !sameConfiguration(t, u)) return false;
  }
  for (const [key, d] of before.doubles) {
    const e = now.doubles.get(key);
    // (read against the other group on an end, the reading turns)
    if (!e || (e.cis !== d.cis) !== ((e.refs[0] !== d.refs[0]) !== (e.refs[1] !== d.refs[1]))) return false;
  }
  return true;
}

/**
 * The stereochemistry `m` shows, by atom id: an H drawn on its own on a
 * centre counted as the centre's H (-1), and each double bond's groups
 * given from its lower id's end first.
 */
function stereoOf(m: Model) {
  const d = drawingOf(m);
  const ids = m.atoms.map((a) => a.id);
  const { tetra, cisTrans } = readStereo(d.atoms, d.bonds);
  const degree = degrees(m.bonds);
  const asId = (n: number) => (n === -1 || (m.atoms[n].el === "H" && degree.get(ids[n]) === 1) ? -1 : ids[n]);
  const centres = new Map<number, Tetrahedral>(
    [...tetra].map(([c, t]) => [ids[c], { neighbours: t.neighbours.map(asId), volume: t.volume }]),
  );
  const doubles = new Map<string, { refs: [number, number]; cis: boolean }>();
  for (const [k, ct] of cisTrans) {
    const b = d.bonds[k];
    const [a, z] = [ids[b.a], ids[b.b]];
    const refs: [number, number] = a < z ? [ids[ct.refs[0]], ids[ct.refs[1]]] : [ids[ct.refs[1]], ids[ct.refs[0]]];
    doubles.set(a < z ? `${a},${z}` : `${z},${a}`, { refs, cis: ct.cis });
  }
  return { centres, doubles };
}

/** The first id no atom or bond of `model` has. */
export function nextFree(model: Model): number {
  return Math.max(0, ...model.atoms.map((a) => a.id), ...model.bonds.map((b) => b.id)) + 1;
}
