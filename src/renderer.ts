import * as T from 'three';
export class RetroRenderer {
  renderer: T.WebGLRenderer;
  target: T.WebGLRenderTarget;
  scene = new T.Scene();
  camera = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  material: T.ShaderMaterial;
  inspecting = false;
  softwareRendering: boolean;
  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new T.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(1);
    const gl = this.renderer.getContext();
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const device = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
    this.softwareRendering = /swiftshader|llvmpipe|softpipe|software/i.test(device);
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
    const widthLimit = this.softwareRendering
      ? this.inspecting
        ? 960
        : 480
      : this.inspecting
        ? 1440
        : 960;
    const ratio = Math.min(1, widthLimit / w, 900 / h);
    // The final shader must use the same reduced buffer on a software device;
    // reducing only the scene target still rasterizes the whole display twice.
    this.renderer.setSize(
      Math.round(w * (this.softwareRendering ? ratio : 1)),
      Math.round(h * (this.softwareRendering ? ratio : 1)),
      false,
    );
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
