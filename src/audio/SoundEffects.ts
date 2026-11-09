import { ChiptuneSynth } from './ChiptuneSynth';

export type SfxName =
  | 'cursor' | 'confirm' | 'cancel' | 'step' | 'bump' | 'slash' | 'hit' | 'enemyHurt'
  | 'playerHurt' | 'enemyDie' | 'door' | 'doorHit' | 'doorBreak' | 'pickup' | 'unlock'
  | 'encounter' | 'mechanism' | 'bossAppear' | 'bossDie' | 'jump' | 'coin' | 'heal'
  | 'throw' | 'pause' | 'text' | 'warp' | 'trap' | 'clang' | 'fall' | 'levelUp' | 'locked'
  | 'turn' | 'explode' | 'shoot';

const F = 1 / 60;
const TAG = 'sfx';

type Play = (s: ChiptuneSynth, out: AudioNode, t: number) => void;

const P = 0.14; // pulse scale
const T = 0.3; // triangle scale
const N = 0.16; // noise scale

function pulse(s: ChiptuneSynth, o: AudioNode, t: number, freq: number, frames: number, vol: number, duty = 2, sweepTo?: number, decay = 0) {
  s.tone('pulse', { time: t, dur: frames * F, freq, vol, duty, sweepTo, decay }, o, P, TAG);
}
function tri(s: ChiptuneSynth, o: AudioNode, t: number, freq: number, frames: number, sweepTo?: number) {
  s.tone('tri', { time: t, dur: frames * F, freq, vol: 15, sweepTo }, o, T, TAG);
}
function noise(s: ChiptuneSynth, o: AudioNode, t: number, period: number, frames: number, vol: number, decay = 0, periodStep = 0, short = false) {
  s.noise({ time: t, dur: frames * F, period, vol, decay, periodStep, short }, o, N, TAG);
}
function arp(s: ChiptuneSynth, o: AudioNode, t: number, freqs: number[], frames: number, vol: number, duty = 1) {
  freqs.forEach((f, i) => pulse(s, o, t + i * frames * F, f, frames, vol, duty));
}

export const SFX: Record<SfxName, Play> = {
  cursor: (s, o, t) => pulse(s, o, t, 1320, 3, 7, 1),
  confirm: (s, o, t) => {
    pulse(s, o, t, 880, 3, 9, 2);
    pulse(s, o, t + 3 * F, 1760, 6, 9, 2, undefined, 1);
  },
  cancel: (s, o, t) => pulse(s, o, t, 700, 6, 8, 2, 350),
  step: (s, o, t) => noise(s, o, t, 11, 3, 5, 1),
  turn: (s, o, t) => noise(s, o, t, 8, 2, 3),
  bump: (s, o, t) => {
    tri(s, o, t, 120, 6, 60);
    noise(s, o, t, 12, 4, 9, 1);
  },
  slash: (s, o, t) => {
    noise(s, o, t, 2, 9, 11, 1, 0.8);
    pulse(s, o, t, 1800, 5, 4, 0, 700);
  },
  hit: (s, o, t) => {
    noise(s, o, t, 3, 6, 13, 1);
    pulse(s, o, t, 320, 4, 9, 2, 160);
  },
  clang: (s, o, t) => {
    pulse(s, o, t, 2600, 2, 8, 0);
    noise(s, o, t, 3, 5, 9, 1, 0, true);
  },
  enemyHurt: (s, o, t) => pulse(s, o, t, 1000, 6, 10, 1, 300),
  playerHurt: (s, o, t) => {
    pulse(s, o, t, 600, 12, 12, 2, 120);
    noise(s, o, t, 5, 8, 9, 1);
  },
  enemyDie: (s, o, t) => {
    noise(s, o, t, 4, 16, 12, 2, 0.6);
    pulse(s, o, t, 400, 8, 6, 3, 1200);
  },
  explode: (s, o, t) => noise(s, o, t, 6, 20, 14, 2, 0.45),
  door: (s, o, t) => {
    noise(s, o, t, 13, 30, 10, 3);
    tri(s, o, t, 70, 24, 50);
  },
  doorHit: (s, o, t) => {
    noise(s, o, t, 9, 6, 14, 1);
    tri(s, o, t, 140, 6, 60);
  },
  doorBreak: (s, o, t) => {
    noise(s, o, t, 5, 30, 15, 3, 0.35);
    tri(s, o, t, 110, 20, 40);
  },
  pickup: (s, o, t) => arp(s, o, t, [1047, 1319, 1568, 2093], 3, 9),
  coin: (s, o, t) => {
    pulse(s, o, t, 1976, 3, 9, 1);
    pulse(s, o, t + 3 * F, 2637, 12, 9, 1, undefined, 1);
  },
  heal: (s, o, t) => arp(s, o, t, [523, 659, 784, 1047, 1319], 4, 8, 2),
  unlock: (s, o, t) => {
    noise(s, o, t, 3, 3, 10, 0, 0, true);
    pulse(s, o, t + 3 * F, 1500, 3, 9, 1);
    pulse(s, o, t + 6 * F, 2000, 8, 9, 1, undefined, 1);
  },
  locked: (s, o, t) => {
    pulse(s, o, t, 196, 6, 10, 2);
    pulse(s, o, t + 8 * F, 185, 10, 10, 2);
  },
  encounter: (s, o, t) => {
    for (let i = 0; i < 12; i++) pulse(s, o, t + i * 2 * F, i & 1 ? 620 : 1240, 2, 10, 1);
    noise(s, o, t, 2, 30, 10, 3, 0.4);
    tri(s, o, t + 24 * F, 220, 20, 55);
  },
  mechanism: (s, o, t) => {
    for (let i = 0; i < 4; i++) noise(s, o, t + i * 5 * F, 8, 3, 11, 0, 0, true);
    tri(s, o, t, 65, 24);
  },
  bossAppear: (s, o, t) => {
    tri(s, o, t, 220, 70, 45);
    noise(s, o, t, 14, 70, 11, 6);
    pulse(s, o, t + 20 * F, 110, 50, 8, 3, 55, 4);
  },
  bossDie: (s, o, t) => {
    for (let i = 0; i < 6; i++) noise(s, o, t + i * 12 * F, 5 + (i % 3), 18, 15, 2, 0.4);
    pulse(s, o, t, 880, 72, 10, 2, 55, 6);
    tri(s, o, t + 40 * F, 160, 50, 40);
  },
  jump: (s, o, t) => pulse(s, o, t, 280, 8, 7, 1, 700),
  throw: (s, o, t) => {
    noise(s, o, t, 2, 3, 8);
    pulse(s, o, t, 1100, 5, 6, 0, 1800);
  },
  shoot: (s, o, t) => pulse(s, o, t, 900, 7, 7, 3, 200),
  pause: (s, o, t) => {
    pulse(s, o, t, 1319, 4, 9, 1);
    pulse(s, o, t + 6 * F, 988, 4, 9, 1);
    pulse(s, o, t + 12 * F, 1319, 8, 9, 1, undefined, 1);
  },
  text: (s, o, t) => pulse(s, o, t, 1600, 1, 4, 1),
  warp: (s, o, t) => {
    for (let i = 0; i < 4; i++) pulse(s, o, t + i * 9 * F, 300, 9, 8, 1, 1400);
  },
  trap: (s, o, t) => {
    noise(s, o, t, 1, 8, 13, 1);
    pulse(s, o, t, 2200, 6, 8, 0, 900);
  },
  fall: (s, o, t) => pulse(s, o, t, 1200, 36, 9, 1, 90),
  levelUp: (s, o, t) => arp(s, o, t, [587, 740, 880, 1175, 880, 1175, 1480], 4, 9, 2),
};
