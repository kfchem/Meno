import * as THREE from "three";
import FacingText from "./FacingText";
import { Atom } from "../../../../utils/structureParsers";

export default function MotionMeasure({
  atoms,
  onDoubleClick,
}: {
  atoms: Atom[];
  onDoubleClick?: () => void;
}) {
  if (atoms.length < 2 || atoms.length > 4) return null;

  const vec = (a: Atom, b: Atom) =>
    new THREE.Vector3(b.x - a.x, b.y - a.y, b.z - a.z);

  const pos = (a: Atom) => new THREE.Vector3(a.x, a.y, a.z);

  const color = "yellow";

  let label = "";
  let labelPos = new THREE.Vector3();
  let measureMesh: React.ReactNode = null;

  if (atoms.length === 2) {
    const a1 = pos(atoms[0]);
    const a2 = pos(atoms[1]);
    label = `${a1.distanceTo(a2).toFixed(2)} Å`;
    labelPos = a1.clone().add(a2).multiplyScalar(0.5);

    const dir = new THREE.Vector3().subVectors(a2, a1);
    const len = dir.length();
    const mid = a1.clone().add(a2).multiplyScalar(0.5);
    const q = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      dir.clone().normalize()
    );

    measureMesh = (
      <mesh position={mid} quaternion={q}>
        <cylinderGeometry args={[0.05, 0.05, len, 8]} />
        <meshStandardMaterial color={color} transparent opacity={0.8} />
      </mesh>
    );
  }

  if (atoms.length === 3) {
    const [a, b, c] = atoms;
    const pa = pos(a);
    const pb = pos(b);
    const pc = pos(c);
    const v1 = vec(b, a).normalize();
    const v2 = vec(b, c).normalize();
    const angleRad = v1.angleTo(v2);
    const angleDeg = THREE.MathUtils.radToDeg(angleRad);
    label = `${angleDeg.toFixed(1)}°`;
    labelPos = pa
      .clone()
      .add(pb)
      .add(pc)
      .multiplyScalar(1 / 3);

    const arcGeom = new THREE.RingGeometry(0, 1.0, 64, 1, 0, angleRad);

    const normal = new THREE.Vector3().crossVectors(v1, v2).normalize();
    const basisZ = new THREE.Vector3(0, 0, 1);
    const rotationAxis = new THREE.Vector3()
      .crossVectors(basisZ, normal)
      .normalize();
    const rotationAngle = Math.acos(basisZ.dot(normal));
    const alignQuat = new THREE.Quaternion().setFromAxisAngle(
      rotationAxis,
      rotationAngle
    );

    const forward = new THREE.Vector3(1, 0, 0).applyQuaternion(alignQuat);
    const startQuat = new THREE.Quaternion().setFromUnitVectors(forward, v1);
    const finalQuat = alignQuat.premultiply(startQuat);

    measureMesh = (
      <mesh
        geometry={arcGeom}
        quaternion={finalQuat}
        position={[pb.x, pb.y, pb.z]}
      >
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.8}
          side={THREE.DoubleSide}
        />
      </mesh>
    );
  }

  if (atoms.length === 4) {
    const [a, b, c, d] = atoms;
    const pa = pos(a),
      pb = pos(b),
      pc = pos(c),
      pd = pos(d);

    const p1 = pa
      .clone()
      .multiplyScalar(2 / 3)
      .add(pb.clone().multiplyScalar(1 / 3));
    const p2 = pd
      .clone()
      .multiplyScalar(2 / 3)
      .add(pc.clone().multiplyScalar(1 / 3));

    const mid = p1.clone().add(p2).multiplyScalar(0.5);
    const topVec = p2.clone().sub(p1);
    const baseVec = pc.clone().sub(pb);
    const normal = new THREE.Vector3()
      .crossVectors(topVec, baseVec)
      .normalize();

    const b1 = pb.clone().sub(pa);
    const b2 = pc.clone().sub(pb);
    const b3 = pd.clone().sub(pc);
    const n1 = new THREE.Vector3().crossVectors(b1, b2).normalize();
    const n2 = new THREE.Vector3().crossVectors(b2, b3).normalize();
    const angleRad = Math.atan2(b2.length() * b1.dot(n2), n1.dot(n2));
    const bulgeFactor = Math.sin(Math.abs(angleRad) / 2);

    const check = new THREE.Vector3().subVectors(mid, pb).dot(normal);
    if (check < 0) normal.negate();

    const scale = p1.distanceTo(p2) * 0.2 * bulgeFactor;
    const control = mid.clone().add(normal.multiplyScalar(scale));

    const curve = new THREE.CatmullRomCurve3([p1, control, p2]);
    const segments = 64;
    const topPoints = curve.getPoints(segments);

    const vertices: number[] = [];
    for (let i = 0; i < segments; i++) {
      const t1 = topPoints[i];
      const t2 = topPoints[i + 1];
      const b1 = pb.clone().lerp(pc, i / segments);
      const b2 = pb.clone().lerp(pc, (i + 1) / segments);

      vertices.push(
        t1.x,
        t1.y,
        t1.z,
        t2.x,
        t2.y,
        t2.z,
        b2.x,
        b2.y,
        b2.z,

        b2.x,
        b2.y,
        b2.z,
        b1.x,
        b1.y,
        b1.z,
        t1.x,
        t1.y,
        t1.z
      );
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(vertices), 3)
    );
    geom.computeVertexNormals();

    measureMesh = (
      <mesh geometry={geom}>
        <meshStandardMaterial
          color={color}
          transparent
          opacity={0.6}
          side={THREE.DoubleSide}
        />
      </mesh>
    );

    const angle = THREE.MathUtils.radToDeg(angleRad);
    label = `${angle.toFixed(1)}°`;
    labelPos = pa.clone().add(pb).add(pc).add(pd).multiplyScalar(0.25);
  }

  return (
    <group onDoubleClick={onDoubleClick}>
      {measureMesh}
      <FacingText
        position={[labelPos.x, labelPos.y, labelPos.z]}
        text={label}
      />
    </group>
  );
}
