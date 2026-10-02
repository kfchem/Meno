import * as THREE from "three";

/**
 * The point of the page - the plane z = 0 - under a point of the screen,
 * given in normalised device coordinates: where the line of sight through
 * it meets the page, for an orthographic camera and a perspective one alike.
 */
export function pageAt(ndcX: number, ndcY: number, camera: THREE.Camera): THREE.Vector3 {
  const near = new THREE.Vector3(ndcX, ndcY, -1).unproject(camera);
  const far = new THREE.Vector3(ndcX, ndcY, 1).unproject(camera);
  return near.lerp(far, near.z / (near.z - far.z));
}
