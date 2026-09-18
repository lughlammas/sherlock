/**
 * Mock / unit tests for UCI parsers — NO real engine binary required.
 * Run: npx tsx --test tests/uci-parsers.test.ts
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { UciParsers } from '../shared/uciParsers.ts';

describe('UciParsers (mock, no binary)', () => {
  it('parses info with score cp, depth, nodes, nps, pv', () => {
    const line =
      'info depth 12 seldepth 16 score cp 34 nodes 120000 nps 400000 time 300 pv e2e4 e7e5 g1f3';
    const info = UciParsers.parseInfoLine(line, 's_test');
    assert.ok(info);
    assert.equal(info!.sessionId, 's_test');
    assert.equal(info!.depth, 12);
    assert.equal(info!.seldepth, 16);
    assert.equal(info!.score?.type, 'cp');
    assert.equal(info!.score?.value, 34);
    assert.equal(info!.nodes, 120000);
    assert.equal(info!.nps, 400000);
    assert.equal(info!.time, 300);
    assert.deepEqual(info!.pv, ['e2e4', 'e7e5', 'g1f3']);
  });

  it('parses mate score', () => {
    const info = UciParsers.parseInfoLine(
      'info depth 8 score mate 3 nodes 900 pv e2e4',
      's1',
    );
    assert.equal(info!.score?.type, 'mate');
    assert.equal(info!.score?.value, 3);
  });

  it('returns null for non-info lines', () => {
    assert.equal(UciParsers.parseInfoLine('readyok', 's1'), null);
  });

  it('parses bestmove with ponder', () => {
    const bm = UciParsers.parseBestMoveLine('bestmove b1c3 ponder e7e5', 's9');
    assert.ok(bm);
    assert.equal(bm!.bestMove, 'b1c3');
    assert.equal(bm!.ponder, 'e7e5');
    assert.equal(bm!.sessionId, 's9');
  });

  it('parses bestmove without ponder', () => {
    const bm = UciParsers.parseBestMoveLine('bestmove e2e4', 's2');
    assert.equal(bm!.bestMove, 'e2e4');
    assert.equal(bm!.ponder, null);
  });

  it('stale session id is caller responsibility — parser stamps given id', () => {
    const a = UciParsers.parseInfoLine('info depth 1 score cp 0 pv e2e4', 'old');
    const b = UciParsers.parseBestMoveLine('bestmove e2e4', 'new');
    assert.equal(a!.sessionId, 'old');
    assert.equal(b!.sessionId, 'new');
    assert.notEqual(a!.sessionId, b!.sessionId);
  });
});
