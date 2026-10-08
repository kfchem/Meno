/**
 * How fast a motion let go goes on (theme/motion: nothing stops dead): as
 * fast as it went over its latest moves - none where it was held still for
 * a moment before it was let go, or made one move only.
 */

/** A move of a motion: when, and how far. */
export type Move = { t: number; d: number };

/** The moves still counted at `now`: those of the last `recentMs`. */
export const recentMoves = (moves: readonly Move[], now: number, recentMs: number): Move[] => moves.filter((m) => now - m.t <= recentMs);

/** How fast, a second, a motion let go at `at` goes on, from its moves; nought where it was still for `heldMs` first, or moved once. */
export function glideSpeed(moves: readonly Move[], at: number, heldMs: number): number {
  if (moves.length < 2) return 0;
  const latest = moves[moves.length - 1].t;
  if (at - latest > heldMs) return 0;
  const took = Math.max((latest - moves[0].t) / 1000, 1 / 60);
  return moves.slice(1).reduce((sum, m) => sum + m.d, 0) / took;
}
