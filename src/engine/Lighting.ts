import * as THREE from 'three';
import type { QualityProfile } from './Quality';

/** Lantern lights a scene makes: the most any profile lights at once. Fewer are shown on lower profiles. */
export const MAX_LANTERNS = 8;

/** Size, reach and softness of the moon's shadow for a profile (a changed map size frees the old map). */
export function moonShadow(moon: THREE.DirectionalLight, q: QualityProfile): void {
  const sh = moon.shadow;
  if (sh.mapSize.x !== q.moonShadow) {
    sh.mapSize.setScalar(q.moonShadow);
    sh.map?.dispose();
    sh.map = null;
  }
  const c = sh.camera;
  c.left = c.bottom = -q.moonRange;
  c.right = c.top = q.moonRange;
  c.updateProjectionMatrix();
  sh.radius = q.shadowRadius;
}

/**
 * The shadow of a point light (the lamp behind the hero): a cube map, six scene passes a
 * frame, so only the profiles that can afford it cast one.
 */
export function pointShadow(light: THREE.PointLight, q: QualityProfile): void {
  const on = q.pointShadow > 0;
  const sh = light.shadow;
  if (!on || sh.mapSize.x !== q.pointShadow) {
    sh.map?.dispose();
    sh.map = null;
  }
  light.castShadow = on;
  if (!on) return;
  sh.mapSize.setScalar(q.pointShadow);
  sh.camera.near = 0.3;
  sh.radius = q.shadowRadius + 0.5;
  sh.bias = -0.003;
}

/** Show the first `q.lights` of a lantern pool (hidden lights cost no shader work). */
export function lanternCount(pool: readonly THREE.PointLight[], q: QualityProfile): void {
  pool.forEach((l, i) => (l.visible = i < q.lights));
}
