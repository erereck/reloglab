import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Archive, Log } from './state';

export const ROOMS = [
  { id: 'reception', number: '00', name: 'RECEPÇÃO', x: 0, z: 14, w: 14, d: 12, doors: { n: [0] } },
  {
    id: 'hub',
    number: '01',
    name: 'DISTRIBUIÇÃO',
    x: 0,
    z: 0,
    w: 18,
    d: 16,
    doors: { s: [0], w: [0], e: [0], n: [-4, 6] },
  },
  {
    id: 'catalog',
    number: '02',
    name: 'ARQUIVO DE TÍTULOS',
    x: -16,
    z: 0,
    w: 14,
    d: 12,
    doors: { e: [0], n: [-16] },
  },
  {
    id: 'log',
    number: '03',
    name: 'PROTOCOLO',
    x: 16,
    z: 0,
    w: 14,
    d: 12,
    doors: { w: [0], n: [17] },
  },
  {
    id: 'profile',
    number: '04',
    name: 'TERRENO DO PERFIL',
    x: -4,
    z: -16,
    w: 10,
    d: 16,
    doors: { s: [-4] },
  },
  { id: 'stats', number: '05', name: 'ESTATÍSTICA', x: 6, z: -16, w: 10, d: 16, doors: { s: [6] } },
  {
    id: 'faq',
    number: '06',
    name: 'CORREDOR DE AJUDA',
    x: -16,
    z: -15,
    w: 14,
    d: 18,
    doors: { s: [-16] },
  },
  {
    id: 'settings',
    number: '07',
    name: 'PREFERÊNCIAS',
    x: 17,
    z: -15,
    w: 12,
    d: 18,
    doors: { s: [17] },
  },
] as const;
export interface Mount {
  mesh: T.Mesh<T.PlaneGeometry, T.MeshBasicMaterial>;
  group: T.Group;
  position: T.Vector3;
  angle: number;
  width: number;
  height: number;
}
type Rect = { x: number; z: number; w: number; d: number };
export class Installation {
  batchedDraws = 0;
  scene = new T.Scene();
  colliders: Rect[] = [];
  mounts: Mount[] = [];
  crates: T.Group[] = [];
  crateMeshes: T.Object3D[] = [];
  particles: T.Points;
  gate: T.Group;
  gateLift = 0;
  gateMat = new T.MeshBasicMaterial({ color: 0xdc8b46 });
  rotor = new T.Group();
  receipt: T.Mesh;
  identity!: T.Mesh;
  identitySignature = '';
  statisticBars: T.Mesh[] = [];
  materials: Record<string, T.Material> = {};
  constructor(private archive: Archive) {
    this.scene.background = new T.Color('#202921');
    this.scene.fog = new T.Fog('#202921', 17, 58);
    this.materials.concrete = new T.MeshLambertMaterial({
      color: '#9da496',
      map: this.noiseTexture('concrete'),
    });
    this.materials.floor = new T.MeshLambertMaterial({
      color: '#6d756b',
      map: this.noiseTexture('floor'),
    });
    this.materials.dark = new T.MeshLambertMaterial({
      color: '#3b4740',
      map: this.noiseTexture('metal'),
    });
    this.materials.metal = new T.MeshLambertMaterial({
      color: '#596357',
      map: this.noiseTexture('metal'),
    });
    this.materials.rust = new T.MeshLambertMaterial({
      color: '#987855',
      map: this.noiseTexture('metal'),
    });
    this.materials.amber = new T.MeshBasicMaterial({ color: '#eeb35d' });
    this.materials.white = new T.MeshBasicMaterial({ color: '#dce8cf' });
    this.materials.green = new T.MeshBasicMaterial({ color: '#9fcead' });
    this.materials.paper = new T.MeshLambertMaterial({ color: '#d3cfb5' });
    this.scene.add(new T.HemisphereLight('#dce2cd', '#323e32', 1.6));
    const key = new T.DirectionalLight('#f6e0b4', 2.3);
    key.position.set(-15, 24, 12);
    this.scene.add(key);
    ROOMS.forEach((r) => this.room(r));
    this.gate = new T.Group();
    this.gate.position.set(0, 0, 8);
    this.box(4, 3.8, 0.28, 0, 1.9, 0, 'dark', false, this.gate);
    for (let i = -1; i <= 1; i++)
      this.box(0.12, 3.4, 0.32, i * 1.2, 1.9, 0.06, 'metal', false, this.gate);
    this.box(3.85, 0.14, 0.35, 0, 0.22, 0, 'amber', false, this.gate);
    this.scene.add(this.gate);
    const gateSign = this.plaque(
      ['CONTROLE DE ACESSO', 'CREDENCIAL OBRIGATÓRIA'],
      3.1,
      0.66,
      0,
      2.9,
      8.2,
      0,
      '#d8ad70',
      '#18221b',
    );
    this.gate.add(gateSign);
    gateSign.position.z = 0.2;
    this.plaque(['RELOGLAB'], 10, 1.25, 0, 4.42, 8.3, 0, '#efba6a', '#273128', true);
    this.plaque(
      ['DEPARTAMENTO DE MEMÓRIA JOGÁVEL', 'SÉRIO NO REGISTRO. QUESTIONÁVEL NO PROCEDIMENTO.'],
      9,
      0.68,
      0,
      3.62,
      8.34,
      0,
      '#b8c0ac',
      '#273128',
    );
    this.plaque(
      ['00 / ADMISSÃO', 'PREENCHA A CREDENCIAL NO TERMINAL', '↓'],
      3.65,
      1.25,
      -4.45,
      3.5,
      8.38,
      0,
      '#e9b26a',
      '#29372d',
    );
    this.plaque(
      [
        'INSTRUÇÕES DE PERMANÊNCIA',
        'W A S D  /  MOVIMENTAR',
        'MOUSE  /  OLHAR',
        'E  /  OPERAR UM OBJETO',
        'SHIFT  /  CORRER',
        'ESC  /  LIBERAR O MOUSE',
        '',
        'CELULAR: JOYSTICK + ARRASTE',
        'SETAS: MOVER E VIRAR',
        '',
        'NÃO USE UMA SENHA REAL.',
        'A CONTA É UMA FICÇÃO LOCAL.',
      ],
      3.2,
      3.0,
      4.55,
      2.3,
      8.38,
      0,
      '#c4cbb7',
      '#25362a',
    );
    this.floorText(['ADMISSÃO', '↑'], 3.2, 2.1, -3, 14, '#c79953');
    this.floorText(['02 ← ARQUIVO', 'PROTOCOLO → 03'], 6, 1.2, 0, 5, '#b5bea8');
    this.floorText(['04 ↑ PERFIL', '05 ↑ ESTATÍSTICA'], 5, 1.2, 0, -4, '#b5bea8');
    this.floorText(['AJUDA ↑ 06'], 4, 0.7, -16, -3, '#b5bea8');
    this.floorText(['07 ↑ PREFERÊNCIAS'], 4, 0.7, 17, -3, '#b5bea8');
    this.plaque(
      ['02', 'ARQUIVO DE TÍTULOS', 'CONSULTA / SELEÇÃO'],
      3.7,
      1.15,
      -8.68,
      3.35,
      0,
      Math.PI / 2,
      '#e8b264',
      '#25352b',
    );
    this.plaque(
      ['03', 'PROTOCOLO', 'REGISTRO / HOMOLOGAÇÃO'],
      3.7,
      1.15,
      8.68,
      3.35,
      0,
      -Math.PI / 2,
      '#e8b264',
      '#25352b',
    );
    this.plaque(['04 / TERRENO DO PERFIL'], 3.8, 0.75, -4, 3.65, -7.7, 0, '#bad1bb', '#25352b');
    this.plaque(['05 / ESTATÍSTICA'], 3.8, 0.75, 6, 3.65, -7.7, 0, '#bad1bb', '#25352b');
    this.plaque(
      ['06 / AJUDA HORIZONTAL', 'A RESPOSTA ESTÁ MAIS ADIANTE.'],
      5,
      0.8,
      -16,
      3.55,
      -5.72,
      0,
      '#bad1bb',
      '#25352b',
    );
    this.plaque(
      ['07 / PREFERÊNCIAS', 'A SUA OPINIÃO FOI ENCAMINHADA.'],
      5,
      0.8,
      17,
      3.55,
      -5.72,
      0,
      '#bad1bb',
      '#25352b',
    );
    this.centralMachine();
    this.furnishArchive();
    this.furnishProtocol();
    this.furnishProfile();
    this.furnishFAQ();
    this.furnishSettings();
    this.furnishStats();
    for (const z of [11, 16]) {
      this.bench(-6, 0, z, Math.PI / 2);
      this.box(0.8, 0.8, 0.8, 6, 0.4, z, 'dark', true);
    }
    this.plaque(
      ['AVISO 014-B', 'O ATENDIMENTO NÃO ESTÁ EM PAUSA.', 'NÃO HÁ ATENDIMENTO.'],
      3.1,
      0.8,
      -6.69,
      2.7,
      16,
      Math.PI / 2,
      '#c0c9b4',
      '#26372a',
    );
    this.plaque(
      ['NÃO CONFUNDIR', 'SALVAR COM SINCRONIZAR.'],
      2.7,
      0.6,
      6.68,
      2.6,
      15,
      -Math.PI / 2,
      '#c0c9b4',
      '#26372a',
    );
    const pg = new T.BufferGeometry();
    const positions = [];
    let seed = 42;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let i = 0; i < 350; i++)
      positions.push((rand() - 0.5) * 42, rand() * 4.8, (rand() - 0.5) * 42 - 3);
    pg.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
    this.particles = new T.Points(
      pg,
      new T.PointsMaterial({
        color: '#dcdebf',
        size: 0.025,
        transparent: true,
        opacity: 0.25,
        depthWrite: false,
      }),
    );
    this.scene.add(this.particles);
    this.receipt = this.box(0.28, 0.01, 0.65, 19, 1.13, -3.5, 'paper');
    this.receipt.visible = false;
    this.rebuildCrates();
  }
  noiseTexture(kind: string) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(128, 128);
    let seed = 37;
    for (let i = 0; i < img.data.length; i += 4) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const v = kind === 'metal' ? 150 + (seed % 20) : 174 + (seed % 46);
      img.data[i] = v;
      img.data[i + 1] = v;
      img.data[i + 2] = v - 4;
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    ctx.strokeStyle = kind === 'floor' ? '#647064' : '#8d9386';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, 128, 128);
    if (kind === 'concrete') {
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, 64);
      ctx.lineTo(128, 64);
      ctx.moveTo(64, 0);
      ctx.lineTo(64, 64);
      ctx.moveTo(32, 64);
      ctx.lineTo(32, 128);
      ctx.stroke();
    }
    if (kind === 'metal') {
      ctx.fillStyle = '#787f74';
      for (const x of [6, 120]) for (const y of [6, 120]) ctx.fillRect(x, y, 3, 3);
    }
    const t = new T.CanvasTexture(c);
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.repeat.set(3, 3);
    t.magFilter = T.NearestFilter;
    t.colorSpace = T.SRGBColorSpace;
    return t;
  }
  box(
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    mat: string,
    solid = false,
    parent: T.Object3D = this.scene,
  ) {
    const m = new T.Mesh(new T.BoxGeometry(w, h, d), this.materials[mat]);
    m.position.set(x, y, z);
    parent.add(m);
    if (solid) this.colliders.push({ x, z, w, d });
    return m;
  }
  room(r: (typeof ROOMS)[number]) {
    const { x, z, w, d } = r;
    const doors = r.doors as {
      n?: readonly number[];
      s?: readonly number[];
      e?: readonly number[];
      w?: readonly number[];
    };
    this.box(w, 0.24, d, x, -0.13, z, 'floor');
    this.box(w, 0.2, d, x, 5.12, z, 'dark');
    const wall = (side: 'n' | 's' | 'e' | 'w') => {
      const horizontal = side === 'n' || side === 's';
      const length = horizontal ? w : d;
      const mid = horizontal ? x : z;
      const fixed = horizontal
        ? z + (side === 'n' ? -d / 2 : d / 2)
        : x + (side === 'w' ? -w / 2 : w / 2);
      let start = mid - length / 2;
      const openings = [...(doors[side] || [])].sort((a, b) => a - b);
      const segment = (a: number, b: number) => {
        if (b - a < 0.01) return;
        this.box(
          horizontal ? b - a : 0.42,
          5,
          horizontal ? 0.42 : b - a,
          horizontal ? (a + b) / 2 : fixed,
          2.5,
          horizontal ? fixed : (a + b) / 2,
          'concrete',
          true,
        );
        this.box(
          horizontal ? b - a : 0.48,
          0.6,
          horizontal ? 0.48 : b - a,
          horizontal ? (a + b) / 2 : fixed,
          0.3,
          horizontal ? fixed : (a + b) / 2,
          'dark',
        );
      };
      openings.forEach((center) => {
        segment(start, center - 2);
        this.box(
          horizontal ? 4 : 0.42,
          1.3,
          horizontal ? 0.42 : 4,
          horizontal ? center : fixed,
          4.35,
          horizontal ? fixed : center,
          'concrete',
        );
        for (const offset of [-2, 2])
          this.box(
            horizontal ? 0.22 : 0.58,
            3.8,
            horizontal ? 0.58 : 0.22,
            horizontal ? center + offset : fixed,
            1.9,
            horizontal ? fixed : center + offset,
            'metal',
          );
        this.box(
          horizontal ? 4.3 : 0.55,
          0.18,
          horizontal ? 0.55 : 4.3,
          horizontal ? center : fixed,
          3.78,
          horizontal ? fixed : center,
          'amber',
        );
        start = center + 2;
      });
      segment(start, mid + length / 2);
    };
    (['n', 's', 'e', 'w'] as const).forEach(wall);
    for (let zz = z - d / 2 + 2; zz < z + d / 2; zz += 4) {
      this.box(w - 0.35, 0.22, 0.32, x, 4.83, zz, 'metal');
      this.box(2.8, 0.08, 0.2, x, 4.65, zz, 'white');
    }
    for (const xx of [x - w / 2 + 0.7, x + w / 2 - 0.7]) {
      const pipe = new T.Mesh(new T.CylinderGeometry(0.12, 0.12, d - 0.7, 7), this.materials.rust);
      pipe.rotation.x = Math.PI / 2;
      pipe.position.set(xx, 4.42, z);
      this.scene.add(pipe);
      for (let zz = z - d / 2 + 1; zz < z + d / 2; zz += 3)
        this.box(0.48, 0.08, 0.45, xx, 4.42, zz, 'dark');
    }
    const light = new T.PointLight(r.id === 'profile' ? '#b6d4ba' : '#f0c486', 26, 17, 2);
    light.position.set(x, 4.3, z);
    this.scene.add(light);
    this.plaque(
      [r.number + ' / ' + r.name],
      Math.min(w - 2, 8),
      0.68,
      x,
      4.2,
      z - d / 2 + 0.3,
      0,
      '#c9cfb8',
      '#2d3a2e',
    );
  }
  canvasPlane(
    c: HTMLCanvasElement,
    w: number,
    h: number,
    x: number,
    y: number,
    z: number,
    angle = 0,
  ) {
    const texture = new T.CanvasTexture(c);
    texture.colorSpace = T.SRGBColorSpace;
    texture.anisotropy = 4;
    const m = new T.Mesh(
      new T.PlaneGeometry(w, h),
      new T.MeshBasicMaterial({ map: texture, side: T.DoubleSide, toneMapped: false }),
    );
    m.position.set(x, y, z);
    m.rotation.y = angle;
    this.scene.add(m);
    return m;
  }
  plaque(
    lines: string[],
    w: number,
    h: number,
    x: number,
    y: number,
    z: number,
    angle = 0,
    ink = '#d0d7bc',
    background = '#26372b',
    big = false,
  ) {
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = Math.round((1024 * h) / w);
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = ink + '44';
    ctx.lineWidth = 3;
    ctx.strokeRect(8, 8, c.width - 16, c.height - 16);
    const size = Math.min(big ? 150 : 52, (c.height - 28) / (lines.length * 1.35));
    ctx.fillStyle = ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    lines.forEach((line, i) => {
      ctx.font = `${i === 0 ? '600' : '400'} ${i === 0 ? size : size * 0.75}px Dept, monospace`;
      ctx.fillText(
        line,
        c.width / 2,
        (c.height - (lines.length - 1) * size * 1.35) / 2 + i * size * 1.35,
        c.width - 44,
      );
    });
    return this.canvasPlane(c, w, h, x, y, z, angle);
  }
  floorText(lines: string[], w: number, d: number, x: number, z: number, ink: string) {
    const p = this.plaque(lines, w, d, x, 0.012, z, 0, ink, '#434d40');
    p.rotation.x = -Math.PI / 2;
    return p;
  }
  mount(c: HTMLCanvasElement, x: number, z: number, angle = 0, w = 3.4, h = 2.55): Mount {
    const centerY = h > 3 ? 2.75 : 2.05;
    const g = new T.Group();
    g.position.set(x, 0, z);
    g.rotation.y = angle;
    this.scene.add(g);
    this.box(w + 0.48, h + 0.48, 0.48, 0, centerY, 0, 'dark', false, g);
    this.box(w + 0.58, 0.11, 0.57, 0, centerY - h / 2 - 0.19, 0, 'metal', false, g);
    this.box(w * 0.75, 1.0, 0.72, 0, 0.5, -0.12, 'metal', false, g);
    this.box(w * 0.9, 0.15, 1.1, 0, 0.08, 0, 'dark', false, g);
    this.box(w * 0.95, 0.1, 0.62, 0, 0.8, 0.5, 'rust', false, g);
    for (let row = 0; row < 3; row++)
      for (let i = 0; i < 15; i++)
        this.box(0.13, 0.04, 0.065, (i - 7) * 0.17, 0.875, row * 0.09 + 0.36, 'dark', false, g);
    for (const offset of [-w / 2, w / 2])
      this.box(0.065, 0.065, 0.05, offset, 0.66, 0.26, 'amber', false, g);
    const screen = this.canvasPlane(c, w, h, 0, 0, 0);
    this.scene.remove(screen);
    g.add(screen);
    screen.position.set(0, centerY, 0.255);
    const mount = {
      mesh: screen,
      group: g,
      position: new T.Vector3(x, centerY, z),
      angle,
      width: w,
      height: h,
    };
    this.mounts.push(mount);
    this.colliders.push({
      x,
      z,
      w: angle === 0 || Math.abs(angle) === Math.PI ? w + 0.4 : 0.9,
      d: angle === 0 || Math.abs(angle) === Math.PI ? 0.9 : w + 0.4,
    });
    return mount;
  }
  bench(x: number, y: number, z: number, a = 0) {
    const g = new T.Group();
    g.position.set(x, y, z);
    g.rotation.y = a;
    this.scene.add(g);
    this.box(2.8, 0.15, 0.65, 0, 0.52, 0, 'metal', false, g);
    this.box(2.8, 0.6, 0.12, 0, 0.9, -0.28, 'dark', false, g);
    for (const xx of [-1.1, 1.1]) this.box(0.15, 0.5, 0.5, xx, 0.25, 0, 'dark', false, g);
  }
  centralMachine() {
    this.box(3, 0.35, 3, 0, 0.175, -0.4, 'dark', true);
    this.box(2.25, 1.6, 2.1, 0, 1.05, -0.5, 'metal', true);
    this.box(1.8, 1.1, 1.3, 0, 2.3, -0.5, 'dark');
    this.plaque(['74%'], 2.15, 1.05, 0, 2.4, 0.17, 0, '#efb162', '#17291b', true);
    this.plaque(
      ['SINCRONIZAÇÃO GERAL', 'TEMPO RESTANTE: ESTIMADO'],
      2.45,
      0.53,
      0,
      1.45,
      0.58,
      0,
      '#cfcca9',
      '#223021',
    );
    for (let i = 0; i < 10; i++)
      this.box(0.18, 0.08, 0.06, -0.95 + i * 0.21, 1, 0.58, i < 7 ? 'amber' : 'dark');
    this.rotor.position.set(0, 3.57, -0.5);
    this.scene.add(this.rotor);
    const hoop = new T.Mesh(new T.TorusGeometry(0.68, 0.09, 6, 24), this.materials.rust);
    hoop.rotation.x = Math.PI / 2;
    this.rotor.add(hoop);
    for (let i = 0; i < 4; i++) {
      const b = this.box(1.25, 0.12, 0.18, 0, 0, 0, 'metal', false, this.rotor);
      b.rotation.y = (i * Math.PI) / 4;
    }
    this.box(0.16, 1.3, 0.16, 0, 4.23, -0.5, 'rust');
    const circuit = new T.Mesh(new T.TorusGeometry(3.55, 0.025, 4, 64), this.materials.rust);
    circuit.rotation.x = Math.PI / 2;
    circuit.position.set(0, 0.026, -0.5);
    this.scene.add(circuit);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const dash = this.box(
        0.11,
        0.012,
        0.34,
        Math.sin(a) * 3.55,
        0.033,
        -0.5 + Math.cos(a) * 3.55,
        'amber',
      );
      dash.rotation.y = a;
    }
    for (const x of [-1.6, 1.6]) {
      const shape = new T.Mesh(new T.TorusGeometry(1.25, 0.075, 6, 24), this.materials.metal);
      shape.rotation.y = Math.PI / 2;
      shape.position.set(x, 2.5, -0.5);
      this.scene.add(shape);
      this.box(0.18, 2.5, 0.18, x, 1.25, -0.5, 'rust');
    }
    this.floorText(['01 / ESTIMATIVA', 'NÃO PISE NA PORCENTAGEM'], 4, 0.62, 0, 3.45, '#c5a569');
    const points = [
      new T.Vector3(-1.6, 2.5, -0.5),
      new T.Vector3(-2.8, 2.7, -1.8),
      new T.Vector3(-3.2, 4.4, -2.5),
      new T.Vector3(-8.5, 4.4, -2.5),
    ];
    const cable = new T.Mesh(
      new T.TubeGeometry(new T.CatmullRomCurve3(points), 18, 0.085, 6, false),
      this.materials.rust,
    );
    this.scene.add(cable);
  }
  furnishArchive() {
    for (const x of [-21.6, -10.5])
      for (const z of [-3, 2.8]) {
        this.box(1.1, 3.2, 2.3, x, 1.6, z, 'dark', true);
        for (let i = 0; i < 7; i++) {
          this.box(1.14, 0.11, 2.35, x, 0.35 + i * 0.43, z, 'metal');
          for (let k = 0; k < 5; k++)
            this.box(
              0.78,
              0.26,
              0.28,
              x,
              0.51 + i * 0.43,
              z - 0.83 + k * 0.39,
              k % 3 === 0 ? 'rust' : 'concrete',
            );
        }
      }
    this.plaque(
      ['CATÁLOGO SECO', 'CAPAS: DESATIVADAS DESDE SEMPRE', 'SELECIONE AQUI. REGISTRE NO SETOR 03.'],
      7,
      0.9,
      -16,
      3.6,
      -5.72,
      0,
      '#deb46e',
      '#26352b',
    );
  }
  furnishProtocol() {
    this.box(3, 1, 1.1, 19, 0.5, -3.8, 'dark', true);
    this.box(3.2, 0.12, 1.3, 19, 1.06, -3.8, 'metal');
    this.box(0.7, 0.3, 0.7, 19, 1.27, -3.85, 'dark');
    this.plaque(
      [
        'FORMULÁRIO 03-B',
        '1. SELECIONE UM TÍTULO NO SETOR 02',
        '2. PREENCHA SITUAÇÃO, NOTA E DATA',
        '3. PROTOCOLE. CONTINUE NESTE BALCÃO.',
      ],
      6.8,
      1.1,
      16,
      3.7,
      -5.72,
      0,
      '#d7b77c',
      '#26352b',
    );
    this.bench(21, 0, 3);
  }
  furnishProfile() {
    const base = this.box(8, 0.1, 11, -4, 0.025, -16.6, 'dark');
    const grid = new T.GridHelper(10, 20, '#9aa88d', '#586950');
    grid.position.set(-4, 0.092, -16.6);
    this.scene.add(grid);
    base.material = new T.MeshLambertMaterial({ color: '#56664c' });
    this.plaque(
      [
        'PERFIL = TERRENO',
        'MIRE NUM BLOCO + E PARA CARREGAR',
        'E NOVAMENTE PARA POSICIONAR',
        'NO PAINEL: ARRASTE OS BLOCOS.',
      ],
      6.7,
      1.2,
      -4,
      3.6,
      -23.72,
      0,
      '#c0d4b5',
      '#273e2b',
    );
    this.floorText(['PROPRIEDADE LOCAL', 'SOBREPOSIÇÕES SÃO PERMITIDAS'], 7, 1, -4, -10, '#9fb189');
    this.identity = this.plaque(
      ['TITULAR DO TERRENO', 'CREDENCIAL NÃO HOMOLOGADA'],
      5.5,
      2.1,
      -8.68,
      2.55,
      -17,
      Math.PI / 2,
      '#c0d4b5',
      '#273e2b',
    );
  }
  furnishStats() {
    for (let i = 0; i < 6; i++) {
      this.box(0.9, 0.22, 0.9, 2.1 + i * 1.45, 0.11, -20.8, 'dark');
      this.statisticBars.push(this.box(0.6, 1, 0.6, 2.1 + i * 1.45, 0.7, -20.8, 'rust'));
      this.plaque(
        [['JOGADO', 'TERMINADO', 'JOGANDO', 'ABANDONADO', 'NA PILHA', 'QUERO JOGAR'][i]],
        1.3,
        0.3,
        2.1 + i * 1.45,
        0.38,
        -20.27,
        0,
        '#c2d1b6',
        '#2b3a2b',
      );
    }
    this.plaque(
      ['CONTABILIDADE DA MEMÓRIA', 'ESTES NÚMEROS SÃO REAIS.', 'O DEPARTAMENTO NÃO TEM OPINIÃO.'],
      7.5,
      1.05,
      6,
      3.75,
      -23.7,
      0,
      '#c2d1b6',
      '#2b3a2b',
    );
  }
  updateAccount() {
    const a = this.archive.data.account,
      signature = JSON.stringify(a);
    if (signature !== this.identitySignature) {
      this.identitySignature = signature;
      const c = document.createElement('canvas');
      c.width = 1024;
      c.height = 392;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#273e2b';
      ctx.fillRect(0, 0, 1024, 392);
      ctx.fillStyle = '#92ab87';
      ctx.font = '400 24px Dept,monospace';
      ctx.fillText('TITULAR DO TERRENO / MEMÓRIA LOCAL', 36, 46);
      ctx.fillStyle = '#d1dfba';
      ctx.font = '500 48px Dept,monospace';
      ctx.fillText(a?.username.toUpperCase() || 'NÃO HOMOLOGADO', 36, 118, 952);
      ctx.font = '400 24px Dept,monospace';
      ctx.fillStyle = '#acc4a0';
      ctx.fillText(
        a ? `Nº ${a.memberNo}  /  DESDE ${a.joined}` : 'EMITA UMA CREDENCIAL NA RECEPÇÃO',
        36,
        170,
        952,
      );
      ctx.fillText('GÊNERO FAVORITO: ' + (a?.favoriteGenre || 'Não informado'), 36, 214, 952);
      const words = (a?.bio || 'O departamento ainda não conhece o titular.').split(' ');
      let line = '',
        y = 270;
      for (const word of words) {
        if (ctx.measureText(line + ' ' + word).width > 952) {
          ctx.fillText(line, 36, y);
          line = word;
          y += 36;
        } else line += (line ? ' ' : '') + word;
      }
      ctx.fillText(line, 36, y);
      const m = this.identity.material as T.MeshBasicMaterial;
      m.map?.dispose();
      m.map = new T.CanvasTexture(c);
      m.map.colorSpace = T.SRGBColorSpace;
      m.needsUpdate = true;
    }
    const s = this.archive.stats();
    Object.values(s.counts).forEach((count, i) => {
      const h = 0.12 + (3.2 * count) / Math.max(1, s.total),
        bar = this.statisticBars[i];
      bar.scale.y = h;
      bar.position.y = 0.22 + h / 2;
    });
  }
  furnishFAQ() {
    const faq = [
      [
        '01 / A CONTA É REAL?',
        'É uma credencial fictícia neste navegador.',
        'Nada é enviado a um servidor.',
        'Exporte os registros para fazer backup.',
      ],
      [
        '02 / MINHA SENHA JÁ FOI USADA?',
        'A primeira senha será recusada.',
        'É o procedimento, não uma consulta real.',
        'Escolha outra senha. Não use uma real.',
      ],
      [
        '03 / POR QUE UM TERRENO?',
        'Cada registro é um bloco manipulável.',
        'Mire + E para carregar e reposicionar.',
        'O organizador distribui ao acaso.',
      ],
      [
        '04 / ONDE ESTÃO AS CAPAS?',
        'As capas continuam desativadas.',
        'O catálogo contém nome, gênero e ano.',
        'A ausência de decoração foi homologada.',
      ],
      [
        '05 / POR QUE 74%?',
        'A sincronização é uma simulação fixa.',
        'Os registros são salvos localmente.',
        'O indicador nunca bloqueia o arquivo.',
      ],
      [
        '06 / COMO EU SAIO?',
        'A saída está no fundo das preferências.',
        'É uma porta de manutenção discreta.',
        'Os registros permanecem no navegador.',
      ],
    ];
    faq.forEach((lines, i) => {
      const z = -8.3 - (i % 3) * 5.8;
      const x = i < 3 ? -22.72 : -9.28;
      this.plaque(
        lines,
        4.8,
        1.65,
        x,
        2.05,
        z,
        i < 3 ? Math.PI / 2 : -Math.PI / 2,
        '#c4d2b5',
        '#253b2c',
      );
    });
    this.floorText(
      ['A ROLAGEM HORIZONTAL', 'AGORA É VOCÊ.', '← LEIA OS DOIS LADOS →'],
      9,
      2.6,
      -16,
      -16,
      '#b5bea8',
    );
    this.bench(-16, 0, -23);
  }
  furnishSettings() {
    for (const z of [-11, -16, -21]) {
      this.box(1, 3.5, 2.4, 22.1, 1.75, z, 'dark', true);
      for (let i = 0; i < 6; i++) {
        this.box(1.08, 0.07, 2.42, 22.1, 0.4 + i * 0.52, z, 'metal');
        this.box(0.06, 0.06, 0.06, 21.55, 0.6 + i * 0.52, z + 0.7, i % 2 === 0 ? 'amber' : 'green');
      }
    }
    this.plaque(
      ['PREFERÊNCIAS DO MEMBRO', 'O ESTILO VISUAL SERÁ ENCAMINHADO', 'AO COMITÊ DE ESTILO VISUAL.'],
      7,
      0.9,
      17,
      3.75,
      -23.7,
      0,
      '#ceb995',
      '#28352b',
    );
    this.box(1.35, 2.5, 0.15, 20.9, 1.25, -23.72, 'dark');
    this.plaque(['MANUT.', '08-B'], 0.75, 0.45, 20.9, 2.1, -23.61, 0, '#718470', '#24362b');
  }
  rebuildCrates() {
    this.crates.forEach((g) => {
      g.traverse((o) => {
        if (o instanceof T.Mesh) {
          o.geometry.dispose();
          if (o.material instanceof T.MeshBasicMaterial && o.material.map) {
            o.material.map.dispose();
            o.material.dispose();
          }
        }
      });
      this.scene.remove(g);
    });
    this.crates = [];
    this.crateMeshes = [];
    this.archive.data.logs.slice(0, 80).forEach((log, i) => {
      const p = this.archive.position(log, i),
        g = new T.Group();
      g.position.set(p.x, 0, p.z);
      g.userData.logId = log.id;
      this.box(1.18, 0.55, 0.75, 0, 0.3, 0, 'metal', false, g);
      this.box(1.24, 0.075, 0.8, 0, 0.59, 0, 'rust', false, g);
      const c = document.createElement('canvas');
      c.width = 512;
      c.height = 192;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#213827';
      ctx.fillRect(0, 0, 512, 192);
      ctx.fillStyle = '#d3e0bc';
      ctx.font = '500 30px Dept,monospace';
      ctx.fillText(log.game.slice(0, 25), 16, 48, 480);
      ctx.font = '20px Dept,monospace';
      ctx.fillStyle = '#adbe99';
      ctx.fillText(log.status.toUpperCase(), 16, 100);
      ctx.fillText(log.rating === '' ? 'SEM NOTA' : log.rating + ' / 10', 16, 140);
      const m = this.canvasPlane(c, 1.12, 0.42, 0, 0, 0);
      this.scene.remove(m);
      g.add(m);
      m.position.set(0, 0.34, 0.381);
      m.userData.logId = log.id;
      this.scene.add(g);
      this.crates.push(g);
      g.traverse((o) => {
        if (o instanceof T.Mesh) {
          o.userData.logId = log.id;
          this.crateMeshes.push(o);
        }
      });
    });
  }
  moveCrate(id: string, x: number, z: number) {
    const g = this.crates.find((c) => c.userData.logId === id);
    if (g) g.position.set(x, 0, z);
  }
  printReceipt() {
    this.receipt.visible = true;
  }
  optimizeStatic(excluded: T.Object3D[]) {
    const exceptions = new Set([this.receipt, ...this.statisticBars, ...excluded]);
    // Keep moving groups separate. Merge boxes in their parent's coordinates,
    // preserving the independent screen planes and collision rectangles.
    for (const parent of [this.scene, this.gate, this.rotor, ...this.mounts.map((m) => m.group)]) {
      const groups = new Map<T.Material, T.Mesh[]>();
      for (const child of [...parent.children]) {
        if (
          !(child instanceof T.Mesh) ||
          !(child.geometry instanceof T.BoxGeometry) ||
          Array.isArray(child.material) ||
          exceptions.has(child)
        )
          continue;
        const meshes = groups.get(child.material) || [];
        meshes.push(child);
        groups.set(child.material, meshes);
      }
      for (const [material, meshes] of groups) {
        if (meshes.length < 2) continue;
        const geometries = meshes.map((mesh) => {
          mesh.updateMatrix();
          return mesh.geometry.clone().applyMatrix4(mesh.matrix);
        });
        const geometry = mergeGeometries(geometries);
        geometries.forEach((g) => g.dispose());
        if (!geometry) continue;
        parent.add(new T.Mesh(geometry, material));
        meshes.forEach((mesh) => {
          parent.remove(mesh);
          mesh.geometry.dispose();
        });
        this.batchedDraws += meshes.length - 1;
      }
    }
  }
  sector(x: number, z: number) {
    return (
      ROOMS.find((r) => Math.abs(x - r.x) < r.w / 2 && Math.abs(z - r.z) < r.d / 2) || ROOMS[1]
    );
  }
  canMove(x: number, z: number) {
    const radius = 0.26;
    if (
      !ROOMS.some(
        (r) => x > r.x - r.w / 2 && x < r.x + r.w / 2 && z > r.z - r.d / 2 && z < r.z + r.d / 2,
      )
    )
      return false;
    if (!this.archive.session && Math.abs(x) < 2.25 && Math.abs(z - 8) < 0.4) return false;
    return !this.colliders.some(
      (r) => Math.abs(x - r.x) < r.w / 2 + radius && Math.abs(z - r.z) < r.d / 2 + radius,
    );
  }
  update(dt: number, t: number) {
    const target = this.archive.session ? 4.15 : 0;
    this.gateLift = T.MathUtils.damp(this.gateLift, target, 3, dt);
    this.gate.position.y = this.gateLift;
    if (!this.archive.data.preferences.reducedMotion) {
      this.rotor.rotation.y = t * 0.12;
      this.particles.rotation.y = Math.sin(t * 0.015) * 0.02;
    }
  }
}
