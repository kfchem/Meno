import type { Html } from "@react-three/drei";
import type { ComponentProps, CSSProperties } from "react";

type Props = ComponentProps<typeof Html>;

/**
 * What HTML on the page is styled with: as it was given - and, laid flat on
 * the screen (not `transform`), taking the pointer unless it says it does
 * not. The layer it goes in passes the pointer through to the canvas where
 * it holds nothing (`pointer-events: none`), and drei's Html sets nothing of
 * its own there, so what it holds would pass it through as well: a list's
 * rows not pointed at nor chosen, a chip's slider not dragged. (In
 * `transform`, drei's own `pointerEvents` says it.)
 */
export function pageHtmlStyle(props: Pick<Props, "transform" | "style">): CSSProperties | undefined {
  if (props.transform || props.style?.pointerEvents != null) return props.style;
  return { pointerEvents: "auto", ...props.style };
}
