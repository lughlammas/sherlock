/**
 * On-device Sherlock: GUI → LocalController → LocalLughnasadhAdapter → NativeUciPort.
 * Same ClientMessage send() surface as useSherlockSocket.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  BestMoveResult,
  ClientMessage,
  EngineInfo,
  Evaluation,
  InvestigationStatus,
  PositionState,
} from '../../shared/types';
import { DEFAULT_START_FEN, ENGINE_DISPLAY_NAME, PRODUCT_NAME } from '../../shared/types';
import { LocalController } from '../local/LocalController';
import type { LogEntry, SherlockClientState } from './useSherlockSocket';

let logSeq = 0;

const initialPosition: PositionState = {
  fen: DEFAULT_START_FEN,
  turn: 'w',
  moveList: [],
  lastMove: null,
  inCheck: false,
  gameOver: false,
};

export function useSherlockLocal() {
  const controllerRef = useRef<LocalController | null>(null);
  const [state, setState] = useState<SherlockClientState>({
    connected: false,
    status: 'booting',
    position: initialPosition,
    evaluation: null,
    lastInfo: null,
    bestMove: null,
    sessionId: null,
    logs: [],
  });

  const pushLog = useCallback((entry: Omit<LogEntry, 'id'>) => {
    setState((s) => ({
      ...s,
      logs: [...s.logs.slice(-400), { ...entry, id: ++logSeq }],
    }));
  }, []);

  useEffect(() => {
    const controller = new LocalController();
    controllerRef.current = controller;

    const unsub = controller.subscribe({
      onStatus: (status, detail) => {
        setState((s) => ({
          ...s,
          status,
          statusDetail: detail,
          errorMessage:
            status === 'engine_error' || status === 'crashed'
              ? detail ?? s.errorMessage
              : status === 'ready' || status === 'investigating'
                ? undefined
                : s.errorMessage,
        }));
      },
      onEngineReady: (meta) => {
        setState((s) => ({
          ...s,
          connected: true,
          engineName: meta.name,
          engineAuthor: meta.author,
          status: 'ready',
          errorMessage: undefined,
        }));
        pushLog({
          at: Date.now(),
          kind: 'app',
          level: 'info',
          text: `onEngineReady: ${meta.name}`,
        });
      },
      onEngineInfo: (info: EngineInfo) => {
        setState((s) => ({ ...s, lastInfo: info }));
      },
      onEvaluationChanged: (evaluation: Evaluation) => {
        setState((s) => ({ ...s, evaluation }));
      },
      onBestMove: (result: BestMoveResult) => {
        setState((s) => ({ ...s, bestMove: result, status: 'best_move' }));
        pushLog({
          at: Date.now(),
          kind: 'app',
          level: 'info',
          text: `BEST MOVE ${result.bestMove}${result.ponder ? ` (ponder ${result.ponder})` : ''}`,
        });
      },
      onAnalysisStarted: (request) => {
        setState((s) => ({
          ...s,
          sessionId: request.sessionId,
          bestMove: null,
          lastInfo: null,
          evaluation: null,
          status: 'investigating',
        }));
      },
      onAnalysisStopped: (payload) => {
        setState((s) => ({
          ...s,
          sessionId: s.sessionId === payload.sessionId ? null : s.sessionId,
        }));
      },
      onAnalysisError: (error) => {
        setState((s) => ({
          ...s,
          errorMessage: error.message,
          status: 'engine_error',
        }));
        pushLog({
          at: Date.now(),
          kind: 'app',
          level: 'error',
          text: error.message,
        });
      },
      onEngineCrashed: (error) => {
        setState((s) => ({
          ...s,
          errorMessage: error.message,
          status: 'crashed',
          connected: false,
        }));
        pushLog({
          at: Date.now(),
          kind: 'app',
          level: 'error',
          text: `CRASH: ${error.message}`,
        });
      },
      onPositionChanged: (position) => {
        setState((s) => ({ ...s, position }));
      },
      onGameLoaded: (info) => {
        pushLog({
          at: Date.now(),
          kind: 'app',
          level: 'info',
          text: `Position loaded (${info.source})`,
        });
      },
      onUciLog: (direction, line) => {
        pushLog({ at: Date.now(), kind: 'uci', direction, text: line });
      },
      onLog: (level, message) => {
        pushLog({ at: Date.now(), kind: 'app', level, text: message });
      },
    });

    pushLog({
      at: Date.now(),
      kind: 'app',
      level: 'info',
      text: `${PRODUCT_NAME} ↔ ${ENGINE_DISPLAY_NAME} (on-device)`,
    });
    setState((s) => ({ ...s, connected: true, position: controller.getPosition() }));

    void controller.boot().catch((e) => {
      const message = e instanceof Error ? e.message : String(e);
      pushLog({ at: Date.now(), kind: 'app', level: 'error', text: message });
    });

    return () => {
      unsub();
      void controller.shutdown();
      controllerRef.current = null;
    };
  }, [pushLog]);

  const send = useCallback((msg: ClientMessage) => {
    const c = controllerRef.current;
    if (!c) return;
    switch (msg.type) {
      case 'ping':
        break;
      case 'load_fen':
        c.loadFen(msg.fen);
        break;
      case 'new_position':
        c.newPosition();
        break;
      case 'load_pgn':
        c.loadPgn(msg.pgn);
        break;
      case 'play_move':
        c.playMove(msg.from, msg.to, msg.promotion);
        break;
      case 'analyze':
        void c.analyze({ depth: msg.depth, movetime: msg.movetime });
        break;
      case 'stop':
        c.stop();
        break;
      case 'restart_engine':
        void c.restartEngine();
        break;
      case 'set_debug':
        c.setDebug(msg.enabled);
        break;
      default:
        break;
    }
  }, []);

  return {
    state,
    send,
    clearLogs: () => setState((s) => ({ ...s, logs: [] })),
  };
}
