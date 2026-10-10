import { create } from "zustand";

/**
 * Each time Open… was asked for from inside a view - the menu on empty
 * space - counted: Meno shows the system's file dialog (App), as Ctrl/Cmd+O
 * does.
 */
export const useOpenAsked = create<{ asked: number }>(() => ({ asked: 0 }));

/** Asks for Open…, from anywhere. */
export function askToOpen(): void {
  useOpenAsked.setState((s) => ({ asked: s.asked + 1 }));
}
