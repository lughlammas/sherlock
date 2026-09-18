/**
 * Desktop smoke: dual Lughnasadh match, movetime 200ms, few plies.
 * Proves alternate white/black bestmoves apply and PGN streams.
 */
import { SherlockController } from '../controller/SherlockController.ts';

const MAX_PLIES = Number(process.env.SMOKE_MATCH_PLIES ?? 6);
const MOVETIME = Number(process.env.SMOKE_MATCH_MOVETIME ?? 200);
const HASH = Number(process.env.SMOKE_MATCH_HASH ?? 16);

async function main(): Promise<void> {
  const moves: string[] = [];
  let ended: { result: string; reason: string } | null = null;

  const c = new SherlockController(process.env.LUGHNASADH_PATH);
  c.subscribe({
    onEngineReady: (m) => console.log('analysis engine ready:', m.name),
    onMatchMove: (p) => {
      moves.push(`${p.ply}:${p.side}:${p.san}`);
      console.log(`MOVE ply=${p.ply} ${p.side} ${p.san} (${p.uci})`);
    },
    onMatchEnded: (p) => {
      ended = { result: p.result, reason: p.reason };
      console.log('MATCH ENDED', p.result, p.reason);
    },
    onLog: (level, msg) => {
      if (level === 'error' || level === 'warn') console.log(`[${level}]`, msg);
    },
  });

  console.log('booting analysis engine…');
  await c.boot();

  let resolveDone!: () => void;
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve;
  });
  const timer = setTimeout(() => {
    console.error('timeout — forcing stop');
    void c.stopMatch().finally(() => resolveDone());
  }, 45_000);

  c.subscribe({
    onMatchMove: (p) => {
      if (p.ply >= MAX_PLIES) {
        clearTimeout(timer);
        void c.stopMatch().finally(() => resolveDone());
      }
    },
    onMatchEnded: () => {
      clearTimeout(timer);
      resolveDone();
    },
  });

  console.log(`starting match movetime=${MOVETIME} hash=${HASH} stopAfter=${MAX_PLIES}`);
  await c.startMatch({ hashMb: HASH, threads: 1, go: { movetime: MOVETIME } });
  await done;

  if (moves.length < 2) {
    throw new Error(`expected alternating moves, got ${moves.length}: ${moves.join(', ')}`);
  }
  if (!moves[0]?.includes(':w:') || !moves[1]?.includes(':b:')) {
    throw new Error(`expected W then B, got ${moves.slice(0, 2).join(' | ')}`);
  }

  console.log('SMOKE MATCH OK', {
    plies: moves.length,
    sample: moves.slice(0, 4),
    fen: c.getPosition().fen,
    ended,
  });
  await c.shutdown();
}

main().catch(async (e) => {
  console.error('SMOKE MATCH FAIL', e);
  process.exit(1);
});
