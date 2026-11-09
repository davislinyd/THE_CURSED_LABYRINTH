import * as THREE from 'three';
import { DIFFICULTIES, DIFFICULTY_INFO } from '../core/Difficulty';
import type { Game } from '../core/Game';
import { Scene } from '../core/SceneManager';
import { View } from '../engine/Renderer';
import { cloudTexture, glowTexture, noiseTexture, rng } from '../engine/ProcTex';
import { t } from '../i18n';
import { SaveManager } from '../persistence/SaveManager';
import { ControlsScreen } from '../ui/Controls';
import { OptionsMenu } from '../ui/Options';
import { COL, MenuOpts, UI, menuMouse } from '../ui/UI';
import { YesNo } from '../ui/YesNo';

const MENU = ['NEW GAME', 'CONTINUE', 'OPTIONS', 'CONTROLS'];
const MENU_AT = { x: 320, y: 296 };
/** The difficulty choice for a new journey. */
const PICK_AT = { x: 320, y: 284 };
const PICK: MenuOpts = { align: 'center', width: 160, pitch: 28, size: 17 };

interface Flame {
  light: THREE.PointLight;
  glow: THREE.Sprite;
  phase: number;
}

/** Title: a moonlit shrine road with stone lanterns, drifting clouds and embers. */
export class TitleScene implements Scene {
  readonly view: View;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(46, 640 / 448, 0.1, 900);
  private readonly clouds: THREE.Sprite[] = [];
  private readonly flames: Flame[] = [];
  private embers!: THREE.Points;
  private emberVel: Float32Array = new Float32Array(0);
  private readonly disposables: { dispose(): void }[] = [];
  private frame = 0;
  private menu = false;
  private cursor = 0;
  private confirmNew: YesNo | null = null;
  /** Index into DIFFICULTIES while choosing one for a new journey. */
  private pick: number | null = null;
  private readonly hasSave = SaveManager.hasSave();
  private readonly oldSave = SaveManager.hasOldSave();
  readonly moving: readonly THREE.Object3D[];

  constructor(private readonly game: Game) {
    this.view = { scene: this.scene, camera: this.camera };
    this.moving = [this.camera];
    this.cursor = this.hasSave ? 1 : 0;
    this.build();
  }

  private own<T extends { dispose(): void }>(x: T): T {
    this.disposables.push(x);
    return x;
  }

  private build(): void {
    const s = this.scene;
    s.background = new THREE.Color(0x05060d);
    s.fog = new THREE.FogExp2(0x0a0c18, 0.018);

    // sky dome with a horizon glow, and stars
    const sky = new THREE.Mesh(
      this.own(new THREE.SphereGeometry(500, 32, 16)),
      this.own(
        new THREE.ShaderMaterial({
          side: THREE.BackSide,
          depthWrite: false,
          fog: false,
          uniforms: { top: { value: new THREE.Color(0x020309) }, horizon: { value: new THREE.Color(0x1d2140) } },
          vertexShader: 'varying float h; void main(){ h = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
          fragmentShader: 'uniform vec3 top, horizon; varying float h; void main(){ gl_FragColor = vec4(mix(horizon, top, smoothstep(-0.05, 0.45, h)), 1.0); }',
        }),
      ),
    );
    s.add(sky);
    const r = rng(7);
    const starPos: number[] = [];
    for (let i = 0; i < 900; i++) {
      const a = r() * Math.PI * 2, e = 0.08 + r() * 1.4;
      starPos.push(Math.cos(a) * Math.cos(e) * 450, Math.sin(e) * 450, Math.sin(a) * Math.cos(e) * 450);
    }
    const starGeo = this.own(new THREE.BufferGeometry());
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
    s.add(new THREE.Points(starGeo, this.own(new THREE.PointsMaterial({ color: 0xbfc8ff, size: 1.3, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.8 }))));

    // the moon, its halo and the clouds crossing it
    const glow = this.own(glowTexture(256));
    const moon = new THREE.Mesh(this.own(new THREE.CircleGeometry(8, 48)), this.own(new THREE.MeshBasicMaterial({ color: 0xfff4dc, fog: false, toneMapped: false })));
    moon.position.set(-55, 104, -250);
    moon.lookAt(0, 2, 9);
    s.add(moon);
    const halo = new THREE.Sprite(this.own(new THREE.SpriteMaterial({ map: glow, color: 0x8b98d6, fog: false, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending })));
    halo.position.copy(moon.position);
    halo.scale.setScalar(130);
    s.add(halo);
    for (let i = 0; i < 7; i++) {
      const c = new THREE.Sprite(this.own(new THREE.SpriteMaterial({ map: this.own(cloudTexture(30 + i)), color: 0x8a90b4, fog: false, transparent: true, opacity: 0.4, depthWrite: false })));
      c.position.set(-260 + i * 90 + r() * 40, 75 + r() * 55, -230 + r() * 20);
      c.scale.set(220, 80, 1);
      s.add(c);
      this.clouds.push(c);
    }

    // mountain ranges, nearer ones darker
    [
      { z: -260, h: 90, col: 0x1a1d33, seed: 3 },
      { z: -190, h: 60, col: 0x12142a, seed: 5 },
      { z: -120, h: 34, col: 0x0b0c1c, seed: 9 },
    ].forEach(({ z, h, col, seed }) => {
      const rr = rng(seed);
      const shape = new THREE.Shape();
      shape.moveTo(-500, -10);
      for (let x = -500; x <= 500; x += 12) shape.lineTo(x, h * (0.35 + 0.65 * Math.abs(Math.sin(x * 0.008 + seed)) * (0.7 + rr() * 0.3)));
      shape.lineTo(500, -10);
      const m = new THREE.Mesh(this.own(new THREE.ShapeGeometry(shape)), this.own(new THREE.MeshBasicMaterial({ color: col, fog: true })));
      m.position.z = z;
      s.add(m);
    });

    // ground and the stone road to the gate
    const groundTex = this.own(noiseTexture(11, '#0d100d', '#1f231c', 256, 8));
    groundTex.repeat.set(30, 30);
    const ground = new THREE.Mesh(this.own(new THREE.PlaneGeometry(600, 600)), this.own(new THREE.MeshStandardMaterial({ map: groundTex, roughness: 1 })));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    s.add(ground);
    const roadTex = this.own(noiseTexture(12, '#3a3732', '#5b574e', 256, 16));
    roadTex.repeat.set(1, 14);
    const road = new THREE.Mesh(this.own(new THREE.PlaneGeometry(4, 80)), this.own(new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.95 })));
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0.01, -30);
    road.receiveShadow = true;
    s.add(road);

    // the torii
    const lacquer = this.own(new THREE.MeshStandardMaterial({ color: 0x8c1d13, roughness: 0.55, metalness: 0.05 }));
    const black = this.own(new THREE.MeshStandardMaterial({ color: 0x141012, roughness: 0.6 }));
    const torii = new THREE.Group();
    for (const x of [-3.2, 3.2]) {
      const p = new THREE.Mesh(this.own(new THREE.CylinderGeometry(0.34, 0.42, 7.4, 16)), lacquer);
      p.position.set(x, 3.7, 0);
      torii.add(p);
      const base = new THREE.Mesh(this.own(new THREE.CylinderGeometry(0.5, 0.5, 0.6, 16)), black);
      base.position.set(x, 0.3, 0);
      torii.add(base);
    }
    const kasagi = new THREE.Mesh(this.own(new THREE.BoxGeometry(10.4, 0.5, 0.9)), black);
    kasagi.position.y = 7.6;
    const shimaki = new THREE.Mesh(this.own(new THREE.BoxGeometry(9.4, 0.42, 0.7)), lacquer);
    shimaki.position.y = 7.15;
    const nuki = new THREE.Mesh(this.own(new THREE.BoxGeometry(8.4, 0.36, 0.42)), lacquer);
    nuki.position.y = 5.7;
    torii.add(kasagi, shimaki, nuki);
    torii.position.set(0, 0, -22);
    torii.traverse((o) => (o.castShadow = true));
    s.add(torii);

    // stone lanterns with living flames
    const stone = this.own(new THREE.MeshStandardMaterial({ map: this.own(noiseTexture(13, '#4b4a46', '#77736a', 128, 8)), roughness: 0.92 }));
    const flameMat = this.own(new THREE.MeshBasicMaterial({ color: 0xffb259 }));
    const ember = this.own(glowTexture(64, [[0, 'rgba(255,220,150,1)'], [0.3, 'rgba(255,140,40,0.7)'], [1, 'rgba(255,80,0,0)']]));
    const lanternAt = [[-3.4, -6], [3.4, -6], [-3.4, -14], [3.4, -14]];
    lanternAt.forEach(([x, z], i) => {
      const g = new THREE.Group();
      const parts: [THREE.BufferGeometry, number][] = [
        [new THREE.CylinderGeometry(0.55, 0.65, 0.3, 6), 0.15],
        [new THREE.CylinderGeometry(0.16, 0.2, 1.3, 8), 0.95],
        [new THREE.CylinderGeometry(0.5, 0.35, 0.25, 6), 1.7],
        [new THREE.CylinderGeometry(0.85, 0.2, 0.45, 6), 2.55],
        [new THREE.ConeGeometry(0.25, 0.35, 6), 2.95],
      ];
      for (const [geo, y] of parts) {
        const m = new THREE.Mesh(this.own(geo), stone);
        m.position.y = y;
        m.castShadow = true;
        g.add(m);
      }
      const box = new THREE.Mesh(this.own(new THREE.BoxGeometry(0.5, 0.45, 0.5)), flameMat);
      box.position.y = 2.06;
      g.add(box);
      const light = new THREE.PointLight(0xff9a40, 30, 16, 1.3);
      light.position.y = 2.1;
      g.add(light);
      const sp = new THREE.Sprite(this.own(new THREE.SpriteMaterial({ map: ember, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
      sp.position.y = 2.1;
      sp.scale.setScalar(1.3);
      g.add(sp);
      g.position.set(x, 0, z);
      s.add(g);
      this.flames.push({ light, glow: sp, phase: i * 1.7 });
    });

    // pines along the road
    const pine = this.own(new THREE.MeshStandardMaterial({ color: 0x0d1612, roughness: 1 }));
    const trunk = this.own(new THREE.MeshStandardMaterial({ color: 0x1c140f, roughness: 1 }));
    for (let i = 0; i < 26; i++) {
      const side = i % 2 ? 1 : -1, x = side * (8 + r() * 26), z = -4 - r() * 70, h = 6 + r() * 7;
      const tr = new THREE.Mesh(this.own(new THREE.CylinderGeometry(0.18, 0.28, h * 0.4, 6)), trunk);
      tr.position.set(x, h * 0.2, z);
      const top = new THREE.Mesh(this.own(new THREE.ConeGeometry(h * 0.28, h, 7)), pine);
      top.position.set(x, h * 0.6, z);
      tr.castShadow = top.castShadow = true;
      s.add(tr, top);
    }

    // moonlight, sky fill
    const moonLight = new THREE.DirectionalLight(0x9aa8e8, 2.2);
    moonLight.position.set(-40, 55, 30);
    moonLight.target.position.set(0, 0, -14);
    moonLight.castShadow = true;
    moonLight.shadow.mapSize.set(1024, 1024);
    Object.assign(moonLight.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 160 });
    s.add(moonLight, moonLight.target, new THREE.HemisphereLight(0x4a5890, 0x140e08, 0.9));

    // rising embers
    const n = 160;
    const pos = new Float32Array(n * 3);
    this.emberVel = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) this.respawnEmber(pos, i, r, true);
    const eg = this.own(new THREE.BufferGeometry());
    eg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.embers = new THREE.Points(eg, this.own(new THREE.PointsMaterial({ map: ember, color: 0xff8a3a, size: 0.22, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
    s.add(this.embers);
  }

  private respawnEmber(pos: Float32Array, i: number, r = Math.random, anywhere = false): void {
    const [x, z] = [[-3.4, -6], [3.4, -6], [-3.4, -14], [3.4, -14]][i % 4];
    pos[i * 3] = x + (r() - 0.5) * 0.4;
    pos[i * 3 + 1] = anywhere ? 2.1 + r() * 6 : 2.2;
    pos[i * 3 + 2] = z + (r() - 0.5) * 0.4;
    this.emberVel[i * 3] = (r() - 0.5) * 0.01;
    this.emberVel[i * 3 + 1] = 0.01 + r() * 0.025;
    this.emberVel[i * 3 + 2] = (r() - 0.5) * 0.01;
  }

  enter(): void {
    this.game.music('TITLE');
  }

  update(): void {
    this.frame++;
    this.animate();
    const g = this.game, inp = g.input;
    if (this.confirmNew) {
      const r = this.confirmNew.update(g);
      if (r === 'yes') {
        SaveManager.clear();
        g.newGame(DIFFICULTIES[this.pick ?? 1]);
      } else if (r === 'no') this.confirmNew = null;
      return;
    }
    if (this.pick !== null) return this.choosePick();
    if (!this.menu) {
      if (this.frame > 30 && (inp.pressed('confirm') || g.input.mouseLeft)) {
        this.menu = true;
        g.sfx('confirm');
      }
      return;
    }
    const m = menuMouse(inp, MENU.length, MENU_AT.x, MENU_AT.y, this.menuOpts());
    if (m.hover >= 0 && m.hover !== this.cursor) {
      this.cursor = m.hover;
      g.sfx('cursor');
    }
    if (inp.repeat('up')) this.move(-1);
    else if (inp.repeat('down')) this.move(1);
    else if (inp.pressed('cancel') || inp.mouseRight) {
      this.menu = false;
      g.sfx('cancel');
    } else if (m.click === -2) g.sfx('locked');
    else if (inp.pressed('confirm') || m.click >= 0) {
      if (m.click >= 0) this.cursor = m.click;
      this.choose();
    }
  }

  private menuOpts(): MenuOpts {
    return { align: 'center', width: 170, pitch: 30, size: 18, disabled: [false, !this.hasSave, false, false] };
  }

  private move(d: number): void {
    do this.cursor = (this.cursor + d + MENU.length) % MENU.length;
    while (this.cursor === 1 && !this.hasSave);
    this.game.sfx('cursor');
  }

  private choose(): void {
    const g = this.game;
    if (this.cursor === 0) {
      this.pick = 1;
      g.sfx('confirm');
    } else if (this.cursor === 1) {
      g.sfx(g.continueGame() ? 'confirm' : 'locked');
    } else {
      g.sfx('confirm');
      g.scenes.push(this.cursor === 2 ? new OptionsMenu(g) : new ControlsScreen(g));
    }
  }

  /** EASY / NORMAL / HARD for the new journey; the saved one is erased only after that, on a yes. */
  private choosePick(): void {
    const g = this.game, inp = g.input, n = DIFFICULTIES.length;
    let pick = this.pick ?? 1;
    const m = menuMouse(inp, n, PICK_AT.x, PICK_AT.y, PICK);
    if (m.hover >= 0 && m.hover !== pick) {
      pick = m.hover;
      g.sfx('cursor');
    }
    if (inp.repeat('up') || inp.repeat('down')) {
      pick = (pick + (inp.repeat('up') ? n - 1 : 1)) % n;
      g.sfx('cursor');
    } else if (inp.pressed('cancel') || inp.mouseRight) {
      this.pick = null;
      g.sfx('cancel');
      return;
    } else if (inp.pressed('confirm') || m.click >= 0) {
      if (m.click >= 0) pick = m.click;
      if (this.hasSave) {
        this.confirmNew = new YesNo(t('ERASE THE SAVED JOURNEY?'), 1, COL.red);
        g.sfx('cursor');
      } else {
        g.sfx('confirm');
        g.newGame(DIFFICULTIES[pick]);
      }
    }
    this.pick = pick;
  }

  private animate(): void {
    const f = this.frame;
    this.camera.position.set(Math.sin(f * 0.0021) * 1.2, 2.3 + Math.sin(f * 0.0033) * 0.15, 9 - Math.sin(f * 0.0011) * 1.5);
    this.camera.lookAt(0, 4.2, -30);
    for (const c of this.clouds) {
      c.position.x += 0.035;
      if (c.position.x > 340) c.position.x = -340;
    }
    for (const fl of this.flames) {
      const k = 0.82 + 0.12 * Math.sin(f * 0.21 + fl.phase) + 0.06 * Math.sin(f * 0.53 + fl.phase * 2.3);
      fl.light.intensity = 30 * k;
      fl.glow.scale.setScalar(1.15 + 0.25 * k);
    }
    const attr = this.embers.geometry.getAttribute('position') as THREE.BufferAttribute;
    const pos = attr.array as Float32Array;
    for (let i = 0; i < pos.length / 3; i++) {
      pos[i * 3] += this.emberVel[i * 3] + Math.sin((f + i * 13) * 0.03) * 0.004;
      pos[i * 3 + 1] += this.emberVel[i * 3 + 1];
      pos[i * 3 + 2] += this.emberVel[i * 3 + 2];
      if (pos[i * 3 + 1] > 9) this.respawnEmber(pos, i);
    }
    attr.needsUpdate = true;
  }

  drawUI(ui: UI): void {
    const a = Math.min(1, this.frame / 90);
    this.drawLogo(ui, a);
    if (!this.menu) {
      if (this.frame > 30 && (this.frame >> 5) & 1) ui.text(t('PRESS {START}'), 320, 330, { size: 18, align: 'center', color: COL.text, spacing: 2 });
    } else if (this.pick !== null) {
      if (!this.confirmNew) this.drawPick(ui, this.pick);
    } else {
      ui.panel(230, 262, 180, 140);
      ui.menu(MENU.map((m) => t(m)), MENU_AT.x, MENU_AT.y, this.cursor, this.menuOpts());
      if (this.oldSave) ui.text(t('A JOURNEY FROM THE 8-BIT EDITION CANNOT CONTINUE IN THIS ONE.'), 320, 418, { size: 12, align: 'center', color: COL.gray });
    }
    this.confirmNew?.draw(ui);
    ui.text(t('ORIGINAL WORK 2026'), ui.right - 12, 436, { size: 11, align: 'right', color: COL.gray });
  }

  private drawPick(ui: UI, pick: number): void {
    ui.panel(160, 214, 320, 206);
    ui.text(t('DIFFICULTY'), 320, 244, { size: 16, weight: 700, align: 'center', color: COL.goldLight, spacing: 3 });
    ui.line(220, 254, 420, 254, COL.goldDim);
    ui.menu(DIFFICULTIES.map((d) => t(DIFFICULTY_INFO[d].name)), PICK_AT.x, PICK_AT.y, pick, PICK);
    ui.wrap(t(DIFFICULTY_INFO[DIFFICULTIES[pick]].desc), 288, 12).forEach((l, i) => ui.text(l, 320, 376 + i * 16, { size: 12, align: 'center', color: COL.gray }));
  }

  private drawLogo(ui: UI, alpha: number): void {
    const ctx = ui.ctx;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = `900 76px "Noto Serif TC", serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    const y = 150;
    ctx.shadowColor = 'rgba(255, 40, 20, 0.75)';
    ctx.shadowBlur = 26;
    ctx.fillStyle = '#2a0303';
    ctx.fillText('幽燈魔境', 320, y);
    ctx.shadowBlur = 0;
    const g = ctx.createLinearGradient(0, y - 70, 0, y + 6);
    g.addColorStop(0, '#ffe7c4');
    g.addColorStop(0.45, '#e04a2c');
    g.addColorStop(1, '#5a0707');
    ctx.fillStyle = g;
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(10,0,0,0.9)';
    ctx.strokeText('幽燈魔境', 320, y);
    ctx.fillText('幽燈魔境', 320, y);
    ctx.restore();
    ui.text('THE CURSED LABYRINTH', 320, 186, { size: 20, weight: 700, align: 'center', color: COL.goldLight, spacing: 6, alpha });
    ui.line(200, 198, 440, 198, COL.goldDim);
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
  }
}
