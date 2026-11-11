import { Game, bootOptions } from './core/Game';

const game = new Game(
  document.getElementById('display') as HTMLCanvasElement,
  document.getElementById('ui') as HTMLCanvasElement,
  document.getElementById('screen')!,
);

document.getElementById('btn-full')?.addEventListener('click', (e) => {
  game.toggleFullscreen();
  (e.currentTarget as HTMLElement).blur();
});

void game.start(bootOptions(location.search));

// development builds only: a handle for automated play-testing
if (import.meta.env.DEV) (window as unknown as { __game: Game }).__game = game;
