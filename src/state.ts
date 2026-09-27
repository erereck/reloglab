import { GAMES, type Game } from './catalog';
export const STATUS = {
  played: 'Jogado',
  completed: 'Terminado',
  playing: 'Jogando agora',
  abandoned: 'Abandonado',
  backlog: 'Na pilha',
  wishlist: 'Quero jogar',
} as const;
export type Status = keyof typeof STATUS;
export interface Log {
  id: string;
  game: string;
  status: Status;
  rating: string;
  date: string;
  note: string;
  replay: boolean;
}
export interface Account {
  username: string;
  memberNo: number;
  joined: string;
  bio: string;
  favoriteGenre: string;
}
export interface Position {
  x: number;
  z: number;
}
export interface Data {
  version: 1;
  account: Account | null;
  logs: Log[];
  positions: Record<string, Position>;
  preferences: { theme: number; quiet: boolean; reducedMotion: boolean };
}
const EMPTY = (): Data => ({
  version: 1,
  account: null,
  logs: [],
  positions: {},
  preferences: {
    theme: 0,
    quiet: false,
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
  },
});
export const today = () => new Date().toLocaleDateString('en-CA');
export const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
export class Archive {
  data = EMPTY();
  session = false;
  rejected = false;
  storageAvailable = true;
  selectedGame: Game | null = null;
  onChange = () => {};
  constructor() {
    try {
      const saved = localStorage.getItem('reloglab.v1');
      if (saved) this.data = this.validate(JSON.parse(saved));
      this.session = sessionStorage.getItem('reloglab.session') === '1' && !!this.data.account;
      this.rejected = sessionStorage.getItem('reloglab.rejected') === '1';
    } catch {
      this.storageAvailable = false;
    }
  }
  validate(raw: unknown): Data {
    if (!raw || typeof raw !== 'object') throw new Error('Arquivo inválido.');
    const r = raw as Record<string, unknown>;
    const candidate = r.account ?? r.user;
    if (!Array.isArray(r.logs)) throw new Error('O arquivo não contém uma lista de registros.');
    if (r.logs.length > 3000)
      throw new Error('O arquivo excede o limite de 3.000 registros. Nenhum dado foi substituído.');
    let account: Account | null = null;
    if (candidate && typeof candidate === 'object') {
      const a = candidate as Record<string, unknown>;
      if (typeof a.username !== 'string' || a.username.trim().length < 3)
        throw new Error('Credencial inválida.');
      account = {
        username: a.username.slice(0, 18),
        memberNo: Number(a.memberNo) || 18433,
        joined: String(a.joined || today()).slice(0, 10),
        bio: String(a.bio || '').slice(0, 140),
        favoriteGenre: String(a.favoriteGenre || 'Não informado').slice(0, 30),
      };
    }
    const logs: Log[] = r.logs.slice(0, 3000).map((item: unknown, i: number) => {
      if (!item || typeof item !== 'object') throw new Error('Registro inválido.');
      const l = item as Record<string, unknown>;
      if (typeof l.game !== 'string' || !l.game.trim()) throw new Error('Título inválido.');
      const rating = l.rating === '' || l.rating == null ? '' : String(l.rating);
      if (
        rating !== '' &&
        (!Number.isFinite(Number(rating)) || Number(rating) < 0 || Number(rating) > 10)
      )
        throw new Error('Nota fora de 0 a 10.');
      return {
        id: `import-${i}-${String(l.id || i).slice(0, 60)}`,
        game: l.game.slice(0, 150),
        status:
          l.status && Object.hasOwn(STATUS, String(l.status)) ? (l.status as Status) : 'played',
        rating,
        date: /^\d{4}-\d{2}-\d{2}$/.test(String(l.date)) ? String(l.date) : today(),
        note: String(l.note || '').slice(0, 180),
        replay: !!l.replay,
      };
    });
    // Preserve stable IDs and positions only in our own versioned format.
    if (r.version === 1) {
      const ids = new Set<string>();
      logs.forEach((l, i) => {
        const id = (r.logs as Record<string, unknown>[])[i].id;
        if (typeof id === 'string' && id.length < 100) l.id = id;
        if (ids.has(l.id))
          throw new Error('O arquivo contém identificadores de registro duplicados.');
        ids.add(l.id);
      });
    }
    const positions: Record<string, Position> = {};
    if (r.version === 1 && r.positions && typeof r.positions === 'object')
      for (const [id, p] of Object.entries(r.positions)) {
        if (p && typeof p === 'object' && Number.isFinite(p.x) && Number.isFinite(p.z))
          positions[id] = {
            x: Math.max(-7.5, Math.min(-0.5, p.x)),
            z: Math.max(-21.5, Math.min(-11, p.z)),
          };
      }
    const pref = r.preferences as Partial<Data['preferences']> | undefined;
    return {
      version: 1,
      account,
      logs,
      positions,
      preferences: {
        theme: ((Math.trunc(Number(pref?.theme) || 0) % 4) + 4) % 4,
        quiet: !!pref?.quiet,
        reducedMotion:
          typeof pref?.reducedMotion === 'boolean'
            ? pref.reducedMotion
            : EMPTY().preferences.reducedMotion,
      },
    };
  }
  persist() {
    try {
      localStorage.setItem('reloglab.v1', JSON.stringify(this.data));
    } catch {
      this.storageAvailable = false;
    }
    this.onChange();
  }
  rejectPassword() {
    this.rejected = true;
    try {
      sessionStorage.setItem('reloglab.rejected', '1');
    } catch {
      this.storageAvailable = false;
    }
  }
  signIn() {
    this.session = true;
    try {
      sessionStorage.setItem('reloglab.session', '1');
    } catch {
      this.storageAvailable = false;
    }
    this.onChange();
  }
  signOut() {
    this.session = false;
    try {
      sessionStorage.removeItem('reloglab.session');
    } catch {
      /* in-memory session */
    }
    this.onChange();
  }
  add(input: Omit<Log, 'id'>) {
    const log = { ...input, id: crypto.randomUUID() };
    this.data.logs.push(log);
    this.persist();
    return log;
  }
  edit(id: string, input: Partial<Omit<Log, 'id'>>) {
    const log = this.data.logs.find((l) => l.id === id);
    if (log) Object.assign(log, input);
    this.persist();
  }
  remove(id: string) {
    this.data.logs = this.data.logs.filter((l) => l.id !== id);
    delete this.data.positions[id];
    this.persist();
  }
  position(log: Log, i: number): Position {
    return (
      this.data.positions[log.id] || {
        x: -7 + (i % 4) * 1.9,
        z: -12 - (Math.floor(i / 4) % 5) * 2.05,
      }
    );
  }
  scatter() {
    this.data.logs.forEach(
      (l) =>
        (this.data.positions[l.id] = {
          x: -7.4 + Math.random() * 6.5,
          z: -11.4 - Math.random() * 9.5,
        }),
    );
    this.persist();
  }
  resetPositions() {
    this.data.positions = {};
    this.persist();
  }
  search(q: string, exact = false, genre = 'Todos') {
    const n = normalize(q);
    return GAMES.filter(
      (g) =>
        (!n || (exact ? normalize(g[0]) === n : normalize(g[0]).includes(n))) &&
        (genre === 'Todos' || g[1] === genre),
    );
  }
  stats() {
    const logs = this.data.logs;
    const counts = Object.fromEntries(
      Object.keys(STATUS).map((s) => [s, logs.filter((l) => l.status === s).length]),
    ) as Record<Status, number>;
    const rated = logs.filter((l) => l.rating !== '');
    const genres: Record<string, number> = {};
    logs.forEach((l) => {
      const genre = GAMES.find((g) => g[0] === l.game)?.[1];
      if (genre) genres[genre] = (genres[genre] || 0) + 1;
    });
    return {
      total: logs.length,
      counts,
      average: rated.length
        ? (rated.reduce((n, l) => n + Number(l.rating), 0) / rated.length).toFixed(2)
        : '—',
      completion: logs.length ? Math.round((counts.completed / logs.length) * 100) : 0,
      favorite: Object.keys(genres).sort((a, b) => genres[b] - genres[a])[0] || 'indefinido',
    };
  }
  export() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(this.data, null, 2)], { type: 'application/json' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = 'reloglab-arquivo.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  import(raw: unknown) {
    this.data = this.validate(raw);
    this.signOut();
    this.persist();
  }
  erase() {
    this.data = EMPTY();
    this.signOut();
    this.persist();
  }
}
