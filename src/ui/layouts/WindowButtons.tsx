import { MinusIcon, StopIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { useMemo, type MouseEvent } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

const stop = (e: MouseEvent) => e.stopPropagation();

/** Minimise, maximise and close, drawn by Meno at the title bar's right. */
export default function WindowButtons() {
  const appWindow = useMemo(() => getCurrentWindow(), []);
  return (
    <div className="ml-2 h-full flex">
      <button
        aria-label="Minimize"
        title="Minimize"
        onMouseDown={stop}
        onClick={() => appWindow.minimize()}
        className="h-10 w-11 flex items-center justify-center transition-colors duration-150 ease-meno hover:bg-gray-200"
      >
        <MinusIcon className="h-4 w-4" />
      </button>
      <button
        aria-label="Maximize"
        title="Maximize / Restore"
        onMouseDown={stop}
        onClick={() => appWindow.toggleMaximize()}
        className="h-10 w-11 flex items-center justify-center transition-colors duration-150 ease-meno hover:bg-gray-200"
      >
        <StopIcon className="h-4 w-4" />
      </button>
      <button
        aria-label="Close"
        title="Close"
        onMouseDown={stop}
        onClick={() => appWindow.close()}
        className="h-10 w-11 flex items-center justify-center transition-colors duration-150 ease-meno hover:bg-red-500 hover:text-white"
      >
        <XMarkIcon className="h-4 w-4" />
      </button>
    </div>
  );
}
