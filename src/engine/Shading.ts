import * as THREE from 'three';

type Shader = THREE.WebGLProgramParametersWithUniforms;

/**
 * Adds shader code to a built-in material, on top of any code already added to it
 * (a see-through cut, a sway): each addition gets its own share of the program cache key.
 */
export function patch<T extends THREE.Material>(m: T, key: string, fn: (sh: Shader) => void): T {
  const before = m.onBeforeCompile;
  const patched = (m.userData.patches as string[] | undefined) ?? [];
  // the key as it stands describes what was added before (by default, the source of that function);
  // taken now, because afterwards the default would describe only the wrapper below
  const base = m.customProgramCacheKey();
  m.onBeforeCompile = (sh, r) => {
    before.call(m, sh, r);
    fn(sh);
  };
  m.customProgramCacheKey = () => base + '|' + key;
  m.userData.patches = [...patched, key];
  m.needsUpdate = true;
  return m;
}

const NOISE = /* glsl */ `
  float dHash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  float dNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(dHash(i), dHash(i + vec2(1.0, 0.0)), f.x), mix(dHash(i + vec2(0.0, 1.0)), dHash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  // two octaves over the surface, whichever way it faces
  float dField(vec3 p, float s) {
    vec2 a = p.xz * s + p.y * s * vec2(0.61, 0.37);
    return 0.65 * dNoise(a) + 0.35 * dNoise(a * 2.7 + 11.0);
  }`;

/** The light that parts a body from the dark behind it: colour (linear, with its strength) and falloff. */
export const RIM = {
  uRimColor: { value: new THREE.Color(0.2, 0.28, 0.5) },
  uRimPower: { value: 2.6 },
};

/**
 * Rim light on a body: a cool edge where the surface turns away from the eye, strongest
 * on faces turned up toward the sky, so figures read against cave walls and night woods.
 */
export function rimLight<T extends THREE.Material>(m: T): T {
  return patch(m, 'rim', (sh) => {
    Object.assign(sh.uniforms, RIM);
    sh.fragmentShader = 'uniform vec3 uRimColor; uniform float uRimPower;\n' + sh.fragmentShader.replace(
      '#include <opaque_fragment>',
      `{
        float rimF = pow(1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0), uRimPower);
        vec3 rimN = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
        outgoingLight += uRimColor * rimF * (0.3 + 0.7 * clamp(rimN.y * 0.5 + 0.5, 0.0, 1.0));
      }
      #include <opaque_fragment>`,
    );
  });
}

/** Rim light on every lit material under `root` that has none yet (enemies, villagers). */
export function rimBody(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
    if (m?.isMeshStandardMaterial && !(m.userData.patches as string[] | undefined)?.includes('rim')) rimLight(m);
  });
}

export interface Detail {
  /** Strength of the large-scale light and dark patches that hide a texture's repeat (0..1). */
  macro?: number;
  /** Moss on faces turned up and along the foot of walls (0..1). */
  moss?: number;
  /** Wet patches: darker and glossy (0..1). */
  wet?: number;
  /** Metres per patch, roughly. */
  size?: number;
}

/**
 * Breaks up a tiled PBR surface: patches of lighter and darker tone over metres, moss
 * where it would grow, and wet, glossy patches. Runs on world position, so it lines up
 * across meshes; a few arithmetic noise lookups, no extra textures.
 */
export function surfaceDetail<T extends THREE.MeshStandardMaterial>(m: T, d: Detail): T {
  const u = {
    uDetail: { value: new THREE.Vector4(d.macro ?? 0.5, d.moss ?? 0, d.wet ?? 0, 1 / (d.size ?? 6)) },
  };
  return patch(m, `detail:${d.moss ? 'm' : ''}${d.wet ? 'w' : ''}`, (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = 'varying vec3 vDetailPos;\n' + sh.vertexShader.replace(
      '#include <project_vertex>',
      `#include <project_vertex>
      vec4 detailP = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        detailP = instanceMatrix * detailP;
      #endif
      vDetailPos = (modelMatrix * detailP).xyz;`,
    );
    sh.fragmentShader = 'uniform vec4 uDetail; varying vec3 vDetailPos;\n' + NOISE + '\n' + sh.fragmentShader.replace(
      '#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>
      {
        float dm = dField(vDetailPos, uDetail.w);
        float df = dField(vDetailPos + 37.0, uDetail.w * 4.3);
        diffuseColor.rgb *= 1.0 + (dm - 0.5) * 0.9 * uDetail.x + (df - 0.5) * 0.3 * uDetail.x;
        ${d.moss ? `
        vec3 dN = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
        float foot = 1.0 - smoothstep(0.0, 1.4, vDetailPos.y);
        float moss = uDetail.y * smoothstep(0.42, 0.7, clamp(dN.y, 0.0, 1.0) * 0.55 + foot * 0.35 + df * 0.5 + dm * 0.25 - 0.2);
        float dl = dot(diffuseColor.rgb, vec3(0.3, 0.5, 0.2));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.26, 0.42, 0.13) * (0.35 + dl * 1.6), moss);
        roughnessFactor = mix(roughnessFactor, 0.96, moss);` : ''}
        ${d.wet ? `
        float wet = uDetail.z * smoothstep(0.5, 0.72, dField(vDetailPos + 91.0, uDetail.w * 1.9));
        diffuseColor.rgb *= 1.0 - 0.42 * wet;
        roughnessFactor = mix(roughnessFactor, 0.14, wet);` : ''}
      }`,
    );
  });
}
