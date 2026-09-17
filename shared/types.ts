/** Shared protocol types: GUI ↔ Controller ↔ Adapter */

export type ScoreType = 'cp' | 'mate';

export interface EngineScore {
  type: ScoreType;
  value: number;
}

export interface EngineInfo {
  depth?: number;
  seldepth?: number;
  multipv?: number;
  score?: EngineScore;
  nodes?: number;
  nps?: number;
  time?: number;
  hashfull?: number;
  tbhits?: number;
  pv?: string[];
  raw: string;
  sessionId: string;
}

export interface BestMoveResult {
  bestMove: string;
  ponder?: string | null;
  sessionId: string;
}

export interface Evaluation {
  scoreCp: number | null;
  mateIn: number | null;
  depth: number;
  nodes: number;
  nps: number;
  timeMs: number;
  pv: string[];
  sessionId: string;
}

export interface AnalysisRequest {
  fen: string;
  moves?: string[];
  depth?: number;
  movetime?: number;
  /** Optional client hint; server assigns canonical sessionId */
  sessionId?: string;
}

export interface PositionState {
  fen: string;
  turn: 'w' | 'b';
  moveList: string[];
  lastMove?: { from: string; to: string } | null;
  inCheck: boolean;
  gameOver: boolean;
}

export interface GameLoadedInfo {
  fen: string;
  pgn?: string;
  source: 'fen' | 'pgn' | 'startpos' | 'move';
}

/** Callbacks the controller exposes (spirit of SherlockEngineCallbacks) */
export interface SherlockEngineCallbacks {
  onEngineReady: (meta: { name: string; author?: string }) => void;
  onEngineInfo: (info: EngineInfo) => void;
  onBestMove: (result: BestMoveResult) => void;
  onEvaluationChanged: (evaluation: Evaluation) => void;
  onAnalysisStarted: (request: AnalysisRequest & { sessionId: string }) => void;
  onAnalysisStopped: (payload: { sessionId: string; reason: 'stop' | 'bestmove' | 'cancelled' | 'error' }) => void;
  onAnalysisError: (error: { message: string; sessionId?: string }) => void;
  onEngineCrashed: (error: { message: string; code?: number | null }) => void;
  onPositionChanged: (position: PositionState) => void;
  onGameLoaded: (info: GameLoadedInfo) => void;
}

export type InvestigationStatus =
  | 'booting'
  | 'ready'
  | 'investigating'
  | 'best_move'
  | 'stopped'
  | 'engine_error'
  | 'crashed';

/** Wire protocol: browser ↔ server */
export type ClientMessage =
  | { type: 'ping' }
  | { type: 'load_fen'; fen: string }
  | { type: 'new_position' }
  | { type: 'load_pgn'; pgn: string }
  | { type: 'play_move'; from: string; to: string; promotion?: string }
  | { type: 'analyze'; depth?: number; movetime?: number }
  | { type: 'stop' }
  | { type: 'restart_engine' }
  | { type: 'set_debug'; enabled: boolean };

export type ServerMessage =
  | { type: 'pong' }
  | { type: 'hello'; product: string; engineDefault: string }
  | { type: 'status'; status: InvestigationStatus; detail?: string }
  | { type: 'engine_ready'; name: string; author?: string }
  | { type: 'engine_info'; info: EngineInfo }
  | { type: 'best_move'; result: BestMoveResult }
  | { type: 'evaluation'; evaluation: Evaluation }
  | { type: 'analysis_started'; request: AnalysisRequest & { sessionId: string } }
  | { type: 'analysis_stopped'; sessionId: string; reason: 'stop' | 'bestmove' | 'cancelled' | 'error' }
  | { type: 'analysis_error'; message: string; sessionId?: string }
  | { type: 'engine_crashed'; message: string; code?: number | null }
  | { type: 'position'; position: PositionState }
  | { type: 'game_loaded'; info: GameLoadedInfo }
  | { type: 'uci_log'; direction: 'in' | 'out'; line: string; at: number }
  | { type: 'log'; level: 'debug' | 'info' | 'warn' | 'error'; message: string; at: number }
  | { type: 'error'; message: string };

export const DEFAULT_START_FEN =
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export const PRODUCT_NAME = 'S H E R L O C K';
export const ENGINE_DISPLAY_NAME = 'Lughnasadh 0.2';
