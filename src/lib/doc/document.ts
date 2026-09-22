/**
 * Document store: the undoable, saveable state of one tab.
 *
 * Meno's views currently keep their content in their own way (the 2D editor in
 * a Zustand store, the workflow editor in component state), which makes undo a
 * per-view affair and keeps a tab's content out of reach of other views. A
 * document is the other half of that split:
 *
 * - **document state** — atoms and bonds, text, a node graph: undoable, saved,
 *   readable by anything that has the tab;
 * - **ephemeral state** — hover, drag previews, camera, edit buffers: owned by
 *   the view, never undone, never saved.
 *
 * History is kept as snapshots. Updates are immutable, so unchanged parts are
 * shared between snapshots rather than copied, which keeps this cheap for the
 * sizes Meno deals with and avoids the bug surface of inverse operations.
 *
 * Framework-agnostic on purpose: `subscribe` matches React's
 * `useSyncExternalStore`, but nothing here imports React.
 */

/** Successive edits are merged into one undo step for this long by default. */
export const DEFAULT_COALESCE_MS = 500;
/** Undo steps kept per document. */
export const DEFAULT_HISTORY_LIMIT = 100;

export type EditMeta = {
  /**
   * Edits sharing a key, close enough in time, collapse into a single undo
   * step — a drag or a run of typing should not need one undo per frame.
   */
  coalesceKey?: string;
  /** Overrides {@link DEFAULT_COALESCE_MS} for this edit. */
  coalesceWithinMs?: number;
};

export type HistoryInfo = {
  undoDepth: number;
  redoDepth: number;
  /** What undo would take back, for menus and tooltips. */
  undoLabel?: string;
  /** What redo would put back. */
  redoLabel?: string;
  dirty: boolean;
};

export interface DocumentStore<T> {
  getState(): T;
  /** Notifies on every state change, including undo and redo. */
  subscribe(listener: () => void): () => void;
  /**
   * Applies `updater` and records one history step. Returns false when the
   * updater returns the state unchanged (no step, no notification).
   */
  edit(label: string, updater: (state: T) => T, meta?: EditMeta): boolean;
  undo(): boolean;
  redo(): boolean;
  /** Replaces the content and forgets the history, e.g. after opening a file. */
  reset(state: T, label?: string): void;
  /** Marks the current state as the saved one. */
  markSaved(): void;
  history(): HistoryInfo;
}

type Entry<T> = {
  state: T;
  /** Describes the edit that produced this state. */
  label: string;
  coalesceKey?: string;
  at: number;
};

export type DocumentOptions = {
  limit?: number;
  /** Injectable clock, so coalescing can be tested without waiting. */
  now?: () => number;
};

export function createDocument<T>(
  initial: T,
  options: DocumentOptions = {},
): DocumentStore<T> {
  const limit = Math.max(1, options.limit ?? DEFAULT_HISTORY_LIMIT);
  const now = options.now ?? (() => Date.now());

  let past: Entry<T>[] = [];
  let present: Entry<T> = { state: initial, label: "open", at: now() };
  let future: Entry<T>[] = [];
  let savedState: T = initial;

  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of [...listeners]) listener();
  };

  return {
    getState: () => present.state,

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    edit(label, updater, meta = {}) {
      const next = updater(present.state);
      if (Object.is(next, present.state)) return false;

      const at = now();
      const window = meta.coalesceWithinMs ?? DEFAULT_COALESCE_MS;
      const coalesce =
        meta.coalesceKey != null &&
        present.coalesceKey === meta.coalesceKey &&
        at - present.at <= window;

      if (coalesce) {
        // Keep the step that is already on the stack and move its end point,
        // so undo jumps back to before the whole gesture.
        present = { state: next, label, coalesceKey: meta.coalesceKey, at };
      } else {
        past.push(present);
        if (past.length > limit) past = past.slice(past.length - limit);
        present = { state: next, label, coalesceKey: meta.coalesceKey, at };
      }
      future = [];
      notify();
      return true;
    },

    undo() {
      const previous = past.pop();
      if (!previous) return false;
      future.unshift(present);
      present = previous;
      notify();
      return true;
    },

    redo() {
      const next = future.shift();
      if (!next) return false;
      past.push(present);
      present = next;
      notify();
      return true;
    },

    reset(state, label = "open") {
      past = [];
      future = [];
      present = { state, label, at: now() };
      savedState = state;
      notify();
    },

    markSaved() {
      savedState = present.state;
      notify();
    },

    history() {
      return {
        undoDepth: past.length,
        redoDepth: future.length,
        // The label of a step describes the edit that produced it: undo takes
        // back the present one, redo puts back the first future one.
        undoLabel: past.length > 0 ? present.label : undefined,
        redoLabel: future.length > 0 ? future[0].label : undefined,
        dirty: !Object.is(present.state, savedState),
      };
    },
  };
}
