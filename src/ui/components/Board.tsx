import { useEffect, useMemo, useRef } from 'react';
import { Chess } from 'chess.js';
import { Chessground } from 'chessground';
import type { Api } from 'chessground/api';
import type { Key } from 'chessground/types';
import type { PositionState } from '../../../shared/types';

interface Props {
  position: PositionState;
  bestMoveUci?: string | null;
  interactive?: boolean;
  onUserMove?: (from: string, to: string) => void;
  showEvidenceTags?: boolean;
}

function destsFromFen(fen: string): Map<Key, Key[]> {
  try {
    const g = new Chess(fen);
    const dests = new Map<Key, Key[]>();
    for (const m of g.moves({ verbose: true })) {
      const from = m.from as Key;
      const arr = dests.get(from) ?? [];
      arr.push(m.to as Key);
      dests.set(from, arr);
    }
    return dests;
  } catch {
    return new Map();
  }
}

/** Map algebraic square → CSS % for top-left of square (white orientation). */
function squareToPercent(sq: string): { left: string; top: string } | null {
  if (!sq || sq.length < 2) return null;
  const file = sq.charCodeAt(0) - 97; // a=0
  const rank = Number(sq[1]);
  if (file < 0 || file > 7 || rank < 1 || rank > 8) return null;
  const left = (file / 8) * 100;
  const top = ((8 - rank) / 8) * 100;
  return { left: `${left}%`, top: `${top}%` };
}

export default function Board({
  position,
  bestMoveUci,
  interactive = true,
  onUserMove,
  showEvidenceTags = true,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<Api | null>(null);
  const onMoveRef = useRef(onUserMove);
  onMoveRef.current = onUserMove;

  useEffect(() => {
    if (!rootRef.current) return;
    const dests = interactive ? destsFromFen(position.fen) : new Map();
    apiRef.current = Chessground(rootRef.current, {
      fen: position.fen,
      turnColor: position.turn === 'w' ? 'white' : 'black',
      check: position.inCheck || false,
      lastMove: position.lastMove
        ? [position.lastMove.from as Key, position.lastMove.to as Key]
        : undefined,
      movable: {
        free: false,
        color: interactive ? (position.turn === 'w' ? 'white' : 'black') : undefined,
        dests,
        events: {
          after: (orig, dest) => {
            onMoveRef.current?.(orig, dest);
          },
        },
      },
      highlight: { lastMove: true, check: true },
      animation: { enabled: true, duration: 160 },
      coordinates: true,
    });
    return () => {
      apiRef.current?.destroy();
      apiRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const api = apiRef.current;
    if (!api) return;
    const dests = interactive ? destsFromFen(position.fen) : new Map();
    const shapes: { orig: Key; dest: Key; brush: string }[] = [];
    if (bestMoveUci && bestMoveUci.length >= 4 && bestMoveUci !== '(none)') {
      shapes.push({
        orig: bestMoveUci.slice(0, 2) as Key,
        dest: bestMoveUci.slice(2, 4) as Key,
        brush: 'yellow',
      });
    }
    api.set({
      fen: position.fen,
      turnColor: position.turn === 'w' ? 'white' : 'black',
      check: position.inCheck || false,
      lastMove: position.lastMove
        ? [position.lastMove.from as Key, position.lastMove.to as Key]
        : undefined,
      movable: {
        free: false,
        color: interactive ? (position.turn === 'w' ? 'white' : 'black') : undefined,
        dests,
      },
      drawable: { autoShapes: shapes },
    });
  }, [position, bestMoveUci, interactive]);

  const tags = useMemo(() => {
    if (!showEvidenceTags || !bestMoveUci || bestMoveUci.length < 4 || bestMoveUci === '(none)') {
      return [];
    }
    const from = bestMoveUci.slice(0, 2);
    const to = bestMoveUci.slice(2, 4);
    return [
      { id: 1, sq: from },
      { id: 2, sq: to },
    ];
  }, [bestMoveUci, showEvidenceTags]);

  const scrap =
    bestMoveUci && bestMoveUci.length >= 4 && bestMoveUci !== '(none)'
      ? {
          move: position.moveList.length,
          pin: bestMoveUci.slice(2, 4).toUpperCase(),
        }
      : null;

  return (
    <div className="board-wrap">
      <div className="cg-wrap board-frame" ref={rootRef} />
      {tags.map((t) => {
        const pos = squareToPercent(t.sq);
        if (!pos) return null;
        return (
          <span
            key={t.id}
            className="evidence-tag"
            style={{ left: pos.left, top: pos.top }}
            aria-hidden
          >
            {t.id}
          </span>
        );
      })}
      {scrap && (
        <div className="alfinete-scrap" aria-hidden>
          <span className="tag-num">1</span>
          LANCE {Math.max(1, Math.ceil(scrap.move / 2) || 1)}
          <br />
          ALFINETE: {scrap.pin}
        </div>
      )}
    </div>
  );
}
