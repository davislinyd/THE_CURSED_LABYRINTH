export type Difficulty = 'easy' | 'normal' | 'hard';

export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'normal', 'hard'];

/** Menu name and one-line summary of each. */
export const DIFFICULTY_INFO: Record<Difficulty, { name: string; desc: string }> = {
  easy: { name: 'EASY', desc: 'HALF DAMAGE TAKEN · WEAKER FOES · SLOWER FATIGUE' },
  normal: { name: 'NORMAL', desc: 'THE CHALLENGE AS INTENDED' },
  hard: { name: 'HARD', desc: 'MORE DAMAGE TAKEN · TOUGHER FOES · FASTER FATIGUE' },
};

interface Rules {
  /** Share of a blow's damage the hero takes. */
  damage: number;
  /** Share of their hit points that foes and guardians have. */
  hp: number;
  /** How fast moving tires the hero. */
  tire: number;
}

export const RULES: Record<Difficulty, Rules> = {
  easy: { damage: 0.5, hp: 0.7, tire: 0.7 },
  normal: { damage: 1, hp: 1, tire: 1 },
  hard: { damage: 1.5, hp: 1.3, tire: 1.4 },
};

/** Life the hero loses to a blow (or trap) of `n` on Normal: at least 1. */
export const harm = (d: Difficulty, n: number) => Math.max(1, Math.round(n * RULES[d].damage));

/** Hit points of a foe or guardian that has `n` on Normal: at least 1. */
export const toughness = (d: Difficulty, n: number) => Math.max(1, Math.round(n * RULES[d].hp));
