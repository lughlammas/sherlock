import type {
  BestMoveResult,
  EngineInfo,
  Evaluation,
  InvestigationStatus,
} from '../../../shared/types';

interface Props {
  status: InvestigationStatus;
  statusDetail?: string;
  engineName?: string;
  evaluation: Evaluation | null;
  lastInfo: EngineInfo | null;
  bestMove: BestMoveResult | null;
  sessionId: string | null;
  depthDefault: number;
  movetimeDefault: number;
  useMovetime: boolean;
  onDepthChange: (n: number) => void;
  onMovetimeChange: (n: number) => void;
  onUseMovetimeChange: (v: boolean) => void;
  onAnalyze: () => void;
  onStop: () => void;
  onRetry: () => void;
  onRestart: () => void;
  onCopyPv: () => void;
}

function statusLabel(s: InvestigationStatus): string {
  switch (s) {
    case 'booting':
      return 'BOOTING';
    case 'ready':
      return 'READY';
    case 'investigating':
      return 'INVESTIGATING…';
    case 'best_move':
      return 'BEST MOVE';
    case 'stopped':
      return 'STOPPED';
    case 'engine_error':
      return 'ENGINE ERROR';
    case 'crashed':
      return 'ENGINE CRASHED';
    default:
      return s;
  }
}

export default function EvidencePanel(props: Props) {
  const {
    status,
    statusDetail,
    engineName,
    evaluation,
    lastInfo,
    bestMove,
    sessionId,
    depthDefault,
    movetimeDefault,
    useMovetime,
    onDepthChange,
    onMovetimeChange,
    onUseMovetimeChange,
    onAnalyze,
    onStop,
    onRetry,
    onRestart,
    onCopyPv,
  } = props;

  const busy = status === 'investigating' || status === 'booting';
  const errored = status === 'engine_error' || status === 'crashed';
  const pv = evaluation?.pv?.join(' ') ?? lastInfo?.pv?.join(' ') ?? '';

  return (
    <aside className="evidence-panel">
      <header className="evidence-header">
        <div className="eyebrow">EVIDENCE DESK</div>
        <div className={`status-pill status-${status}`}>{statusLabel(status)}</div>
        {statusDetail && <div className="status-detail">{statusDetail}</div>}
        <div className="engine-meta">
          Engine: <strong>{engineName ?? 'Lughnasadh 0.2'}</strong>
          <span className="muted"> · classical UCI</span>
        </div>
      </header>

      <section className="evidence-controls">
        <div className="field-row">
          <label>
            <input
              type="radio"
              checked={!useMovetime}
              onChange={() => onUseMovetimeChange(false)}
            />{' '}
            go depth
          </label>
          <input
            type="number"
            min={1}
            max={40}
            value={depthDefault}
            disabled={useMovetime}
            onChange={(e) => onDepthChange(Number(e.target.value))}
          />
        </div>
        <div className="field-row">
          <label>
            <input
              type="radio"
              checked={useMovetime}
              onChange={() => onUseMovetimeChange(true)}
            />{' '}
            go movetime (ms)
          </label>
          <input
            type="number"
            min={100}
            max={60000}
            step={100}
            value={movetimeDefault}
            disabled={!useMovetime}
            onChange={(e) => onMovetimeChange(Number(e.target.value))}
          />
        </div>
        <div className="btn-row">
          <button
            type="button"
            className="btn primary"
            disabled={busy || errored}
            onClick={onAnalyze}
          >
            ANALYZE
          </button>
          <button
            type="button"
            className="btn"
            disabled={status !== 'investigating'}
            onClick={onStop}
          >
            STOP
          </button>
        </div>
        {errored && (
          <div className="btn-row">
            <button type="button" className="btn warn" onClick={onRetry}>
              RETRY
            </button>
            <button type="button" className="btn danger" onClick={onRestart}>
              RESTART ENGINE
            </button>
          </div>
        )}
      </section>

      <section className="evidence-metrics">
        <div className="metric">
          <span className="metric-k">depth</span>
          <span className="metric-v">{evaluation?.depth ?? lastInfo?.depth ?? '—'}</span>
        </div>
        <div className="metric">
          <span className="metric-k">score</span>
          <span className="metric-v">
            {evaluation?.mateIn != null
              ? `mate ${evaluation.mateIn}`
              : evaluation?.scoreCp != null
                ? `${(evaluation.scoreCp / 100).toFixed(2)}`
                : '—'}
          </span>
        </div>
        <div className="metric">
          <span className="metric-k">nodes</span>
          <span className="metric-v">
            {evaluation?.nodes?.toLocaleString() ?? '—'}
          </span>
        </div>
        <div className="metric">
          <span className="metric-k">nps</span>
          <span className="metric-v">
            {evaluation?.nps?.toLocaleString() ?? '—'}
          </span>
        </div>
        <div className="metric">
          <span className="metric-k">time</span>
          <span className="metric-v">
            {evaluation?.timeMs != null ? `${evaluation.timeMs} ms` : '—'}
          </span>
        </div>
        <div className="metric">
          <span className="metric-k">session</span>
          <span className="metric-v mono small">{sessionId ?? '—'}</span>
        </div>
      </section>

      <section className="evidence-pv">
        <div className="section-title">
          PRINCIPAL VARIATION <span className="muted">(reasoning line)</span>
        </div>
        <div className="pv-line mono">{pv || '—'}</div>
        <button type="button" className="btn ghost" disabled={!pv} onClick={onCopyPv}>
          COPY PV
        </button>
      </section>

      <section className="evidence-conclusion">
        <div className="section-title">CONCLUSION</div>
        {bestMove ? (
          <div className="best-move-box">
            <div className="best-move-label">BEST MOVE</div>
            <div className="best-move-value mono">{bestMove.bestMove}</div>
            {bestMove.ponder && (
              <div className="ponder muted">ponder {bestMove.ponder}</div>
            )}
          </div>
        ) : (
          <div className="muted">Awaiting investigation result…</div>
        )}
      </section>
    </aside>
  );
}
