import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';

/** public/assets/manifest.json, written by scripts/assets/build.mjs. */
export interface Source {
  title: string;
  author: string;
  url: string;
  license: string;
  /** Absent for the project's own work. */
  licenseFile?: string;
}

/** One instrument sample: file, MIDI note, velocity layer (0..1], round robin. */
export interface Sample {
  f: string;
  n: number;
  v: number;
  r: number;
}

export interface AssetEntry {
  kind: 'texture' | 'model' | 'hdri' | 'instrument' | 'percussion' | 'sfx' | 'font';
  source: string;
  origin: string;
  author?: string;
  files: string[];
  samples?: Sample[];
  tris?: number;
}

export interface Manifest {
  sources: Record<string, Source>;
  assets: Record<string, AssetEntry>;
}

export interface TextureSet {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  armMap: THREE.Texture;
}

const BASE = import.meta.env.BASE_URL + 'assets/';

/** Loads and caches the files listed in the manifest. */
export class Assets {
  manifest: Manifest = { sources: {}, assets: {} };
  private readonly tex = new THREE.TextureLoader();
  private readonly gltf = new GLTFLoader();
  private readonly cache = new Map<string, Promise<unknown>>();
  /** Tiled copies of textures, shared by every material that asks for the same repeat (owned here, never disposed by a scene). */
  private readonly tiled = new Map<string, THREE.Texture>();
  /** Texture filtering for grazing views (set from the renderer's maximum). */
  anisotropy = 4;

  async init(): Promise<void> {
    const res = await fetch(BASE + 'manifest.json');
    if (!res.ok) throw new Error(`asset manifest: HTTP ${res.status}`);
    this.manifest = await res.json();
  }

  url(file: string): string {
    return BASE + file;
  }

  entry(key: string): AssetEntry {
    const e = this.manifest.assets[key];
    if (!e) throw new Error(`unknown asset ${key}`);
    return e;
  }

  private once<T>(key: string, load: () => Promise<T>): Promise<T> {
    let p = this.cache.get(key) as Promise<T> | undefined;
    if (!p) this.cache.set(key, (p = load()));
    return p;
  }

  /** Raw bytes (not cached: decodeAudioData takes ownership of the buffer). */
  async bytes(file: string): Promise<ArrayBuffer> {
    const res = await fetch(this.url(file));
    if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
    return res.arrayBuffer();
  }

  /** PBR set of a Poly Haven texture, wrapped for tiling. */
  textures(id: string): Promise<TextureSet> {
    return this.once(`tex:${id}`, async () => {
      const [diff, nor, arm] = this.entry(`tex/${id}`).files;
      const load = async (f: string, srgb: boolean) => {
        const t = await this.tex.loadAsync(this.url(f));
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.anisotropy = this.anisotropy;
        if (srgb) t.colorSpace = THREE.SRGBColorSpace;
        return t;
      };
      const [map, normalMap, armMap] = await Promise.all([load(diff, true), load(nor, false), load(arm, false)]);
      return { map, normalMap, armMap };
    });
  }

  /** A standard material from a texture set; `repeat` tiles all maps. The material is the caller's own; its textures are shared. */
  async material(id: string, repeat = 1, params: THREE.MeshStandardMaterialParameters = {}): Promise<THREE.MeshStandardMaterial> {
    const set = await this.textures(id);
    // one tiled copy per texture and repeat for the whole session: a scene entered again makes no new ones
    const tile = (t: THREE.Texture, slot: string) => {
      if (repeat === 1) return t;
      const key = `${id}:${slot}:${repeat}`;
      let c = this.tiled.get(key);
      if (!c) {
        c = t.clone();
        c.repeat.set(repeat, repeat);
        this.tiled.set(key, c);
      }
      return c;
    };
    const arm = tile(set.armMap, 'arm');
    return new THREE.MeshStandardMaterial({
      map: tile(set.map, 'map'),
      normalMap: tile(set.normalMap, 'nor'),
      aoMap: arm,
      roughnessMap: arm,
      metalnessMap: arm,
      ...params,
    });
  }

  /** A fresh copy of a model's scene (geometry and materials are shared). */
  async model(id: string): Promise<THREE.Group> {
    const gltf = await this.once(`model:${id}`, () => this.gltf.loadAsync(this.url(this.entry(`model/${id}`).files[0])));
    return gltf.scene.clone(true);
  }

  /** After a lost WebGL context: prefiltered environments are render targets, their contents gone. */
  forgetEnvironments(): void {
    for (const k of [...this.cache.keys()]) if (k.startsWith('env:')) this.cache.delete(k);
  }

  /** Prefiltered environment map from an HDRI, for reflections. */
  environment(id: string, renderer: THREE.WebGLRenderer): Promise<THREE.Texture> {
    return this.once(`env:${id}`, async () => {
      const hdr = await new HDRLoader().loadAsync(this.url(this.entry(`hdri/${id}`).files[0]));
      hdr.mapping = THREE.EquirectangularReflectionMapping;
      const pmrem = new THREE.PMREMGenerator(renderer);
      const env = pmrem.fromEquirectangular(hdr).texture;
      hdr.dispose();
      pmrem.dispose();
      return env;
    });
  }
}
