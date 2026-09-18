/**
 * SherlockController — investigation desk brain.
 * GUI never talks raw UCI; all engine I/O goes through LocalLughnasadhAdapter (native ProcessBuilder).
 * Position state survives engine timeout/crash/restart.
 */
import { Chess } from 'chess.js';
import { LocalLughnasadhAdapter } from './LocalLughnasadhAdapter';
import {
  DEFAULT_START_FEN,
  ENGINE_DISPLAY_NAME,
  type AnalysisRequest,
  type BestMoveResult,
  type EngineInfo,
  type Evaluation,
  type GameLoadedInfo,
  type InvestigationStatus,
  type PositionState,
  type SherlockEngineCallbacks,
} from '../../shared/types';

export type ControllerListener = Partial<SherlockEngineCallbacks> & {
  onStatus?: (status: InvestigationStatus, detail?: string) => void;
  onUciLog?: (direction: 'in' | 'out', line: string) => void;
  onLog?: (level: 'debug' | 'info' | 'warn' | 'error', message: string) => void;
};

function newSessionId(): string {
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

function uciToSquares(uci: string): { from: string; to: string } | null {
  if (!uci || uci === '(none)' || uci.length < 4) return null;
  return { from: uci.slice(0, 2), to: uci.slice(2, 4) };
}

export class LocalController {
  private adapter: LocalLughnasadhAdapter;
  private chess = new Chess();
  private listeners = new Set<ControllerListener>();
  private status: InvestigationStatus = 'booting';
  private activeSessionId: string | null = null;
  private lastEvaluation: Evaluation | null = null;
  private debugUci = true;
  private analysisTimeout: ReturnType<typeof setTimeout> | null = null;
  private restarting = false;

  constructor() {
    this.adapter = new LocalLughnasadhAdapter({
      onReady: (meta) => {
        this.setStatus('ready');
        this.emit('onEngineReady', meta);
      },
      onInfo: (info) => this.handleInfo(info),
      onBestMove: (result) => this.handleBestMove(result),
      onUciLog: (dir, line) => {
        if (this.debugUci) this.emitRaw('onUciLog', dir, line);
      },
      onCrash: (err) => this.handleCrash(err),
      onError: (msg) => {
        this.emitRaw('onLog', 'error', msg);
        this.emit('onAnalysisError', { message: msg });
      },
    });
  }

  subscribe(listener: ControllerListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getStatus(): InvestigationStatus {
    return this.status;
  }

  getPosition(): PositionState {
    return this.snapshotPosition();
  }

  getEnginePath(): string {
    return this.adapter.getEnginePath();
  }

  setDebug(enabled: boolean): void {
    this.debugUci = enabled;
  }

  async boot(): Promise<void> {
    this.setStatus('booting', 'Starting Lughnasadh 0.2…');
    try {
      await this.adapter.start();
      // Preserve current board FEN across boot; sync engine to it
      this.syncEnginePosition();
      this.setStatus('ready');
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.setStatus('engine_error', message);
      this.emit('onAnalysisError', { message });
      throw e;
    }
  }

  async restartEngine(): Promise<void> {
    if (this.restarting) return;
    this.restarting = true;
    this.clearAnalysisTimeout();
    this.activeSessionId = null;
    this.adapter.invalidateSession();
    // Position (this.chess) intentionally preserved
    const fen = this.chess.fen();
    this.emitRaw('onLog', 'info', `Restarting engine; position preserved: ${fen}`);
    this.setStatus('booting', 'Restarting Lughnasadh 0.2…');
    try {
      await this.adapter.quit();
      await this.adapter.start();
      this.syncEnginePosition();
      this.setStatus('ready');
      this.emit('onPositionChanged', this.snapshotPosition());
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.setStatus('engine_error', message);
      this.emit('onAnalysisError', { message });
    } finally {
      this.restarting = false;
    }
  }

  loadFen(fen: string): void {
    const trimmed = fen.trim();
    try {
      this.chess.load(trimmed);
    } catch {
      this.emit('onAnalysisError', { message: `Invalid FEN: ${trimmed}` });
      return;
    }
    void this.cancelAnalysis('cancelled');
    this.syncEnginePosition();
    const info: GameLoadedInfo = { fen: this.chess.fen(), source: 'fen' };
    this.emit('onGameLoaded', info);
    this.emit('onPositionChanged', this.snapshotPosition());
    if (this.adapter.isReady()) this.setStatus('ready');
  }

  newPosition(): void {
    this.chess.reset();
    void this.cancelAnalysis('cancelled');
    this.adapter.newGame();
    this.syncEnginePosition();
    this.emit('onGameLoaded', { fen: DEFAULT_START_FEN, source: 'startpos' });
    this.emit('onPositionChanged', this.snapshotPosition());
    if (this.adapter.isReady()) this.setStatus('ready');
  }

  loadPgn(pgn: string): void {
    try {
      this.chess.loadPgn(pgn, { strict: false });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'PGN parse failed';
      this.emit('onAnalysisError', { message });
      return;
    }
    void this.cancelAnalysis('cancelled');
    this.syncEnginePosition();
    this.emit('onGameLoaded', {
      fen: this.chess.fen(),
      pgn: pgn.trim(),
      source: 'pgn',
    });
    this.emit('onPositionChanged', this.snapshotPosition());
    if (this.adapter.isReady()) this.setStatus('ready');
  }

  playMove(from: string, to: string, promotion?: string): boolean {
    const move = this.chess.move({
      from,
      to,
      promotion: (promotion as 'q' | 'r' | 'b' | 'n' | undefined) ?? 'q',
    });
    if (!move) return false;
    void this.cancelAnalysis('cancelled');
    this.syncEnginePosition();
    this.emit('onPositionChanged', this.snapshotPosition());
    this.emit('onGameLoaded', { fen: this.chess.fen(), source: 'move' });
    if (this.adapter.isReady()) this.setStatus('ready');
    return true;
  }

  /**
   * Cancel previous analysis before starting a new one.
   * Session tokens discard stale info/bestmove.
   */
  async analyze(opts: { depth?: number; movetime?: number } = {}): Promise<string> {
    if (!this.adapter.isReady()) {
      this.emit('onAnalysisError', { message: 'Engine not ready' });
      this.setStatus('engine_error', 'Engine not ready');
      throw new Error('Engine not ready');
    }

    await this.cancelAnalysis('cancelled');

    const sessionId = newSessionId();
    this.activeSessionId = sessionId;
    this.lastEvaluation = null;

    const request: AnalysisRequest & { sessionId: string } = {
      fen: this.chess.fen(),
      depth: opts.depth,
      movetime: opts.movetime,
      sessionId,
    };

    this.syncEnginePosition();
    this.setStatus('investigating', `session ${sessionId}`);
    this.emit('onAnalysisStarted', request);

    // Soft timeout for hung searches (does not kill position)
    const limitMs =
      opts.movetime != null && opts.movetime > 0
        ? opts.movetime + 5000
        : ((opts.depth ?? 12) * 3000) + 10000;
    this.clearAnalysisTimeout();
    this.analysisTimeout = setTimeout(() => {
      if (this.activeSessionId !== sessionId) return;
      this.emitRaw('onLog', 'warn', `Analysis timeout session ${sessionId}`);
      this.adapter.stop();
      this.adapter.invalidateSession();
      this.activeSessionId = null;
      this.setStatus('engine_error', 'Analysis timed out — use Retry / Restart');
      this.emit('onAnalysisError', {
        message: 'Analysis timed out',
        sessionId,
      });
      this.emit('onAnalysisStopped', { sessionId, reason: 'error' });
    }, limitMs);

    try {
      this.adapter.go(sessionId, {
        depth: opts.depth,
        movetime: opts.movetime,
      });
    } catch (e) {
      this.clearAnalysisTimeout();
      this.activeSessionId = null;
      const message = e instanceof Error ? e.message : String(e);
      this.setStatus('engine_error', message);
      this.emit('onAnalysisError', { message, sessionId });
      throw e;
    }

    return sessionId;
  }

  stop(): void {
    void this.cancelAnalysis('stop');
  }

  async shutdown(): Promise<void> {
    this.clearAnalysisTimeout();
    this.activeSessionId = null;
    await this.adapter.quit();
  }

  private async cancelAnalysis(
    reason: 'stop' | 'cancelled' | 'error',
  ): Promise<void> {
    this.clearAnalysisTimeout();
    const prev = this.activeSessionId;
    if (!prev && !this.adapter.isSearching()) {
      this.adapter.invalidateSession();
      return;
    }
    this.adapter.stop();
    // Invalidate so late replies from prev session are dropped
    this.adapter.invalidateSession();
    this.activeSessionId = null;
    if (prev) {
      this.emit('onAnalysisStopped', { sessionId: prev, reason });
      if (reason === 'stop') this.setStatus('stopped');
    }
    // Brief yield so engine can emit bestmove after stop (still discarded if stale)
    await new Promise((r) => setTimeout(r, 30));
  }

  private handleInfo(info: EngineInfo): void {
    if (!this.activeSessionId || info.sessionId !== this.activeSessionId) {
      return; // stale session
    }
    this.emit('onEngineInfo', info);

    const evaluation: Evaluation = {
      scoreCp: info.score?.type === 'cp' ? info.score.value : this.lastEvaluation?.scoreCp ?? null,
      mateIn: info.score?.type === 'mate' ? info.score.value : null,
      depth: info.depth ?? this.lastEvaluation?.depth ?? 0,
      nodes: info.nodes ?? this.lastEvaluation?.nodes ?? 0,
      nps: info.nps ?? this.lastEvaluation?.nps ?? 0,
      timeMs: info.time ?? this.lastEvaluation?.timeMs ?? 0,
      pv: info.pv ?? this.lastEvaluation?.pv ?? [],
      sessionId: info.sessionId,
    };
    if (info.score?.type === 'mate') {
      evaluation.scoreCp = null;
    }
    this.lastEvaluation = evaluation;
    this.emit('onEvaluationChanged', evaluation);
  }

  private handleBestMove(result: BestMoveResult): void {
    if (!this.activeSessionId || result.sessionId !== this.activeSessionId) {
      return; // stale
    }
    this.clearAnalysisTimeout();
    const sessionId = result.sessionId;
    this.activeSessionId = null;
    this.adapter.invalidateSession();
    this.setStatus('best_move', result.bestMove);
    this.emit('onBestMove', result);
    this.emit('onAnalysisStopped', { sessionId, reason: 'bestmove' });
  }

  private handleCrash(err: { message: string; code?: number | null }): void {
    this.clearAnalysisTimeout();
    const sid = this.activeSessionId;
    this.activeSessionId = null;
    this.adapter.invalidateSession();
    // Position preserved in this.chess
    this.setStatus('crashed', err.message);
    this.emit('onEngineCrashed', err);
    if (sid) {
      this.emit('onAnalysisStopped', { sessionId: sid, reason: 'error' });
    }
    this.emitRaw(
      'onLog',
      'error',
      `${err.message} — position preserved (${this.chess.fen()})`,
    );
  }

  private syncEnginePosition(): void {
    if (!this.adapter.isReady()) return;
    try {
      this.adapter.setPosition(this.chess.fen());
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.emitRaw('onLog', 'warn', `syncEnginePosition: ${message}`);
    }
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

  private setStatus(status: InvestigationStatus, detail?: string): void {
    this.status = status;
    this.emitRaw('onStatus', status, detail);
  }

  private clearAnalysisTimeout(): void {
    if (this.analysisTimeout) {
      clearTimeout(this.analysisTimeout);
      this.analysisTimeout = null;
    }
  }

  private emit<K extends keyof SherlockEngineCallbacks>(
    key: K,
    ...args: Parameters<SherlockEngineCallbacks[K]>
  ): void {
    for (const l of this.listeners) {
      const fn = l[key] as SherlockEngineCallbacks[K] | undefined;
      if (typeof fn === 'function') {
        try {
          // @ts-expect-error spread into callback
          fn(...args);
        } catch (e) {
          console.error('listener error', key, e);
        }
      }
    }
  }

  private emitRaw(key: keyof ControllerListener, ...args: unknown[]): void {
    for (const l of this.listeners) {
      const fn = (l as Record<string, unknown>)[key];
      if (typeof fn === 'function') {
        try {
          (fn as (...a: unknown[]) => void)(...args);
        } catch (e) {
          console.error('listener error', key, e);
        }
      }
    }
  }
}

export { ENGINE_DISPLAY_NAME };
export { LocalController as SherlockController };
