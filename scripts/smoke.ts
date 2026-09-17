/**
 * Real-binary smoke: boot controller → analyze startpos → expect infos + bestmove.
 */
import { SherlockController } from '../controller/SherlockController.ts';

const depth = Number(process.env.SMOKE_DEPTH ?? 10);

async function main(): Promise<void> {
  const infos: number[] = [];
  let best: string | null = null;
  let ready = false;

  const c = new SherlockController(process.env.LUGHNASADH_PATH);
  c.subscribe({
    onEngineReady: (m) => {
      ready = true;
      console.log('onEngineReady:', m.name);
    },
    onEngineInfo: (info) => {
      infos.push(info.depth ?? 0);
      if (infos.length <= 3 || info.depth === depth) {
        console.log(
          `info depth=${info.depth} score=${info.score?.type}:${info.score?.value} nodes=${info.nodes} nps=${info.nps} pv=${info.pv?.join(' ')}`,
        );
      }
    },
    onBestMove: (r) => {
      best = r.bestMove;
      console.log('BEST MOVE:', r.bestMove, r.ponder ? `(ponder ${r.ponder})` : '');
    },
    onAnalysisError: (e) => console.error('analysis_error', e),
    onEngineCrashed: (e) => console.error('crash', e),
  });

  console.log('engine path:', c.getEnginePath());
  await c.boot();
  if (!ready) throw new Error('onEngineReady did not fire');

  const done = new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('smoke timeout')), 30000);
    c.subscribe({
      onBestMove: () => {
        clearTimeout(t);
        resolve();
      },
      onAnalysisError: (e) => {
        clearTimeout(t);
        reject(new Error(e.message));
      },
    });
  });

  const sessionId = await c.analyze({ depth });
  console.log('analysis session:', sessionId);
  await done;

  if (infos.length < 1) throw new Error('no info lines');
  if (!best) throw new Error('no bestmove');

  console.log('SMOKE OK', { infos: infos.length, bestMove: best, fen: c.getPosition().fen });
  await c.shutdown();
}

main().catch(async (e) => {
  console.error('SMOKE FAIL', e);
  process.exit(1);
});
