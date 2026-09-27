import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import plexSans from "../../../assets/fonts/IBMPlexSans-Regular.ttf?url";

let systemArial: Promise<string | undefined> | undefined;

/**
 * The font file the canvas sets labels in, for a typeface, as a URL the
 * text renderer can load: IBM Plex Sans from Meno's own files, and for
 * Arial and Helvetica (which is drawn to Arial's widths) the system's Arial,
 * read once through the app. Nothing outside the app or where there is no
 * Arial - the renderer's own font is used then.
 */
export function labelFontUrl(family: string): Promise<string | undefined> {
  if (family === "IBM Plex Sans") return Promise.resolve(plexSans);
  systemArial ??= invoke<ArrayBuffer>("label_font")
    .then((bytes) =>
      URL.createObjectURL(new Blob([bytes], { type: "font/ttf" })),
    )
    .catch(() => undefined);
  return systemArial;
}

/** `labelFontUrl`, for a component: null until it is known. */
export function useLabelFont(family: string): string | undefined | null {
  const [font, setFont] = useState<{ family: string; url?: string } | null>(
    null,
  );
  useEffect(() => {
    let live = true;
    void labelFontUrl(family).then((url) => {
      if (live) setFont({ family, url });
    });
    return () => {
      live = false;
    };
  }, [family]);
  // Until the typeface asked for is known, nothing: not the last one's file.
  return font && font.family === family ? font.url : null;
}
