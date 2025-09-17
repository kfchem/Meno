import { motion } from "motion/react";

const modeTabs = [
  { id: "ball", label: "B&S", color: "#cfe7ee" },
  { id: "vdw", label: "CPK", color: "#f5dadf" },
];

export default function ModeTabs({
  currentMode,
  onChange,
  tabId,
}: {
  currentMode: "ball" | "vdw";
  onChange: (mode: "ball" | "vdw") => void;
  tabId: string;
}) {
  return (
    <ul className="absolute top-4 right-4 z-10 h-8.5 w-23.5 flex backdrop-blur border-1 bg-white/50 border-gh-line rounded-full overflow-hidden items-center justify-between">
      {modeTabs.map((tab) => (
        <li key={tab.id} className="relative">
          <button
            onClick={() => onChange(tab.id as "ball" | "vdw")}
            className={`relative px-3 py-2 text-xs transition-colors ${
              currentMode === tab.id
                ? "text-gh-black"
                : "text-gh-gray hover:text-gh-black duration-75"
            }`}
          >
            <span className="relative z-10">{tab.label}</span>
            {currentMode === tab.id && (
              <motion.span
                layoutId={`activeModeTab-${tabId}`}
                className="absolute inset-0 z-0 rounded-full m-1 bg-gh-base/60 border-1 border-gh-line backdrop-blur"
                transition={{
                  type: "spring",
                  stiffness: 500,
                  damping: 30,
                }}
              />
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}
