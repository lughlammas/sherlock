/**
 * Browser/Android adapter — classical UCI over NativeUciPort (ProcessBuilder).
 * Same sessionId / parse rules as the Node LughnasadhAdapter.
 */
import { parseBestMoveLine, parseInfoLine } from '../../shared/uciParsers';
import type { BestMoveResult, EngineInfo } from '../../shared/types';
import { NativeUciPort } from './nativeUci';

export type AdapterLogDirection = 'in' | 'out';

export interface AdapterHandlers {
  onReady: (meta: { name: string; author?: string }) => void;
  onInfo: (info: EngineInfo) => void;
  onBestMove: (result: BestMoveResult) => void;
  onUciLog: (direction: AdapterLogDirection, line: string) => void;
  onCrash: (error: { message: string; code?: number | null }) => void;
  onError: (message: string) => void;
}

export class LocalLughnasadhAdapter {
  private port = new NativeUciPort();
  private handlers: AdapterHandlers;
  private ready = false;
  private searching = false;
  private activeSessionId: string | null = null;
  private name = 'Lughnasadh 0.2';
  private author: string | undefined;
  private pendingReady: (() => void) | null = null;
  private pendingUci: (() => void) | null = null;
  private started = false;

  constructor(handlers: AdapterHandlers) {
    this.handlers = handlers;
    this.port.attach({
      onLine: (line) => this.onLine(line),
      onExit: (code) => {
        const wasReady = this.ready;
        this.ready = false;
        this.searching = false;
        this.started = false;
        if (wasReady || code !== 0) {
          this.handlers.onCrash({
            message: `Engine process exited (code ${code})`,
            code,
          });
        }
      },
      onError: (message) => {
        this.ready = false;
        this.handlers.onCrash({ message, code: null });
      },
    });
  }

  isReady(): boolean {
    return this.ready && this.started;
  }

  isSearching(): boolean {
    return this.searching;
  }

  getActiveSessionId(): string | null {
    return this.activeSessionId;
  }

  getEnginePath(): string {
    return 'liblughnasadh.so (on-device)';
  }

  async start(): Promise<void> {
    if (this.started) {
      await this.quit();
    }
    this.ready = false;
    this.searching = false;
    this.activeSessionId = null;

    const result = this.port.start();
    if (!result.ok) {
      const msg = result.error ?? 'Failed to start native engine';
      this.handlers.onError(msg);
      throw new Error(msg);
    }
    this.started = true;

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
      if (trimmed.startsWith('info ') || trimmed.startsWith('bestmove ')) return;
      return;
    }

    const info = parseInfoLine(trimmed, sessionId);
    if (info) {
      if (this.activeSessionId !== sessionId) return;
      this.handlers.onInfo(info);
      return;
    }

    const best = parseBestMoveLine(trimmed, sessionId);
    if (best) {
      if (this.activeSessionId !== sessionId) return;
      this.searching = false;
      this.handlers.onBestMove(best);
    }
  }

  private sendRaw(cmd: string): void {
    if (!this.started) throw new Error('Engine not started');
    this.handlers.onUciLog('out', cmd);
    this.port.send(cmd);
  }

  sendUciCommand(cmd: string): void {
    const allowed = /^(uci|isready|ucinewgame|stop|quit|position\b|go\b|setoption\b)/;
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
  }

  async quit(): Promise<void> {
    this.invalidateSession();
    this.ready = false;
    try {
      this.port.quit();
    } catch {
      /* ignore */
    }
    this.started = false;
    await new Promise((r) => setTimeout(r, 50));
  }
}
