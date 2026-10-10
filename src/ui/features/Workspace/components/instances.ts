import type { InstancedMesh } from "three";

/**
 * Tell three.js that an instanced mesh's instances have moved.
 *
 * `instanceMatrix.needsUpdate` is enough for what is drawn, but not for what
 * can be picked. `InstancedMesh.raycast` first tests the ray against a
 * bounding sphere that three.js computes the first time anything asks for it -
 * a raycast, or the frustum test when the mesh is drawn - and then keeps. An
 * instance that has since moved outside that sphere is never hit, however
 * squarely the pointer lands on it. So the sphere is recomputed with every
 * move.
 */
export function commitInstanceMatrices(mesh: InstancedMesh): void {
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
}
