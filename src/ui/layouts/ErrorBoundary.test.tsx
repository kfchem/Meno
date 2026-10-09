import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { ErrorBoundary, StoppedCard, type Stopped } from "./ErrorBoundary";

// Vitest runs in Node, with no page to mount on: what the boundary does as
// React calls it is done by hand here; the server's renderer draws what it
// shows. (In the app it was tried by making each part fail in turn.)

const fallback = ({ error }: Stopped) => <p>{`stopped: ${String(error)}`}</p>;

/** A boundary as React holds it, with `setState` applied at once. */
function held(props: Partial<ConstructorParameters<typeof ErrorBoundary>[0]> = {}) {
  const b = new ErrorBoundary({ part: "canvas", fallback, children: <p>the part</p>, ...props });
  b.setState = ((u: any) => {
    b.state = { ...b.state, ...(typeof u === "function" ? u(b.state, b.props) : u) };
  }) as typeof b.setState;
  return b;
}

/** A boundary that has caught `error`, as React leaves it. */
function failed(error: unknown, props: Parameters<typeof held>[0] = {}) {
  const b = held(props);
  b.state = { ...b.state, ...ErrorBoundary.getDerivedStateFromError(error) };
  return b;
}

const drawn = (b: ErrorBoundary) => renderToString(<>{b.render()}</>);

afterEach(() => vi.restoreAllMocks());

describe("ErrorBoundary", () => {
  it("shows the part while nothing has failed", () => {
    expect(renderToString(<ErrorBoundary part="canvas" fallback={fallback}><p>the part</p></ErrorBoundary>)).toContain("the part");
    // (given as a function, it is told it is not made again)
    const seen: boolean[] = [];
    renderToString(
      <ErrorBoundary part="canvas" fallback={fallback}>
        {(reloaded) => {
          seen.push(reloaded);
          return <p>the part</p>;
        }}
      </ErrorBoundary>,
    );
    expect(seen).toEqual([false]);
  });

  it("shows the fallback in its place once it has failed, whatever was thrown", () => {
    expect(drawn(failed(new Error("no atom 7")))).toContain("stopped: Error: no atom 7");
    expect(drawn(failed(null))).toContain("stopped: null");
  });

  it("logs what failed, naming the part", () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new Error("no atom 7");
    failed(error).componentDidCatch(error, { componentStack: "\n    at Atoms2D" });
    expect(logged).toHaveBeenCalledWith("Meno: the canvas stopped working.", error, "\n    at Atoms2D");
  });

  it("makes the part again on Reload, after letting go of what it was doing", () => {
    const order: string[] = [];
    const seen: boolean[] = [];
    let reload = () => {};
    const b = failed(new Error("no atom 7"), {
      fallback: (s: Stopped) => ((reload = s.reload), null),
      onReload: () => order.push("let go"),
      children: (reloaded: boolean) => {
        order.push("made");
        seen.push(reloaded);
        return <p>the part</p>;
      },
    });
    b.render();
    reload();
    expect(drawn(b)).toContain("the part");
    expect(order).toEqual(["let go", "made"]);
    expect(seen).toEqual([true]);
  });
});

describe("StoppedCard", () => {
  it("says what stopped, what went wrong, and what can be done", () => {
    const html = renderToString(
      <StoppedCard
        said="The canvas stopped working. What is on it is kept."
        error={new TypeError("Cannot read properties of null (reading 'x')")}
        actions={[{ label: "Reload", run: () => {} }, { label: "Hide", run: () => {} }]}
      />,
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain("The canvas stopped working. What is on it is kept.");
    expect(html).toContain("TypeError: Cannot read properties of null (reading &#x27;x&#x27;)");
    expect(html).toMatch(/<button[^>]*>Reload<\/button>.*<button[^>]*>Hide<\/button>/);
  });

  it("says what was thrown that is not an Error", () => {
    expect(renderToString(<StoppedCard said="" error="lost" actions={[]} />)).toContain("lost");
  });
});
