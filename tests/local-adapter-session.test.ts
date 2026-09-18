/**
 * Smoke for on-device adapter session gating — no Android device / no binary.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseBestMoveLine, parseInfoLine } from '../shared/uciParsers.ts';

describe('Android bridge session smoke (mock lines)', () => {
  it('drops stale info when session rotates', () => {
    const oldId = 's_old';
    const newId = 's_new';
    const stale = parseInfoLine('info depth 5 score cp 10 pv e2e4', oldId);
    const fresh = parseInfoLine('info depth 6 score cp 20 pv e2e4', newId);
    assert.ok(stale && fresh);
    assert.notEqual(stale!.sessionId, fresh!.sessionId);
    // Controller would compare activeSessionId === info.sessionId
    const active = newId;
    assert.equal(stale!.sessionId === active, false);
    assert.equal(fresh!.sessionId === active, true);
  });

  it('bestmove carries session for conclusion gate', () => {
    const bm = parseBestMoveLine('bestmove e2e4 ponder e7e5', 's_live');
    assert.equal(bm!.bestMove, 'e2e4');
    assert.equal(bm!.sessionId, 's_live');
  });
});
