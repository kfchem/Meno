import { useState, useCallback, useMemo } from "react";
import {
  ReactFlow,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
  Handle,
  Position,
  NodeResizeControl,
  type Node,
  type Edge,
  type NodeChange,
  type EdgeChange,
  type Connection,
  type NodeTypes,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Cog6ToothIcon } from "@heroicons/react/24/outline";
import { StructureCanvas } from "../StructureEditor";
import MoleculeViewer from "../MoleculeViewer/MoleculeViewer";
import { Molecule, parseXYZ } from "../../../utils/structureParsers";
import testXyz from "../../../assets/KEF20633_b_296.xyz?raw";

type Molecule2DNode = Node<{ filename?: string; payload?: string }>;

function Molecule2D({ id, data }: NodeProps<Molecule2DNode>) {
  // Show helper hint only until first interaction or when initial data exists
  const [hideHint, setHideHint] = useState<boolean>(
    !!(data?.payload || data?.filename)
  );
  return (
    <>
      <NodeResizeControl
        nodeId={id}
        style={{
          background: "transparent",
          border: "none",
        }}
        className="z-50"
      >
        <div className="size-10 absolute right-0 bottom-0"></div>
      </NodeResizeControl>
      <Handle type="source" position={Position.Right} style={{ top: 15 }} />
      <div className="rounded-sm border border-gh-line bg-white w-full h-full flex-1 flex flex-col overflow-hidden">
        <div className="h-8 min-h-8 bg-gh-base border-b border-gh-line flex items-center px-3 justify-between">
          <span className="text-xs text-gh-gray">Sketch molecule</span>
          <span className="text-[10px] text-gh-gray/70">Input</span>
        </div>
        {/* Embed StructureCanvas; stop propagation on content so ReactFlow doesn't drag while sketching */}
        <div
          className="min-w-[300px] min-h-[300px] w-full h-full relative nowheel nopan nodrag bg-white"
          onPointerDown={(e) => {
            e.stopPropagation();
            if (!hideHint) setHideHint(true);
          }}
          onPointerUp={(e) => {
            e.stopPropagation();
            if (!hideHint) setHideHint(true);
          }}
          onDrop={() => {
            if (!hideHint) setHideHint(true);
          }}
        >
          <StructureCanvas
            tabId={id}
            initialFilename={data?.filename}
            initialPayload={data?.payload}
          />
          {/* Helper hint (English). Hidden after first interaction or when initial data exists) */}
          {!hideHint && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center select-none">
              <div className="px-3 py-1 rounded text-[11px] text-gh-gray bg-white/70 border border-gh-line/60">
                Double-click to start drawing / drop a file to import
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

type Molecule3DNode = Node<{ molecules: Molecule[] | Molecule[][] }>;

function Molecule3D({ id, data }: NodeProps<Molecule3DNode>) {
  return (
    <>
      <NodeResizeControl
        nodeId={id}
        style={{
          background: "transparent",
          border: "none",
        }}
        className="z-50"
      >
        <div className="size-10 absolute right-0 bottom-0"></div>
      </NodeResizeControl>
      <Handle type="target" position={Position.Left} style={{ top: 15 }} />
      <div className="rounded-sm border border-gh-line bg-white flex flex-col overflow-hidden min-h-0 w-full h-full relative">
        <div className="h-8 min-h-8 bg-gh-base border-b border-gh-line flex items-center px-3 justify-between">
          <span className="text-xs text-gh-gray">3D view</span>
          <span className="text-[10px] text-gh-gray/70">Viewer</span>
        </div>
        <MoleculeViewer
          initialMolecules={data.molecules}
          tabId={id}
          showAtomIndex={false}
          className="cursor-default nowheel nopan nodrag"
        />
      </div>
    </>
  );
}

type ParamValues = {
  method: string;
  basis: string;
  charge: number;
  multiplicity: number;
  temperature?: number;
  solvent?: string;
};

type ParametersNodeData = {
  label?: string;
  values?: Partial<ParamValues>;
  onChange?: (next: ParamValues) => void;
  methods?: Array<{ id: string; label: string }>;
  bases?: string[];
  solvents?: Array<{ id: string; label: string }>;
};
type ParametersNode = Node<ParametersNodeData>;

function Parameters({ id, data }: NodeProps<ParametersNode>) {
  const methodOptions = useMemo(
    () =>
      data.methods ?? [
        { id: "gfn2-xtb", label: "GFN2-xTB" },
        { id: "b3lyp", label: "B3LYP" },
        { id: "m06-2x", label: "M06-2X" },
        { id: "wb97x-d", label: "ωB97X-D" },
      ],
    [data.methods]
  );
  const basisOptions = useMemo(
    () => data.bases ?? ["def2-SVP", "def2-TZVP", "6-31G(d)", "cc-pVDZ"],
    [data.bases]
  );
  const solventOptions = useMemo(
    () =>
      data.solvents ?? [
        { id: "gas", label: "Gas phase" },
        { id: "water", label: "Water" },
        { id: "acn", label: "Acetonitrile" },
        { id: "meoh", label: "Methanol" },
        { id: "etoh", label: "Ethanol" },
        { id: "chcl3", label: "Chloroform" },
        { id: "dcm", label: "Dichloromethane" },
        { id: "tol", label: "Toluene" },
      ],
    [data.solvents]
  );

  const initial: ParamValues = {
    method: data.values?.method ?? methodOptions[0].id,
    basis: data.values?.basis ?? basisOptions[0],
    charge: data.values?.charge ?? 0,
    multiplicity: data.values?.multiplicity ?? 1,
    temperature: data.values?.temperature ?? 298.15,
    solvent: data.values?.solvent ?? "gas",
  };
  const [local, setLocal] = useState<ParamValues>(initial);

  const setLocalAndNotify = (next: ParamValues) => {
    setLocal(next);
    data.onChange?.(next);
  };

  const setValue = <K extends keyof ParamValues>(k: K, v: ParamValues[K]) => {
    const next = { ...local, [k]: v } as ParamValues;
    if (k === "method") {
      const isXTB = v === "gfn2-xtb";
      next.basis = isXTB
        ? "N/A"
        : local.basis === "N/A"
        ? basisOptions[0]
        : local.basis;
    }
    setLocalAndNotify(next);
  };

  const onNumberWheel = (e: React.WheelEvent<HTMLInputElement>) =>
    (e.target as HTMLInputElement).blur();
  const basisDisabled = local.method === "gfn2-xtb";

  return (
    <>
      <Handle type="source" position={Position.Right} style={{ top: 15 }} />
      <div className="rounded-sm border border-gh-line bg-white flex flex-col overflow-hidden">
        <div className="h-8 min-h-8 bg-gh-base border-b border-gh-line px-3 flex items-center justify-between">
          <span className="text-xs text-gh-gray tracking-wide">
            {data.label}
          </span>
          <span className="text-[10px] text-gh-gray/70">Parameters</span>
        </div>
        <div
          id={id}
          className="p-2 text-[11px] text-gh-black select-none  nowheel nopan nodrag"
        >
          <div className="grid grid-cols-2 gap-x-2 gap-y-2 min-w-48">
            <label className="flex items-center justify-between gap-2">
              <span className="text-gh-gray">Method</span>
              <select
                className="h-6 px-1 rounded border border-gh-line bg-white text-xs"
                value={local.method}
                onChange={(e) => setValue("method", e.target.value)}
              >
                {methodOptions.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex items-center justify-between gap-2">
              <span className="text-gh-gray">Basis</span>
              {basisDisabled ? (
                <div className="h-6 w-24 px-1 rounded border border-gh-line bg-gh-base/40 text-xs grid place-items-center text-gh-gray">
                  N/A
                </div>
              ) : (
                <select
                  className="h-6 px-1 rounded border border-gh-line bg-white text-xs"
                  value={local.basis}
                  onChange={(e) => setValue("basis", e.target.value)}
                >
                  {basisOptions.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              )}
            </label>

            <label className="flex items-center justify-between gap-2">
              <span className="text-gh-gray">Charge</span>
              <input
                type="number"
                className="h-6 w-20 px-1 rounded border border-gh-line bg-white text-xs text-right"
                value={local.charge}
                step={1}
                onWheel={onNumberWheel}
                onChange={(e) => setValue("charge", Number(e.target.value))}
              />
            </label>

            <label className="flex items-center justify-between gap-2">
              <span className="text-gh-gray">Multiplicity</span>
              <input
                type="number"
                className="h-6 w-20 px-1 rounded border border-gh-line bg-white text-xs text-right"
                value={local.multiplicity}
                min={1}
                step={1}
                onWheel={onNumberWheel}
                onChange={(e) =>
                  setValue("multiplicity", Number(e.target.value))
                }
              />
            </label>

            <label className="flex items-center justify-between gap-2">
              <span className="text-gh-gray">Temp (K)</span>
              <input
                type="number"
                className="h-6 w-24 px-1 rounded border border-gh-line bg-white text-xs text-right"
                value={local.temperature}
                min={0}
                step={0.1}
                onWheel={onNumberWheel}
                onChange={(e) =>
                  setValue("temperature", Number(e.target.value))
                }
              />
            </label>

            <label className="flex items-center justify-between gap-2">
              <span className="text-gh-gray">Solvent</span>
              <select
                className="h-6 px-1 rounded border border-gh-line bg-white text-xs"
                value={local.solvent}
                onChange={(e) => setValue("solvent", e.target.value)}
              >
                {solventOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </div>
    </>
  );
}

type EngineNode = Node<{ label?: string; sublabel?: string }>;

function Engine({ id, data }: NodeProps<EngineNode>) {
  return (
    <>
      <Handle
        type="target"
        id="input"
        position={Position.Left}
        style={{ top: 57 }}
      />
      <Handle
        type="target"
        id="parameters"
        position={Position.Left}
        style={{ top: 107 }}
      />
      <div className="rounded-sm border border-gh-line bg-white flex flex-col overflow-hidden">
        <div className="h-8 min-h-8 bg-gh-base border-b border-gh-line flex items-center px-3 justify-between">
          {/* label: role + program name; sublabel: generic node type */}
          <span className="text-xs text-gh-gray">{data.label}</span>
          <span className="text-[10px] text-gh-gray/70">
            {data.sublabel ?? "Engine"}
          </span>
        </div>

        <div
          id={id}
          className="relative min-h-24 min-w-48 grid grid-cols-2 text-xs text-gh-black nowheel nopan nodrag"
        >
          <div className="grid grid-rows-2 pl-2">
            <span className="flex items-center">input</span>
            <span className="flex items-center">parameters</span>
          </div>
          <div className="flex items-center justify-end pr-2 text-right">
            output
          </div>
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className="w-10 h-10 rounded-full border border-gh-line/70 bg-gradient-to-b from-white to-gh-base/60 grid place-items-center shadow-[0_2px_6px_rgba(0,0,0,0.06)]">
              <Cog6ToothIcon className="w-6 h-6 text-gh-gray animate-[spin_2.5s_linear_infinite]" />
            </div>
          </div>
        </div>

        <Handle type="source" position={Position.Right} style={{ top: 82 }} />
      </div>
    </>
  );
}

type RDKitParamValues = {
  task: "Conformer generation";
  method: "ETKDG" | "ETKDGv2" | "ETKDGv3";
  count: number;
};

type RDKitParametersNodeData = {
  label?: string;
  values?: Partial<RDKitParamValues>;
  onChange?: (next: RDKitParamValues) => void;
};
type RDKitParametersNode = Node<RDKitParametersNodeData>;

function RDKitParameters({ id, data }: NodeProps<RDKitParametersNode>) {
  const initial: RDKitParamValues = {
    task: data.values?.task ?? "Conformer generation",
    method: data.values?.method ?? "ETKDGv3",
    count: data.values?.count ?? 50,
  };
  const [local, setLocal] = useState<RDKitParamValues>(initial);
  const setValue = <K extends keyof RDKitParamValues>(
    k: K,
    v: RDKitParamValues[K]
  ) => {
    const next = { ...local, [k]: v };
    setLocal(next);
    data.onChange?.(next);
  };
  const onNumberWheel = (e: React.WheelEvent<HTMLInputElement>) =>
    (e.target as HTMLInputElement).blur();

  return (
    <>
      <Handle type="source" position={Position.Right} style={{ top: 15 }} />
      <div className="rounded-sm border border-gh-line bg-white flex flex-col overflow-hidden">
        <div className="h-8 min-h-8 bg-gh-base border-b border-gh-line px-3 flex items-center justify-between">
          <span className="text-xs text-gh-gray tracking-wide">
            {data.label}
          </span>
          <span className="text-[10px] text-gh-gray/70">Parameters</span>
        </div>
        <div
          id={id}
          className="p-2 text-[11px] text-gh-black select-none nowheel nopan nodrag"
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
        >
          <div className="grid grid-cols-2 gap-x-2 gap-y-2 min-w-48">
            <label className="flex items-center justify-between gap-2">
              <span className="text-gh-gray">Task</span>
              <select
                className="h-6 px-1 rounded border border-gh-line bg-white text-xs"
                value={local.task}
                onChange={(e) =>
                  setValue("task", e.target.value as RDKitParamValues["task"])
                }
              >
                <option value="Conformer generation">
                  Conformer generation
                </option>
              </select>
            </label>

            <label className="flex items-center justify-between gap-2">
              <span className="text-gh-gray">Method</span>
              <select
                className="h-6 px-1 rounded border border-gh-line bg-white text-xs"
                value={local.method}
                onChange={(e) =>
                  setValue(
                    "method",
                    e.target.value as RDKitParamValues["method"]
                  )
                }
              >
                <option value="ETKDG">ETKDG</option>
                <option value="ETKDGv2">ETKDGv2</option>
                <option value="ETKDGv3">ETKDGv3</option>
              </select>
            </label>

            <label className="flex items-center justify-between gap-2 col-span-2">
              <span className="text-gh-gray">Count</span>
              <input
                type="number"
                className="h-6 w-24 px-1 rounded border border-gh-line bg-white text-xs text-right"
                value={local.count}
                min={1}
                step={1}
                onWheel={onNumberWheel}
                onChange={(e) => setValue("count", Number(e.target.value))}
              />
            </label>
          </div>
        </div>
      </div>
    </>
  );
}

type FilterMode = "energy" | "count";
type EnergyRef = "min" | "first" | "median";
type EnergyUnit = "kcal/mol" | "kJ/mol";

type ConformerFilterValues = {
  mode: FilterMode;
  energyRef: EnergyRef;
  energyWindow: number;
  energyUnit: EnergyUnit;
  topN: number;
  uniqueOnly: boolean;
};

type ConformerFilterNodeData = {
  label?: string;
  values?: Partial<ConformerFilterValues>;
  onChange?: (next: ConformerFilterValues) => void;
  energyUnits?: EnergyUnit[];
  energyRefs?: EnergyRef[];
};
type ConformerFilterNode = Node<ConformerFilterNodeData>;

function ConformerFilter({ id, data }: NodeProps<ConformerFilterNode>) {
  const refOptions = data.energyRefs?.length
    ? data.energyRefs
    : (["min", "first", "median"] as const);
  const unitOptions = data.energyUnits?.length
    ? data.energyUnits
    : (["kcal/mol", "kJ/mol"] as const);

  const initial: ConformerFilterValues = {
    mode: data.values?.mode ?? "energy",
    energyRef: data.values?.energyRef ?? refOptions[0],
    energyWindow: data.values?.energyWindow ?? 3.0,
    energyUnit: data.values?.energyUnit ?? unitOptions[0],
    topN: data.values?.topN ?? 10,
    uniqueOnly: data.values?.uniqueOnly ?? true,
  };
  const [local, setLocal] = useState<ConformerFilterValues>(initial);
  const setValue = <K extends keyof ConformerFilterValues>(
    k: K,
    v: ConformerFilterValues[K]
  ) => {
    const next = { ...local, [k]: v };
    setLocal(next);
    data.onChange?.(next);
  };
  const onNumberWheel = (e: React.WheelEvent<HTMLInputElement>) =>
    (e.target as HTMLInputElement).blur();

  return (
    <>
      <Handle type="target" position={Position.Left} style={{ top: 15 }} />
      <Handle type="source" position={Position.Right} style={{ top: 15 }} />
      <div className="rounded-sm border border-gh-line bg-white min-w-32 min-h-4 flex flex-col overflow-hidden">
        <div className="h-8 min-h-8 bg-gh-base border-b border-gh-line flex items-center px-3 justify-between">
          <span className="text-xs text-gh-gray">{data.label}</span>
          <span className="text-[10px] text-gh-gray/70">Filter</span>
        </div>
        <div
          id={id}
          className="p-3 text-[11px] text-gh-black select-none nowheel nopan nodrag"
        >
          <div className="grid grid-cols-2 gap-x-3 gap-y-2 min-w-48">
            <label className="flex items-center justify-between gap-2">
              <span className="text-gh-gray">Mode</span>
              <select
                className="h-6 px-1 rounded border border-gh-line bg-white text-xs"
                value={local.mode}
                onChange={(e) => setValue("mode", e.target.value as FilterMode)}
              >
                <option value="energy">Energy window</option>
                <option value="count">Top N</option>
              </select>
            </label>

            <label className="flex items-center justify-between gap-2">
              <span className="text-gh-gray">Unique</span>
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={local.uniqueOnly}
                onChange={(e) => setValue("uniqueOnly", e.target.checked)}
              />
            </label>

            {local.mode === "energy" && (
              <>
                <label className="flex items-center justify-between gap-2">
                  <span className="text-gh-gray">Reference</span>
                  <select
                    className="h-6 px-1 rounded border border-gh-line bg-white text-xs"
                    value={local.energyRef}
                    onChange={(e) =>
                      setValue("energyRef", e.target.value as EnergyRef)
                    }
                  >
                    {refOptions.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex items-center justify-between gap-2">
                  <span className="text-gh-gray">Unit</span>
                  <select
                    className="h-6 px-1 rounded border border-gh-line bg-white text-xs"
                    value={local.energyUnit}
                    onChange={(e) =>
                      setValue("energyUnit", e.target.value as EnergyUnit)
                    }
                  >
                    {unitOptions.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex items-center justify-between gap-2 col-span-2">
                  <span className="text-gh-gray">Window</span>
                  <input
                    type="number"
                    className="h-6 w-24 px-1 rounded border border-gh-line bg-white text-xs text-right"
                    value={local.energyWindow}
                    min={0}
                    step={0.1}
                    onWheel={onNumberWheel}
                    onChange={(e) =>
                      setValue("energyWindow", Number(e.target.value))
                    }
                  />
                </label>

                <div className="col-span-2">
                  <input
                    type="range"
                    className="w-full mt-2"
                    min={0}
                    max={local.energyUnit === "kcal/mol" ? 20 : 80}
                    step={local.energyUnit === "kcal/mol" ? 0.1 : 0.5}
                    value={
                      local.energyUnit === "kcal/mol"
                        ? local.energyWindow
                        : Math.round(local.energyWindow * 4)
                    }
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      const w =
                        local.energyUnit === "kcal/mol"
                          ? v
                          : Number((v / 4).toFixed(2));
                      setValue("energyWindow", w);
                    }}
                  />
                </div>
              </>
            )}

            {local.mode === "count" && (
              <label className="flex items-center justify-between gap-2 col-span-2">
                <span className="text-gh-gray">Top N</span>
                <input
                  type="number"
                  className="h-6 w-24 px-1 rounded border border-gh-line bg-white text-xs text-right"
                  value={local.topN}
                  min={1}
                  step={1}
                  onWheel={onNumberWheel}
                  onChange={(e) => setValue("topN", Number(e.target.value))}
                />
              </label>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

const nodeTypes: NodeTypes = {
  molecule2D: Molecule2D,
  molecule3D: Molecule3D,
  engine: Engine,
  rdkitParameters: RDKitParameters,
  parameters: Parameters,
  conformerFilter: ConformerFilter,
};

// initial nodes are created inside GraphEditor to inject filename/payload

const initialEdges: Edge[] = [
  {
    id: "e_mol2d_rdkit",
    source: "mol2d",
    target: "eng_rdkit",
    targetHandle: "input",
    animated: true,
    type: "smoothstep",
  },
  {
    id: "e_param_rdkit",
    source: "param_rdkit",
    target: "eng_rdkit",
    targetHandle: "parameters",
    type: "smoothstep",
  },

  {
    id: "e_rdkit_f1",
    source: "eng_rdkit",
    target: "filt_1",
    animated: true,
    type: "smoothstep",
  },

  {
    id: "e_f1_orca",
    source: "filt_1",
    target: "eng_orca",
    targetHandle: "input",
    animated: true,
    type: "smoothstep",
  },
  {
    id: "e_param_orca",
    source: "param_orca",
    target: "eng_orca",
    targetHandle: "parameters",
    type: "smoothstep",
  },

  {
    id: "e_orca_f2",
    source: "eng_orca",
    target: "filt_2",
    animated: true,
    type: "smoothstep",
  },

  {
    id: "e_f2_gau",
    source: "filt_2",
    target: "eng_gau",
    targetHandle: "input",
    animated: true,
    type: "smoothstep",
  },
  {
    id: "e_param_gau",
    source: "param_gau",
    target: "eng_gau",
    targetHandle: "parameters",
    type: "smoothstep",
  },

  {
    id: "e_gau_select",
    source: "eng_gau",
    target: "filt_select",
    animated: true,
    type: "smoothstep",
  },
  {
    id: "e_select_mol3d",
    source: "filt_select",
    target: "mol3d",
    animated: true,
    type: "smoothstep",
  },
];

export default function GraphEditor({
  initialFilename,
  initialPayload,
}: {
  initialFilename?: string;
  initialPayload?: string;
}) {
  const initialNodes: Node[] = [
    {
      id: "mol2d",
      type: "molecule2D",
      position: { x: 40, y: 40 },
      data: { filename: initialFilename, payload: initialPayload },
      // Ensure the node has a concrete size so the inner Canvas (height:100%) renders immediately
      style: { width: 520, height: 380 },
    },

    // RDKit
    {
      id: "eng_rdkit",
      type: "engine",
      position: { x: 320, y: 40 },
      data: { label: "RDKit", sublabel: "Engine" },
    },
    {
      id: "param_rdkit",
      type: "rdkitParameters",
      position: { x: 320, y: 160 },
      data: {
        label: "RDKit · Parameters",
        values: { method: "ETKDGv3", count: 50 },
      },
    },
    {
      id: "filt_1",
      type: "conformerFilter",
      position: { x: 540, y: 40 },
      data: { label: "Conformer filtering" },
    },

    // ORCA (xTB)
    {
      id: "eng_orca",
      type: "engine",
      position: { x: 780, y: 40 },
      data: { label: "ORCA", sublabel: "Engine" },
    },
    {
      id: "param_orca",
      type: "parameters",
      position: { x: 780, y: 160 },
      data: {
        label: "ORCA · Parameters",
        values: { method: "gfn2-xtb", basis: "N/A", solvent: "gas" },
      },
    },
    {
      id: "filt_2",
      type: "conformerFilter",
      position: { x: 1000, y: 40 },
      data: { label: "Conformer filtering" },
    },

    // Gaussian (DFT)
    {
      id: "eng_gau",
      type: "engine",
      position: { x: 1240, y: 40 },
      data: { label: "Gaussian", sublabel: "Engine" },
    },
    {
      id: "param_gau",
      type: "parameters",
      position: { x: 1240, y: 160 },
      data: {
        label: "Gaussian · Parameters",
        values: { method: "b3lyp", basis: "def2-TZVP", solvent: "water" },
      },
    },

    // Final selection by filter (Top N = 1) → 3D
    {
      id: "filt_select",
      type: "conformerFilter",
      position: { x: 1480, y: 40 },
      data: { label: "Select top N", values: { mode: "count", topN: 1 } },
    },
    {
      id: "mol3d",
      type: "molecule3D",
      position: { x: 1680, y: 0 },
      data: { molecules: parseXYZ(testXyz) },
    },
  ];

  const [nodes, setNodes] = useState<Node[]>(initialNodes);
  const [edges, setEdges] = useState<Edge[]>(initialEdges);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) =>
      setNodes((prev) => applyNodeChanges(changes, prev)),
    []
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) =>
      setEdges((prev) => applyEdgeChanges(changes, prev)),
    []
  );
  const onConnect = useCallback(
    (params: Connection) =>
      setEdges((prev) => addEdge({ ...params, type: "smoothstep" }, prev)),
    []
  );

  return (
    <div className="w-full h-full rf-no-cursor">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        proOptions={{ hideAttribution: true }}
      >
        <Controls className="border border-gh-line" />
        <MiniMap className="border border-gh-line rounded-lg hidden" />
        <Background
          variant={BackgroundVariant.Dots}
          gap={30}
          size={2}
          lineWidth={1}
          bgColor="white"
          color="rgb(209, 217, 224)"
        />
      </ReactFlow>
    </div>
  );
}
