import { Component, type ErrorInfo, type ReactNode } from "react";
import { motion } from "motion/react";
import clsx from "clsx";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { RISE } from "../theme/motion";

/** What a part that failed offers, as a button on its card: Reload, and whatever else lets work go on. */
export type StoppedAction = { label: string; run: () => void };

/** A part that failed, as its fallback is given it: what went wrong, and the part made again. */
export type Stopped = { error: unknown; reload: () => void };

type Props = {
  /** What the part is, as the log names it: "canvas", "column", "tab", "window". */
  part: string;
  /** What is shown in the part's place once it has failed. */
  fallback: (stopped: Stopped) => ReactNode;
  /** Done just before the part is made again: whatever it was in the middle of let go. */
  onReload?: () => void;
  /** The part - or, given whether it is made again after failing, the part as it is then. */
  children: ReactNode | ((reloaded: boolean) => ReactNode);
};

type State = { failed: boolean; error: unknown; reloads: number };

/**
 * A part of the window that, should it fail as it is drawn, gives way to a
 * card saying so, and leaves the rest of the window as it was (docs/
 * ARCHITECTURE.md, *When a part fails*). Reload makes the part again from
 * nothing; what it shows lives outside it - a tab's document in lib/doc,
 * the canvas's store with the document - and is there as it was.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false, error: null, reloads: 0 };

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { failed: true, error };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    // (to be found in the console: which part, what, and where in the tree)
    console.error(`Meno: the ${this.props.part} stopped working.`, error, info.componentStack ?? "");
  }

  reload = () => {
    this.props.onReload?.();
    this.setState((s) => ({ failed: false, error: null, reloads: s.reloads + 1 }));
  };

  render() {
    const { failed, error, reloads } = this.state;
    if (failed) return this.props.fallback({ error, reload: this.reload });
    const { children } = this.props;
    return typeof children === "function" ? children(reloads > 0) : children;
  }
}

/** What went wrong, in a line. */
function errorLine(error: unknown): string {
  if (error instanceof Error) return error.message ? `${error.name}: ${error.message}` : error.name;
  return String(error);
}

/**
 * The card a part that failed leaves in its place, as Meno's notices are
 * drawn: what stopped and that what it showed is kept, the error in grey
 * beneath, and what can be done about it.
 */
export function StoppedCard({
  said,
  error,
  actions,
  className,
}: {
  said: string;
  error: unknown;
  actions: StoppedAction[];
  /** Where it sits, over the part's place. */
  className?: string;
}) {
  return (
    <motion.div
      {...RISE}
      role="alert"
      className={clsx(
        "z-50 max-w-[90%] w-max flex items-start gap-2 rounded-md border border-gh-line bg-white/95 shadow-sm px-3 py-2 text-xs text-gh-black",
        className,
      )}
    >
      <ExclamationTriangleIcon className="h-4 w-4 shrink-0 text-accel-accent" />
      <div className="min-w-0">
        <p className="break-words">{said}</p>
        <p className="mt-0.5 break-words text-gh-gray select-text">{errorLine(error)}</p>
      </div>
      {actions.map((a) => (
        <button
          key={a.label}
          onClick={(e) => {
            e.stopPropagation();
            a.run();
          }}
          className="shrink-0 underline text-gh-gray hover:text-gh-black"
        >
          {a.label}
        </button>
      ))}
    </motion.div>
  );
}
