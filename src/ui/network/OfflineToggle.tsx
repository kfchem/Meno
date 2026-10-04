import { AnimatePresence, motion } from "motion/react";
import { DURATION, EASE, FADE } from "../theme/motion";
import { GlobeAltIcon, SignalSlashIcon } from "@heroicons/react/24/outline";
import clsx from "clsx";
import { setOffline, useNetwork } from "../../lib/net/network";

/**
 * Online or offline, in the top bar, and a dot while anything is on the
 * network. A click switches between them.
 */
export default function OfflineToggle() {
  const offline = useNetwork((s) => s.offline);
  const busy = useNetwork((s) =>
    Object.values(s.tasks).some((t) => !t.ended && t.purpose !== "python-code"),
  );
  return (
    <button
      onMouseDown={(e) => e.stopPropagation()}
      onClick={() => void setOffline(!offline)}
      aria-pressed={offline}
      aria-label={offline ? "Offline" : "Online"}
      title={
        offline
          ? "Offline: nothing leaves this computer. Click to go online."
          : "Online: Meno asks before anything first uses the network. Click to work offline."
      }
      className={clsx(
        "relative h-7 rounded-md flex items-center gap-1 px-1.5 text-xs transition-colors duration-150 ease-meno",
        offline
          ? "bg-accel-lightaccent text-accel-accent hover:opacity-90"
          : "text-gh-gray hover:bg-gray-200 hover:text-gh-black",
      )}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span key={offline ? "off" : "on"} {...FADE} className="flex">
          {offline ? <SignalSlashIcon className="h-4 w-4" /> : <GlobeAltIcon className="h-4 w-4" />}
        </motion.span>
      </AnimatePresence>
      <AnimatePresence initial={false}>
        {offline && (
          <motion.span
            key="offline"
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: "auto" }}
            exit={{ opacity: 0, width: 0 }}
            transition={{ duration: DURATION.base, ease: EASE }}
            className="overflow-hidden whitespace-nowrap"
          >
            Offline
          </motion.span>
        )}
      </AnimatePresence>
      {busy && (
        <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-accel-base animate-pulse" />
      )}
    </button>
  );
}
