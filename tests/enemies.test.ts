import { describe, expect, it } from 'vitest';
import { ENEMY_ATTACK, ENEMY_CLIPS, ENEMY_REACT } from '../src/actors/Enemies';

describe('enemy clips', () => {
  it('match the attack and reaction timing used by combat', () => {
    for (const [kind, clips] of Object.entries(ENEMY_CLIPS)) {
      expect(Math.round(clips.attack.duration * 60), kind).toBe(ENEMY_ATTACK[kind as keyof typeof ENEMY_ATTACK].len);
      for (const [a, len] of Object.entries(ENEMY_REACT)) expect(Math.round(clips[a as keyof typeof clips].duration * 60), `${kind} ${a}`).toBe(len);
    }
  });
});
