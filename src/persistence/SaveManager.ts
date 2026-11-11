import { GameState, newGameState } from '../core/GameState';
import { Effects, QualityId, RESOLUTIONS, Resolution, isQuality, qualityFromLegacy } from '../engine/Quality';
import { Lang, browserLang } from '../i18n';

const SAVE_KEY = 'yuto-makyo.save.v2';
/** Saves of the 8-bit edition, which cannot carry over. */
const OLD_SAVE_KEY = 'yuto-makyo.save.v1';
const SETTINGS_KEY = 'yuto-makyo.settings.v2';

export interface Settings {
  bgmVolume: number;
  sfxVolume: number;
  muted: boolean;
  lang: Lang;
  resolution: Resolution;
  /** Rendering quality profile. */
  quality: QualityId;
  /** Legacy (before the profiles): kept in step with `quality` for older builds reading the same settings. */
  effects: Effects;
  crt: boolean;
  /** Labyrinth corner map. */
  minimap: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  bgmVolume: 7,
  sfxVolume: 8,
  muted: false,
  lang: browserLang(),
  resolution: 'auto',
  quality: 'high',
  effects: 'high',
  crt: false,
  minimap: true,
};

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Settings from stored data of this or an earlier build: missing fields take their defaults, old choices are mapped. */
export function migrateSettings(data: Partial<Settings> | null): Settings {
  const s: Settings = { ...DEFAULT_SETTINGS, ...data };
  // the PS2 / HD / native choices of earlier builds
  if (!RESOLUTIONS.includes(s.resolution)) s.resolution = 'auto';
  // before the profiles there was EFFECTS HIGH / LOW
  if (!isQuality(data?.quality)) s.quality = data ? qualityFromLegacy(data.effects) : DEFAULT_SETTINGS.quality;
  s.effects = s.quality === 'performance' ? 'low' : 'high';
  return s;
}

export const SaveManager = {
  /** Benchmark runs: nothing is written, so the player's journey and settings stay as they are. */
  readOnly: false,

  hasSave(): boolean {
    return !!storage()?.getItem(SAVE_KEY);
  },

  /** An 8-bit edition journey is stored, and no journey of this edition yet. */
  hasOldSave(): boolean {
    return !!storage()?.getItem(OLD_SAVE_KEY) && !this.hasSave();
  },

  save(state: GameState): boolean {
    if (this.readOnly) return false;
    try {
      storage()?.setItem(SAVE_KEY, JSON.stringify(state));
      return true;
    } catch {
      return false;
    }
  },

  load(): GameState | null {
    try {
      const raw = storage()?.getItem(SAVE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw) as Partial<GameState>;
      if (data.version !== 2) return null;
      // Merge over defaults so older saves missing a field still load.
      const base = newGameState();
      return {
        ...base,
        ...data,
        items: { ...base.items, ...data.items },
        keys: { ...base.keys, ...data.keys },
        stats: { ...base.stats, ...data.stats },
        flags: { ...data.flags },
        visited: { ...data.visited },
      } as GameState;
    } catch {
      return null;
    }
  },

  clear(): void {
    if (this.readOnly) return;
    try {
      storage()?.removeItem(SAVE_KEY);
    } catch {
      /* storage unavailable */
    }
  },

  loadSettings(): Settings {
    try {
      const raw = storage()?.getItem(SETTINGS_KEY);
      return migrateSettings(raw ? (JSON.parse(raw) as Partial<Settings>) : null);
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  },

  saveSettings(s: Settings): void {
    if (this.readOnly) return;
    try {
      storage()?.setItem(SETTINGS_KEY, JSON.stringify(s));
    } catch {
      /* storage unavailable */
    }
  },
};
