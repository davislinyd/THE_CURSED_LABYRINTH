import { GameState, newGameState } from '../core/GameState';
import { Effects, RESOLUTIONS, Resolution } from '../engine/Renderer';
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

export const SaveManager = {
  hasSave(): boolean {
    return !!storage()?.getItem(SAVE_KEY);
  },

  /** An 8-bit edition journey is stored, and no journey of this edition yet. */
  hasOldSave(): boolean {
    return !!storage()?.getItem(OLD_SAVE_KEY) && !this.hasSave();
  },

  save(state: GameState): boolean {
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
    try {
      storage()?.removeItem(SAVE_KEY);
    } catch {
      /* storage unavailable */
    }
  },

  loadSettings(): Settings {
    try {
      const raw = storage()?.getItem(SETTINGS_KEY);
      const s: Settings = raw ? { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) } : { ...DEFAULT_SETTINGS };
      // the PS2 / HD / native choices of earlier builds
      if (!RESOLUTIONS.includes(s.resolution)) s.resolution = 'auto';
      return s;
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  },

  saveSettings(s: Settings): void {
    try {
      storage()?.setItem(SETTINGS_KEY, JSON.stringify(s));
    } catch {
      /* storage unavailable */
    }
  },
};
