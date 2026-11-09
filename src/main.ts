import { Game } from './core/Game';

const canvas = document.getElementById('display') as HTMLCanvasElement;
const screen = document.getElementById('screen')!;
const game = new Game(canvas, screen);

const pad = document.getElementById('pad');
if (pad) game.input.bindTouchPad(pad);

document.getElementById('btn-pad')?.addEventListener('click', (e) => {
  game.settings.touchPad = !game.settings.touchPad;
  game.applySettings();
  (e.currentTarget as HTMLElement).blur();
});
document.getElementById('btn-full')?.addEventListener('click', (e) => {
  game.toggleFullscreen();
  (e.currentTarget as HTMLElement).blur();
});

game.start();
