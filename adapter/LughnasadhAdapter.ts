/**
 * LughnasadhAdapter — owns the real UCI process.
 * Classical UCI only. No proprietary commands. No simulated replies.
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface, type Interface } from 'node:readline';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import type { BestMoveResult, EngineInfo, EngineScore } from '../shared/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export type AdapterLogDirection = 'in' | 'out';

export interface AdapterHandlers {
  onReady: (meta: { name: string; author?: string }) => void;
  onInfo: (info: EngineInfo) => void;
  onBestMove: (result: BestMoveResult) => void;
  onUciLog: (direction: AdapterLogDirection, line: string) => void;
  onCrash: (error: { message: string; code?: number | null }) => void;
  onError: (message: string) => void;
}

function findProjectEnginesDir(start: string): string | null {
  let dir = start;
  for (let i = 0; i < 6; i++) {
    const engines = path.join(dir, 'engines', 'lughnasadh');
    if (existsSync(engines)) return engines;
    dir = path.resolve(dir, '..');
  }
  return null;
}

export function resolveEnginePath(override?: string): string {
  if (override && override.trim()) return override.trim();
  if (process.env.LUGHNASADH_PATH && process.env.LUGHNASADH_PATH.trim()) {
    return process.env.LUGHNASADH_PATH.trim();
  }
  const fromTree = findProjectEnginesDir(__dirname);
  const candidates = [
    ...(fromTree ? [fromTree] : []),
    path.resolve(__dirname, '../engines/lughnasadh'),
    '/workspace/lughnasadh-build/build/lughnasadh',
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return candidates[candidates.length - 1];
}

function parseScore(tokens: string[]): EngineScore | undefined {
  const i = tokens.indexOf('score');
  if (i < 0) return undefined;
  const kind = tokens[i + 1];
  const value = Number(tokens[i + 2]);
  if (kind === 'cp' && Number.isFinite(value)) return { type: 'cp', value };
  if (kind === 'mate' && Number.isFinite(value)) return { type: 'mate', value };
  return undefined;
}

function parseIntAfter(tokens: string[], key: string): number | undefined {
  const i = tokens.indexOf(key);
  if (i < 0) return undefined;
  const n = Number(tokens[i + 1]);
  return Number.isFinite(n) ? n : undefined;
}

function parsePv(tokens: string[]): string[] | undefined {
  const i = tokens.indexOf('pv');
  if (i < 0) return undefined;
  return tokens.slice(i + 1).filter((t) => /^[a-h][1-8][a-h][1-8][qrbn]?$/i.test(t));
}

export function parseInfoLine(line: string, sessionId: string): EngineInfo | null {
  if (!line.startsWith('info ')) return null;
  const tokens = line.trim().split(/\s+/);
  return {
    depth: parseIntAfter(tokens, 'depth'),
    seldepth: parseIntAfter(tokens, 'seldepth'),
    multipv: parseIntAfter(tokens, 'multipv'),
    score: parseScore(tokens),
    nodes: parseIntAfter(tokens, 'nodes'),
    nps: parseIntAfter(tokens, 'nps'),
    time: parseIntAfter(tokens, 'time'),
    hashfull: parseIntAfter(tokens, 'hashfull'),
    tbhits: parseIntAfter(tokens, 'tbhits'),
    pv: parsePv(tokens),
    raw: line,
    sessionId,
  };
}

export function parseBestMoveLine(line: string, sessionId: string): BestMoveResult | null {
  if (!line.startsWith('bestmove ')) return null;
  const parts = line.trim().split(/\s+/);
  const bestMove = parts[1] ?? '(none)';
  let ponder: string | null = null;
  const pi = parts.indexOf('ponder');
  if (pi >= 0 && parts[pi + 1]) ponder = parts[pi + 1];
  return { bestMove, ponder, sessionId };
}

/** Pure parser used by unit tests (no binary). */
export const UciParsers = { parseInfoLine, parseBestMoveLine };

export class LughnasadhAdapter {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private rl: Interface | null = null;
  private handlers: AdapterHandlers;
  private enginePath: string;
  private ready = false;
  private searching = false;
  private activeSessionId: string | null = null;
  private name = 'Lughnasadh 0.2';
  private author: string | undefined;
  private startPromise: Promise<void> | null = null;
  private pendingReady: (() => void) | null = null;
  private pendingUci: (() => void) | null = null;

  constructor(handlers: AdapterHandlers, enginePath?: string) {
    this.handlers = handlers;
    this.enginePath = resolveEnginePath(enginePath);
  }

  getEnginePath(): string {
    return this.enginePath;
  }

  isReady(): boolean {
    return this.ready && !!this.proc;
  }

  isSearching(): boolean {
    return this.searching;
  }

  getActiveSessionId(): string | null {
    return this.activeSessionId;
  }

  async start(): Promise<void> {
    if (this.startPromise) return this.startPromise;
    this.startPromise = this._start();
    try {
      await this.startPromise;
    } finally {
      this.startPromise = null;
    }
  }

  private async _start(): Promise<void> {
    if (this.proc) {
      await this.quit();
    }
    this.ready = false;
    this.searching = false;
    this.activeSessionId = null;

    if (!existsSync(this.enginePath)) {
      const msg = `Engine binary not found: ${this.enginePath}`;
      this.handlers.onError(msg);
      throw new Error(msg);
    }

    this.proc = spawn(this.enginePath, [], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.rl = createInterface({ input: this.proc.stdout });
    this.rl.on('line', (line) => this.onLine(line));

    this.proc.stderr.on('data', (buf: Buffer) => {
      const text = buf.toString('utf8').trim();
      if (text) this.handlers.onUciLog('in', `[stderr] ${text}`);
    });

    this.proc.on('exit', (code) => {
      const wasReady = this.ready;
      this.ready = false;
      this.searching = false;
      this.proc = null;
      this.rl = null;
      if (wasReady || code !== 0) {
        this.handlers.onCrash({
          message: `Engine process exited (code ${code ?? 'null'})`,
          code,
        });
      }
    });

    this.proc.on('error', (err) => {
      this.ready = false;
      this.handlers.onCrash({ message: err.message, code: null });
    });

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('Timeout waiting for uciok'));
      }, 8000);

      const cleanup = () => {
        clearTimeout(timer);
        this.pendingUci = null;
      };

      this.pendingUci = () => {
        cleanup();
        resolve();
      };

      try {
        this.sendRaw('uci');
      } catch (e) {
        cleanup();
        reject(e);
      }
    });

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('Timeout waiting for readyok'));
      }, 8000);

      const cleanup = () => {
        clearTimeout(timer);
        this.pendingReady = null;
      };

      this.pendingReady = () => {
        cleanup();
        this.ready = true;
        this.handlers.onReady({ name: this.name, author: this.author });
        resolve();
      };

      try {
        this.sendRaw('isready');
      } catch (e) {
        cleanup();
        reject(e);
      }
    });
  }

  private onLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed) return;
    this.handlers.onUciLog('in', trimmed);

    if (trimmed.startsWith('id name ')) {
      this.name = trimmed.slice('id name '.length).trim() || this.name;
      return;
    }
    if (trimmed.startsWith('id author ')) {
      this.author = trimmed.slice('id author '.length).trim();
      return;
    }
    if (trimmed === 'uciok') {
      this.pendingUci?.();
      return;
    }
    if (trimmed === 'readyok') {
      this.pendingReady?.();
      return;
    }

    const sessionId = this.activeSessionId;
    if (!sessionId) {
      // Ignore search traffic with no active session (stale after cancel/restart)
      if (trimmed.startsWith('info ') || trimmed.startsWith('bestmove ')) return;
      return;
    }

    const info = parseInfoLine(trimmed, sessionId);
    if (info) {
      // Drop if session rotated mid-flight
      if (this.activeSessionId !== sessionId) return;
      this.handlers.onInfo(info);
      return;
    }

    const best = parseBestMoveLine(trimmed, sessionId);
    if (best) {
      if (this.activeSessionId !== sessionId) return;
      this.searching = false;
      this.handlers.onBestMove(best);
      return;
    }
  }

  private sendRaw(cmd: string): void {
    if (!this.proc?.stdin.writable) {
      throw new Error('Engine stdin not writable');
    }
    this.handlers.onUciLog('out', cmd);
    this.proc.stdin.write(cmd + '\n');
  }

  /** Classical UCI only */
  sendUciCommand(cmd: string): void {
    const allowed =
      /^(uci|isready|ucinewgame|stop|quit|position\b|go\b|setoption\b)/;
    if (!allowed.test(cmd.trim())) {
      throw new Error(`Refusing non-classical UCI command: ${cmd}`);
    }
    this.sendRaw(cmd.trim());
  }

  newGame(): void {
    this.sendRaw('ucinewgame');
  }

  setPosition(fen: string, moves?: string[]): void {
    if (!fen || fen === 'startpos') {
      const mv = moves?.length ? ` moves ${moves.join(' ')}` : '';
      this.sendRaw(`position startpos${mv}`);
      return;
    }
    const mv = moves?.length ? ` moves ${moves.join(' ')}` : '';
    this.sendRaw(`position fen ${fen}${mv}`);
  }

  /**
   * Start search bound to sessionId. Caller must stop/cancel prior search first.
   * go depth N | go movetime MS only.
   */
  go(sessionId: string, opts: { depth?: number; movetime?: number }): void {
    this.activeSessionId = sessionId;
    this.searching = true;
    if (opts.movetime != null && opts.movetime > 0) {
      this.sendRaw(`go movetime ${Math.floor(opts.movetime)}`);
    } else {
      const depth = opts.depth != null && opts.depth > 0 ? Math.floor(opts.depth) : 12;
      this.sendRaw(`go depth ${depth}`);
    }
  }

  /** Invalidate session so late info/bestmove are discarded */
  invalidateSession(): void {
    this.activeSessionId = null;
    this.searching = false;
  }

  stop(): void {
    if (this.searching || this.activeSessionId) {
      try {
        this.sendRaw('stop');
      } catch {
        /* ignore */
      }
    }
    this.searching = false;
    // Keep session until bestmove or explicit invalidate — caller decides
  }

  async quit(): Promise<void> {
    this.invalidateSession();
    this.ready = false;
    const proc = this.proc;
    if (!proc) return;
    try {
      this.sendRaw('quit');
    } catch {
      /* ignore */
    }
    await new Promise<void>((resolve) => {
      const t = setTimeout(() => {
        try {
          proc.kill('SIGKILL');
        } catch {
          /* ignore */
        }
        resolve();
      }, 1500);
      proc.once('exit', () => {
        clearTimeout(t);
        resolve();
      });
    });
    this.proc = null;
    this.rl = null;
  }
}
