import type { Game } from '../core/Game';
import { Scene } from '../core/SceneManager';
import { t } from '../i18n';
import { COL, UI } from '../ui/UI';

/** Boot screen: reads the asset manifest and decodes the sound banks. */
export class LoadingScene implements Scene {
  private progress = 0;
  private error = '';

  constructor(private readonly game: Game) {}

  enter(): void {
    void this.load();
  }

  private async load(): Promise<void> {
    const g = this.game;
    try {
      await g.assets.init();
      await g.audio.load(g.assets, (done, total) => (this.progress = done / total));
      g.booted();
    } catch (e) {
      this.error = String(e instanceof Error ? e.message : e);
      console.error(e);
    }
  }

  update(): void {}

  drawUI(ui: UI): void {
    ui.fill(ui.left, 0, ui.right - ui.left, 448, '#000');
    if (this.error) {
      ui.text(t('LOADING FAILED'), 320, 210, { size: 20, weight: 700, align: 'center', color: COL.red });
      ui.text(this.error.slice(0, 80), 320, 240, { size: 12, align: 'center', color: COL.gray });
      return;
    }
    const flicker = 0.75 + 0.25 * Math.sin(ui.frame * 0.15);
    ui.text(t('NOW LOADING'), 320, 214, { size: 16, weight: 700, align: 'center', color: COL.goldLight, spacing: 4, alpha: flicker });
    ui.gauge(220, 232, 200, 4, this.progress, COL.red, COL.goldLight);
  }
}
