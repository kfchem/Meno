import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import logo from "../../assets/icon.png";
import { menuGroups, useTabCommands, type CommandGroup } from "./commands";

/**
 * Meno's menu, from its logo at the top left: everything the app and the tab
 * in front can do, with their keys - the one place that lists them all. (The
 * system's own menu bar is left as the system has it.)
 */
export default function MenoMenu({ own }: { own: CommandGroup[] }) {
  const [open, setOpen] = useState(false);
  const [groups, setGroups] = useState<CommandGroup[]>([]);
  const ref = useRef<HTMLDivElement>(null);
  const show = () => {
    // (the tab's commands as the tab is now: R and S shown or not, say)
    setGroups(menuGroups(own, useTabCommands.getState().offer?.groups() ?? []));
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault();
      const items = [...(ref.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]:not(:disabled)") ?? [])];
      const at = items.indexOf(document.activeElement as HTMLButtonElement);
      const step = e.key === "ArrowDown" ? 1 : -1;
      items[(at + step + items.length) % items.length]?.focus();
    };
    const onPress = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPress, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPress, true);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative mt-1.5 ml-1.5" onMouseDown={(e) => e.stopPropagation()}>
      <button
        aria-label="Menu"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Menu"
        onClick={() => (open ? setOpen(false) : show())}
        className="h-7.5 w-7.5 flex items-center justify-center hover:bg-gray-200 rounded-lg outline-none"
      >
        <img src={logo} alt="" className="h-6 w-6" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            aria-label="Meno"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16, ease: [0.2, 0.8, 0.2, 1] }}
            className="absolute left-0 top-9 z-50 min-w-60 rounded-md border border-gh-line bg-white py-1 shadow-lg text-sm text-gh-black"
          >
            {groups.map((g, i) => (
              <div key={g.title} role="group" aria-label={g.title}>
                {i > 0 && <div role="separator" className="my-1 border-t border-gh-line" />}
                <div className="px-3 pt-1 pb-0.5 text-[11px] text-gh-gray">{g.title}</div>
                {g.items.map((item) => (
                  <button
                    key={item.name}
                    role="menuitem"
                    disabled={item.disabled}
                    onClick={() => {
                      setOpen(false);
                      item.run();
                    }}
                    className="w-full h-8 px-3 flex items-center justify-between gap-6 text-left whitespace-nowrap outline-none hover:bg-gh-base focus:bg-gh-base disabled:text-gh-gray disabled:hover:bg-white"
                  >
                    <span>{item.name}</span>
                    <kbd className="font-sans text-xs text-gh-gray">{item.keys}</kbd>
                  </button>
                ))}
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
