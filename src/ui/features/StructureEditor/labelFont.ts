import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";

let pending: Promise<string | undefined> | undefined;

/**
 * The font the canvas sets labels in: the system's Arial, which ACS 1996 asks
 * for and the layout is measured in, read once through the app. Resolves to
 * a URL the text renderer can load, or to nothing outside the app or where
 * there is no Arial - the renderer's own font is used then.
 */
export function labelFontUrl(): Promise<string | undefined> {
  pending ??= invoke<ArrayBuffer>("label_font")
    .then((bytes) =>
      URL.createObjectURL(new Blob([bytes], { type: "font/ttf" })),
    )
    .catch(() => undefined);
  return pending;
}

/** `labelFontUrl`, for a component: null until it is known. */
export function useLabelFont(): string | undefined | null {
  const [url, setUrl] = useState<string | undefined | null>(null);
  useEffect(() => {
    let live = true;
    void labelFontUrl().then((u) => {
      if (live) setUrl(u);
    });
    return () => {
      live = false;
    };
  }, []);
  return url;
}
