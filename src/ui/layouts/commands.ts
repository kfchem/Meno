import { create } from "zustand";

/** One thing the app's menu offers: its name, its key if it has one, and what it does. */
export type Command = { name: string; keys?: string; run: () => void; disabled?: boolean };
/** Commands under one heading: File, Edit, View, Format. */
export type CommandGroup = { title: string; items: Command[] };

type Offer = { owner: string; groups: () => CommandGroup[] };

/**
 * What the tab in front offers the app's menu (MenoMenu): asked for as the
 * menu opens, so that it is as the tab is then.
 */
export const useTabCommands = create<{ offer: Offer | null }>(() => ({ offer: null }));

/** `owner` offers `groups` to the app's menu; what it returns takes them back. */
export function offerCommands(owner: string, groups: () => CommandGroup[]): () => void {
  useTabCommands.setState({ offer: { owner, groups } });
  return () => {
    if (useTabCommands.getState().offer?.owner === owner) useTabCommands.setState({ offer: null });
  };
}

const HEADINGS = ["File", "Edit", "View", "Format"];

/**
 * The app's own commands and the tab's, under one heading each - File,
 * Edit, View, Format, then any other - the app's first; empty headings left out.
 */
export function menuGroups(own: CommandGroup[], tab: CommandGroup[]): CommandGroup[] {
  const by = new Map<string, Command[]>();
  for (const g of [...own, ...tab]) by.set(g.title, [...(by.get(g.title) ?? []), ...g.items]);
  const rank = (t: string) => (HEADINGS.includes(t) ? HEADINGS.indexOf(t) : HEADINGS.length);
  return [...by.entries()]
    .filter(([, items]) => items.length > 0)
    .sort(([a], [b]) => rank(a) - rank(b))
    .map(([title, items]) => ({ title, items }));
}
