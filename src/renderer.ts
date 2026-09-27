import * as T from 'three';
export class RetroRenderer {
  renderer: T.WebGLRenderer;
  target: T.WebGLRenderTarget;
  scene = new T.Scene();
  camera = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  material: T.ShaderMaterial;
  inspecting = false;
  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new T.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(1);
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.target = new T.WebGLRenderTarget(1, 1, { depthBuffer: true });
    this.material = new T.ShaderMaterial({
      uniforms: {
        scene: { value: this.target.texture },
        resolution: { value: new T.Vector2(1, 1) },
      },
      vertexShader:
        'varying vec2 uvScreen; void main(){uvScreen=uv;gl_Position=vec4(position,1.);}',
      fragmentShader: `precision highp float; uniform sampler2D scene; uniform vec2 resolution; varying vec2 uvScreen;
        void main(){vec2 p=uvScreen;vec3 col=texture2D(scene,p).rgb;
        float edge=1.-smoothstep(.24,.86,length((p-.5)*vec2(1.,.85)));col*=.87+.13*edge;
        float pattern=mod(floor(p.x*resolution.x)+2.*floor(p.y*resolution.y),4.);col+=(pattern-1.5)/420.;
        col*=1.-.025*mod(floor(p.y*resolution.y),2.);gl_FragColor=vec4(col,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        }`,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    this.scene.add(new T.Mesh(new T.PlaneGeometry(2, 2), this.material));
    this.resize();
  }
  inspect(value: boolean) {
    this.inspecting = value;
    this.resize();
  }
  resize() {
    const w = innerWidth,
      h = innerHeight;
    this.renderer.setSize(w, h, false);
    const ratio = Math.min(1, (this.inspecting ? 1440 : 960) / w, 900 / h);
    this.target.setSize(Math.round(w * ratio), Math.round(h * ratio));
    this.target.texture.magFilter = T.NearestFilter;
    this.material.uniforms.resolution.value.set(w * ratio, h * ratio);
  }
  render(scene: T.Scene, camera: T.Camera) {
    this.renderer.setRenderTarget(this.target);
    this.renderer.render(scene, camera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.scene, this.camera);
  }
}
