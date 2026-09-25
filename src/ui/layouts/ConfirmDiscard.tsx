import { useEffect, useRef } from "react";

/**
 * Asks before something with unsaved changes is closed. Drawn in the page
 * rather than as a system dialog, so it looks the same on every platform and
 * shows up in a window capture.
 *
 * Nothing here can be saved yet, so the choice is to keep it open or to let
 * the changes go; a Save button joins these once saving exists.
 */
export default function ConfirmDiscard({
  title,
  message,
  discardLabel,
  onCancel,
  onDiscard,
}: {
  title: string;
  message: string;
  discardLabel: string;
  onCancel: () => void;
  onDiscard: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    // Keeping is the safe answer, so it is the one a stray Enter gives.
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div
      className="absolute inset-0 z-[100] flex items-center justify-center bg-black/20"
      onPointerDown={(e) => {
        // A press outside the box is a way of saying no.
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-discard-title"
        className="w-[360px] max-w-[90%] rounded-lg border border-gh-line bg-white shadow-lg p-4 text-sm text-gh-black"
      >
        <h2 id="confirm-discard-title" className="font-semibold mb-2 break-words">
          {title}
        </h2>
        <p className="text-gh-gray mb-4">{message}</p>
        <div className="flex justify-end gap-2">
          <button
            ref={cancelRef}
            onClick={onCancel}
            className="rounded-md border border-gh-line px-3 py-1.5 hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            onClick={onDiscard}
            className="rounded-md border border-red-300 bg-red-50 px-3 py-1.5 text-red-700 hover:bg-red-100"
          >
            {discardLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
