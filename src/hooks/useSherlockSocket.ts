import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  BestMoveResult,
  ClientMessage,
  EngineInfo,
  Evaluation,
  InvestigationStatus,
  PositionState,
  ServerMessage,
} from '../../shared/types';
import { DEFAULT_START_FEN } from '../../shared/types';

export interface LogEntry {
  id: number;
  at: number;
  kind: 'uci' | 'app';
  direction?: 'in' | 'out';
  level?: string;
  text: string;
}

export interface SherlockClientState {
  connected: boolean;
  status: InvestigationStatus;
  statusDetail?: string;
  engineName?: string;
  engineAuthor?: string;
  position: PositionState;
  evaluation: Evaluation | null;
  lastInfo: EngineInfo | null;
  bestMove: BestMoveResult | null;
  sessionId: string | null;
  logs: LogEntry[];
  errorMessage?: string;
  matchState: import('../../shared/types').MatchState | null;
}

let logSeq = 0;

function wsUrl(): string {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  if (import.meta.env.DEV) {
    return `${proto}://${location.hostname}:8787/ws`;
  }
  return `${proto}://${location.host}/ws`;
}

const initialPosition: PositionState = {
  fen: DEFAULT_START_FEN,
  turn: 'w',
  moveList: [],
  lastMove: null,
  inCheck: false,
  gameOver: false,
};

export function useSherlockSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const [state, setState] = useState<SherlockClientState>({
    connected: false,
    status: 'booting',
    position: initialPosition,
    evaluation: null,
    lastInfo: null,
    bestMove: null,
    sessionId: null,
    logs: [],
    matchState: null,
  });

  const pushLog = useCallback((entry: Omit<LogEntry, 'id'>) => {
    setState((s) => ({
      ...s,
      logs: [...s.logs.slice(-400), { ...entry, id: ++logSeq }],
    }));
  }, []);

  const send = useCallback((msg: ClientMessage) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }, []);

  useEffect(() => {
    let closed = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let ws: WebSocket;

    const connect = () => {
      ws = new WebSocket(wsUrl());
      wsRef.current = ws;

      ws.onopen = () => {
        if (closed) return;
        setState((s) => ({ ...s, connected: true }));
        pushLog({ at: Date.now(), kind: 'app', level: 'info', text: 'WebSocket connected' });
      };

      ws.onclose = () => {
        if (closed) return;
        setState((s) => ({ ...s, connected: false }));
        pushLog({ at: Date.now(), kind: 'app', level: 'warn', text: 'WebSocket closed — reconnecting…' });
        retryTimer = setTimeout(connect, 1200);
      };

      ws.onerror = () => {
        pushLog({ at: Date.now(), kind: 'app', level: 'error', text: 'WebSocket error' });
      };

      ws.onmessage = (ev) => {
        let msg: ServerMessage;
        try {
          msg = JSON.parse(String(ev.data)) as ServerMessage;
        } catch {
          return;
        }
        handleMessage(msg);
      };
    };

    const handleMessage = (msg: ServerMessage) => {
      switch (msg.type) {
        case 'hello':
          pushLog({
            at: Date.now(),
            kind: 'app',
            level: 'info',
            text: `${msg.product} ↔ ${msg.engineDefault}`,
          });
          break;
        case 'status':
          setState((s) => ({
            ...s,
            status: msg.status,
            statusDetail: msg.detail,
            errorMessage:
              msg.status === 'engine_error' || msg.status === 'crashed'
                ? msg.detail ?? s.errorMessage
                : msg.status === 'ready' || msg.status === 'investigating'
                  ? undefined
                  : s.errorMessage,
          }));
          break;
        case 'engine_ready':
          setState((s) => ({
            ...s,
            engineName: msg.name,
            engineAuthor: msg.author,
            status: 'ready',
            errorMessage: undefined,
          }));
          pushLog({
            at: Date.now(),
            kind: 'app',
            level: 'info',
            text: `onEngineReady: ${msg.name}`,
          });
          break;
        case 'engine_info':
          setState((s) => ({ ...s, lastInfo: msg.info }));
          break;
        case 'evaluation':
          setState((s) => ({ ...s, evaluation: msg.evaluation }));
          break;
        case 'best_move':
          setState((s) => ({
            ...s,
            bestMove: msg.result,
            status: 'best_move',
          }));
          pushLog({
            at: Date.now(),
            kind: 'app',
            level: 'info',
            text: `BEST MOVE ${msg.result.bestMove}${msg.result.ponder ? ` (ponder ${msg.result.ponder})` : ''}`,
          });
          break;
        case 'analysis_started':
          setState((s) => ({
            ...s,
            sessionId: msg.request.sessionId,
            bestMove: null,
            lastInfo: null,
            evaluation: null,
            status: 'investigating',
          }));
          break;
        case 'analysis_stopped':
          setState((s) => ({
            ...s,
            sessionId:
              s.sessionId === msg.sessionId ? null : s.sessionId,
          }));
          break;
        case 'analysis_error':
          setState((s) => ({
            ...s,
            errorMessage: msg.message,
            status: 'engine_error',
          }));
          pushLog({
            at: Date.now(),
            kind: 'app',
            level: 'error',
            text: msg.message,
          });
          break;
        case 'engine_crashed':
          setState((s) => ({
            ...s,
            errorMessage: msg.message,
            status: 'crashed',
          }));
          pushLog({
            at: Date.now(),
            kind: 'app',
            level: 'error',
            text: `CRASH: ${msg.message}`,
          });
          break;
        case 'position':
          setState((s) => ({ ...s, position: msg.position }));
          break;
        case 'game_loaded':
          pushLog({
            at: Date.now(),
            kind: 'app',
            level: 'info',
            text: `Position loaded (${msg.info.source})`,
          });
          break;
        case 'uci_log':
          pushLog({
            at: msg.at,
            kind: 'uci',
            direction: msg.direction,
            text: msg.line,
          });
          break;
        case 'log':
          pushLog({
            at: msg.at,
            kind: 'app',
            level: msg.level,
            text: msg.message,
          });
          break;
        case 'error':
          pushLog({
            at: Date.now(),
            kind: 'app',
            level: 'error',
            text: msg.message,
          });
          break;
        case 'match_state':
          setState((s) => ({ ...s, matchState: msg.state, status: msg.state.running ? 'matching' : s.status }));
          break;
        case 'match_move':
          pushLog({
            at: Date.now(),
            kind: 'app',
            level: 'info',
            text: `MATCH ${msg.side === 'w' ? 'W' : 'B'} ply ${msg.ply}: ${msg.san} (${msg.uci})`,
          });
          break;
        case 'match_ended':
          setState((s) => ({
            ...s,
            matchState: s.matchState
              ? { ...s.matchState, running: false, result: msg.result, endReason: msg.reason, pgn: msg.pgn }
              : s.matchState,
          }));
          pushLog({
            at: Date.now(),
            kind: 'app',
            level: 'info',
            text: `MATCH ENDED ${msg.result} — ${msg.reason}`,
          });
          break;
        default:
          break;
      }
    };

    connect();

    return () => {
      closed = true;
      if (retryTimer) clearTimeout(retryTimer);
      wsRef.current?.close();
    };
  }, [pushLog]);

  return { state, send, clearLogs: () => setState((s) => ({ ...s, logs: [] })) };
}
