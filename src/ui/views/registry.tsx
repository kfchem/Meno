import type { JSX } from "react";
import OmniLoader from "../features/OmniHub";
import TextEditor from "../features/TextEditor";
import TextDocumentEditor from "../features/TextEditor/TextDocumentEditor";
import {
  createTextDocument,
  textToTabData,
} from "../features/TextEditor/document";
import type { DocumentStore } from "../../lib/doc";
import PyConsole from "../features/PythonConsole";
import GraphEditor from "../features/WorkflowEditor";
import SettingsPanel from "../features/SettingsPanel";
import MoleculeViewer from "../features/MoleculeViewer";

import type {
  TabId,
  TabInstance,
  TabContentBase,
  TabKind,
} from "../../lib/core";
import { StructureCanvas } from "../../ui/features/StructureEditor";

export type ViewProps = {
  tabId: TabId;
  content: TabContentBase;
  active: boolean;
  dispatchPatchData: (patch: unknown) => void;
  replaceContent: (next: unknown) => void;
  /** Present once the view's kind declares `createDocument` (see ViewEntry). */
  document?: DocumentStore<any>;
};

export type ViewEntry = {
  kind: TabKind;
  Component: (p: ViewProps) => JSX.Element;
  create: (label: string) => TabInstance;
  keepAlive?: boolean; // if false, unmount when tab inactive (for heavy WebGL views)
  /**
   * Views opt into documents (undo/redo, saving) by building one from the
   * tab's data. Without this the view keeps owning its own state, as before.
   */
  createDocument?: (data: unknown) => DocumentStore<any>;
  /** Mirrors the document back into the tab's data. */
  toTabData?: (state: any) => Record<string, unknown>;
};

const create = (label: string, kind: TabKind, data?: unknown): TabInstance => {
  const id = crypto.randomUUID();
  return {
    meta: { id, label },
    content: { kind, data },
  } as unknown as TabInstance;
};

export const viewRegistry: Record<string, ViewEntry> = {
  loader: {
    kind: "loader",
    Component: ({ replaceContent }) => (
      <OmniLoader onResolve={(next) => replaceContent(next as any)} />
    ),
    create: (label) => create(label, "loader"),
  },
  "3d": {
    kind: "3d",
    Component: ({ tabId, content, active }) => (
      <MoleculeViewer
        tabId={tabId}
        initialMolecules={(content.data as any)?.molecules ?? []}
        energies={(content.data as any)?.energies}
        showAtomIndex={false}
        paused={!active}
      />
    ),
    create: (label: string) => create(label, "3d", { molecules: [] }),
  },
  "2d": {
    kind: "2d",
    Component: ({ tabId, content, active }) => (
      <StructureCanvas
        tabId={tabId}
        active={active}
        initialFilename={(content as any)?.data?.filename}
        initialPayload={(content as any)?.data?.payload}
      />
    ),
    create: (label) => create(label, "2d", {}),
  },
  text: {
    kind: "text",
    createDocument: createTextDocument,
    toTabData: (text: string) => textToTabData(text),
    Component: ({ content, dispatchPatchData, document }) =>
      document ? (
        <TextDocumentEditor document={document as DocumentStore<string>} />
      ) : (
        // Fallback for a tab opened before documents existed.
        <TextEditor
          value={(content.data as any)?.text ?? ""}
          onChange={(v: string) => dispatchPatchData({ text: v })}
        />
      ),
    create: (label) => create(label, "text", { text: "" }),
  },
  settings: {
    kind: "settings",
    Component: () => <SettingsPanel />,
    create: (label) => create(label, "settings", {}),
  },
  pyconsole: {
    kind: "pyconsole",
    Component: () => <PyConsole />,
    create: (label) => create(label, "pyconsole", {}),
  },
  node: {
    kind: "node",
    Component: ({ content, active }) => (
      <GraphEditor
        active={active}
        initialFilename={(content as any)?.data?.filename}
        initialPayload={(content as any)?.data?.payload}
      />
    ),
    create: (label) => create(label, "node", {}),
  },
  structure: {
    kind: "structure",
    Component: ({ tabId, content, active }) => (
      <StructureCanvas
        tabId={tabId}
        active={active}
        initialFilename={(content as any)?.data?.filename}
        initialPayload={(content as any)?.data?.payload}
      />
    ),
    create: (label) => create(label, "structure", {}),
  },
};

export default viewRegistry;
