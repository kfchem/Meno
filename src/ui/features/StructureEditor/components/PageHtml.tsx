import { Html } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import type { ComponentProps, RefObject } from "react";
import { usePageHtmlLayer } from "./coverLayer";
import { pageHtmlStyle } from "./pageHtmlStyle";

/**
 * drei's Html, laid over the canvas only once the canvas's events are
 * connected to their element - where Html puts what it holds. Before then
 * it puts it beside the canvas and moves it when they are: it unmounts its
 * own React root while the canvas's is rendering, which can leave it empty.
 * (So it did for the frames chip of a molecule opened with its file, from
 * three 0.186 on.)
 */
export default function PageHtml(props: ComponentProps<typeof Html>) {
  const connected = useThree((s) => s.events.connected);
  // (in the layer cut off where the column begins, where there is one: coverLayer)
  const layer = usePageHtmlLayer();
  return connected ? <Html {...(layer ? { portal: layer as RefObject<HTMLElement> } : {})} {...props} style={pageHtmlStyle(props)} /> : null;
}
