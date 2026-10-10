import { ArrowUturnLeftIcon } from "@heroicons/react/24/outline";
import { setCursor } from "../../theme/cursors";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import clsx from "clsx";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import {
  KEY_LIGHT_FROM,
  preset3dById,
  STYLE_3D_FIELDS,
  STYLE_3D_PRESETS,
  style3dOf,
  with3dSetting,
  type Style3D,
  type Style3DChoice,
  type Style3DField,
} from "../../../lib/chem/style3d";
import type { Turn3D } from "../Workspace/store/types";
import Molecule3DView from "../Workspace/components/Molecule3DView";
import { lookOf, solidOf } from "../Workspace/utils/molecule3d";
import { SAMPLE_3D } from "./sample3d";

/**
 * How molecules in 3D look and turn: a preset and what was changed from it,
 * as the drawing style is chosen (./StyleEditor), with a molecule beside it
 * drawn in the look - one that can be turned, to try how turning feels.
 */
export default function Style3DEditor({
  choice,
  onChange,
  children,
}: {
  choice: Style3DChoice;
  onChange: (next: Style3DChoice) => void;
  /** More settings, laid out with these: who makes molecules in 3D, say. */
  children?: ReactNode;
}) {
  const style = useMemo(() => style3dOf(choice), [choice]);
  const changed = Object.keys(choice.changes).length;
  const groups = [...new Set(STYLE_3D_FIELDS.map((f) => f.group))];
  return (
    <div className="flex gap-8 items-start">
      <div className="min-w-0 flex-1">
        <Presets choice={choice} onChange={onChange} />
        {changed > 0 && (
          <div className="mt-4 flex justify-end">
            <button
              onClick={() => onChange({ preset: choice.preset, changes: {} })}
              className="h-8 px-3 rounded-md border border-gh-line bg-white text-xs text-gh-black hover:bg-gh-base whitespace-nowrap"
              title={`Take all ${changed} changes back to ${preset3dById(choice.preset).name}`}
            >
              Reset all ({changed})
            </button>
          </div>
        )}
        {groups.map((group) => (
          <section key={group} className="mt-6">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gh-gray">{group}</h3>
            <div className="mt-2 rounded-lg border border-gh-line divide-y divide-gh-line bg-white">
              {STYLE_3D_FIELDS.filter((f) => f.group === group).map((f) => (
                <Row key={f.key} field={f} choice={choice} style={style} onChange={onChange} />
              ))}
            </div>
          </section>
        ))}
        {children}
      </div>
      <div className="w-[26rem] shrink-0 sticky top-4">
        <div className="text-xs font-semibold uppercase tracking-wider text-gh-gray">Preview</div>
        <div className="mt-2 h-80 rounded-lg border border-gh-line bg-white overflow-hidden" aria-label="A molecule drawn in this look">
          <Preview style={style} />
        </div>
        <p className="mt-1.5 text-[11px] text-gh-gray">Drag the molecule to turn it.</p>
      </div>
    </div>
  );
}

// --- Presets -------------------------------------------------------------------

function Presets({ choice, onChange }: { choice: Style3DChoice; onChange: (next: Style3DChoice) => void }) {
  // Picking another preset with changes made asks what to do with them.
  const [asking, setAsking] = useState<string | null>(null);
  const changes = Object.keys(choice.changes).length;
  const pick = (id: string) => {
    if (id === choice.preset) return;
    if (changes > 0) setAsking(id);
    else onChange({ preset: id, changes: {} });
  };
  return (
    <div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-2">
        {STYLE_3D_PRESETS.map((p) => {
          const on = p.id === choice.preset;
          return (
            <button
              key={p.id}
              onClick={() => pick(p.id)}
              aria-pressed={on}
              className={clsx(
                "text-left rounded-lg border px-3 py-2 transition-colors",
                on ? "border-accel-base bg-accel-lightbase/40 ring-1 ring-accel-base" : "border-gh-line bg-white hover:bg-gh-base",
              )}
            >
              <div className="text-sm font-medium text-gh-black">{p.name}</div>
              <div className="text-[11px] leading-snug text-gh-gray line-clamp-2">{p.description}</div>
            </button>
          );
        })}
      </div>
      {asking && (
        <div role="alertdialog" className="mt-2 rounded-lg border border-gh-line bg-gh-base px-3 py-2 text-sm flex flex-wrap items-center gap-2">
          <span className="flex-1 min-w-[12rem] text-gh-black">
            {changes === 1 ? "One setting is" : `${changes} settings are`} changed from {preset3dById(choice.preset).name}. Keep{" "}
            {changes === 1 ? "it" : "them"} on {preset3dById(asking).name}?
          </span>
          <button
            onClick={() => {
              onChange({ preset: asking, changes: choice.changes });
              setAsking(null);
            }}
            className="h-7 px-2.5 rounded-md border border-gh-line bg-white text-xs hover:bg-gray-100"
          >
            Keep changes
          </button>
          <button
            onClick={() => {
              onChange({ preset: asking, changes: {} });
              setAsking(null);
            }}
            className="h-7 px-2.5 rounded-md bg-accel-base text-white text-xs hover:opacity-90"
          >
            Use {preset3dById(asking).name} as it is
          </button>
          <button onClick={() => setAsking(null)} className="h-7 px-2 rounded-md text-xs text-gh-gray hover:text-gh-black">
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

// --- One setting ---------------------------------------------------------------

function Row({
  field,
  choice,
  style,
  onChange,
}: {
  field: Style3DField;
  choice: Style3DChoice;
  style: Style3D;
  onChange: (next: Style3DChoice) => void;
}) {
  const key = field.key;
  const changed = key in choice.changes;
  const preset = preset3dById(choice.preset);
  const set = (value: Style3D[typeof key]) => onChange(with3dSetting(choice, key, value));
  return (
    <div className={clsx("px-3 py-2.5 relative", changed && "bg-accel-lightbase/15")}>
      {changed && <span aria-hidden className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-accel-base" />}
      <div className="flex gap-3 items-start">
        <div className="min-w-0 flex-1">
          <div className="text-sm text-gh-black">{field.label}</div>
          <p className="text-xs leading-snug text-gh-gray mt-0.5">{field.description}</p>
        </div>
        <div className="shrink-0 flex items-center gap-1.5 pt-0.5">
          <Control field={field} value={style[key]} onSet={set as (v: unknown) => void} />
          <button
            onClick={() => set(preset.style[key] as never)}
            disabled={!changed}
            aria-label={`Reset ${field.label}`}
            title={changed ? `Back to ${preset.name}'s value` : "Not changed"}
            className="h-6 w-6 rounded-md flex items-center justify-center text-gh-gray hover:bg-gh-base hover:text-gh-black disabled:opacity-0"
          >
            <ArrowUturnLeftIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function Control({ field, value, onSet }: { field: Style3DField; value: unknown; onSet: (v: unknown) => void }) {
  if (field.kind === "choice") {
    return (
      <div className="flex rounded-md border border-gh-line overflow-hidden" role="radiogroup" aria-label={field.label}>
        {field.options.map((o) => (
          <button
            key={o.value}
            role="radio"
            aria-checked={value === o.value}
            onClick={() => onSet(o.value)}
            className={clsx(
              "h-7 px-2.5 text-xs border-l border-gh-line first:border-l-0",
              value === o.value ? "bg-accel-base text-white" : "bg-white text-gh-black hover:bg-gh-base",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    );
  }
  if (field.kind === "colour") {
    const hex = String(value);
    return (
      <label className="flex items-center gap-1.5">
        <input
          type="color"
          value={hex}
          aria-label={field.label}
          onChange={(e) => onSet(e.target.value.toLowerCase())}
          className="h-7 w-9 rounded border border-gh-line bg-white p-0.5"
        />
        <span className="text-xs text-gh-gray tabular-nums w-16">{hex}</span>
      </label>
    );
  }
  const v = value as number;
  const shown = (v * (field.scale ?? 1)).toFixed(field.digits ?? 2);
  return (
    <div className="flex items-center gap-2">
      {field.ends && <span className="text-[11px] text-gh-gray w-20 text-right">{field.ends[0]}</span>}
      <input
        type="range"
        min={field.min}
        max={field.max}
        step={field.step}
        value={v}
        aria-label={field.label}
        onChange={(e) => onSet(Number(e.target.value))}
        className="w-36 accent-accel-base"
      />
      {field.ends ? (
        <span className="text-[11px] text-gh-gray w-20">{field.ends[1]}</span>
      ) : (
        <span className="text-xs text-gh-black tabular-nums w-14">
          {shown}
          {field.unit === "%" || field.unit === "°" ? field.unit : ` ${field.unit ?? ""}`}
        </span>
      )}
    </div>
  );
}

// --- Preview -------------------------------------------------------------------

/** A turn left to itself stops below this speed, in radians a second. */
const STILL = 0.02;
/** How the sample is first seen: tipped back a little and turned, so its ring is not seen edge on. */
const FIRST_TURN = (() => {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.5, 0.35, 0.1));
  return [q.x, q.y, q.z, q.w] as Turn3D;
})();

/** The preview's field of view, in degrees, and how gently its camera goes to another look's distance, in seconds. */
const FOV = 30;
const FRAMING_TAU = 0.12;

function Preview({ style }: { style: Style3D }) {
  const far = useMemo(() => solidOf(SAMPLE_3D, style).reach.space * 8, [style]);
  return (
    <Canvas frameloop="demand" dpr={[1, 2]} camera={{ position: [0, 0, far / 2], fov: FOV, near: 0.1, far }}>
      <ambientLight intensity={style.ambientLight} />
      <directionalLight position={KEY_LIGHT_FROM as [number, number, number]} intensity={style.keyLight} />
      <Framing style={style} />
      <Turnable style={style} />
    </Canvas>
  );
}

/**
 * The camera, as far off as the sample needs in its look to fit however it
 * is turned - going there, not jumping, when the look changes.
 */
function Framing({ style }: { style: Style3D }) {
  const { camera, invalidate } = useThree();
  const solid = useMemo(() => solidOf(SAMPLE_3D, style), [style]);
  const look = lookOf(SAMPLE_3D, style);
  const placed = useRef(false);
  useEffect(() => invalidate(), [look, invalidate]);
  useFrame((_, dt) => {
    // (it stands as high as it reaches; seen from that far again, and as much once more to fit)
    const reach = solid.reach[look];
    const to = reach + (reach * 1.15) / Math.tan(((FOV / 2) * Math.PI) / 180);
    const z = camera.position.z;
    const next = placed.current ? to + (z - to) * Math.exp(-Math.min(dt, 1 / 30) / FRAMING_TAU) : to;
    placed.current = true;
    camera.position.set(0, 0, Math.abs(next - to) < 1e-3 ? to : next);
    camera.lookAt(0, 0, reach);
    if (camera.position.z !== to) invalidate();
  });
  return null;
}

/** The sample, turned by a drag as a molecule on the canvas is - at the speed, and with the coasting, the style sets. */
function Turnable({ style }: { style: Style3D }) {
  const [turn, setTurn] = useState<Turn3D>(FIRST_TURN);
  const { gl, invalidate } = useThree();
  const spin = useRef<{ axis: THREE.Vector3; speed: number } | null>(null);
  const styleRef = useRef(style);
  styleRef.current = style;
  const turnBy = (axis: THREE.Vector3, angle: number) =>
    setTurn((was) => {
      const q = new THREE.Quaternion(...was).premultiply(new THREE.Quaternion().setFromAxisAngle(axis, angle)).normalize();
      return [q.x, q.y, q.z, q.w];
    });

  useEffect(() => {
    const dom = gl.domElement;
    let drag: { x: number; y: number; t: number; recent: { t: number; angle: number; dt: number }[]; axis: THREE.Vector3 } | null = null;
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      dom.setPointerCapture(e.pointerId);
      spin.current = null;
      drag = { x: e.clientX, y: e.clientY, t: e.timeStamp, recent: [], axis: new THREE.Vector3(0, 1, 0) };
      setCursor(dom, "turning");
    };
    const onMove = (e: PointerEvent) => {
      if (!drag) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      const len = Math.hypot(dx, dy);
      if (!len) return;
      const angle = (styleRef.current.turnPerHalfWidth * len) / Math.max(dom.clientWidth / 2, 1);
      // (a drag to the right turns the near side right; down turns it down)
      const axis = new THREE.Vector3(dy, dx, 0).normalize();
      turnBy(axis, angle);
      drag.recent = [...drag.recent, { t: e.timeStamp, angle, dt: e.timeStamp - drag.t }].filter((r) => e.timeStamp - r.t <= 64);
      drag = { ...drag, x: e.clientX, y: e.clientY, t: e.timeStamp, axis };
      invalidate();
    };
    const onUp = (e: PointerEvent) => {
      if (!drag) return;
      const took = drag.recent.reduce((a, r) => a + r.dt, 0);
      const speed = drag.recent.reduce((a, r) => a + r.angle, 0) / (Math.max(took, 16) / 1000);
      if (e.timeStamp - drag.t < 80 && speed > STILL) spin.current = { axis: drag.axis, speed };
      drag = null;
      setCursor(dom, "turn");
      invalidate();
    };
    setCursor(dom, "turn");
    dom.addEventListener("pointerdown", onDown);
    dom.addEventListener("pointermove", onMove);
    dom.addEventListener("pointerup", onUp);
    dom.addEventListener("pointercancel", onUp);
    return () => {
      dom.removeEventListener("pointerdown", onDown);
      dom.removeEventListener("pointermove", onMove);
      dom.removeEventListener("pointerup", onUp);
      dom.removeEventListener("pointercancel", onUp);
    };
  }, [gl, invalidate]);

  // let go while turning, it turns on, slowing as the style says
  useFrame((_, dt) => {
    const s = spin.current;
    if (!s) return;
    turnBy(s.axis, s.speed * dt);
    s.speed *= Math.pow(1 - styleRef.current.turnDamping, dt * 60);
    if (s.speed < STILL) spin.current = null;
    invalidate();
  });

  return (
    <Molecule3DView
      m={SAMPLE_3D}
      style={style}
      look={lookOf(SAMPLE_3D, style)}
      frame={0}
      turn={turn}
      lit={0}
      selected={false}
      chosen={NONE}
      chosenBonds={NONE}
      holding={null}
      following={false}
      framesOpen={false}
      onFrame={() => {}}
      hoveredMeasure={null}
      // (a sample, with no R and S on it)
      stereoShown={null}
      stereoFont={NO_STEREO_FONT}
    />
  );
}

const NO_STEREO_FONT = { size: 0, units: "px" as const, family: "", parentheses: false, gap: 0 };
const NONE: number[] = [];
