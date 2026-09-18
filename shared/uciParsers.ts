/** Pure classical UCI parsers — no process I/O, safe for browser + Node. */
import type { BestMoveResult, EngineInfo, EngineScore } from './types.js';

function parseScore(tokens: string[]): EngineScore | undefined {
  const i = tokens.indexOf('score');
  if (i < 0) return undefined;
  const kind = tokens[i + 1];
  const value = Number(tokens[i + 2]);
  if (kind === 'cp' && Number.isFinite(value)) return { type: 'cp', value };
  if (kind === 'mate' && Number.isFinite(value)) return { type: 'mate', value };
  return undefined;
}

function parseIntAfter(tokens: string[], key: string): number | undefined {
  const i = tokens.indexOf(key);
  if (i < 0) return undefined;
  const n = Number(tokens[i + 1]);
  return Number.isFinite(n) ? n : undefined;
}

function parsePv(tokens: string[]): string[] | undefined {
  const i = tokens.indexOf('pv');
  if (i < 0) return undefined;
  return tokens.slice(i + 1).filter((t) => /^[a-h][1-8][a-h][1-8][qrbn]?$/i.test(t));
}

export function parseInfoLine(line: string, sessionId: string): EngineInfo | null {
  if (!line.startsWith('info ')) return null;
  const tokens = line.trim().split(/\s+/);
  return {
    depth: parseIntAfter(tokens, 'depth'),
    seldepth: parseIntAfter(tokens, 'seldepth'),
    multipv: parseIntAfter(tokens, 'multipv'),
    score: parseScore(tokens),
    nodes: parseIntAfter(tokens, 'nodes'),
    nps: parseIntAfter(tokens, 'nps'),
    time: parseIntAfter(tokens, 'time'),
    hashfull: parseIntAfter(tokens, 'hashfull'),
    tbhits: parseIntAfter(tokens, 'tbhits'),
    pv: parsePv(tokens),
    raw: line,
    sessionId,
  };
}

export function parseBestMoveLine(line: string, sessionId: string): BestMoveResult | null {
  if (!line.startsWith('bestmove ')) return null;
  const parts = line.trim().split(/\s+/);
  const bestMove = parts[1] ?? '(none)';
  let ponder: string | null = null;
  const pi = parts.indexOf('ponder');
  if (pi >= 0 && parts[pi + 1]) ponder = parts[pi + 1];
  return { bestMove, ponder, sessionId };
}

export const UciParsers = { parseInfoLine, parseBestMoveLine };
