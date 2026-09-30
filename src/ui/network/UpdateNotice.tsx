import { useState } from "react";
import { restartIntoUpdate, useUpdate } from "../../lib/update";

/**
 * A newer Meno downloaded: said once, in a corner, with a restart into it
 * at once - it goes in when Meno is quit anyway.
 */
export default function UpdateNotice() {
  const ready = useUpdate((s) => (s?.phase === "ready" ? s.version : null));
  const [dismissed, setDismissed] = useState<string | null>(null);
  if (!ready || dismissed === ready) return null;
  return (
    <div
      role="status"
      className="fixed bottom-3 left-3 z-50 max-w-sm flex items-center gap-3 rounded-md border border-gh-line bg-white/95 shadow-sm px-3 py-2 text-xs text-gh-black"
    >
      <span className="flex-1">Meno {ready} is ready. It goes in when you quit Meno.</span>
      <button
        onClick={() => void restartIntoUpdate()}
        className="shrink-0 h-7 px-2.5 rounded-md border border-gh-line hover:bg-gh-base"
      >
        Restart now
      </button>
      <button
        onClick={() => setDismissed(ready)}
        className="shrink-0 underline text-gh-gray hover:text-gh-black"
      >
        Later
      </button>
    </div>
  );
}
