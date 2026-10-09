/**
 * The column lies over the canvas's right side (docs/PDF.md, *One canvas*):
 * what is on the page in HTML - a step's card, a chip, words being written -
 * goes in a layer cut off where the column begins (PageHtml), and the view
 * follows the column as it opens, shuts or is dragged, so that what was in
 * the middle of the view stays in the middle of what can be seen.
 */
import { createContext, useContext, useEffect, useMemo, useRef, type RefObject } from "react";
import type * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { useEditor } from "../store";
import { setViewGoal, viewGoalOf } from "./viewGoal";

/** The layer the page's HTML goes in, cut off where the column begins: its element, once it is there. */
export const PageHtmlLayer = createContext<HTMLElement | null>(null);

/** The layer, as drei's Html takes a place to go in. */
export function usePageHtmlLayer(): RefObject<HTMLElement> | null {
  const el = useContext(PageHtmlLayer);
  return useMemo(() => (el ? { current: el } : null), [el]);
}

/** The view following the column: as it covers more or less, the view moves by half as much, eased. */
export function FollowCover() {
  const cover = useEditor((s) => s.cover);
  const { camera, invalidate } = useThree();
  const was = useRef<number | null>(null);
  useEffect(() => {
    if (was.current == null) {
      was.current = cover;
      return;
    }
    const d = cover - was.current;
    was.current = cover;
    if (!d) return;
    const cam = camera as THREE.OrthographicCamera;
    const goal = viewGoalOf(cam);
    const zoom = goal?.zoom ?? cam.zoom;
    if (!zoom) return;
    setViewGoal(cam, { zoom, x: (goal?.x ?? cam.position.x) + d / 2 / zoom, y: goal?.y ?? cam.position.y });
    invalidate();
  }, [cover, camera, invalidate]);
  return null;
}
