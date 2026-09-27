import { test, expect, type Page } from '@playwright/test';

const snapshot = (page: Page) => page.evaluate(() => (window as any).__RELOGLAB__.snapshot());
const targets = (page: Page) => page.evaluate(() => (window as any).__RELOGLAB__.targets());
async function hold(page: Page, key: string, ms: number) {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
}
const wrap = (r: number) => Math.atan2(Math.sin(r), Math.cos(r));
async function face(page: Page, x: number, z: number) {
  for (let i = 0; i < 20; i++) {
    const s = await snapshot(page);
    const desired = Math.atan2(-(x - s.position[0]), -(z - s.position[2]));
    const diff = wrap(desired - s.yaw);
    if (Math.abs(diff) < 0.04) return;
    await hold(
      page,
      diff > 0 ? 'ArrowLeft' : 'ArrowRight',
      Math.max(25, Math.min(500, (Math.abs(diff) / 1.7) * 1000)),
    );
  }
  throw new Error('Não foi possível orientar a câmera.');
}
async function walk(page: Page, x: number, z: number) {
  let stalled = 0;
  for (let i = 0; i < 70; i++) {
    const s = await snapshot(page);
    const dist = Math.hypot(x - s.position[0], z - s.position[2]);
    if (dist < 0.24) return;
    await face(page, x, z);
    await page.keyboard.down('Shift');
    await hold(page, 'ArrowUp', Math.max(60, Math.min(500, (dist / 6.2) * 1000)));
    await page.keyboard.up('Shift');
    await page.waitForTimeout(90);
    const after = await snapshot(page);
    const now = Math.hypot(x - after.position[0], z - after.position[2]);
    if (dist - now < 0.01) stalled++;
    else stalled = 0;
    if (stalled > 3)
      throw new Error(`Colisão no caminho de ${JSON.stringify(after.position)} até ${x},${z}`);
  }
  throw new Error(`Caminho excedeu a duração permitida: ${x},${z}`);
}
async function route(page: Page, points: number[][]) {
  for (const [x, z] of points) await walk(page, x, z);
}
async function tilt(page: Page, pitch: number) {
  for (let i = 0; i < 15; i++) {
    const diff = pitch - (await snapshot(page)).pitch;
    if (Math.abs(diff) < 0.03) return;
    await hold(
      page,
      diff > 0 ? 'PageUp' : 'PageDown',
      Math.max(25, Math.min(400, (Math.abs(diff) / 1.2) * 1000)),
    );
  }
  throw new Error('Não foi possível inclinar a câmera.');
}
async function station(page: Page, x: number, z: number, name: string) {
  await face(page, x, z);
  await page.keyboard.press('KeyE');
  await expect.poll(async () => (await snapshot(page)).station).toBe(name);
  await page.waitForTimeout(600);
}
async function click(page: Page, label: string) {
  const target = (await targets(page)).find((t: any) => !t.field && t.label.includes(label));
  expect(target, `Alvo: ${label}`).toBeTruthy();
  await page.mouse.click(target.x, target.y);
  await page.waitForTimeout(100);
}
async function fill(page: Page, field: string, value: string) {
  const target = (await targets(page)).find((t: any) => t.field === field);
  expect(target, `Campo: ${field}`).toBeTruthy();
  await page.mouse.click(target.x, target.y);
  await page.locator('#terminal-input').fill(value);
  await page.keyboard.press('Enter');
}
async function leave(page: Page) {
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await snapshot(page)).station).toBe(null);
}

test('o procedimento completo ocorre dentro do mundo e persiste', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto('/');
  await expect
    .poll(async () => await page.evaluate(() => !!(window as any).__RELOGLAB__))
    .toBe(true);
  await expect(page.locator('#boot')).toHaveCSS('opacity', '0');
  await page.screenshot({ path: info.outputPath('00-recepcao.png') });
  console.log('Instalação 3D inicializada.');
  await route(page, [[-3.8, 14.4]]);
  await station(page, -3.8, 10.4, 'reception');
  await fill(page, 'username', 'arquivista');
  await fill(page, 'password', 'senha-falsa');
  await fill(page, 'confirm', 'senha-falsa');
  await click(page, 'VALIDAR');
  await expect(page.locator('#screen-reader')).toContainText('esta senha já está sendo usada');
  expect((await snapshot(page)).session).toBe(false);
  await fill(page, 'password', 'segunda-falsa');
  await fill(page, 'confirm', 'segunda-falsa');
  await click(page, 'VALIDAR');
  expect((await snapshot(page)).data.account.username).toBe('arquivista');
  expect((await snapshot(page)).session).toBe(false);
  await fill(page, 'password', 'terceira-falsa');
  await click(page, 'ENTRAR');
  await expect.poll(async () => (await snapshot(page)).session).toBe(true);
  await page.screenshot({ path: info.outputPath('01-credencial.png') });
  await leave(page);
  await route(page, [
    [0, 11],
    [0, 6],
    [-5, 3.8],
    [-6, 0],
    [-12, 0],
    [-19.5, -1.2],
  ]);
  await station(page, -19.5, -4.7, 'catalog');
  await fill(page, 'search', 'DOOM');
  await click(page, 'PESQUISAR');
  await click(page, 'EXATO: NÃO');
  await click(page, 'DOOM');
  expect((await snapshot(page)).selectedGame[0]).toBe('DOOM');
  await page.screenshot({ path: info.outputPath('02-arquivo.png') });
  console.log('Cadastro, login, porta e pesquisa exata verificados.');
  await leave(page);
  await route(page, [
    [-12, 0],
    [-6, 0],
    [-5, 3.8],
    [5, 3.8],
    [6, 0],
    [12, 0],
    [12.3, -1.1],
  ]);
  await station(page, 12.3, -4.7, 'log');
  await click(page, 'Jogado');
  for (let i = 0; i < 9; i++) await click(page, i === 0 ? 'Sem nota' : `${i - 1} / 10`);
  await fill(page, 'note', 'Concluído sem negociar com a repartição.');
  await click(page, 'Pretendo rejogar');
  await click(page, 'PROTOCOLAR');
  let s = await snapshot(page);
  expect(s.data.logs).toHaveLength(1);
  expect(s.data.logs[0]).toMatchObject({
    game: 'DOOM',
    rating: '8',
    status: 'completed',
    replay: true,
    note: 'Concluído sem negociar com a repartição.',
  });
  expect(s.station).toBe('log');
  const persisted = await page.evaluate(() => localStorage.getItem('reloglab.v1'));
  expect(persisted).not.toContain('senha');
  await page.screenshot({ path: info.outputPath('03-protocolo.png') });
  await leave(page);
  await route(page, [
    [12, 0],
    [6, 0],
    [5, 3.8],
    [0, 6],
  ]);
  await station(page, 0, 2.25, 'sync');
  await click(page, 'SOLICITAR NOVA');
  expect((await snapshot(page)).syncPercent).toBeLessThan(74);
  await expect.poll(async () => (await snapshot(page)).syncPercent).toBe(74);
  await leave(page);
  await route(page, [
    [-5, 3.8],
    [-5, -5],
    [-4, -10],
    [-4, -19.2],
  ]);
  await station(page, -4, -22.7, 'profile');
  const tile = (await targets(page)).find((t: any) => t.logId);
  expect(tile).toBeTruthy();
  await page.mouse.move(tile.x, tile.y);
  await page.mouse.down();
  await page.mouse.move(tile.x + 95, tile.y + 54, { steps: 12 });
  await page.mouse.up();
  s = await snapshot(page);
  const id = s.data.logs[0].id;
  expect(s.data.positions[id]).toBeTruthy();
  await page.screenshot({ path: info.outputPath('04-terreno.png') });
  await click(page, 'INSPECIONAR TODOS');
  await click(page, 'DOOM');
  await click(page, '8 / 10');
  await fill(page, 'note', 'Observação retificada no terreno.');
  await click(page, 'SALVAR ALTERAÇÃO');
  expect((await snapshot(page)).data.logs[0]).toMatchObject({
    rating: '9',
    note: 'Observação retificada no terreno.',
  });
  console.log('Protocolo, arraste persistente e edição verificados.');
  await leave(page);
  const placement = (await snapshot(page)).data.positions[id];
  await walk(page, placement.x, placement.z - 3);
  await face(page, placement.x, placement.z);
  let p = (await snapshot(page)).position;
  await tilt(page, Math.atan2(0.34 - p[1], Math.hypot(placement.x - p[0], placement.z - p[2])));
  await page.keyboard.press('KeyE');
  expect((await snapshot(page)).carried).toBe(id);
  await walk(page, -5.5, -15);
  await page.keyboard.press('KeyE');
  expect((await snapshot(page)).carried).toBe(null);
  await tilt(page, 0.055);
  await route(page, [
    [-4, -10],
    [-4, -5],
    [6, -5],
    [6, -10],
    [6, -19.2],
  ]);
  await station(page, 6, -22.7, 'stats');
  await page.screenshot({ path: info.outputPath('05-estatistica.png') });
  await leave(page);
  await route(page, [
    [6, -10],
    [6, -5],
    [-6, -5],
    [-6, 0],
    [-12, 0],
    [-16, 0],
    [-16, -10],
  ]);
  expect((await snapshot(page)).sector).toBe('faq');
  await face(page, -22.72, -8.3);
  await page.screenshot({ path: info.outputPath('06-ajuda.png') });
  await route(page, [
    [-16, 0],
    [-12, 0],
    [-6, 0],
    [-5, 3.8],
    [5, 3.8],
    [6, 0],
    [12, 0],
    [17, 0],
    [16.5, -10.1],
  ]);
  await station(page, 16.5, -13.5, 'settings');
  await fill(page, 'bio', 'Arquivo seriamente questionável.');
  await click(page, 'Padrão do departamento');
  await click(page, 'SOM: LIGADO');
  await click(page, 'SALVAR INFORMAÇÕES');
  expect((await snapshot(page)).data.account.bio).toBe('Arquivo seriamente questionável.');
  expect((await snapshot(page)).data.preferences).toMatchObject({ theme: 1, quiet: true });
  await page.screenshot({ path: info.outputPath('07-preferencias.png') });
  await leave(page);
  await route(page, [
    [19.4, -10],
    [19.4, -16],
    [15.5, -20],
  ]);
  await station(page, 12.3, -20, 'maintenance');
  const downloadPromise = page.waitForEvent('download');
  await click(page, 'EXPORTAR');
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('reloglab-arquivo.json');
  await download.saveAs(info.outputPath('reloglab-arquivo.json'));
  await leave(page);
  await route(page, [
    [19.4, -20],
    [20.9, -22.1],
  ]);
  await face(page, 20.9, -23.52);
  p = (await snapshot(page)).position;
  await tilt(page, Math.atan2(1.23 - p[1], Math.hypot(20.9 - p[0], -23.52 - p[2])));
  await page.keyboard.press('KeyE');
  await expect.poll(async () => (await snapshot(page)).session).toBe(false);
  expect((await snapshot(page)).data.logs).toHaveLength(1);
  expect((await snapshot(page)).position[2]).toBeGreaterThan(15);
  await page.reload();
  await expect
    .poll(async () => await page.evaluate(() => !!(window as any).__RELOGLAB__))
    .toBe(true);
  expect((await snapshot(page)).data.logs[0].rating).toBe('9');
  expect((await snapshot(page)).data.positions[id]).toBeTruthy();
  expect(errors).toEqual([]);
  console.log(
    'Todos os setores, exportação, saída escondida e persistência após reload verificados.',
  );
});

test('celular: movimento por joystick, leitura e operação no terminal', async ({
  browser,
}, info) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  await page.goto('/');
  await expect
    .poll(async () => await page.evaluate(() => !!(window as any).__RELOGLAB__))
    .toBe(true);
  await expect(page.locator('#touch-controls')).toBeVisible();
  await page.screenshot({ path: info.outputPath('mobile-recepcao.png') });
  const before = (await snapshot(page)).position;
  await page.locator('#stick').dispatchEvent('pointerdown', {
    pointerId: 1,
    clientX: 65,
    clientY: 650,
    pointerType: 'touch',
  });
  await page.locator('#stick').dispatchEvent('pointermove', {
    pointerId: 1,
    clientX: 65,
    clientY: 605,
    pointerType: 'touch',
  });
  await page.waitForTimeout(700);
  await page.locator('#stick').dispatchEvent('pointerup', { pointerId: 1, pointerType: 'touch' });
  expect((await snapshot(page)).position[2]).toBeLessThan(before[2] - 0.5);
  await route(page, [[-3.8, 14.4]]);
  await station(page, -3.8, 10.4, 'reception');
  await fill(page, 'username', 'mobile');
  await fill(page, 'password', 'falso');
  await fill(page, 'confirm', 'falso');
  await click(page, 'VALIDAR');
  await expect(page.locator('#screen-reader')).toContainText('esta senha já está sendo usada');
  await page.screenshot({ path: info.outputPath('mobile-terminal.png') });
  await page.locator('#touch-exit').tap();
  expect((await snapshot(page)).station).toBe(null);
  await context.close();
});

test('importação do LogLab, falha de arquivo e descarte confirmado', async ({ page }) => {
  const account = {
    username: 'custodia',
    memberNo: 18435,
    joined: '2026-09-27',
    bio: '',
    favoriteGenre: 'RPG',
  };
  await page.addInitScript((data) => localStorage.setItem('reloglab.v1', JSON.stringify(data)), {
    version: 1,
    account,
    logs: [],
    positions: {},
    preferences: { theme: 0, quiet: true, reducedMotion: true },
  });
  await page.goto('/');
  await expect
    .poll(async () => await page.evaluate(() => !!(window as any).__RELOGLAB__))
    .toBe(true);
  await route(page, [[-3.8, 14.4]]);
  await station(page, -3.8, 10.4, 'reception');
  await fill(page, 'password', 'falso');
  await click(page, 'ENTRAR');
  await leave(page);
  await route(page, [
    [0, 11],
    [0, 6],
    [5, 3.8],
    [6, 0],
    [12, 0],
    [17, 0],
    [17, -9],
    [19.4, -10],
    [19.4, -16],
    [15.5, -20],
  ]);
  await station(page, 12.3, -20, 'maintenance');
  await page.locator('#import-file').setInputFiles({
    name: 'errado.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"logs":"bad"}'),
  });
  await expect(page.locator('#screen-reader')).toContainText('Transferência recusada');
  expect((await snapshot(page)).data.account.username).toBe('custodia');
  const original = {
    user: { ...account, username: 'migrado', password: 'NUNCA-COPIAR' },
    logs: [
      {
        id: 'old1',
        game: 'Portal',
        status: 'completed',
        rating: '10',
        date: '2011-01-03',
        note: 'Do LogLab',
        replay: false,
      },
    ],
    positions: { old1: { x: 920, y: 340 } },
  };
  await page.locator('#import-file').setInputFiles({
    name: 'loglab-export.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from(JSON.stringify(original)),
  });
  await expect.poll(async () => (await snapshot(page)).data.account.username).toBe('migrado');
  expect((await snapshot(page)).data.logs[0].game).toBe('Portal');
  expect((await snapshot(page)).session).toBe(false);
  expect(await page.evaluate(() => localStorage.getItem('reloglab.v1'))).not.toContain(
    'NUNCA-COPIAR',
  );
  await route(page, [[-3.8, 14.4]]);
  await station(page, -3.8, 10.4, 'reception');
  await fill(page, 'password', 'falso');
  await click(page, 'ENTRAR');
  await leave(page);
  await route(page, [
    [0, 11],
    [0, 6],
    [5, 3.8],
    [6, 0],
    [12, 0],
    [17, 0],
    [17, -9],
    [19.4, -10],
    [19.4, -16],
    [15.5, -20],
  ]);
  await station(page, 12.3, -20, 'maintenance');
  await click(page, 'DESCARTAR CONTA');
  expect((await snapshot(page)).data.logs).toHaveLength(1);
  await click(page, 'CANCELAR');
  expect((await snapshot(page)).data.account.username).toBe('migrado');
  await click(page, 'DESCARTAR CONTA');
  await click(page, 'CONFIRMAR DESCARTE');
  expect((await snapshot(page)).data.logs).toHaveLength(1);
  await click(page, 'DESCARTAR DEFINITIVAMENTE');
  expect((await snapshot(page)).data.logs).toHaveLength(0);
  expect((await snapshot(page)).data.account).toBe(null);
});
