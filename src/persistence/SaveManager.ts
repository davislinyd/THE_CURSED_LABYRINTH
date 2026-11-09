import { GameState, newGameState } from '../core/GameState';
import { Lang, browserLang } from '../i18n';

const SAVE_KEY = 'yuto-makyo.save.v1';
const SETTINGS_KEY = 'yuto-makyo.settings.v1';

export interface Settings {
  bgmVolume: number;
  sfxVolume: number;
  muted: boolean;
  scanlines: 0 | 1 | 2;
  flicker: boolean;
  aspect: 0 | 1; // 0 square, 1 = 8:7 NTSC
  touchPad: boolean;
  lang: Lang;
}

export const DEFAULT_SETTINGS: Settings = {
  bgmVolume: 7,
  sfxVolume: 8,
  muted: false,
  scanlines: 1,
  flicker: true,
  aspect: 0,
  touchPad: false,
  lang: browserLang(),
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
      if (data.version !== 1) return null;
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
      return raw ? { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) } : { ...DEFAULT_SETTINGS };
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
