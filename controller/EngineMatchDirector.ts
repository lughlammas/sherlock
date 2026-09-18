/**
 * EngineMatchDirector — Lughnasadh × Lughnasadh continuous match.
 * Two independent UCI processes (white + black). Classical UCI only.
 * Never blocks the UI; streams PGN/state as bestmoves arrive.
 */
import { Chess } from 'chess.js';
import type {
  BestMoveResult,
  EngineInfo,
  Evaluation,
  MatchConfig,
  MatchGoOpts,
  MatchSideTelemetry,
  MatchState,
  PositionState,
} from '../shared/types.js';
import {
  DEFAULT_MATCH_HASH_MB,
  DEFAULT_MATCH_MOVETIME_MS,
  DEFAULT_MATCH_THREADS,
  ENGINE_HASH_MAX_MB,
} from '../shared/types.js';

export interface MatchAdapterHandlers {
  onReady: (meta: { name: string; author?: string }) => void;
  onInfo: (info: EngineInfo) => void;
  onBestMove: (result: BestMoveResult) => void;
  onUciLog: (direction: 'in' | 'out', line: string) => void;
  onCrash: (error: { message: string; code?: number | null }) => void;
  onError: (message: string) => void;
}

export interface MatchCapableAdapter {
  start(): Promise<void>;
  quit(): Promise<void>;
  isReady(): boolean;
  isSearching(): boolean;
  newGame(): void;
  setPosition(fen: string, moves?: string[]): void;
  go(sessionId: string, opts: { depth?: number; movetime?: number }): void;
  stop(): void;
  invalidateSession(): void;
  configurePower(opts: { hashMb: number; threads: number }): Promise<void>;
}

export type MatchAdapterFactory = (
  side: 'w' | 'b',
  handlers: MatchAdapterHandlers,
) => MatchCapableAdapter;

export interface MatchDirectorListeners {
  onStatus?: (status: string, detail?: string) => void;
  onLog?: (level: 'debug' | 'info' | 'warn' | 'error', message: string) => void;
  onUciLog?: (direction: 'in' | 'out', line: string, side: 'w' | 'b') => void;
  onPositionChanged?: (position: PositionState) => void;
  onMatchState?: (state: MatchState) => void;
  onMatchMove?: (payload: {
    san: string;
    uci: string;
    ply: number;
    side: 'w' | 'b';
    fen: string;
  }) => void;
  onMatchEnded?: (payload: { result: string; reason: string; pgn: string }) => void;
  onEngineInfo?: (side: 'w' | 'b', info: EngineInfo) => void;
  onEvaluationChanged?: (side: 'w' | 'b', evaluation: Evaluation) => void;
  onError?: (message: string) => void;
}

function newSessionId(side: 'w' | 'b'): string {
  return `m${side}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function emptySide(): MatchSideTelemetry {
  return {
    thinking: false,
    nodes: 0,
    nps: 0,
    depth: 0,
    timeMs: 0,
    eval: null,
    sessionId: null,
  };
}

function clampHash(mb: number): number {
  return Math.max(1, Math.min(ENGINE_HASH_MAX_MB, Math.floor(mb)));
}

export class EngineMatchDirector {
  private white: MatchCapableAdapter | null = null;
  private black: MatchCapableAdapter | null = null;
  private chess = new Chess();
  private running = false;
  private stopping = false;
  private hashMb = DEFAULT_MATCH_HASH_MB;
  private threads = DEFAULT_MATCH_THREADS;
  private goOpts: MatchGoOpts = { movetime: DEFAULT_MATCH_MOVETIME_MS };
  private whiteTel = emptySide();
  private blackTel = emptySide();
  private result: string | null = null;
  private endReason: string | null = null;
  private startedAt: number | null = null;
  private activeSide: 'w' | 'b' | null = null;
  private ply = 0;
  private endedEmitted = false;
  private listeners: MatchDirectorListeners;
  private factory: MatchAdapterFactory;
  private bootPromise: Promise<void> | null = null;

  constructor(factory: MatchAdapterFactory, listeners: MatchDirectorListeners = {}) {
    this.factory = factory;
    this.listeners = listeners;
  }

  isRunning(): boolean {
    return this.running;
  }

  getState(): MatchState {
    return this.snapshot();
  }

  getPosition(): PositionState {
    return this.snapshotPosition();
  }

  async ensureEngines(config?: MatchConfig): Promise<void> {
    if (config?.hashMb != null) this.hashMb = clampHash(config.hashMb);
    if (config?.threads != null) this.threads = Math.max(1, Math.floor(config.threads));
    if (config?.go) this.goOpts = { ...config.go };

    if (this.bootPromise) {
      await this.bootPromise;
      return;
    }

    if (this.white?.isReady() && this.black?.isReady()) {
      await Promise.all([
        this.white.configurePower({ hashMb: this.hashMb, threads: this.threads }),
        this.black.configurePower({ hashMb: this.hashMb, threads: this.threads }),
      ]);
      return;
    }

    this.bootPromise = this.bootBoth();
    try {
      await this.bootPromise;
    } finally {
      this.bootPromise = null;
    }
  }

  private async bootBoth(): Promise<void> {
    await this.destroyEngines();
    this.white = this.factory('w', this.handlersFor('w'));
    this.black = this.factory('b', this.handlersFor('b'));

    this.listeners.onLog?.('info', 'CASO CRUZADO: spawning two Lughnasadh 0.2 processes…');
    await Promise.all([this.white.start(), this.black.start()]);
    await Promise.all([
      this.white.configurePower({ hashMb: this.hashMb, threads: this.threads }),
      this.black.configurePower({ hashMb: this.hashMb, threads: this.threads }),
    ]);
    this.listeners.onLog?.(
      'info',
      `Engines ready — Hash=${this.hashMb}MB×2 Threads=${this.threads}×2 (dual process)`,
    );
    this.emitState();
  }

  private handlersFor(side: 'w' | 'b'): MatchAdapterHandlers {
    return {
      onReady: (meta) => {
        this.listeners.onLog?.(
          'info',
          `${side === 'w' ? 'White' : 'Black'} ready: ${meta.name}`,
        );
      },
      onInfo: (info) => this.onInfo(side, info),
      onBestMove: (result) => {
        void this.onBestMove(side, result);
      },
      onUciLog: (dir, line) => this.listeners.onUciLog?.(dir, line, side),
      onCrash: (err) => {
        this.listeners.onLog?.('error', `${side} crash: ${err.message}`);
        if (this.running) void this.finish('*', `engine_crash_${side}`);
        this.listeners.onError?.(err.message);
      },
      onError: (msg) => this.listeners.onError?.(msg),
    };
  }

  async startMatch(config: MatchConfig = {}): Promise<void> {
    if (this.running) await this.stopMatch();

    if (config.hashMb != null) this.hashMb = clampHash(config.hashMb);
    if (config.threads != null) this.threads = Math.max(1, Math.floor(config.threads));
    if (config.go) this.goOpts = { ...config.go };
    else if (this.goOpts.movetime == null && this.goOpts.depth == null) {
      this.goOpts = { movetime: DEFAULT_MATCH_MOVETIME_MS };
    }

    await this.ensureEngines(config);

    this.chess.reset();
    this.ply = 0;
    this.result = null;
    this.endReason = null;
    this.endedEmitted = false;
    this.whiteTel = emptySide();
    this.blackTel = emptySide();
    this.startedAt = Date.now();
    this.running = true;
    this.stopping = false;

    this.white!.newGame();
    this.black!.newGame();
    this.syncPositions();

    this.listeners.onPositionChanged?.(this.snapshotPosition());
    this.listeners.onStatus?.('matching', 'CASO CRUZADO — Lughnasadh × Lughnasadh');
    this.emitState();
    this.listeners.onLog?.(
      'warn',
      `FULL POWER — Hash ${this.hashMb}MB×2 · ${this.describeGo()} · high battery/RAM drain`,
    );

    this.askSide('w');
  }

  async stopMatch(): Promise<void> {
    const wasRunning = this.running;
    this.stopping = true;
    this.running = false;
    this.white?.stop();
    this.black?.stop();
    this.white?.invalidateSession();
    this.black?.invalidateSession();
    this.whiteTel.thinking = false;
    this.blackTel.thinking = false;
    this.activeSide = null;
    if (!this.endReason) this.endReason = 'stopped';
    if (!this.result) this.result = '*';
    this.emitState();
    if (wasRunning || !this.endedEmitted) {
      this.endedEmitted = true;
      this.listeners.onMatchEnded?.({
        result: this.result,
        reason: this.endReason,
        pgn: this.chess.pgn(),
      });
    }
    this.listeners.onStatus?.('ready', 'Match stopped');
    await new Promise((r) => setTimeout(r, 40));
  }

  async newMatch(config?: MatchConfig): Promise<void> {
    await this.stopMatch();
    await this.startMatch(
      config ?? { go: this.goOpts, hashMb: this.hashMb, threads: this.threads },
    );
  }

  resetBoard(): void {
    void this.stopMatch();
    this.chess.reset();
    this.ply = 0;
    this.result = null;
    this.endReason = null;
    this.endedEmitted = false;
    this.whiteTel = emptySide();
    this.blackTel = emptySide();
    this.startedAt = null;
    this.listeners.onPositionChanged?.(this.snapshotPosition());
    this.emitState();
  }

  async shutdown(): Promise<void> {
    await this.stopMatch();
    await this.destroyEngines();
  }

  private async destroyEngines(): Promise<void> {
    const w = this.white;
    const b = this.black;
    this.white = null;
    this.black = null;
    await Promise.allSettled([w?.quit(), b?.quit()]);
  }

  private describeGo(): string {
    if (this.goOpts.movetime != null && this.goOpts.movetime > 0) {
      return `movetime ${this.goOpts.movetime}ms`;
    }
    return `depth ${this.goOpts.depth ?? 18}`;
  }

  private askSide(side: 'w' | 'b'): void {
    if (!this.running || this.stopping) return;
    if (this.chess.isGameOver()) {
      void this.finishByRules();
      return;
    }

    const adapter = side === 'w' ? this.white : this.black;
    if (!adapter?.isReady()) {
      this.listeners.onError?.(`${side} engine not ready`);
      void this.finish('*', 'engine_not_ready');
      return;
    }

    const sessionId = newSessionId(side);
    this.activeSide = side;
    const tel = side === 'w' ? this.whiteTel : this.blackTel;
    tel.thinking = true;
    tel.sessionId = sessionId;
    tel.nodes = 0;
    tel.nps = 0;
    tel.depth = 0;
    tel.timeMs = 0;

    this.syncPositions();
    this.emitState();

    try {
      adapter.go(sessionId, {
        movetime: this.goOpts.movetime,
        depth: this.goOpts.depth,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.listeners.onError?.(message);
      void this.finish('*', 'go_failed');
    }
  }

  private onInfo(side: 'w' | 'b', info: EngineInfo): void {
    const tel = side === 'w' ? this.whiteTel : this.blackTel;
    if (!tel.sessionId || info.sessionId !== tel.sessionId) return;

    if (info.nodes != null) tel.nodes = info.nodes;
    if (info.nps != null) tel.nps = info.nps;
    if (info.depth != null) tel.depth = info.depth;
    if (info.time != null) tel.timeMs = info.time;

    const evaluation: Evaluation = {
      scoreCp: info.score?.type === 'cp' ? info.score.value : tel.eval?.scoreCp ?? null,
      mateIn: info.score?.type === 'mate' ? info.score.value : null,
      depth: info.depth ?? tel.eval?.depth ?? 0,
      nodes: info.nodes ?? tel.eval?.nodes ?? 0,
      nps: info.nps ?? tel.eval?.nps ?? 0,
      timeMs: info.time ?? tel.eval?.timeMs ?? 0,
      pv: info.pv ?? tel.eval?.pv ?? [],
      sessionId: info.sessionId,
    };
    if (info.score?.type === 'mate') evaluation.scoreCp = null;
    tel.eval = evaluation;

    this.listeners.onEngineInfo?.(side, info);
    this.listeners.onEvaluationChanged?.(side, evaluation);
    this.emitState();
  }

  private async onBestMove(side: 'w' | 'b', result: BestMoveResult): Promise<void> {
    const tel = side === 'w' ? this.whiteTel : this.blackTel;
    if (!tel.sessionId || result.sessionId !== tel.sessionId) return;

    tel.thinking = false;
    tel.sessionId = null;
    (side === 'w' ? this.white : this.black)?.invalidateSession();

    if (!this.running || this.stopping) {
      this.emitState();
      return;
    }
    if (this.activeSide !== side) return;
    this.activeSide = null;

    const uci = result.bestMove;
    if (!uci || uci === '(none)') {
      await this.finish(this.chess.turn() === 'w' ? '0-1' : '1-0', 'no_legal_move');
      return;
    }

    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    const promotion = uci.length > 4 ? uci[4] : undefined;
    let move;
    try {
      move = this.chess.move({
        from,
        to,
        promotion: (promotion as 'q' | 'r' | 'b' | 'n' | undefined) ?? undefined,
      });
    } catch {
      move = null;
    }

    if (!move) {
      this.listeners.onLog?.('error', `Illegal bestmove from ${side}: ${uci}`);
      await this.finish('*', 'illegal_bestmove');
      return;
    }

    this.ply = this.chess.history().length;
    this.listeners.onMatchMove?.({
      san: move.san,
      uci,
      ply: this.ply,
      side,
      fen: this.chess.fen(),
    });
    this.listeners.onPositionChanged?.(this.snapshotPosition());
    this.emitState();

    if (this.chess.isGameOver()) {
      await this.finishByRules();
      return;
    }

    await new Promise((r) => setTimeout(r, 0));
    if (!this.running || this.stopping) return;
    this.askSide(this.chess.turn() as 'w' | 'b');
  }

  private async finishByRules(): Promise<void> {
    let result = '*';
    let reason = 'game_over';
    if (this.chess.isCheckmate()) {
      result = this.chess.turn() === 'w' ? '0-1' : '1-0';
      reason = 'checkmate';
    } else if (this.chess.isStalemate()) {
      result = '1/2-1/2';
      reason = 'stalemate';
    } else if (this.chess.isThreefoldRepetition()) {
      result = '1/2-1/2';
      reason = 'threefold';
    } else if (this.chess.isInsufficientMaterial()) {
      result = '1/2-1/2';
      reason = 'insufficient';
    } else if (this.chess.isDraw()) {
      result = '1/2-1/2';
      reason = 'draw';
    }
    await this.finish(result, reason);
  }

  private async finish(result: string, reason: string): Promise<void> {
    this.running = false;
    this.stopping = true;
    this.result = result;
    this.endReason = reason;
    this.white?.stop();
    this.black?.stop();
    this.white?.invalidateSession();
    this.black?.invalidateSession();
    this.whiteTel.thinking = false;
    this.blackTel.thinking = false;
    this.activeSide = null;
    this.emitState();
    if (!this.endedEmitted) {
      this.endedEmitted = true;
      this.listeners.onMatchEnded?.({
        result,
        reason,
        pgn: this.chess.pgn(),
      });
    }
    this.listeners.onStatus?.('ready', `Match ended ${result} (${reason})`);
    this.listeners.onLog?.('info', `Match ended: ${result} — ${reason}`);
  }

  private syncPositions(): void {
    const fen = this.chess.fen();
    try {
      this.white?.setPosition(fen);
      this.black?.setPosition(fen);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.listeners.onLog?.('warn', `syncPositions: ${message}`);
    }
  }

  private snapshot(): MatchState {
    return {
      running: this.running,
      mode: 'lugh_vs_lugh',
      sideToMove: this.chess.turn(),
      ply: this.ply,
      hashMb: this.hashMb,
      threads: this.threads,
      go: { ...this.goOpts },
      white: { ...this.whiteTel },
      black: { ...this.blackTel },
      result: this.result,
      endReason: this.endReason,
      pgn: this.chess.pgn(),
      startedAt: this.startedAt,
    };
  }

  private snapshotPosition(): PositionState {
    const history = this.chess.history({ verbose: true });
    const last = history[history.length - 1];
    return {
      fen: this.chess.fen(),
      turn: this.chess.turn(),
      moveList: this.chess.history(),
      lastMove: last ? { from: last.from, to: last.to } : null,
      inCheck: this.chess.inCheck(),
      gameOver: this.chess.isGameOver(),
    };
  }

  private emitState(): void {
    this.listeners.onMatchState?.(this.snapshot());
  }
}
