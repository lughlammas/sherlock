import { useEffect, useState } from 'react';
import { useSherlockSocket } from '../hooks/useSherlockSocket';
import { useSherlockLocal } from '../hooks/useSherlockLocal';
import { hasNativeUci } from '../local/nativeUci';
import type { ClientMessage } from '../../shared/types';
import type { SherlockClientState } from '../hooks/useSherlockSocket';
import Board from './components/Board';
import EvalBar from './components/EvalBar';
import EvidencePanel from './components/EvidencePanel';
import LogPanel from './components/LogPanel';

type Client = {
  state: SherlockClientState;
  send: (msg: ClientMessage) => void;
  clearLogs: () => void;
};

function Desk({ state, send, clearLogs }: Client) {
  const [fenInput, setFenInput] = useState(state.position.fen);
  const [pgnInput, setPgnInput] = useState('');
  const [depth, setDepth] = useState(12);
  const [movetime, setMovetime] = useState(2000);
  const [useMovetime, setUseMovetime] = useState(false);

  useEffect(() => {
    setFenInput(state.position.fen);
  }, [state.position.fen]);

  const applyFen = () => {
    send({ type: 'load_fen', fen: fenInput.trim() });
  };

  const copyFen = async () => {
    try {
      await navigator.clipboard.writeText(state.position.fen);
    } catch {
      /* ignore */
    }
  };

  const copyPv = async () => {
    const pv = state.evaluation?.pv?.join(' ') ?? '';
    if (!pv) return;
    try {
      await navigator.clipboard.writeText(pv);
    } catch {
      /* ignore */
    }
  };

  const analyze = () => {
    if (useMovetime) {
      send({ type: 'analyze', movetime });
    } else {
      send({ type: 'analyze', depth });
    }
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <h1 className="brand-title">S H E R L O C K</h1>
          <p className="brand-sub">
            Mesa de investigação · sobre <em>Lughnasadh 0.2</em>
          </p>
        </div>
        <div className="header-meta">
          <span className={`dot ${state.connected ? 'on' : 'off'}`} />
          <span className="mono small">
            {state.connected
              ? hasNativeUci()
                ? 'on-device'
                : 'desk online'
              : 'desk offline'}
          </span>
        </div>
      </header>

      <main className="app-main">
        <section className="board-column">
          <div className="board-stage">
            <EvalBar evaluation={state.evaluation} turn={state.position.turn} />
            <Board
              position={state.position}
              bestMoveUci={state.bestMove?.bestMove}
              onUserMove={(from, to) => send({ type: 'play_move', from, to })}
            />
          </div>

          <div className="position-tools">
            <label className="field-label">FEN</label>
            <div className="fen-row">
              <input
                className="fen-input mono"
                value={fenInput}
                onChange={(e) => setFenInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && applyFen()}
                spellCheck={false}
              />
              <button type="button" className="btn" onClick={applyFen}>
                Aplicar
              </button>
              <button type="button" className="btn" onClick={copyFen}>
                COPY FEN
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => send({ type: 'new_position' })}
              >
                NEW POSITION
              </button>
            </div>

            <label className="field-label">PGN (parcial / import)</label>
            <div className="pgn-row">
              <textarea
                className="pgn-input mono"
                rows={3}
                placeholder="1. e4 e5 2. Nf3 …"
                value={pgnInput}
                onChange={(e) => setPgnInput(e.target.value)}
              />
              <button
                type="button"
                className="btn"
                onClick={() => {
                  send({ type: 'load_pgn', pgn: pgnInput });
                }}
              >
                Import PGN
              </button>
            </div>

            <div className="move-list">
              <span className="field-label">Moves</span>
              <div className="mono moves">
                {state.position.moveList.length
                  ? state.position.moveList.join(' ')
                  : '—'}
              </div>
            </div>
          </div>
        </section>

        <EvidencePanel
          status={state.status}
          statusDetail={state.statusDetail}
          engineName={state.engineName}
          evaluation={state.evaluation}
          lastInfo={state.lastInfo}
          bestMove={state.bestMove}
          sessionId={state.sessionId}
          depthDefault={depth}
          movetimeDefault={movetime}
          useMovetime={useMovetime}
          onDepthChange={setDepth}
          onMovetimeChange={setMovetime}
          onUseMovetimeChange={setUseMovetime}
          onAnalyze={analyze}
          onStop={() => send({ type: 'stop' })}
          onRetry={analyze}
          onRestart={() => send({ type: 'restart_engine' })}
          onCopyPv={copyPv}
        />
      </main>

      <LogPanel logs={state.logs} onClear={clearLogs} />

      <footer className="app-footer">
        <span>
          Preparação / análise de posições — não é auxílio a trampas em partidas
          ao vivo.
        </span>
        <span className="muted">
          Classical Lughnasadh 0.2 · sem Stockfish · sem comandos UCI proprietários
        </span>
      </footer>
    </div>
  );
}

function AppLocal() {
  const client = useSherlockLocal();
  return <Desk {...client} />;
}

function AppSocket() {
  const client = useSherlockSocket();
  return <Desk {...client} />;
}

export default function App() {
  return hasNativeUci() ? <AppLocal /> : <AppSocket />;
}
