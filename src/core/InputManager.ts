import { CursorKind, makeCursors } from '../ui/Cursors';

export type Action =
  | 'up' | 'down' | 'left' | 'right'
  | 'attack' | 'strong' | 'guard' | 'dodge' | 'item' | 'act' | 'lock' | 'map'
  | 'start' | 'select' | 'confirm' | 'cancel'
  | 'item1' | 'item2' | 'item3';

export type Device = 'kb' | 'pad';

/**
 * Keyboard code -> actions. Menu confirm / cancel share keys with gameplay actions.
 * J K L I serve keyboard-only play; Shift, R, M and 1-3 are the left-hand keys
 * for playing with the mouse in the right hand.
 */
const KEYMAP: Record<string, Action[]> = {
  ArrowUp: ['up'], KeyW: ['up'],
  ArrowDown: ['down'], KeyS: ['down'],
  ArrowLeft: ['left'], KeyA: ['left'],
  ArrowRight: ['right'], KeyD: ['right'],
  KeyJ: ['attack', 'confirm'],
  KeyK: ['strong', 'cancel'],
  KeyL: ['guard'], ShiftLeft: ['guard'], ShiftRight: ['guard'],
  Space: ['dodge', 'confirm'],
  KeyE: ['act', 'confirm'],
  KeyI: ['item'], KeyR: ['item'],
  Digit1: ['item1'], Digit2: ['item2'], Digit3: ['item3'],
  KeyQ: ['lock'],
  Tab: ['map'],
  Enter: ['start', 'confirm'], NumpadEnter: ['start', 'confirm'],
  Escape: ['start', 'cancel'],
  Backspace: ['cancel'],
  KeyM: ['select'],
};

/** Keys and pad buttons that spell the test cheat (arrow keys only, not WASD). */
const TAP_KEYS: Record<string, string> = { ArrowUp: 'U', ArrowDown: 'D', ArrowLeft: 'L', ArrowRight: 'R', KeyB: 'B', KeyA: 'A' };
const TAP_PAD: Record<number, string> = { 12: 'U', 13: 'D', 14: 'L', 15: 'R', 1: 'B', 0: 'A' };

/** W3C "standard" gamepad buttons -> actions. */
const PADMAP: Action[][] = [
  ['act', 'confirm'], // 0 A / cross
  ['dodge', 'cancel'], // 1 B / circle
  ['attack'], // 2 X / square
  ['strong'], // 3 Y / triangle
  ['item'], // 4 LB
  ['guard'], // 5 RB
  ['lock'], // 6 LT
  ['guard'], // 7 RT
  ['map'], // 8 back / select
  ['start'], // 9 start
  ['select'], // 10 L3
  ['lock'], // 11 R3
  ['up'], ['down'], ['left'], ['right'], // 12-15 d-pad
];

/** On-screen names of each action's key, per device (used by i18n placeholders). */
export const KEY_LABELS: Record<Device, Record<string, string>> = {
  kb: {
    ATTACK: 'J', STRONG: 'K', GUARD: 'SHIFT / L', DODGE: 'SPACE', ITEM: 'R / I', ACT: 'E', LOCK: 'Q', MAP: 'TAB',
    START: 'ENTER', SELECT: 'M', CONFIRM: 'ENTER', CANCEL: 'ESC', MOVE: 'WASD',
  },
  pad: {
    ATTACK: 'X', STRONG: 'Y', GUARD: 'RB', DODGE: 'B', ITEM: 'LB', ACT: 'A', LOCK: 'LT', MAP: 'BACK',
    START: 'START', SELECT: 'L3', CONFIRM: 'A', CANCEL: 'B', MOVE: 'L-STICK',
  },
};

const DEADZONE = 0.25;
/** Camera turn per pixel of captured mouse movement, and per tick of full right stick (radians). */
const MOUSE_YAW = 0.0032;
const MOUSE_PITCH = 0.0024;
const STICK_YAW = 0.05;
const STICK_PITCH = 0.035;
/** Largest mouse jump accepted in one event (some systems report spikes). */
const MAX_DELTA = 150;

export interface Vec2 {
  x: number;
  y: number;
}

/**
 * Keyboard, gamepad and mouse, sampled once per fixed logic tick so a tap that
 * starts and ends between two ticks is still seen exactly once.
 */
export class InputManager {
  private keyDown = new Set<Action>();
  private keyLatch = new Set<Action>();
  private padDown = new Set<Action>();
  private down = new Set<Action>();
  private pressedNow = new Set<Action>();
  private holdFrames = new Map<Action, number>();
  private stick: Vec2 = { x: 0, y: 0 };
  private rstick: Vec2 = { x: 0, y: 0 };
  device: Device = 'kb';
  /** Mouse in logical safe-area units (see UI); `null` until the pointer moves over the game. */
  mouse: Vec2 | null = null;
  mouseHeld = false;
  private mouseLatch = { left: false, right: false, mid: false, moved: false, wheel: 0, dx: 0, dy: 0 };
  /** Buttons pressed during the last tick. */
  mouseLeft = false;
  mouseRight = false;
  mouseMid = false;
  /** The pointer moved during the last tick (menus follow it only then). */
  mouseMoved = false;
  /** Wheel notches of the last tick: -1 up, 1 down, 0 none. */
  wheel = 0;
  /** Mouse movement of the last tick while captured, in CSS pixels. */
  lookX = 0;
  lookY = 0;
  /** Set by the scene on every tick it wants the mouse captured (3D play); see syncLock. */
  wantLock = false;
  private lockWanted = false;
  private releasing = false;
  private lostLatch = false;
  /** The player pressed Esc to free the captured mouse during the last tick. */
  lockLost = false;
  /** Mouse cursor for this tick; scenes set it while updating (reset to normal every tick). */
  cursor: CursorKind = 'normal';
  private shownCursor: CursorKind | null = null;
  private readonly cursors = makeCursors();
  /** Cheat letters typed during the last tick (see TAP_KEYS). */
  taps: string[] = [];
  private tapLatch: string[] = [];
  private padTapPrev = new Set<number>();
  /** Maps client coordinates to logical screen pixels. */
  toLogical: ((cx: number, cy: number) => Vec2 | null) | null = null;
  /** Fired on the first real user gesture (needed to unlock AudioContext). */
  onFirstGesture: (() => void) | null = null;
  onFullscreenKey: (() => void) | null = null;

  constructor(private readonly surface: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyF' && !e.repeat) {
        this.onFullscreenKey?.();
        return;
      }
      if (TAP_KEYS[e.code] && !e.repeat) this.tapLatch.push(TAP_KEYS[e.code]);
      const acts = KEYMAP[e.code];
      if (!acts) return;
      e.preventDefault();
      this.gesture();
      this.device = 'kb';
      for (const a of acts) {
        if (!this.keyDown.has(a)) this.keyLatch.add(a);
        this.keyDown.add(a);
      }
    });
    window.addEventListener('keyup', (e) => {
      const acts = KEYMAP[e.code];
      if (acts) for (const a of acts) this.keyDown.delete(a);
    });
    window.addEventListener('blur', () => this.keyDown.clear());
    surface.addEventListener('pointermove', (e) => {
      if (this.locked) {
        const clamp = (v: number) => Math.max(-MAX_DELTA, Math.min(MAX_DELTA, v));
        this.mouseLatch.dx += clamp(e.movementX);
        this.mouseLatch.dy += clamp(e.movementY);
        return;
      }
      this.mouse = this.toLogical?.(e.clientX, e.clientY) ?? null;
      this.mouseLatch.moved = true;
    });
    surface.addEventListener('pointerdown', (e) => {
      this.gesture();
      this.device = 'kb';
      if (this.lockWanted && !this.locked) {
        // this click only captures the mouse (pointer lock needs a user gesture)
        this.capture();
        return;
      }
      if (!this.locked) this.mouse = this.toLogical?.(e.clientX, e.clientY) ?? null;
      if (e.button === 0) {
        this.mouseLatch.left = true;
        this.mouseHeld = true;
      } else if (e.button === 1) {
        e.preventDefault();
        this.mouseLatch.mid = true;
      } else if (e.button === 2) this.mouseLatch.right = true;
    });
    window.addEventListener('pointerup', (e) => {
      if (e.button === 0) this.mouseHeld = false;
    });
    surface.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        if (e.deltaY) this.mouseLatch.wheel += Math.sign(e.deltaY);
      },
      { passive: false },
    );
    surface.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      if (this.locked) return;
      this.mouseHeld = false;
      if (this.releasing) this.releasing = false;
      else if (this.lockWanted) this.lostLatch = true;
    });
  }

  /** The mouse is captured by the game (3D camera control). */
  get locked(): boolean {
    return document.pointerLockElement === this.surface;
  }

  private capture(): void {
    try {
      // Chrome refuses for about a second after Esc; Safari returns no promise
      const p = this.surface.requestPointerLock() as unknown as Promise<void> | undefined;
      p?.catch?.(() => undefined);
    } catch {
      /* pointer lock unavailable */
    }
  }

  /** End of a logic tick: let go of the mouse if no scene asked to keep it, and show the tick's cursor. */
  syncLock(): void {
    this.lockWanted = this.wantLock;
    this.wantLock = false;
    if (!this.lockWanted && this.locked) {
      this.releasing = true;
      document.exitPointerLock();
    }
    if (this.cursor !== this.shownCursor) {
      this.shownCursor = this.cursor;
      // the image-set form is dropped by browsers that do not take it, leaving the plain one
      for (const c of this.cursors[this.cursor]) this.surface.style.cursor = c;
    }
  }

  private gesture(): void {
    if (this.onFirstGesture) {
      const f = this.onFirstGesture;
      this.onFirstGesture = null;
      f();
    }
  }

  /** Called once at the start of every logic tick. */
  poll(): void {
    this.pollPad();
    const now = new Set<Action>([...this.keyDown, ...this.keyLatch, ...this.padDown]);
    this.pressedNow.clear();
    for (const a of now) if (!this.down.has(a) || this.keyLatch.has(a)) this.pressedNow.add(a);
    this.keyLatch.clear();
    this.down = new Set([...this.keyDown, ...this.padDown]);
    for (const a of now) this.holdFrames.set(a, (this.holdFrames.get(a) ?? 0) + 1);
    for (const a of [...this.holdFrames.keys()]) if (!now.has(a)) this.holdFrames.delete(a);
    const ml = this.mouseLatch;
    this.mouseLeft = ml.left;
    this.mouseRight = ml.right;
    this.mouseMid = ml.mid;
    this.mouseMoved = ml.moved;
    this.wheel = Math.sign(ml.wheel);
    this.lookX = ml.dx;
    this.lookY = ml.dy;
    ml.left = ml.right = ml.mid = ml.moved = false;
    ml.wheel = ml.dx = ml.dy = 0;
    this.lockLost = this.lostLatch;
    this.lostLatch = false;
    this.taps = this.tapLatch;
    this.tapLatch = [];
    this.cursor = 'normal';
  }

  private pollPad(): void {
    this.padDown.clear();
    this.stick = { x: 0, y: 0 };
    this.rstick = { x: 0, y: 0 };
    const pads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p || !p.connected) continue;
      let active = false;
      p.buttons.forEach((b, i) => {
        if (b.pressed && PADMAP[i]) {
          for (const a of PADMAP[i]) this.padDown.add(a);
          active = true;
        }
        if (TAP_PAD[i]) {
          if (b.pressed && !this.padTapPrev.has(i)) this.tapLatch.push(TAP_PAD[i]);
          if (b.pressed) this.padTapPrev.add(i);
          else this.padTapPrev.delete(i);
        }
      });
      const ax = (i: number) => (Math.abs(p.axes[i] ?? 0) > DEADZONE ? p.axes[i] : 0);
      this.stick = { x: ax(0), y: ax(1) };
      this.rstick = { x: ax(2), y: ax(3) };
      if (this.stick.x || this.stick.y || this.rstick.x || this.rstick.y) active = true;
      // the stick also drives the digital directions (menus)
      if (this.stick.y < -0.5) this.padDown.add('up');
      if (this.stick.y > 0.5) this.padDown.add('down');
      if (this.stick.x < -0.5) this.padDown.add('left');
      if (this.stick.x > 0.5) this.padDown.add('right');
      if (active) {
        this.gesture();
        this.device = 'pad';
      }
      break;
    }
  }

  pressed(a: Action): boolean {
    return this.pressedNow.has(a);
  }

  held(a: Action): boolean {
    return this.down.has(a);
  }

  /** True on press and then every `rate` frames after `delay` frames of holding. */
  repeat(a: Action, delay = 18, rate = 5): boolean {
    if (this.pressedNow.has(a)) return true;
    const f = this.holdFrames.get(a) ?? 0;
    return f > delay && (f - delay) % rate === 0;
  }

  /** Movement vector, length <= 1: analog stick, or the digital directions. y is down. */
  move(): Vec2 {
    if (this.stick.x || this.stick.y) {
      const l = Math.hypot(this.stick.x, this.stick.y);
      return l > 1 ? { x: this.stick.x / l, y: this.stick.y / l } : { ...this.stick };
    }
    const x = (this.keyDown.has('right') ? 1 : 0) - (this.keyDown.has('left') ? 1 : 0);
    const y = (this.keyDown.has('down') ? 1 : 0) - (this.keyDown.has('up') ? 1 : 0);
    const l = Math.hypot(x, y) || 1;
    return { x: x / l, y: y / l };
  }

  /** Camera stick (gamepad only). */
  look(): Vec2 {
    return { ...this.rstick };
  }

  /** This tick's camera turn [yaw, pitch] in radians, from the captured mouse and the right stick. */
  camLook(): [number, number] {
    return [this.lookX * MOUSE_YAW + this.rstick.x * STICK_YAW, this.lookY * MOUSE_PITCH + this.rstick.y * STICK_PITCH];
  }

  /** The item key (1-3) pressed this tick, as an index, or -1. */
  slot(): number {
    return this.pressed('item1') ? 0 : this.pressed('item2') ? 1 : this.pressed('item3') ? 2 : -1;
  }

  clear(): void {
    this.keyDown.clear();
    this.keyLatch.clear();
    this.down.clear();
    this.pressedNow.clear();
    this.holdFrames.clear();
  }
}
