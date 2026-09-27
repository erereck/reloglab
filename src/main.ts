import './style.css';
import * as T from 'three';
import { Archive } from './state';
import { Installation, ROOMS } from './world';
import { Terminal, type Target, type Station } from './screens';
import { DepartmentAudio } from './audio';
import { RetroRenderer } from './renderer';
import { Registrar } from './registrar';

const $ = <E extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as E;
const canvas = $<HTMLCanvasElement>('world');
const input = $<HTMLInputElement>('terminal-input');
const archive = new Archive();
const audio = new DepartmentAudio();
const keys = new Set<string>();
const camera = new T.PerspectiveCamera(58, innerWidth / innerHeight, 0.05, 85);
camera.rotation.order = 'YXZ';
const player = new T.Vector3(1.5, 1.68, 17.4);
let yaw = 0.27,
  pitch = 0.055;
let world: Installation;
let renderer: RetroRenderer;
let terminals: Terminal[] = [];
let operating: Terminal | null = null;
let returnPosition = new T.Vector3();
let cameraDestination = new T.Vector3();
let nearest: { terminal?: Terminal; logId?: string; logout?: boolean; distance: number } | null =
  null;
let carried: string | null = null;
let lookDrag: {
  id: number;
  x: number;
  y: number;
  total: number;
  initialX: number;
  initialY: number;
} | null = null;
let terminalDrag: {
  id: number;
  target: Target;
  x: number;
  y: number;
  initial: { x: number; z: number };
  moved: boolean;
} | null = null;
let stick: { id: number; x: number; y: number } | null = null;
let touchX = 0,
  touchY = 0;
let clock = performance.now(),
  time = 0,
  bob = 0,
  stepDistance = 0,
  uiAccumulator = 0,
  syncAccumulator = 0;
let logSignature = '',
  lastSector = '';
let lastSession = archive.session;
let accountKey = '';
let logoutHandle: T.Mesh;
let registrar: Registrar;
const raycaster = new T.Raycaster();
const mouse = new T.Vector2();
const survey = $<HTMLCanvasElement>('survey').getContext('2d')!;
const moving = new T.Vector3();

function announce(message: string) {
  $('screen-reader').textContent = message;
}
function clearMovement() {
  keys.clear();
  moving.set(0, 0, 0);
  touchX = touchY = 0;
  stick = null;
  $('stick').querySelector('i')!.setAttribute('style', '');
}
function fatal(message: string) {
  $('boot').classList.add('loaded');
  $('fatal-message').textContent = message;
  $('fatal').hidden = false;
}
function cameraForTerminal(t: Terminal) {
  const usable = innerWidth < 650 ? 0.58 : 0.67;
  const halfAngle = T.MathUtils.degToRad(camera.fov / 2);
  const distance = Math.max(
    t.mount.height / (2 * Math.tan(halfAngle) * usable),
    t.mount.width / (2 * Math.tan(halfAngle) * camera.aspect * 0.87),
  );
  cameraDestination
    .copy(t.mount.position)
    .add(new T.Vector3(Math.sin(t.mount.angle) * distance, 0, Math.cos(t.mount.angle) * distance));
}
function enter(t: Terminal) {
  if (operating === t) return;
  if (carried) dropCrate();
  audio.start();
  audio.beep();
  clearMovement();
  returnPosition.copy(player);
  operating = t;
  t.cursor = 0;
  t.activeField = null;
  t.paint();
  cameraForTerminal(t);
  renderer.inspect(true);
  document.exitPointerLock?.();
  document.body.classList.add('operating');
  $('movement-hint').innerHTML = t.mobile
    ? 'TERMINAL EM OPERAÇÃO <span>toque nos campos para digitar · VOLTAR para levantar</span>'
    : 'TERMINAL EM OPERAÇÃO <span>clique nos campos · Tab selecionar · Enter operar · Esc levantar</span>';
  $('interaction').textContent = '';
  announce(
    t.canvas ? `${t.kind}: ${t.targets.map((x) => x.label).join('. ')}` : 'Terminal em operação.',
  );
}
function finishInput() {
  if (!operating) return;
  operating.activeField = null;
  input.blur();
  operating.paint();
}
function leave() {
  if (!operating) return;
  finishInput();
  operating = null;
  terminalDrag = null;
  player.copy(returnPosition);
  renderer.inspect(false);
  camera.position.copy(player);
  camera.rotation.set(pitch, yaw, 0, 'YXZ');
  document.body.classList.remove('operating', 'dragging');
  clearMovement();
  updateCaptureHint();
}
function updateCaptureHint() {
  if (operating) return;
  const locked = document.pointerLockElement === canvas;
  const coarse = matchMedia('(pointer:coarse)').matches;
  $('movement-hint').innerHTML = coarse
    ? 'EXPLORE A INSTALAÇÃO <span>joystick mover · arraste olhar · E operar um objeto</span>'
    : locked
      ? 'WASD MOVER · SHIFT CORRER · E OPERAR <span>Esc libera o mouse · setas também movem e viram</span>'
      : 'CLIQUE NO AMBIENTE PARA ENTRAR <span>WASD mover · mouse olhar · E operar · Esc liberar</span>';
}
async function capture() {
  audio.start();
  canvas.focus();
  if (matchMedia('(pointer:coarse)').matches) return;
  try {
    await canvas.requestPointerLock();
  } catch {
    $('movement-hint').innerHTML =
      'ARRASTE O MOUSE PARA OLHAR <span>WASD mover · setas virar · E operar · Esc liberar</span>';
  }
}
function cast(x?: number, y?: number) {
  mouse.set(x == null ? 0 : (x / innerWidth) * 2 - 1, y == null ? 0 : 1 - (y / innerHeight) * 2);
  raycaster.setFromCamera(mouse, camera);
}
function findObject(x?: number, y?: number) {
  cast(x, y);
  const hit = raycaster
    .intersectObjects(world.scene.children, true)
    .find((h) => h.object instanceof T.Mesh);
  if (!hit || hit.distance > 5.2) return null;
  const t = terminals.find((t) => t.mount.mesh === hit.object);
  if (t) return { terminal: t, distance: hit.distance };
  const logId = hit.object.userData.logId as string | undefined;
  if (logId && archive.session) return { logId, distance: hit.distance };
  if (hit.object === logoutHandle && archive.session)
    return { logout: true, distance: hit.distance };
  return null;
}
function terminalCoords(x: number, y: number) {
  if (!operating) return null;
  cast(x, y);
  const mesh = operating.mount.mesh;
  const normal = new T.Vector3(0, 0, 1).applyQuaternion(
    mesh.getWorldQuaternion(new T.Quaternion()),
  );
  const plane = new T.Plane().setFromNormalAndCoplanarPoint(
    normal,
    mesh.getWorldPosition(new T.Vector3()),
  );
  const point = raycaster.ray.intersectPlane(plane, new T.Vector3());
  if (!point) return null;
  mesh.worldToLocal(point);
  return {
    x: (point.x / operating.mount.width + 0.5) * 1024,
    y: (0.5 - point.y / operating.mount.height) * operating.canvas.height,
  };
}
function dropCrate() {
  if (!carried) return;
  const g = world.crates.find((g) => g.userData.logId === carried);
  if (g) archive.data.positions[carried] = { x: g.position.x, z: g.position.z };
  carried = null;
  archive.persist();
  audio.beep();
  announce('Bloco posicionado no terreno.');
}
function use(object?: typeof nearest) {
  registrar?.stamp();
  if (operating) {
    if (!operating.activeField) leave();
    return;
  }
  if (carried) {
    dropCrate();
    return;
  }
  nearest = object || findObject();
  if (nearest?.terminal) enter(nearest.terminal);
  else if (nearest?.logId) {
    carried = nearest.logId;
    audio.beep();
    announce('Bloco carregado. Mova-se e pressione E para posicionar.');
  } else if (nearest?.logout) {
    archive.signOut();
    leave();
    carried = null;
    player.set(1.5, 1.68, 17.4);
    yaw = 0.27;
    pitch = 0.055;
    camera.position.copy(player);
    camera.rotation.set(pitch, yaw, 0, 'YXZ');
    terminals[0].mode = 'login';
    terminals[0].fields.username = archive.data.account?.username || '';
    terminals[0].message =
      'Sessão encerrada pela manutenção. Os registros permanecem sob custódia.';
    terminals[0].paint();
    audio.beep();
    announce('Sessão encerrada. Você retornou à recepção.');
  }
}
function syncWorld() {
  if (!world) return;
  if (lastSession && !archive.session) {
    leave();
    carried = null;
    archive.selectedGame = null;
    player.set(1.5, 1.68, 17.4);
    yaw = 0.27;
    pitch = 0.055;
    camera.position.copy(player);
    camera.rotation.set(pitch, yaw, 0, 'YXZ');
    terminals[0].mode = archive.data.account ? 'login' : '';
    terminals[0].message = '';
    terminals[0].fields.username = archive.data.account?.username || '';
    terminals[0].fields.password = '';
    terminals[0].fields.confirm = '';
  }
  lastSession = archive.session;
  const currentAccount = archive.data.account,
    signatureAccount = currentAccount
      ? `${currentAccount.memberNo}:${currentAccount.username}`
      : '';
  if (accountKey !== signatureAccount) {
    accountKey = signatureAccount;
    const settings = terminals.find((t) => t.kind === 'settings')!;
    settings.fields.bio = currentAccount?.bio || '';
    settings.fields.favoriteGenre = currentAccount?.favoriteGenre || 'Não informado';
    for (const kind of ['profile', 'log'] as const) {
      const t = terminals.find((t) => t.kind === kind)!;
      t.mode = '';
      t.editId = null;
      t.message = '';
      t.deletion = 0;
      Object.assign(t.fields, {
        note: '',
        date: new Date().toLocaleDateString('en-CA'),
        rating: '',
        status: 'played',
        replay: '0',
      });
    }
  }
  const signature = JSON.stringify(archive.data.logs);
  if (logSignature !== signature) {
    logSignature = signature;
    world.rebuildCrates();
  } else
    world.crates.forEach((g, i) => {
      const log = archive.data.logs.find((l) => l.id === g.userData.logId);
      if (log) {
        const p = archive.position(log, i);
        world.moveCrate(log.id, p.x, p.z);
      }
    });
  audio.setQuiet(archive.data.preferences.quiet);
  world.updateAccount();
  $('credential').textContent = archive.session
    ? archive.data.account!.username.toUpperCase()
    : 'VISITANTE';
  $('member-no').textContent = archive.session
    ? 'MEMBRO Nº ' + archive.data.account!.memberNo
    : 'ACESSO NÃO HOMOLOGADO';
  $('log-count').textContent = String(archive.data.logs.length).padStart(3, '0');
  $('objective').textContent = !archive.session
    ? 'Apresente-se ao terminal da recepção.'
    : archive.selectedGame
      ? 'Leve o título ao protocolo / setor 03.'
      : archive.data.logs.length
        ? 'Seu arquivo está homologado. Explore os setores.'
        : 'Separe um título no arquivo / setor 02.';
  $('procedure').textContent = !archive.storageAvailable
    ? 'Armazenamento indisponível. Exporte antes de sair.'
    : archive.selectedGame
      ? 'EM TRÂNSITO: ' + archive.selectedGame[0]
      : 'Nenhum formulário sai deste navegador.';
  terminals.forEach((t) => t.paint());
}
function drawSurvey() {
  const c = survey;
  const scale = 2.1,
    ox = 86,
    oz = 61;
  c.fillStyle = '#0e1411';
  c.fillRect(0, 0, 172, 112);
  c.lineWidth = 1;
  const sector = world.sector(player.x, player.z);
  ROOMS.forEach((r) => {
    const x = ox + (r.x - r.w / 2) * scale,
      z = oz + (r.z - r.d / 2) * scale;
    c.fillStyle = r.id === sector.id ? '#394c37' : '#202b22';
    c.strokeStyle = '#657259';
    c.fillRect(x, z, r.w * scale, r.d * scale);
    c.strokeRect(x, z, r.w * scale, r.d * scale);
    c.fillStyle = r.id === sector.id ? '#dab377' : '#819375';
    c.font = '7px monospace';
    c.textAlign = 'center';
    c.fillText(r.number, ox + r.x * scale, oz + r.z * scale + 2);
  });
  const x = ox + player.x * scale,
    z = oz + player.z * scale;
  c.save();
  c.translate(x, z);
  c.rotate(-yaw);
  c.fillStyle = '#efb86b';
  c.beginPath();
  c.moveTo(0, -5);
  c.lineTo(3, 3);
  c.lineTo(0, 1);
  c.lineTo(-3, 3);
  c.closePath();
  c.fill();
  c.restore();
  c.fillStyle = '#8a967e';
  c.textAlign = 'left';
  c.font = '6px monospace';
  c.fillText('PLANTA NÃO VINCULANTE', 8, 10);
}
function updateUI() {
  const sector = world.sector(player.x, player.z);
  if (lastSector !== sector.id) {
    lastSector = sector.id;
    $('sector-name').textContent = sector.number + ' / ' + sector.name;
  }
  if (!operating) {
    nearest = findObject();
    const label = carried
      ? 'POSICIONAR BLOCO'
      : nearest?.terminal
        ? 'OPERAR / ' + nearest.terminal.kind.toUpperCase()
        : nearest?.logId
          ? 'CARREGAR REGISTRO'
          : nearest?.logout
            ? 'ENCERRAR SESSÃO'
            : '';
    $('interaction').innerHTML = label ? '<kbd>E</kbd>' + label : '';
    $('crosshair').style.opacity = label ? '1' : '.55';
    registrar.status(
      carried
        ? 'EM TRANSPORTE'
        : nearest?.terminal
          ? 'E / OPERAR'
          : nearest?.logId
            ? 'E / CARREGAR'
            : nearest?.logout
              ? 'E / DESENERGIZAR'
              : 'SEM REQUERIMENTO',
    );
  }
  drawSurvey();
}
function animate(now: number) {
  const dt = Math.min(0.05, (now - clock) / 1000);
  clock = now;
  time += dt;
  if (operating) {
    if (archive.data.preferences.reducedMotion) camera.position.copy(cameraDestination);
    else camera.position.lerp(cameraDestination, 1 - Math.exp(-dt * 12));
    camera.lookAt(operating.mount.position);
  } else {
    if (keys.has('ArrowLeft')) yaw += dt * 1.7;
    if (keys.has('ArrowRight')) yaw -= dt * 1.7;
    if (keys.has('PageUp')) pitch = T.MathUtils.clamp(pitch + dt * 1.2, -1.2, 1.2);
    if (keys.has('PageDown')) pitch = T.MathUtils.clamp(pitch - dt * 1.2, -1.2, 1.2);
    let forward =
      (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) -
      (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) -
      touchY;
    let strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0) + touchX;
    const magnitude = Math.max(1, Math.hypot(forward, strafe));
    forward /= magnitude;
    strafe /= magnitude;
    const speed = keys.has('ShiftLeft') || keys.has('ShiftRight') ? 6.2 : 3.8;
    const dx = (-Math.sin(yaw) * forward + Math.cos(yaw) * strafe) * speed,
      dz = (-Math.cos(yaw) * forward - Math.sin(yaw) * strafe) * speed;
    moving.x = T.MathUtils.damp(moving.x, dx, 13, dt);
    moving.z = T.MathUtils.damp(moving.z, dz, 13, dt);
    const oldX = player.x,
      oldZ = player.z;
    if (world.canMove(player.x + moving.x * dt, player.z)) player.x += moving.x * dt;
    else moving.x = 0;
    if (world.canMove(player.x, player.z + moving.z * dt)) player.z += moving.z * dt;
    else moving.z = 0;
    const distance = Math.hypot(player.x - oldX, player.z - oldZ);
    bob += distance * 6;
    stepDistance += distance;
    if (stepDistance > 0.95) {
      audio.step();
      stepDistance = 0;
    }
    camera.position.copy(player);
    if (!archive.data.preferences.reducedMotion)
      camera.position.y += Math.sin(bob) * Math.min(distance / dt, 0.025) * 0.85;
    camera.rotation.set(pitch, yaw, 0, 'YXZ');
    if (carried) {
      const x = T.MathUtils.clamp(player.x - Math.sin(yaw) * 1.7, -7.5, -0.5),
        z = T.MathUtils.clamp(player.z - Math.cos(yaw) * 1.7, -21.5, -11);
      world.moveCrate(carried, x, z);
    }
  }
  world.update(dt, time);
  registrar.update(dt, bob, !operating, archive.data.preferences.reducedMotion);
  syncAccumulator += dt;
  if (syncAccumulator > 0.15) {
    terminals.find((t) => t.kind === 'sync')!.tick(syncAccumulator);
    syncAccumulator = 0;
  }
  uiAccumulator += dt;
  if (uiAccumulator > 0.1) {
    updateUI();
    uiAccumulator = 0;
  }
  renderer.render(world.scene, camera);
  requestAnimationFrame(animate);
}

async function boot() {
  await document.fonts.load('400 20px Dept');
  await document.fonts.ready;
  renderer = new RetroRenderer(canvas);
  world = new Installation(archive);
  registrar = new Registrar(camera, world.scene);
  const configs: [Station, number, number, number?][] = [
    ['reception', -3.8, 10.4],
    ['catalog', -19.5, -4.7],
    ['log', 12.3, -4.7],
    ['profile', -4, -22.7],
    ['stats', 6, -22.7],
    ['sync', 0, 2.25],
    ['settings', 16.5, -13.5],
    ['maintenance', 12.3, -20, Math.PI / 2],
  ];
  terminals = configs.map(([kind, x, z, angle]) => {
    const t = new Terminal(kind, archive);
    t.mount = world.mount(
      t.canvas,
      x,
      z,
      angle ?? 0,
      kind === 'sync' ? 2.6 : 3.4,
      t.mobile ? 3.9 : kind === 'sync' ? 1.95 : 2.55,
    );
    t.onInput = (screen, key) => {
      input.type = ['password', 'confirm'].includes(key) ? 'password' : 'text';
      input.inputMode = key === 'date' ? 'numeric' : 'text';
      input.maxLength =
        (
          {
            username: 18,
            password: 64,
            confirm: 64,
            search: 100,
            note: 180,
            bio: 140,
            date: 10,
          } as Record<string, number>
        )[key] || 180;
      input.value = screen.fields[key] || '';
      input.setAttribute(
        'aria-label',
        (
          {
            username: 'Nome de usuário',
            password: 'Senha fictícia',
            confirm: 'Confirme a senha fictícia',
            search: 'Pesquisa por nome',
            date: 'Data do registro',
            note: 'Observação do registro',
            bio: 'Apresentação do perfil',
          } as Record<string, string>
        )[key],
      );
      input.focus({ preventScroll: true });
      input.select();
    };
    t.onFeedback = (message) => {
      audio.beep(t.error);
      announce(message);
    };
    t.onChange = syncWorld;
    t.onReceipt = () => world.printReceipt();
    t.paint();
    return t;
  });
  logoutHandle = world.box(0.22, 0.28, 0.12, 20.9, 1.23, -23.52, 'rust');
  world.plaque(['DESENERGIZAR'], 1, 0.19, 20.9, 0.82, -23.59, 0, '#778772', '#26372b');
  world.optimizeStatic([logoutHandle]);
  archive.onChange = syncWorld;
  syncWorld();
  camera.position.copy(player);
  camera.rotation.set(pitch, yaw, 0, 'YXZ');
  if (import.meta.env.DEV) {
    (window as unknown as Record<string, unknown>).__RELOGLAB__ = {
      snapshot: () => ({
        position: player.toArray(),
        yaw,
        pitch,
        sector: lastSector,
        station: operating?.kind || null,
        session: archive.session,
        carried,
        data: structuredClone(archive.data),
        selectedGame: archive.selectedGame,
        gate: world.gateLift,
        storageAvailable: archive.storageAvailable,
        syncPercent: terminals.find((t) => t.kind === 'sync')!.syncing,
        batchedDraws: world.batchedDraws,
      }),
      project: (x: number, y: number, z: number) => {
        const p = new T.Vector3(x, y, z).project(camera);
        return { x: ((p.x + 1) * innerWidth) / 2, y: ((1 - p.y) * innerHeight) / 2 };
      },
      targets: () =>
        operating?.targets.map((t) => {
          const point = new T.Vector3(
            ((t.x + t.w / 2) / 1024) * operating!.mount.width - operating!.mount.width / 2,
            operating!.mount.height / 2 -
              ((t.y + t.h / 2) / operating!.canvas.height) * operating!.mount.height,
            0,
          );
          operating!.mount.mesh.localToWorld(point);
          point.project(camera);
          return {
            label: t.label,
            field: t.field,
            logId: t.logId,
            x: ((point.x + 1) * innerWidth) / 2,
            y: ((1 - point.y) * innerHeight) / 2,
          };
        }) || [],
      screen: () => operating?.canvas.toDataURL(),
    };
  }
  $('boot').classList.add('loaded');
  updateCaptureHint();
  clock = performance.now();
  requestAnimationFrame(animate);
}

input.addEventListener('input', () => {
  if (operating?.activeField) {
    operating.fields[operating.activeField] = input.value;
    operating.paint();
  }
});
input.addEventListener('blur', () => {
  if (operating?.activeField) {
    operating.activeField = null;
    operating.paint();
  }
});
window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape') {
    e.preventDefault();
    if (operating) leave();
    else if (carried) dropCrate();
    clearMovement();
    return;
  }
  if (operating) {
    if (e.code === 'Tab') {
      e.preventDefault();
      finishInput();
      operating.next(e.shiftKey ? -1 : 1);
      announce(operating.targets[operating.cursor]?.label || 'Terminal');
      return;
    }
    if (e.code === 'Enter') {
      e.preventDefault();
      if (operating.activeField) {
        finishInput();
        operating.next();
      } else {
        audio.beep();
        operating.activate();
      }
      return;
    }
    if (operating.activeField) return;
    if (e.code === 'ArrowDown' || e.code === 'ArrowRight') {
      e.preventDefault();
      operating.next();
    }
    if (e.code === 'ArrowUp' || e.code === 'ArrowLeft') {
      e.preventDefault();
      operating.next(-1);
    }
    if (e.code === 'KeyE') {
      e.preventDefault();
      leave();
    }
    return;
  }
  if (
    [
      'KeyW',
      'KeyA',
      'KeyS',
      'KeyD',
      'ArrowUp',
      'ArrowDown',
      'ArrowLeft',
      'ArrowRight',
      'PageUp',
      'PageDown',
      'ShiftLeft',
      'ShiftRight',
      'Space',
      'KeyE',
    ].includes(e.code)
  ) {
    e.preventDefault();
    audio.start();
    if (e.code === 'KeyE' && !e.repeat) use();
    else keys.add(e.code);
  }
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', clearMovement);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    clearMovement();
    if (terminalDrag) {
      archive.persist();
      terminalDrag = null;
    }
  }
});
document.addEventListener('pointerlockchange', () => {
  clearMovement();
  updateCaptureHint();
});
document.addEventListener('mousemove', (e) => {
  if (!operating && document.pointerLockElement === canvas) {
    yaw -= e.movementX * 0.0022;
    pitch = T.MathUtils.clamp(pitch - e.movementY * 0.0022, -1.2, 1.2);
  }
});
canvas.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  audio.start();
  if (operating) {
    e.preventDefault();
    const p = terminalCoords(e.clientX, e.clientY),
      target = p ? operating.hit(p.x, p.y) : null;
    if (!target) return;
    if (operating.activeField && operating.activeField !== target.field) finishInput();
    operating.select(target);
    if (target.logId) {
      const log = archive.data.logs.find((l) => l.id === target.logId)!;
      const i = archive.data.logs.indexOf(log);
      terminalDrag = {
        id: e.pointerId,
        target,
        x: p!.x,
        y: p!.y,
        initial: { ...archive.position(log, i) },
        moved: false,
      };
      canvas.setPointerCapture(e.pointerId);
    } else {
      audio.beep();
      target.action();
    }
    return;
  }
  if (e.pointerType === 'touch') {
    lookDrag = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      initialX: e.clientX,
      initialY: e.clientY,
      total: 0,
    };
    canvas.setPointerCapture(e.pointerId);
    return;
  }
  if (document.pointerLockElement === canvas) {
    use();
    return;
  }
  const object = findObject(e.clientX, e.clientY);
  if (object?.terminal) enter(object.terminal);
  else if (object?.logout) {
    use(object);
  } else {
    lookDrag = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      initialX: e.clientX,
      initialY: e.clientY,
      total: 0,
    };
    void capture();
  }
});
canvas.addEventListener('pointermove', (e) => {
  if (operating) {
    const p = terminalCoords(e.clientX, e.clientY);
    if (!p) return;
    if (terminalDrag && terminalDrag.id === e.pointerId) {
      const dx = p.x - terminalDrag.x,
        dy = p.y - terminalDrag.y;
      terminalDrag.moved ||= Math.hypot(dx, dy) > 8;
      if (terminalDrag.moved) {
        document.body.classList.add('dragging');
        operating.drag(terminalDrag.target.logId!, dx, dy, terminalDrag.initial);
      }
    } else if (!operating.activeField) {
      const target = operating.hit(p.x, p.y);
      canvas.style.cursor = target ? 'pointer' : 'default';
      if (target && operating.cursor !== operating.targets.indexOf(target))
        operating.select(target);
    }
    return;
  }
  if (lookDrag && lookDrag.id === e.pointerId && document.pointerLockElement !== canvas) {
    const dx = e.clientX - lookDrag.x,
      dy = e.clientY - lookDrag.y;
    lookDrag.total += Math.hypot(dx, dy);
    yaw -= dx * 0.004;
    pitch = T.MathUtils.clamp(pitch - dy * 0.004, -1.2, 1.2);
    lookDrag.x = e.clientX;
    lookDrag.y = e.clientY;
  }
});
canvas.addEventListener('pointerup', (e) => {
  if (terminalDrag && terminalDrag.id === e.pointerId) {
    if (terminalDrag.moved) {
      archive.persist();
      audio.beep();
    } else terminalDrag.target.action();
    terminalDrag = null;
    document.body.classList.remove('dragging');
  }
  if (lookDrag?.id === e.pointerId) {
    if (e.pointerType === 'touch' && lookDrag.total < 10) {
      const object = findObject(e.clientX, e.clientY);
      if (object?.terminal) enter(object.terminal);
      else if (object?.logId || object?.logout) {
        use(object);
      }
    }
    lookDrag = null;
  }
});
canvas.addEventListener('pointercancel', () => {
  lookDrag = null;
  if (terminalDrag) {
    archive.persist();
    terminalDrag = null;
  }
  document.body.classList.remove('dragging');
});
$('stick').addEventListener('pointerdown', (e) => {
  const p = e as PointerEvent;
  audio.start();
  stick = { id: p.pointerId, x: p.clientX, y: p.clientY };
  $('stick').setPointerCapture(p.pointerId);
});
$('stick').addEventListener('pointermove', (e) => {
  const p = e as PointerEvent;
  if (stick?.id !== p.pointerId) return;
  const dx = p.clientX - stick.x,
    dy = p.clientY - stick.y,
    length = Math.max(38, Math.hypot(dx, dy));
  touchX = dx / length;
  touchY = dy / length;
  $('stick')
    .querySelector('i')!
    .setAttribute('style', `transform:translate(${touchX * 30}px,${touchY * 30}px)`);
});
for (const event of ['pointerup', 'pointercancel'])
  $('stick').addEventListener(event, () => {
    stick = null;
    touchX = touchY = 0;
    $('stick').querySelector('i')!.setAttribute('style', '');
  });
$('touch-use').addEventListener('click', () => use());
$('touch-exit').addEventListener('click', leave);
$<HTMLInputElement>('import-file').addEventListener('change', async (e) => {
  const element = e.target as HTMLInputElement,
    file = element.files?.[0];
  if (!file) return;
  const maintenance = terminals.find((t) => t.kind === 'maintenance')!;
  try {
    if (file.size > 5_000_000) throw new Error('Arquivo maior que 5 MB.');
    const raw = JSON.parse(await file.text());
    archive.import(raw);
    terminals[0].mode = 'login';
    terminals[0].fields.username = archive.data.account?.username || '';
    const settings = terminals.find((t) => t.kind === 'settings')!;
    settings.fields.bio = archive.data.account?.bio || '';
    settings.fields.favoriteGenre = archive.data.account?.favoriteGenre || 'Não informado';
    maintenance.status(
      'Arquivo transferido. A sessão foi encerrada; entre com a credencial importada na recepção.',
    );
    leave();
    player.set(1.5, 1.68, 17.4);
    yaw = 0.27;
    pitch = 0.055;
    syncWorld();
  } catch (error) {
    maintenance.status(
      'Transferência recusada: ' + (error instanceof Error ? error.message : 'arquivo inválido'),
      true,
    );
  } finally {
    element.value = '';
  }
});
window.addEventListener('resize', () => {
  if (!renderer) return;
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.resize();
  if (operating) cameraForTerminal(operating);
});
canvas.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  fatal(
    'O contexto 3D foi interrompido. Seus registros já protocolados permanecem no navegador. Recarregue para reabrir a instalação.',
  );
});
boot().catch((error) => {
  console.error(error);
  fatal(
    'Este ambiente precisa de WebGL 2 e aceleração gráfica. Verifique se estão habilitados no navegador e tente novamente.',
  );
});
