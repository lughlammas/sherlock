import { useEffect, useMemo, useState } from 'react';
import { useSherlockSocket } from '../hooks/useSherlockSocket';
import { useSherlockLocal } from '../hooks/useSherlockLocal';
import { hasNativeUci } from '../local/nativeUci';
import type { ClientMessage } from '../../shared/types';
import type { SherlockClientState } from '../hooks/useSherlockSocket';
import Board from './components/Board';
import EvalBar from './components/EvalBar';
import EvidencePanel from './components/EvidencePanel';
import CrossCasePanel from './components/CrossCasePanel';
import LogPanel from './components/LogPanel';

type Mode = 'arquivo' | 'jogar' | 'analisar' | 'treinar';

type Client = {
  state: SherlockClientState;
  send: (msg: ClientMessage) => void;
  clearLogs: () => void;
};

const TAGLINE = 'chess as a case file';
const BYLINE = 'by LughLammas';

function caseNumberFromSession(sessionId: string | null): string {
  if (!sessionId) return '00017';
  let h = 0;
  for (let i = 0; i < sessionId.length; i++) {
    h = (h * 31 + sessionId.charCodeAt(i)) >>> 0;
  }
  return String((h % 90000) + 10000).slice(0, 5);
}

function FolderTabs({
  mode,
  onSelect,
}: {
  mode: Mode;
  onSelect: (m: Mode) => void;
}) {
  const tabs: { id: Mode; label: string; sub: string }[] = [
    { id: 'jogar', label: 'JOGAR', sub: 'Novo Caso' },
    { id: 'analisar', label: 'ANALISAR', sub: 'Abrir Investigação' },
    { id: 'treinar', label: 'TREINAR IA', sub: 'Reconstruir Posição' },
  ];
  return (
    <nav className="folder-tabs" aria-label="Arquivo">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          className={`folder-tab${mode === t.id ? ' active' : ''}`}
          onClick={() => onSelect(t.id)}
        >
          <span className="folder-tab-label">{t.label}</span>
          <span className="folder-tab-sub">{t.sub}</span>
        </button>
      ))}
    </nav>
  );
}

function SideNav({
  mode,
  onSelect,
}: {
  mode: Mode;
  onSelect: (m: Mode) => void;
}) {
  const items: { id: Mode; label: string; sub: string }[] = [
    { id: 'jogar', label: 'J O G A R', sub: 'Novo Caso' },
    { id: 'analisar', label: 'A N A L I S A R', sub: 'Abrir Investigação' },
    { id: 'treinar', label: 'T R E I N A R  I A', sub: 'Reconstruir Posição' },
  ];
  return (
    <aside className="side-nav-wide parchment-panel">
      <img
        className="side-nav-seal"
        src="/art/herald-seal-square.png"
        alt=""
        width={56}
        height={56}
      />
      <div className="brand-side">S H E R L O C K</div>
      {items.map((t) => (
        <button
          key={t.id}
          type="button"
          className={`side-nav-item${mode === t.id ? ' active' : ''}`}
          onClick={() => onSelect(t.id)}
        >
          <span className="folder-tab-label">{t.label}</span>
          <span className="folder-tab-sub">{t.sub}</span>
        </button>
      ))}
      <p className="side-nav-tagline">{TAGLINE}</p>
    </aside>
  );
}

function HubMenu({ onSelect }: { onSelect: (m: Mode) => void }) {
  return (
    <aside className="parchment-panel">
      <div className="arquivo-header">ARQUIVO N.º 47-B · DOSSIÊ</div>
      <div className="hub-splash">
        <img
          className="herald-seal large"
          src="/art/herald-seal-square.png"
          alt="Herald seal — SHERLOCK by LughLammas"
          width={176}
          height={176}
        />
        <h2 className="hub-splash-title">SHERLOCK</h2>
        <p className="hub-splash-sub">
          {BYLINE} — {TAGLINE}
        </p>
        <div className="buckets" aria-hidden>
          <span className="bucket cobalt" title="cobalt" />
          <span className="bucket oxblood" title="oxblood" />
        </div>
      </div>
      <div className="hub-cards">
        <button type="button" className="hub-card" onClick={() => onSelect('jogar')}>
          <span className="hub-card-icon" aria-hidden>
            I
          </span>
          <span>
            <span className="hub-card-title">JOGAR</span>
            <span className="hub-card-sub">Novo Caso</span>
          </span>
          <span className="hub-card-idx">01</span>
        </button>
        <button type="button" className="hub-card" onClick={() => onSelect('analisar')}>
          <span className="hub-card-icon" aria-hidden>
            II
          </span>
          <span>
            <span className="hub-card-title">ANALISAR</span>
            <span className="hub-card-sub">Abrir Investigação</span>
          </span>
          <span className="hub-card-idx">02</span>
        </button>
        <button type="button" className="hub-card" onClick={() => onSelect('treinar')}>
          <span className="hub-card-icon" aria-hidden>
            III
          </span>
          <span>
            <span className="hub-card-title">TREINAR IA</span>
            <span className="hub-card-sub">Reconstruir Posição</span>
          </span>
          <span className="hub-card-idx">03</span>
        </button>
      </div>
      <p className="hub-tagline">Toda partida deixa pistas.</p>
    </aside>
  );
}

function Desk({ state, send, clearLogs }: Client) {
  const [mode, setMode] = useState<Mode>('arquivo');
  const [fenInput, setFenInput] = useState(state.position.fen);
  const [pgnInput, setPgnInput] = useState('');
  const [depth, setDepth] = useState(12);
  const [movetime, setMovetime] = useState(2000);
  const [useMovetime, setUseMovetime] = useState(false);

  useEffect(() => {
    setFenInput(state.position.fen);
  }, [state.position.fen]);

  const caseNo = useMemo(
    () => caseNumberFromSession(state.sessionId),
    [state.sessionId],
  );

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

  const openMode = (m: Mode) => {
    setMode(m);
    if (m === 'jogar') {
      send({ type: 'new_position' });
    }
  };

  const showEval = mode === 'analisar' || mode === 'jogar';
  const showEvidence = mode === 'analisar';
  const showTools = mode === 'treinar' || mode === 'jogar' || mode === 'analisar';
  const showHub = mode === 'arquivo';
  const showSideNav = mode !== 'arquivo';

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand-block">
          <img
            className="herald-seal"
            src="/art/herald-seal-square.png"
            alt=""
            width={38}
            height={38}
          />
          <div>
            <h1 className="brand-title">SHERLOCK</h1>
            <p className="brand-byline">{BYLINE}</p>
          </div>
        </div>
        <div className="header-right">
          <button
            type="button"
            className="arquivo-link"
            onClick={() => setMode('arquivo')}
          >
            ARQUIVO
          </button>
          <span className="caso-atual">CASO ATUAL: ABERTO</span>
          <span
            className={`status-light${state.connected ? ' on' : ''}`}
            title={state.connected ? 'conectado' : 'offline'}
          />
        </div>
      </header>

      <main className={`app-main mode-${mode}`}>
        {showSideNav && <SideNav mode={mode} onSelect={openMode} />}

        <section className="board-column">
          <div className="board-stage">
            {showEval ? (
              <EvalBar evaluation={state.evaluation} turn={state.position.turn} />
            ) : (
              <div />
            )}
            <Board
              position={state.position}
              bestMoveUci={state.bestMove?.bestMove}
              onUserMove={(from, to) => send({ type: 'play_move', from, to })}
              showEvidenceTags={mode === 'analisar'}
              interactive={mode !== 'arquivo' && state.status !== 'matching'}
            />
          </div>

          <div className="board-meta-row">
            <p className="tagline">
              {mode === 'arquivo' ? TAGLINE : 'Toda partida deixa pistas.'}
            </p>
            <span className="caso-stamp">CASO {caseNo}</span>
          </div>

          {showTools && (
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
                  COPIAR FEN
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => send({ type: 'new_position' })}
                >
                  NOVA POSIÇÃO
                </button>
              </div>

              {(mode === 'treinar' || mode === 'analisar') && (
                <>
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
                      Importar PGN
                    </button>
                  </div>
                </>
              )}

              <div className="move-list">
                <span className="field-label">Lances</span>
                <div className="mono moves">
                  {state.position.moveList.length
                    ? state.position.moveList.join(' ')
                    : '—'}
                </div>
              </div>
            </div>
          )}
        </section>

        {showHub && <HubMenu onSelect={openMode} />}
        {showEvidence && (
          <EvidencePanel
            status={state.status}
            statusDetail={state.statusDetail}
            engineName={state.engineName}
            evaluation={state.evaluation}
            lastInfo={state.lastInfo}
            bestMove={state.bestMove}
            sessionId={state.sessionId}
            caseNo={caseNo}
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
        )}
        {mode === 'jogar' && (
          <CrossCasePanel
            caseNo={caseNo}
            matchState={state.matchState ?? null}
            status={state.status}
            onStart={(opts) =>
              send({
                type: 'start_match',
                movetime: opts.movetime,
                depth: opts.depth,
                hashMb: opts.hashMb,
              })
            }
            onStop={() => send({ type: 'stop_match' })}
            onNew={() => send({ type: 'new_match' })}
          />
        )}
        {mode === 'treinar' && (
          <aside className="parchment-panel evidence-panel">
            <div className="caso-n-label">TREINAR IA</div>
            <div className="caso-n-value" style={{ fontSize: '1.5rem' }}>
              POSIÇÃO
            </div>
            <p className="detective-note">
              Cole um FEN ou PGN à esquerda para remontar a cena. Depois abra a
              investigação.
            </p>
            <div className="btn-row">
              <button
                type="button"
                className="btn primary"
                onClick={() => setMode('analisar')}
              >
                INVESTIGAR ESTA POSIÇÃO
              </button>
            </div>
          </aside>
        )}
      </main>

      {(mode === 'analisar' || mode === 'treinar') && (
        <LogPanel logs={state.logs} onClear={clearLogs} />
      )}

      {mode !== 'arquivo' && <FolderTabs mode={mode} onSelect={openMode} />}

      <footer className="app-footer">
        <span>
          Preparação / análise de posições — não é auxílio a trampas em partidas
          ao vivo.
        </span>
        <span className="muted">
          Classical Lughnasadh 0.2 · sem Stockfish · sem UCI proprietário
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
