/**
 * Sherlock HTTP + WebSocket server.
 * Binds 127.0.0.1:8787 by default. Spawns real Lughnasadh via controller.
 */
import http from 'node:http';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { WebSocketServer, type WebSocket } from 'ws';
import { SherlockController } from '../controller/SherlockController.js';
import {
  ENGINE_DISPLAY_NAME,
  PRODUCT_NAME,
  type ClientMessage,
  type ServerMessage,
} from '../shared/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveProjectRoot(start: string): string {
  let dir = start;
  for (let i = 0; i < 6; i++) {
    const pkg = path.join(dir, 'package.json');
    const engines = path.join(dir, 'engines');
    if (existsSync(pkg) && existsSync(engines)) return dir;
    dir = path.resolve(dir, '..');
  }
  return path.resolve(start, '..');
}

const ROOT = resolveProjectRoot(__dirname);
const HOST = process.env.SHERLOCK_HOST ?? '127.0.0.1';
const PORT = Number(process.env.SHERLOCK_PORT ?? 8787);
const isProd = process.env.NODE_ENV === 'production';

const app = express();
app.use(express.json({ limit: '1mb' }));

const controller = new SherlockController(process.env.LUGHNASADH_PATH);

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    product: PRODUCT_NAME,
    engine: ENGINE_DISPLAY_NAME,
    status: controller.getStatus(),
    enginePath: controller.getEnginePath(),
    fen: controller.getPosition().fen,
  });
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, product: PRODUCT_NAME, engine: ENGINE_DISPLAY_NAME });
});

const distDir = path.join(ROOT, 'dist');
if (isProd) {
  app.use(express.static(distDir));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function broadcast(msg: ServerMessage): void {
  for (const client of wss.clients) {
    send(client, msg);
  }
}

controller.subscribe({
  onStatus: (status, detail) => broadcast({ type: 'status', status, detail }),
  onEngineReady: (meta) =>
    broadcast({ type: 'engine_ready', name: meta.name, author: meta.author }),
  onEngineInfo: (info) => broadcast({ type: 'engine_info', info }),
  onBestMove: (result) => broadcast({ type: 'best_move', result }),
  onEvaluationChanged: (evaluation) =>
    broadcast({ type: 'evaluation', evaluation }),
  onAnalysisStarted: (request) => broadcast({ type: 'analysis_started', request }),
  onAnalysisStopped: ({ sessionId, reason }) =>
    broadcast({ type: 'analysis_stopped', sessionId, reason }),
  onAnalysisError: ({ message, sessionId }) =>
    broadcast({ type: 'analysis_error', message, sessionId }),
  onEngineCrashed: (error) =>
    broadcast({
      type: 'engine_crashed',
      message: error.message,
      code: error.code,
    }),
  onPositionChanged: (position) => broadcast({ type: 'position', position }),
  onGameLoaded: (info) => broadcast({ type: 'game_loaded', info }),
  onUciLog: (direction, line) =>
    broadcast({ type: 'uci_log', direction, line, at: Date.now() }),
  onLog: (level, message) =>
    broadcast({ type: 'log', level, message, at: Date.now() }),
  onMatchState: (state) => broadcast({ type: 'match_state', state }),
  onMatchMove: (payload) => broadcast({ type: 'match_move', ...payload }),
  onMatchEnded: (payload) => broadcast({ type: 'match_ended', ...payload }),
});

wss.on('connection', (ws) => {
  send(ws, {
    type: 'hello',
    product: PRODUCT_NAME,
    engineDefault: ENGINE_DISPLAY_NAME,
  });
  send(ws, { type: 'status', status: controller.getStatus() });
  send(ws, { type: 'position', position: controller.getPosition() });
  if (controller.getStatus() === 'ready') {
    send(ws, {
      type: 'engine_ready',
      name: ENGINE_DISPLAY_NAME,
    });
  }

  ws.on('message', async (raw) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(String(raw)) as ClientMessage;
    } catch {
      send(ws, { type: 'error', message: 'Invalid JSON' });
      return;
    }

    try {
      switch (msg.type) {
        case 'ping':
          send(ws, { type: 'pong' });
          break;
        case 'load_fen':
          controller.loadFen(msg.fen);
          break;
        case 'new_position':
          controller.newPosition();
          break;
        case 'load_pgn':
          controller.loadPgn(msg.pgn);
          break;
        case 'play_move':
          controller.playMove(msg.from, msg.to, msg.promotion);
          break;
        case 'analyze':
          await controller.analyze({
            depth: msg.depth,
            movetime: msg.movetime,
          });
          break;
        case 'stop':
          controller.stop();
          break;
        case 'restart_engine':
          await controller.restartEngine();
          break;
        case 'set_debug':
          controller.setDebug(msg.enabled);
          break;
        case 'start_match':
          await controller.startMatch({
            hashMb: msg.hashMb,
            threads: msg.threads,
            go:
              msg.movetime != null || msg.depth != null
                ? { movetime: msg.movetime, depth: msg.depth }
                : undefined,
          });
          break;
        case 'stop_match':
          await controller.stopMatch();
          break;
        case 'new_match':
          await controller.newMatch();
          break;
        default:
          send(ws, { type: 'error', message: 'Unknown message type' });
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      send(ws, { type: 'error', message });
    }
  });
});

async function main(): Promise<void> {
  try {
    await controller.boot();
    console.log(`[sherlock] ${PRODUCT_NAME} engine ready via ${controller.getEnginePath()}`);
  } catch (e) {
    console.error('[sherlock] boot failed — server still up for Retry/Restart', e);
  }

  server.listen(PORT, HOST, () => {
    console.log(`[sherlock] listening http://${HOST}:${PORT}  ws://${HOST}:${PORT}/ws`);
  });
}

async function shutdown(): Promise<void> {
  await controller.shutdown();
  server.close();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());

void main();
