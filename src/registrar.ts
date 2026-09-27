import * as T from 'three';

/** A departmental scanner, carried in the scene like a 1990s view model. */
export class Registrar {
  group = new T.Group();
  display = document.createElement('canvas');
  texture: T.CanvasTexture;
  last = '';
  impulse = 0;
  constructor(camera: T.Camera, scene: T.Scene) {
    this.group.position.set(0.48, -0.24, -0.85);
    this.group.rotation.set(-0.14, -0.16, -0.08);
    const materials = {
      body: new T.MeshBasicMaterial({ color: '#657060' }),
      dark: new T.MeshBasicMaterial({ color: '#26372e' }),
      paper: new T.MeshBasicMaterial({ color: '#b8b894' }),
      glove: new T.MeshBasicMaterial({ color: '#475742' }),
      amber: new T.MeshBasicMaterial({ color: '#d2a357' }),
    };
    const box = (
      w: number,
      h: number,
      d: number,
      x: number,
      y: number,
      z: number,
      mat: keyof typeof materials,
    ) => {
      const mesh = new T.Mesh(new T.BoxGeometry(w, h, d), materials[mat]);
      mesh.position.set(x, y, z);
      this.group.add(mesh);
      return mesh;
    };
    box(0.3, 0.19, 0.32, 0, 0.055, 0, 'body');
    box(0.32, 0.06, 0.35, 0, 0.13, -0.015, 'dark');
    box(0.26, 0.1, 0.1, 0, 0.05, -0.22, 'dark');
    box(0.21, 0.06, 0.11, 0, 0.06, -0.28, 'amber');
    box(0.1, 0.24, 0.14, 0.015, -0.145, 0.045, 'dark');
    box(0.13, 0.16, 0.12, 0.014, -0.165, 0.11, 'glove');
    box(0.14, 0.22, 0.16, 0.028, -0.32, 0.13, 'glove');
    box(0.022, 0.15, 0.04, -0.13, 0.06, 0.17, 'dark');
    box(0.022, 0.15, 0.04, 0.13, 0.06, 0.17, 'dark');
    box(0.23, 0.025, 0.045, 0, -0.02, 0.175, 'paper');
    for (let i = 0; i < 13; i++)
      box(0.007, 0.021, 0.004, -0.1 + i * 0.016, -0.018, 0.2, i % 3 === 0 ? 'paper' : 'dark');
    for (const x of [-0.13, 0.13])
      for (const y of [0, 0.12]) box(0.012, 0.012, 0.004, x, y, 0.168, 'paper');
    this.display.width = 512;
    this.display.height = 168;
    this.texture = new T.CanvasTexture(this.display);
    this.texture.colorSpace = T.SRGBColorSpace;
    this.texture.magFilter = T.NearestFilter;
    const screen = new T.Mesh(
      new T.PlaneGeometry(0.228, 0.09),
      new T.MeshBasicMaterial({ map: this.texture, toneMapped: false }),
    );
    screen.position.set(0, 0.065, 0.162);
    this.group.add(screen);
    camera.add(this.group);
    scene.add(camera);
    this.status('AGUARDANDO');
  }
  status(text: string) {
    if (text === this.last) return;
    this.last = text;
    const c = this.display.getContext('2d')!;
    c.fillStyle = '#152d1e';
    c.fillRect(0, 0, 512, 168);
    c.fillStyle = '#99c28b';
    c.font = '500 26px Dept,monospace';
    c.fillText('REGISTRADOR / RL-074', 18, 34);
    c.fillStyle = '#dbc190';
    c.font = '600 36px Dept,monospace';
    c.fillText(text, 18, 98, 478);
    c.fillStyle = '#638664';
    c.fillRect(18, 137, 476, 3);
    this.texture.needsUpdate = true;
  }
  stamp() {
    this.impulse = 0.05;
  }
  update(dt: number, bob: number, visible: boolean, reduced: boolean) {
    this.group.visible = visible && innerWidth > 700;
    this.impulse = T.MathUtils.damp(this.impulse, 0, 14, dt);
    this.group.position.y = -0.24 + (reduced ? 0 : Math.sin(bob) * 0.008);
    this.group.position.z = -0.85 + this.impulse;
    this.group.rotation.z = -0.08 + (reduced ? 0 : Math.cos(bob) * 0.012);
  }
}
