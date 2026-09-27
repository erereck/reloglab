import * as T from 'three';
import { GAMES, type Game } from './catalog';
import { Archive, STATUS, today, type Log, type Status } from './state';
import type { Mount } from './world';

export type Station =
  'reception' | 'catalog' | 'log' | 'profile' | 'stats' | 'sync' | 'settings' | 'maintenance';
export interface Target {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  action: () => void;
  field?: string;
  logId?: string;
}
const PALETTE = {
  ink: '#cbdcba',
  muted: '#879b7d',
  amber: '#efba6b',
  dark: '#112219',
  line: '#3c5540',
  error: '#f1a286',
};
export class Terminal {
  canvas = document.createElement('canvas');
  ctx: CanvasRenderingContext2D;
  mount!: Mount;
  targets: Target[] = [];
  cursor = 0;
  activeField: string | null = null;
  mode = '';
  message = '';
  error = false;
  fields: Record<string, string> = {};
  page = 0;
  query = '';
  exact = false;
  genre = 'Todos';
  editId: string | null = null;
  deletion = 0;
  onInput: (terminal: Terminal, key: string) => void = () => {};
  onFeedback: (message: string) => void = () => {};
  onChange: () => void = () => {};
  onReceipt: () => void = () => {};
  syncing = 74;
  isSyncing = false;
  mobile = matchMedia('(pointer:coarse)').matches && innerWidth < 650;
  bodyDrawing = false;
  mobileScale = 1.85;
  constructor(
    public kind: Station,
    private archive: Archive,
  ) {
    this.canvas.width = 1024;
    this.canvas.height = this.mobile ? 1280 : 768;
    this.ctx = this.canvas.getContext('2d')!;
    this.mode = kind === 'reception' && archive.data.account ? 'login' : '';
    this.fields = {
      username: archive.data.account?.username || '',
      password: '',
      confirm: '',
      search: '',
      status: 'played',
      rating: '',
      date: today(),
      note: '',
      replay: '0',
      bio: archive.data.account?.bio || '',
      favoriteGenre: archive.data.account?.favoriteGenre || 'Não informado',
    };
    this.paint();
  }
  text(
    s: string,
    x: number,
    y: number,
    size = 22,
    color = PALETTE.ink,
    weight = 400,
    maxWidth?: number,
  ) {
    const transform = this.ctx.getTransform();
    this.ctx.save();
    if (this.mobile && this.bodyDrawing) {
      y = y * transform.d + transform.f;
      this.ctx.setTransform(1, 0, 0, 1, 0, 0);
      size *= 1.8;
    }
    this.ctx.fillStyle = color;
    this.ctx.font = `${weight} ${size}px Dept, monospace`;
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'top';
    this.ctx.fillText(s, x, y, maxWidth);
    this.ctx.restore();
  }
  wrap(
    s: string,
    x: number,
    y: number,
    width: number,
    size = 20,
    color = PALETTE.muted,
    maxLines = 4,
  ) {
    const words = s.split(/\s+/);
    let line = '',
      n = 0;
    this.ctx.font = `400 ${size * (this.mobile && this.bodyDrawing ? 1.8 : 1)}px Dept,monospace`;
    for (const word of words) {
      const next = line ? line + ' ' + word : word;
      if (this.ctx.measureText(next).width > width && line) {
        this.text(line, x, y + n * size * 1.45, size, color);
        line = word;
        n++;
        if (n >= maxLines) return y + (n + 1) * size * 1.45;
      } else line = next;
    }
    this.text(line, x, y + n * size * 1.45, size, color);
    return y + (n + 1) * size * 1.45;
  }
  button(
    label: string,
    x: number,
    y: number,
    w: number,
    action: () => void,
    accent = false,
    h = 46,
    field?: string,
    logId?: string,
  ) {
    const i = this.targets.length;
    const tr = this.ctx.getTransform();
    this.targets.push({ x, y: y * tr.d + tr.f, w, h: h * tr.d, label, action, field, logId });
    const selected = this.cursor === i;
    this.ctx.fillStyle = accent ? '#c29c5e' : selected ? '#38543b' : '#223b2a';
    this.ctx.fillRect(x, y, w, h);
    this.ctx.strokeStyle = selected ? PALETTE.amber : PALETTE.line;
    this.ctx.lineWidth = selected ? 3 : 1;
    this.ctx.strokeRect(x, y, w, h);
    this.text(
      (selected && !accent ? '› ' : '') + label,
      x + 14,
      y + (h - 20) / 2,
      20,
      accent ? '#15251a' : PALETTE.ink,
      accent ? 600 : 400,
      w - 28,
    );
  }
  field(label: string, key: string, x: number, y: number, w: number, password = false) {
    if (this.mobile)
      label =
        (
          {
            username: 'USUÁRIO / 3–18 CARACTERES',
            password: 'SENHA FICTÍCIA',
            confirm: 'REPETIR A SENHA',
            search: 'PESQUISA POR NOME',
            note: 'OBSERVAÇÃO',
            date: 'DATA / AAAA-MM-DD',
            bio: 'APRESENTAÇÃO',
          } as Record<string, string>
        )[key] || label;
    this.text(label, x, y, 16, PALETTE.muted, 400, w);
    const value = this.fields[key] || '';
    const display = password ? '•'.repeat(value.length) : value;
    const text = display || (this.activeField === key ? '_' : '[ clique para digitar ]');
    this.button(
      text + (this.activeField === key && value ? ' _' : ''),
      x,
      y + 26,
      w,
      () => {
        this.activeField = key;
        this.onInput(this, key);
        this.paint();
      },
      false,
      44,
      key,
    );
  }
  status(message: string, error = false) {
    this.message = message;
    this.error = error;
    this.onFeedback(message);
    this.paint();
  }
  header(title: string, tag: string, subtitle: string) {
    this.ctx.fillStyle = PALETTE.dark;
    this.ctx.fillRect(0, 0, 1024, this.canvas.height);
    this.text('RL / ' + tag, 40, 25, 15, PALETTE.amber, 600);
    this.text('TERMINAL LOCAL · REV. 1996/26', 630, 25, 14, PALETTE.muted);
    this.ctx.fillStyle = PALETTE.line;
    this.ctx.fillRect(40, 55, 944, 1);
    this.text(title, 40, 76, 38, PALETTE.ink, 500);
    this.text(subtitle, 40, 124, 17, PALETTE.muted);
  }
  paint() {
    this.targets = [];
    const names: Record<Station, [string, string, string]> = {
      reception: [
        'Admissão de membro',
        '00 — RECEPÇÃO',
        'Formulário 00-A / credencial fictícia de acesso',
      ],
      catalog: [
        'Arquivo de títulos',
        '02 — CONSULTA',
        `${GAMES.length} títulos catalogados / capas permanentemente temporárias`,
      ],
      log: [
        'Protocolar um jogo',
        '03 — HOMOLOGAÇÃO',
        'Seleção não equivale a registro. Preencha e protocole.',
      ],
      profile: [
        'Terreno do perfil',
        '04 — PROPRIEDADE LOCAL',
        'O espaço é seu. A responsabilidade pela disposição também.',
      ],
      stats: [
        'Contabilidade da memória',
        '05 — ESTATÍSTICA',
        'Cálculos reais, derivados dos registros deste navegador.',
      ],
      sync: [
        'Sincronização geral',
        '01 — MÁQUINA CENTRAL',
        'Este indicador não tem jurisdição sobre os seus registros.',
      ],
      settings: [
        'Preferências do membro',
        '07 — CONFIGURAÇÃO',
        'Requerimento de ajustes / deferimento não implica aplicação',
      ],
      maintenance: [
        'Custódia do arquivo',
        '07-B — MANUTENÇÃO',
        'Exportação, transferência e descarte de registros locais',
      ],
    };
    this.header(...names[this.kind]);
    this.ctx.save();
    this.bodyDrawing = true;
    if (this.mobile) this.ctx.setTransform(1, 0, 0, this.mobileScale, 0, -120);
    if (
      !this.archive.session &&
      !['reception', 'catalog', 'sync', 'maintenance'].includes(this.kind)
    )
      this.locked();
    else
      ({
        reception: () => this.login(),
        catalog: () => this.catalog(),
        log: () => this.record(),
        profile: () => this.profile(),
        stats: () => this.stats(),
        sync: () => this.sync(),
        settings: () => this.settings(),
        maintenance: () => this.maintenance(),
      })[this.kind]();
    this.ctx.restore();
    this.bodyDrawing = false;
    if (this.message)
      this.wrap(
        this.message,
        40,
        this.mobile ? 1090 : 648,
        944,
        this.mobile ? 27 : 18,
        this.error ? PALETTE.error : PALETTE.amber,
        3,
      );
    const footer = this.canvas.height - 56;
    this.ctx.fillStyle = PALETTE.line;
    this.ctx.fillRect(40, footer, 944, 1);
    this.text(
      this.mobile
        ? 'TOQUE / OPERAR    VOLTAR / LEVANTAR'
        : 'TAB / SELECIONAR    ENTER / OPERAR    ESC / LEVANTAR',
      40,
      footer + 18,
      this.mobile ? 22 : 14,
      PALETTE.muted,
    );
    this.text(
      this.archive.storageAvailable ? 'ARQUIVO: LOCAL' : 'ARQUIVO: TEMPORÁRIO',
      this.mobile ? 770 : 700,
      footer + 18,
      this.mobile ? 18 : 13,
      this.archive.storageAvailable ? PALETTE.muted : PALETTE.error,
    );
    // Scanlines belong to the physical monitor, not an HTML overlay.
    this.ctx.fillStyle = '#0000000c';
    for (let y = 0; y < this.canvas.height; y += 4) this.ctx.fillRect(0, y, 1024, 1);
    if (this.mount) this.mount.mesh.material.map!.needsUpdate = true;
  }
  locked() {
    this.text('ACESSO NÃO HOMOLOGADO', 40, 245, 34, PALETTE.amber);
    this.wrap(
      'A credencial deve ser emitida no terminal da recepção. O departamento não admite atalhos administrativos.',
      40,
      310,
      830,
      24,
    );
  }
  login() {
    if (this.archive.session) {
      this.text('CREDENCIAL HOMOLOGADA', 40, 205, 34, PALETTE.amber);
      this.text(this.archive.data.account!.username, 40, 267, 48);
      this.wrap(
        'A porta central está aberta. Arquivo à esquerda, protocolo à direita. Seu histórico não será julgado por esta repartição.',
        40,
        351,
        900,
        25,
      );
      this.text('MEMBRO Nº ' + this.archive.data.account!.memberNo, 40, 505, 20, PALETTE.muted);
      return;
    }
    const registered = !!this.archive.data.account;
    const login = this.mode === 'login';
    this.field('NOME DE USUÁRIO / 3–18 CARACTERES', 'username', 40, 170, 944);
    this.field(
      'SENHA FICTÍCIA / MÍNIMO 4 CARACTERES',
      'password',
      40,
      262,
      login ? 944 : 453,
      true,
    );
    if (!login) this.field('REPETIR A SENHA FICTÍCIA', 'confirm', 531, 262, 453, true);
    this.wrap(
      login
        ? 'Autenticação demonstrativa: qualquer senha fictícia de 4 caracteres permite retomar a sua credencial local.'
        : 'O departamento verifica se a senha já foi utilizada. Não é tecnicamente possível; o procedimento será executado mesmo assim.',
      40,
      365,
      944,
      21,
    );
    this.button(
      login ? 'ENTRAR NA INSTALAÇÃO' : 'VALIDAR E CONTINUAR →',
      40,
      477,
      590,
      () => {
        const username = this.fields.username.trim();
        const pw = this.fields.password;
        if (username.length < 3 || username.length > 18)
          return this.status('Nome inválido. O formulário aceita 3 a 18 caracteres.', true);
        if (pw.length < 4)
          return this.status('A senha fictícia deve conter pelo menos 4 caracteres.', true);
        if (login) {
          if (!registered)
            return this.status('Nenhuma credencial local. Utilize emitir cadastro.', true);
          if (username !== this.archive.data.account!.username)
            return this.status(
              'O nome não corresponde à credencial armazenada neste navegador.',
              true,
            );
          this.fields.password = '';
          this.archive.signIn();
          this.status('Acesso homologado. A porta central foi liberada.');
          this.onChange();
          return;
        }
        if (pw !== this.fields.confirm)
          return this.status(
            'As duas senhas não coincidem. A repartição exige concordância.',
            true,
          );
        if (!this.archive.rejected) {
          this.archive.rejectPassword();
          this.fields.password = '';
          this.fields.confirm = '';
          return this.status(
            'ERRO 104: esta senha já está sendo usada por outro membro. Escolha outra senha fictícia e envie novamente.',
            true,
          );
        }
        if (registered)
          return this.status(
            'Já existe uma credencial. Entre com ela ou use a custódia do arquivo para removê-la.',
            true,
          );
        this.archive.data.account = {
          username,
          memberNo: 18433 + Math.floor(Math.random() * 734),
          joined: today(),
          bio: 'Ainda não preencheu a apresentação pessoal.',
          favoriteGenre: 'Não informado',
        };
        this.archive.persist();
        this.fields.password = '';
        this.fields.confirm = '';
        this.mode = 'login';
        this.status(
          'Cadastro aceito. Por segurança, você não foi conectado. Digite uma senha fictícia e entre.',
        );
      },
      true,
    );
    this.button(login ? 'EMITIR CADASTRO' : 'JÁ SOU MEMBRO', 650, 477, 334, () => {
      this.mode = login ? '' : 'login';
      this.message = '';
      this.paint();
    });
    this.text('NÃO USE UMA SENHA REAL. NENHUMA SENHA É ARMAZENADA.', 40, 570, 19, PALETTE.amber);
    this.text('Dados no navegador. Sem servidor, sem conta online.', 40, 606, 17, PALETTE.muted);
  }
  catalog() {
    this.field('PESQUISA POR NOME', 'search', 40, 165, 648);
    this.button(
      'PESQUISAR',
      714,
      191,
      270,
      () => {
        this.query = this.fields.search;
        this.page = 0;
        this.message = '';
        this.paint();
      },
      true,
      44,
    );
    this.button('EXATO: ' + (this.exact ? 'SIM' : 'NÃO'), 40, 252, 270, () => {
      this.exact = !this.exact;
      this.page = 0;
      this.paint();
    });
    const genres = ['Todos', ...new Set(GAMES.map((g) => g[1]))];
    this.button('GÊNERO: ' + this.genre, 330, 252, 654, () => {
      this.genre = genres[(genres.indexOf(this.genre) + 1) % genres.length];
      this.page = 0;
      this.paint();
    });
    const results = this.archive.search(this.query, this.exact, this.genre);
    const last = Math.max(0, Math.ceil(results.length / 6) - 1);
    this.page = Math.min(this.page, last);
    this.text('TÍTULO', 40, 316, 15, PALETTE.muted);
    this.text('ANO / GÊNERO', 729, 316, 15, PALETTE.muted);
    results.slice(this.page * 6, this.page * 6 + 6).forEach((g, i) => {
      this.button(
        g[0],
        40,
        345 + i * 41,
        944,
        () => {
          this.archive.selectedGame = g;
          this.status(
            'Título separado: ' +
              g[0] +
              '. Leve-o ao PROTOCOLO / setor 03, do outro lado do átrio.',
          );
          this.onChange();
        },
        false,
        36,
      );
      this.ctx.fillStyle = PALETTE.dark;
      this.ctx.fillRect(723, 346 + i * 41, 260, 34);
      this.text(g[2] + ' / ' + g[1], 738, 355 + i * 41, 16, PALETTE.muted, 400, 230);
    });
    if (!results.length)
      this.text('NENHUM TÍTULO LOCALIZADO. REVISE A PESQUISA.', 40, 384, 22, PALETTE.amber);
    this.button('←', 40, 598, 72, () => {
      this.page = Math.max(0, this.page - 1);
      this.paint();
    });
    this.text(
      `${results.length} resultados / folha ${this.page + 1} de ${last + 1}`,
      137,
      612,
      17,
      PALETTE.muted,
    );
    this.button('→', 910, 598, 74, () => {
      this.page = Math.min(last, this.page + 1);
      this.paint();
    });
  }
  setEdit(log: Log) {
    this.editId = log.id;
    this.mode = 'edit';
    this.message = '';
    this.deletion = 0;
    this.fields = {
      ...this.fields,
      status: log.status,
      rating: log.rating,
      date: log.date,
      note: log.note,
      replay: log.replay ? '1' : '0',
    };
    this.paint();
  }
  record() {
    const edit = this.editId ? this.archive.data.logs.find((l) => l.id === this.editId) : null;
    const game = edit?.game || this.archive.selectedGame?.[0];
    this.text(
      edit ? 'ALTERAÇÃO DE REGISTRO' : 'TÍTULO SEPARADO PELO ARQUIVO',
      40,
      169,
      15,
      PALETTE.muted,
    );
    this.text(
      game || 'Nenhum título selecionado no setor 02.',
      40,
      201,
      27,
      game ? PALETTE.amber : PALETTE.error,
      500,
      944,
    );
    const statuses = Object.keys(STATUS) as Status[];
    this.text('SITUAÇÃO / CLIQUE PARA ALTERNAR', 40, 256, 15, PALETTE.muted);
    this.button(STATUS[this.fields.status as Status] || STATUS.played, 40, 281, 458, () => {
      this.fields.status =
        statuses[(statuses.indexOf(this.fields.status as Status) + 1) % statuses.length];
      this.paint();
    });
    this.text('NOTA / CLIQUE PARA ALTERNAR', 531, 256, 15, PALETTE.muted);
    this.button(
      this.fields.rating === '' ? 'Sem nota' : this.fields.rating + ' / 10',
      531,
      281,
      453,
      () => {
        this.fields.rating =
          this.fields.rating === ''
            ? '0'
            : Number(this.fields.rating) < 10
              ? String(Number(this.fields.rating) + 1)
              : '';
        this.paint();
      },
    );
    this.field('DATA / AAAA-MM-DD', 'date', 40, 349, 305);
    this.field('OBSERVAÇÃO / ATÉ 180 CARACTERES', 'note', 375, 349, 609);
    this.button(
      (this.fields.replay === '1' ? '[X]' : '[ ]') + ' Pretendo rejogar futuramente',
      40,
      446,
      944,
      () => {
        this.fields.replay = this.fields.replay === '1' ? '0' : '1';
        this.paint();
      },
    );
    this.button(
      edit ? 'SALVAR ALTERAÇÃO' : 'PROTOCOLAR REGISTRO →',
      40,
      514,
      edit ? 596 : 944,
      () => {
        if (!game)
          return this.status(
            'ERRO: digitar não é selecionar. Separe um título no arquivo, setor 02.',
            true,
          );
        if (!edit && this.archive.data.logs.length >= 3000)
          return this.status(
            'Capacidade do arquivo: 3.000 registros. Exporte uma cópia e remova um registro antes de protocolar outro.',
            true,
          );
        const date = this.fields.date;
        const parsed = new Date(date + 'T12:00:00');
        if (
          !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
          isNaN(parsed.getTime()) ||
          parsed.toISOString().slice(0, 10) !== date
        )
          return this.status('Data inválida. Utilize uma data real no formato AAAA-MM-DD.', true);
        const data = {
          game,
          status: this.fields.status as Status,
          rating: this.fields.rating,
          date,
          note: this.fields.note.slice(0, 180),
          replay: this.fields.replay === '1',
        };
        if (edit) {
          this.archive.edit(edit.id, data);
          this.mode = '';
          this.editId = null;
          this.status('Alteração homologada. O terreno já reflete o registro.');
        } else {
          this.archive.add(data);
          this.archive.selectedGame = null;
          this.fields.note = '';
          this.fields.rating = '';
          this.fields.status = 'played';
          this.fields.replay = '0';
          this.onReceipt();
          this.status(
            'Registro recebido. O departamento estima 2–4 minutos; seu arquivo já foi salvo. Permaneça neste balcão.',
          );
        }
        this.onChange();
        this.paint();
      },
      true,
    );
    if (edit) {
      this.button('VOLTAR AO TERRENO', 660, 514, 324, () => {
        this.mode = '';
        this.editId = null;
        this.message = '';
        this.paint();
      });
      this.button(this.deletion ? 'CONFIRMAR REMOÇÃO' : 'REMOVER REGISTRO', 40, 577, 944, () => {
        if (!this.deletion) {
          this.deletion = 1;
          this.status(
            'Este registro será removido. Clique em confirmar remoção para executar.',
            true,
          );
        } else {
          this.archive.remove(edit.id);
          this.mode = '';
          this.editId = null;
          this.deletion = 0;
          this.status('Registro removido do terreno.');
          this.onChange();
          this.paint();
        }
      });
    } else
      this.text('O recibo físico permanece à direita do terminal.', 40, 594, 18, PALETTE.muted);
  }
  profile() {
    if (this.mode === 'edit') return this.record();
    const account = this.archive.data.account!;
    const logs = this.archive.data.logs;
    this.text(account.username.toUpperCase(), 40, 166, 27, PALETTE.amber, 500);
    this.text(`Nº ${account.memberNo} · ${logs.length} REGISTROS`, 487, 172, 18, PALETTE.muted);
    if (this.mode === 'list') {
      const last = Math.max(0, Math.ceil(logs.length / 7) - 1);
      this.page = Math.min(this.page, last);
      logs
        .slice(this.page * 7, this.page * 7 + 7)
        .forEach((l, i) =>
          this.button(
            `${l.game} / ${STATUS[l.status]} / ${l.rating || '—'}`,
            40,
            222 + i * 48,
            944,
            () => this.setEdit(l),
            false,
            41,
          ),
        );
      if (!logs.length)
        this.text('O terreno está vazio. Protocole um título no setor 03.', 40, 298, 23);
      this.button('←', 40, 580, 68, () => {
        this.page = Math.max(0, this.page - 1);
        this.paint();
      });
      this.text(`Folha ${this.page + 1}/${last + 1}`, 130, 594, 18);
      this.button('TERRENO', 690, 580, 205, () => {
        this.mode = '';
        this.message = '';
        this.paint();
      });
      this.button('→', 915, 580, 69, () => {
        this.page = Math.min(last, this.page + 1);
        this.paint();
      });
      return;
    }
    this.ctx.fillStyle = '#213823';
    this.ctx.fillRect(40, 218, 944, 337);
    this.ctx.strokeStyle = '#3c5637';
    this.ctx.lineWidth = 1;
    for (let i = 0; i < 20; i++) {
      this.ctx.beginPath();
      this.ctx.moveTo(40 + i * 47.2, 218);
      this.ctx.lineTo(40 + i * 47.2, 555);
      this.ctx.stroke();
    }
    for (let i = 0; i < 8; i++) {
      this.ctx.beginPath();
      this.ctx.moveTo(40, 218 + i * 42.1);
      this.ctx.lineTo(984, 218 + i * 42.1);
      this.ctx.stroke();
    }
    if (!logs.length) {
      this.text('TERRENO NÃO OCUPADO', 235, 339, 34, PALETTE.ink);
      this.text('Selecione no arquivo. Protocole no setor 03.', 215, 399, 19, PALETTE.muted);
    }
    logs.slice(0, 80).forEach((l, i) => {
      const p = this.archive.position(l, i);
      const x = 50 + ((p.x + 7.5) / 7) * 768;
      const y = 226 + ((p.z + 21.5) / 10.5) * 270;
      this.button(
        l.game.slice(0, 20),
        x,
        y,
        153,
        () => this.setEdit(l),
        false,
        48,
        undefined,
        l.id,
      );
      this.text(l.rating === '' ? '—' : l.rating + '/10', x + 10, y + 34, 11, PALETTE.muted);
    });
    this.text(
      'ARRASTE PARA POSICIONAR · CLIQUE PARA EDITAR · VISUALIZAÇÃO FÍSICA: 80 BLOCOS',
      40,
      564,
      13,
      PALETTE.muted,
    );
    this.button('ORGANIZAR AUTOMATICAMENTE', 40, 596, 430, () => {
      this.archive.scatter();
      this.onChange();
      this.status('Organização concluída por amostragem aleatória. Verifique as sobreposições.');
    });
    this.button('RESTAURAR', 487, 596, 211, () => {
      this.archive.resetPositions();
      this.onChange();
      this.status('Distribuição inicial restaurada.');
    });
    this.button('INSPECIONAR TODOS', 714, 596, 270, () => {
      this.mode = 'list';
      this.page = 0;
      this.message = '';
      this.paint();
    });
  }
  drag(logId: string, dx: number, dy: number, initial: { x: number; z: number }) {
    this.archive.data.positions[logId] = {
      x: T.MathUtils.clamp(initial.x + (dx / 768) * 7, -7.5, -0.5),
      z: T.MathUtils.clamp(
        initial.z + (dy / (270 * (this.mobile ? this.mobileScale : 1))) * 10.5,
        -21.5,
        -11,
      ),
    };
    this.onChange();
    this.paint();
  }
  stats() {
    const s = this.archive.stats();
    [
      ['REGISTROS', String(s.total)],
      ['NOTA MÉDIA', s.average],
      ['CONCLUSÃO', s.completion + '%'],
    ].forEach(([label, value], i) => {
      const x = 40 + i * 326;
      this.text(label, x, 177, 16, PALETTE.muted);
      this.text(value, x, 210, 72, PALETTE.amber, 500);
    });
    this.text('DISTRIBUIÇÃO POR SITUAÇÃO', 40, 320, 16, PALETTE.muted);
    Object.entries(STATUS).forEach(([id, label], i) => {
      const count = s.counts[id as Status];
      this.text(label, 40, 358 + i * 40, 20);
      this.ctx.fillStyle = '#29442d';
      this.ctx.fillRect(331, 362 + i * 40, 568, 18);
      this.ctx.fillStyle = '#99b189';
      this.ctx.fillRect(331, 362 + i * 40, s.total ? (568 * count) / s.total : 0, 18);
      this.text(String(count).padStart(3, '0'), 928, 357 + i * 40, 20, PALETTE.amber);
    });
    this.text('GÊNERO MAIS FREQUENTE: ' + s.favorite, 40, 614, 20, PALETTE.muted);
  }
  sync() {
    this.text(Math.floor(this.syncing) + '%', 193, 185, 168, PALETTE.amber, 600);
    this.ctx.fillStyle = '#29442d';
    this.ctx.fillRect(40, 398, 944, 24);
    this.ctx.fillStyle = PALETTE.amber;
    this.ctx.fillRect(40, 398, (944 * this.syncing) / 100, 24);
    this.text(
      'ESTADO: ' + (this.isSyncing ? 'APROXIMANDO A ESTIMATIVA' : 'AGUARDANDO O RESTANTE'),
      40,
      453,
      23,
    );
    this.text('TEMPO RESTANTE: INDETERMINADO', 40, 495, 18, PALETTE.muted);
    this.button('SOLICITAR NOVA ESTIMATIVA', 40, 562, 944, () => {
      this.syncing = 0;
      this.isSyncing = true;
      this.status('Solicitação recebida. A estimativa está sendo reestimada.');
    });
    if (!this.message)
      this.text(
        'Seus registros são salvos antes desta máquina opinar.',
        40,
        657,
        18,
        PALETTE.muted,
      );
  }
  settings() {
    this.field('APRESENTAÇÃO / 140 CARACTERES', 'bio', 40, 175, 944);
    const genres = ['Não informado', ...new Set(GAMES.map((g) => g[1]))];
    this.text('GÊNERO FAVORITO', 40, 268, 15, PALETTE.muted);
    this.button(this.fields.favoriteGenre, 40, 294, 944, () => {
      this.fields.favoriteGenre =
        genres[(genres.indexOf(this.fields.favoriteGenre) + 1) % genres.length];
      this.paint();
    });
    const pref = this.archive.data.preferences;
    const themes = [
      'Padrão do departamento',
      'Compatibilidade LCD',
      'Web Safe Colors',
      'Alto contraste experimental',
    ];
    this.text('ESTILO VISUAL / CONSULTIVO', 40, 364, 15, PALETTE.muted);
    this.button(themes[pref.theme % 4], 40, 390, 944, () => {
      pref.theme = (pref.theme + 1) % 4;
      this.archive.persist();
      this.status('Estilo encaminhado ao comitê. A aplicação visual permanece em análise.');
    });
    this.button('SOM: ' + (pref.quiet ? 'DESLIGADO' : 'LIGADO'), 40, 459, 453, () => {
      pref.quiet = !pref.quiet;
      this.archive.persist();
      this.onChange();
      this.paint();
    });
    this.button(
      'MOVIMENTO REDUZIDO: ' + (pref.reducedMotion ? 'SIM' : 'NÃO'),
      531,
      459,
      453,
      () => {
        pref.reducedMotion = !pref.reducedMotion;
        this.archive.persist();
        this.paint();
      },
    );
    this.button(
      'SALVAR INFORMAÇÕES DO PERFIL',
      40,
      552,
      944,
      () => {
        const a = this.archive.data.account!;
        a.bio = this.fields.bio.slice(0, 140);
        a.favoriteGenre = this.fields.favoriteGenre;
        this.archive.persist();
        this.status('Informações salvas. Este requerimento produziu um efeito verificável.');
      },
      true,
    );
  }
  maintenance() {
    this.wrap(
      'A custódia é local. Exporte seu arquivo antes de trocar de navegador. A transferência aceita arquivos do RelogLab e exportações do LogLab original.',
      40,
      185,
      944,
      24,
      PALETTE.ink,
      4,
    );
    this.button(
      'EXPORTAR ARQUIVO / JSON',
      40,
      334,
      944,
      () => {
        this.archive.export();
        this.status('Cópia emitida para download. Nenhuma senha consta do arquivo.');
      },
      true,
    );
    this.button(
      this.deletion === 10
        ? 'CONFIRMAR SUBSTITUIÇÃO E ESCOLHER ARQUIVO'
        : 'IMPORTAR / SUBSTITUIR ARQUIVO LOCAL',
      40,
      408,
      944,
      () => {
        if (this.deletion !== 10) {
          this.deletion = 10;
          return this.status(
            'A importação substituirá a credencial e os registros atuais. Exporte antes de confirmar.',
            true,
          );
        }
        this.deletion = 0;
        document.getElementById('import-file')!.click();
        this.paint();
      },
    );
    this.button(
      this.deletion === 1
        ? 'CONFIRMAR DESCARTE →'
        : this.deletion === 2
          ? 'DESCARTAR DEFINITIVAMENTE'
          : 'DESCARTAR CONTA E REGISTROS',
      40,
      482,
      944,
      () => {
        if (this.deletion < 1 || this.deletion > 2) {
          this.deletion = 1;
          this.status(
            'O descarte remove a credencial, todos os registros e posições. Confirme para prosseguir.',
            true,
          );
        } else if (this.deletion === 1) {
          this.deletion = 2;
          this.status(
            'ÚLTIMA CONFERÊNCIA: clique em descartar definitivamente para apagar o arquivo local.',
            true,
          );
        } else {
          this.archive.erase();
          this.deletion = 0;
          this.onChange();
          this.status('Arquivo local descartado. Retorne à recepção para emitir outra credencial.');
        }
      },
    );
    if (this.deletion)
      this.button('CANCELAR REQUERIMENTO', 40, 568, 944, () => {
        this.deletion = 0;
        this.status('Requerimento cancelado. O arquivo permanece sob custódia.');
      });
    else
      this.text('A saída encontra-se na porta de manutenção ao fundo.', 40, 588, 18, PALETTE.muted);
  }
  hit(x: number, y: number) {
    return [...this.targets]
      .reverse()
      .find((t) => x >= t.x && x <= t.x + t.w && y >= t.y && y <= t.y + t.h);
  }
  select(target: Target) {
    this.cursor = this.targets.indexOf(target);
    this.paint();
  }
  activate(target?: Target) {
    (target || this.targets[this.cursor])?.action();
  }
  next(direction = 1) {
    this.cursor =
      (this.cursor + direction + this.targets.length) % Math.max(1, this.targets.length);
    this.paint();
  }
  tick(dt: number) {
    if (this.isSyncing) {
      this.syncing = Math.min(74, this.syncing + dt * 24);
      if (this.syncing >= 74) {
        this.isSyncing = false;
        this.message = 'Estimativa concluída: 74%. O resultado anterior foi ratificado.';
      }
      this.paint();
    }
  }
}
