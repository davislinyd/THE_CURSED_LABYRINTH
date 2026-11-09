import type { Game } from '../core/Game';
import { Scene } from '../core/SceneManager';
import { BACK_STAND, HERO_PAL } from '../data/sprites/hero';
import { C } from '../graphics/Palette';
import { PixelRenderer } from '../graphics/PixelRenderer';
import { MessageBox } from '../ui/Window';
import { t } from '../i18n';

const STORY = [
  'THE MASK OF MEIOU SPLIT IN TWO. A WIND FROM NOWHERE BLEW THROUGH THE TEMPLE, AND THE DEAD LAY DOWN.',
  'ONE BY ONE, THE SHRINE LAMPS OF HAIYA FLICKERED BACK TO LIFE. THE LABYRINTHS WERE ONLY ROADS AGAIN.',
  'KAGEMARU RETURNED THE THREE SEALS TO THE MOUNTAIN SHRINE, AND WALKED ON INTO THE DAWN.',
];

export function formatTime(frames: number): string {
  const sec = Math.floor(frames / 60);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** A rank for the clear: fewer deaths and continues, more treasure. */
export function clearRank(st: { deaths: number; continuesUsed: number; chests: number; secrets: number }): string {
  const score = st.chests * 2 + st.secrets * 3 - st.deaths * 2 - st.continuesUsed * 4;
  return score >= 40 ? 'S' : score >= 28 ? 'A' : score >= 16 ? 'B' : 'C';
}

export class EndingScene implements Scene {
  private phase: 'story' | 'stats' = 'story';
  private page = 0;
  private frame = 0;
  private msg = new MessageBox(28, 3);

  constructor(private readonly game: Game) {
    this.msg.set(t(STORY[0]));
  }

  enter(): void {
    this.game.music('ENDING');
  }

  update(): void {
    this.frame++;
    const g = this.game, inp = g.input;
    if (this.phase === 'story') {
      if (this.msg.update(inp.held('a') || inp.held('b'))) g.sfx('text');
      if ((inp.pressed('a') || inp.pressed('b') || inp.pressed('start')) && !this.msg.advance()) {
        this.page++;
        if (this.page < STORY.length) this.msg.set(t(STORY[this.page]));
        else {
          this.phase = 'stats';
          this.frame = 0;
        }
      }
      return;
    }
    if (this.frame > 90 && inp.pressed('start')) {
      g.sfx('confirm');
      g.toTitle();
    }
  }

  draw(r: PixelRenderer): void {
    r.clear(C.BLACK);
    if (this.phase === 'story') {
      // dawn over the ridge
      const glow = [0x01, 0x02, 0x12, 0x22, 0x27, 0x37];
      glow.forEach((c, i) => r.rect(0, 40 + i * 18, 256, 18, c));
      for (let x = 0; x < 256; x++) r.vline(x, 140 + Math.round(Math.sin(x * 0.04) * 6), 160, C.BLACK);
      r.sprite(BACK_STAND, 128 - 31, 168 - BACK_STAND.h + 4, HERO_PAL);
      r.rect(0, 160, 256, 80, C.BLACK);
      this.msg.draw(r, 0, 176, 256, this.frame);
      return;
    }
    const st = this.game.state.stats;
    r.textCenter(t('THE LAMPS BURN AGAIN'), 32, C.GOLD);
    const rows: [string, string][] = [
      ['TIME', formatTime(st.frames)],
      ['DEMONS SLAIN', String(st.kills)],
      ['FALLEN', String(st.deaths)],
      ['CONTINUES', String(st.continuesUsed)],
      ['CHESTS OPENED', String(st.chests)],
      ['SECRETS FOUND', String(st.secrets)],
      ['STEPS IN THE MAZE', String(st.steps)],
    ];
    rows.forEach(([k, v], i) => {
      if (this.frame < 10 + i * 10) return;
      r.text(t(k), 32, 60 + i * 14, C.LGRAY);
      r.textRight(v, 224, 60 + i * 14, C.WHITE);
    });
    if (this.frame > 90) {
      r.text(t('RANK'), 32, 168, C.LGRAY);
      r.text(clearRank(st), 216, 168, C.ORANGE);
      r.textCenter(t('THE END'), 196, C.WHITE);
      if ((this.frame >> 4) & 1) r.textCenter(t('PRESS {START}'), 216, C.GRAY);
    }
  }
}
