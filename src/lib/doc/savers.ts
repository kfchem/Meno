/**
 * What saves each tab that can be saved, by the tab's id: set by the tab's
 * view while it is there, so that closing a tab - or the window - with
 * unsaved changes can offer to save it first. Each resolves true once the
 * tab is saved, false where the chemist did not say where, or it failed.
 */
const savers = new Map<string, () => Promise<boolean>>();

/** Sets what saves tab `id`; the function returned takes it away again. */
export function setSaver(id: string, save: () => Promise<boolean>): () => void {
  savers.set(id, save);
  return () => {
    if (savers.get(id) === save) savers.delete(id);
  };
}

/** What saves tab `id`, if it can be saved. */
export function saverOf(id: string): (() => Promise<boolean>) | undefined {
  return savers.get(id);
}
