import { useEffect, useRef } from 'react';
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

export default function Board({
  position,
  bestMoveUci,
  interactive = true,
  onUserMove,
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
    // mount once
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
        brush: 'paleGreen',
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

  return <div className="cg-wrap board-frame" ref={rootRef} />;
}
