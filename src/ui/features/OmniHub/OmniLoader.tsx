import { useRef } from "react";
import type { TabKind } from "../../../lib/core";
// no direct parsing here; route to StructureEditor
import { detectFormat, readMoleculesFromText } from "../../../utils/importers";

type Props = {
  onResolve: (next: { kind: TabKind } & Record<string, unknown>) => void;
};

const EXT_3D = new Set(["sdf", "xyz", "pdb"]);
const EXT_2D = new Set(["mol", "rxn", "ket"]);
const EXT_TEXT = new Set([
  "txt",
  "md",
  "markdown",
  "json",
  "csv",
  "tsv",
  "yaml",
  "yml",
  "ini",
  "cfg",
  "log",
  "js",
  "ts",
  "tsx",
  "py",
  "c",
  "cpp",
  "css",
  "html",
]);

const isRxn = (s: string) => /^\s*\$RXN\b/m.test(s);
const isMol = (s: string) =>
  /\b(V2000|V3000)\b/.test(s) || /^(M\s{2,}END)\s*$/m.test(s);
// const isKet = (s: string) =>
//   s.trim().startsWith("{") && /"root"|\"nodes\"/.test(s);
const isXyz = (s: string) => /^\s*\d+\s*$/m.test(s.split("\n")[0] || "");
const normalize = (s: string) => s.replace(/\r\n?/g, "\n").trim();

export default function OmniLoader({ onResolve }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const onPick = () => inputRef.current?.click();

  const handleFiles = async (files: FileList) => {
    if (!files.length) return;
    const file = files[0];
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    const textRaw = await file.text();
    const text = normalize(textRaw);

    // Prefer MoleculeViewer for XYZ; others continue to StructureEditor as before
    const fmt = detectFormat(file.name, textRaw);
    if (fmt === "xyz" || isXyz(text) || ext === "xyz") {
      const molecules = readMoleculesFromText(textRaw, "xyz");
      onResolve({ kind: "3d", molecules, filename: file.name });
      return;
    }
    // Route other chemical files to StructureEditor
    if (
      ext === "sdf" ||
      EXT_3D.has(ext) ||
      isRxn(text) ||
      isMol(text) ||
      EXT_2D.has(ext)
    ) {
      onResolve({ kind: "structure", filename: file.name, payload: textRaw });
      return;
    }

    if (EXT_TEXT.has(ext)) {
      onResolve({
        kind: "text",
        text: textRaw,
        language: ext,
        filename: file.name,
      });
      return;
    }

    try {
      const asJson = JSON.parse(textRaw);
      onResolve({
        kind: "text",
        text: JSON.stringify(asJson, null, 2),
        language: "json",
        filename: file.name,
      });
      return;
    } catch {}

    onResolve({
      kind: "text",
      text: textRaw,
      language: ext || "txt",
      filename: file.name,
    });
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length)
      handleFiles(e.dataTransfer.files);
  };

  return (
    <div
      className="flex-1 w-full h-full grid place-items-center"
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      <div className="text-center space-y-3">
        <button
          className="px-4 py-2 border rounded border-gh-line text-gh-black"
          onClick={onPick}
        >
          Open file
        </button>
        <div className="text-sm text-gray-600">or drop a file here</div>
      </div>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept={[
          ".mol",
          ".rxn",
          ".ket",
          ".sdf",
          ".xyz",
          ".pdb",
          ".txt",
          ".md",
          ".markdown",
          ".json",
          ".csv",
          ".tsv",
          ".yaml",
          ".yml",
          ".ini",
          ".cfg",
          ".log",
          ".js",
          ".ts",
          ".tsx",
          ".py",
          ".c",
          ".cpp",
          ".css",
          ".html",
        ].join(",")}
        onChange={(e) => e.target.files && handleFiles(e.target.files)}
      />
    </div>
  );
}
