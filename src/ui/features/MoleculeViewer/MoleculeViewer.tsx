import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { TrackballControls } from "@react-three/drei";
import { TrackballControls as ThreeTrackballControls } from "three-stdlib";
import ModeTabs from "./components/ModeTabs";
import MotionBond from "./components/MotionBond";
import MotionAtom from "./components/MotionAtom";
import MotionMeasure from "./components/MotionMeasure";
import { CalculatorIcon } from "@heroicons/react/24/solid";
import { AnimatePresence, motion } from "framer-motion";
import { v4 as uuidv4 } from "uuid";
import type { Molecule } from "../../../utils/structureParsers";
import clsx from "clsx";

function bondKey(bond: { a1: number; a2: number }) {
  const [i, j] = bond.a1 < bond.a2 ? [bond.a1, bond.a2] : [bond.a2, bond.a1];
  return `bond-${i}-${j}`;
}

function InvalidateOnChange({ deps }: { deps: any[] }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return null;
}

function LimitedTrackballControls({
  minDistance = 10,
  maxDistance = 100,
  enabled = true,
  ...props
}: {
  minDistance?: number;
  maxDistance?: number;
  enabled?: boolean;
  [key: string]: unknown;
}) {
  const controlsRef = useRef<ThreeTrackballControls | null>(null);
  const { camera } = useThree();

  useFrame(() => {
    const distance = camera.position.length();
    if (distance < minDistance) camera.position.setLength(minDistance);
    else if (distance > maxDistance) camera.position.setLength(maxDistance);
  });

  return <TrackballControls ref={controlsRef} enabled={enabled} {...props} />;
}

export default function MoleculeViewer({
  initialMolecules,
  energies,
  tabId,
  showAtomIndex,
  paused = false,
  className,
}: {
  initialMolecules: Molecule[] | Molecule[][];
  energies?: number[];
  tabId: string;
  showAtomIndex: boolean;
  paused?: boolean;
  className?: string;
}) {
  const [fileIndex, setFileIndex] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [mode, setMode] = useState<"ball" | "vdw">("ball");
  const [selectedAtoms, setSelectedAtoms] = useState<number[]>([]);
  const [measures, setMeasures] = useState<{ id: string; atoms: number[] }[]>(
    []
  );

  const isMultiFile = Array.isArray((initialMolecules as any)[0]);
  const filesCount = isMultiFile
    ? (initialMolecules as Molecule[][]).length
    : 1;

  const frames: Molecule[] = useMemo(() => {
    return isMultiFile
      ? (initialMolecules as Molecule[][])[hoveredIndex ?? fileIndex] ?? []
      : (initialMolecules as Molecule[]);
  }, [initialMolecules, isMultiFile, hoveredIndex, fileIndex]);

  useEffect(() => {
    if (currentIndex >= frames.length) setCurrentIndex(0);
  }, [frames.length, currentIndex]);

  const { atoms, bonds } = frames[currentIndex] ?? { atoms: [], bonds: [] };

  let heightValues: number[] = [];
  if (filesCount > 1) {
    if (energies && energies.length === filesCount) {
      const min = Math.min(...energies);
      const relative = energies.map((e) => e - min);
      const diffs = relative.map((e, i, arr) => (i ? e - arr[i - 1] : e));
      const total = diffs.reduce((a, b) => a + b, 0);
      heightValues = diffs.map((d) =>
        total === 0 ? 100 / diffs.length : (d / total) * 100
      );
    } else {
      heightValues = Array.from({ length: filesCount }, () => 100 / filesCount);
    }
  }

  const invalidateDeps = useMemo(
    () => [paused, mode, currentIndex, atoms, bonds, selectedAtoms, measures],
    [paused, mode, currentIndex, atoms, bonds, selectedAtoms, measures]
  );

  return (
    <div
      className={clsx(
        "w-full h-full relative min-h-0 overflow-hidden",
        className
      )}
    >
      <ModeTabs currentMode={mode} onChange={setMode} tabId={tabId} />

      {selectedAtoms.length >= 2 && selectedAtoms.length <= 4 && (
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="absolute top-4 right-30 z-10 size-8.5 backdrop-blur border-1 bg-white/50 border-gh-line rounded-full"
          >
            <button
              onClick={() => {
                setMeasures((prev) => [
                  ...prev,
                  { id: uuidv4(), atoms: selectedAtoms },
                ]);
                setSelectedAtoms([]);
              }}
              className="p-2"
            >
              <CalculatorIcon className="w-full h-full text-gh-gray" />
            </button>
          </motion.div>
        </AnimatePresence>
      )}

      <Canvas
        key={tabId}
        className="w-full h-full"
        camera={{ position: [0, 0, 50], fov: 20 }}
        frameloop={paused ? "never" : "always"}
        dpr={[1, 1.75]}
        gl={{ powerPreference: "high-performance" }}
        onCreated={({ gl, invalidate }) => {
          const canvas = gl.domElement as HTMLCanvasElement;
          const onLost = (e: Event) => {
            e.preventDefault();
          };
          const onRestored = () => invalidate();
          canvas.addEventListener("webglcontextlost", onLost as any, false);
          canvas.addEventListener(
            "webglcontextrestored",
            onRestored as any,
            false
          );
        }}
      >
        {paused && <InvalidateOnChange deps={invalidateDeps} />}

        <ambientLight intensity={0.9} />
        <directionalLight position={[5, 5, 5]} />
        <LimitedTrackballControls
          enabled={!paused}
          minDistance={5}
          maxDistance={80}
          rotateSpeed={3.0}
          dynamicDampingFactor={0.1}
          zoomSpeed={0.1}
          panSpeed={0.05}
        />

        {atoms.map((atom, idx) => (
          <group key={`atom-${idx}`}>
            <MotionAtom
              atom={atom}
              mode={mode}
              label={showAtomIndex ? String(idx + 1) : undefined}
              selected={selectedAtoms.includes(idx)}
              onClick={() => {
                setSelectedAtoms((prev) =>
                  prev.includes(idx)
                    ? prev.filter((i) => i !== idx)
                    : prev.length === 4
                    ? [idx]
                    : [...prev, idx]
                );
              }}
            />
          </group>
        ))}

        {mode === "ball" &&
          bonds.map((bond) => {
            const a1 = atoms[bond.a1];
            const a2 = atoms[bond.a2];
            return <MotionBond key={bondKey(bond)} start={a1} end={a2} />;
          })}

        {measures.map(({ id, atoms: indices }) => (
          <MotionMeasure
            key={id}
            atoms={indices.map((j) => atoms[j])}
            onDoubleClick={() => {
              setMeasures((prev) => prev.filter((m) => m.id !== id));
            }}
          />
        ))}
      </Canvas>

      {frames.length > 1 && (
        <div className="absolute bottom-4 left-0 right-0 z-10 flex justify-center space-x-3 pl-10">
          <div className="relative w-2/3">
            <input
              type="range"
              min={0}
              max={frames.length - 1}
              value={currentIndex}
              onChange={(e) => setCurrentIndex(parseInt(e.target.value))}
              className="w-full h-2 backdrop-blur border-1 bg-white/50 border-gh-line rounded-full appearance-none cursor-pointer"
            />
          </div>
          <div className="text-xs px-3 py-1 rounded-full backdrop-blur border-1 bg-white/50 border-gh-line min-w-14 text-gh-gray text-center">
            {currentIndex + 1}/{frames.length}
          </div>
        </div>
      )}

      {filesCount > 1 && (
        <div className="absolute top-0 bottom-0 left-4 flex items-center">
          <div className="relative h-3/5 w-4 flex flex-col items-center">
            <div
              className="absolute w-2 bg-white/50 backdrop-blur rounded-full border-gh-line border-1 h-[110%]"
              style={{ transform: "translateY(-5%)" }}
            />
            {(initialMolecules as Molecule[][]).map((_, i, arr) => {
              const reverseIndex = arr.length - 1 - i;
              return (
                <div
                  key={reverseIndex}
                  className={
                    "w-20 relative group flex justify-center " +
                    (energies ? "items-start" : "items-center")
                  }
                  style={{ height: `${heightValues[reverseIndex]}%` }}
                  onMouseEnter={() => setHoveredIndex(reverseIndex)}
                  onMouseLeave={() => setHoveredIndex(null)}
                  onClick={() => {
                    setFileIndex(reverseIndex);
                    setCurrentIndex(0);
                  }}
                >
                  <div
                    className={`absolute rounded-full border-gh-line border-1 ${
                      reverseIndex === fileIndex
                        ? "bg-accel-base w-4 h-4 z-20"
                        : "bg-accel-lightbase w-2 h-2 group-hover:scale-200 ease-in-out duration-300 "
                    }`}
                  />
                  <div
                    className={`absolute left-14 px-4 py-2 text-sm bg-gh-base border-1 border-gh-line rounded-full opacity-0 group-hover:opacity-100 transition duration-300 pointer-events-none whitespace-nowrap ${
                      energies && "-top-3"
                    }`}
                  >
                    {energies && energies[reverseIndex] != null && (
                      <>
                        {": "}
                        <span className="font-bold">
                          {energies[reverseIndex].toFixed(2)} kcal/mol
                        </span>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
