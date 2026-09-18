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
  caseNo: string;
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
      return 'INICIALIZANDO';
    case 'ready':
      return 'PRONTO';
    case 'investigating':
      return 'INVESTIGANDO…';
    case 'best_move':
      return 'PISTA ENCONTRADA';
    case 'stopped':
      return 'INTERROMPIDO';
    case 'engine_error':
      return 'ERRO DO MOTOR';
    case 'crashed':
      return 'MOTOR CAIU';
    default:
      return s;
  }
}

function detectiveNote(s: InvestigationStatus, hasBest: boolean): string {
  if (s === 'investigating') return 'Seguindo a linha de raciocínio…';
  if (s === 'best_move' || hasBest) return 'Interessante.';
  if (s === 'ready') return 'Caso aberto. Aguardando análise.';
  if (s === 'engine_error' || s === 'crashed') return 'A trilha técnica falhou.';
  if (s === 'stopped') return 'Investigação pausada.';
  return 'Preparando o arquivo…';
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
    caseNo,
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
    <aside className="parchment-panel evidence-panel">
      <header className="caso-header">
        <div>
          <div className="caso-n-label">CASO N.º</div>
          <div className="caso-n-value">{caseNo}</div>
          <div className={`status-pill status-${status}`}>{statusLabel(status)}</div>
          {statusDetail && <div className="status-detail">{statusDetail}</div>}
          <div className="engine-meta">
            Motor: <strong>{engineName ?? 'Lughnasadh 0.2'}</strong>
            <span className="muted"> · UCI clássico</span>
          </div>
        </div>
      </header>

      <p className="detective-note">{detectiveNote(status, !!bestMove)}</p>

      <section className="evidence-controls">
        <div className="field-row">
          <label>
            <input
              type="radio"
              checked={!useMovetime}
              onChange={() => onUseMovetimeChange(false)}
            />{' '}
            profundidade
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
            tempo (ms)
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
            ANALISAR
          </button>
          <button
            type="button"
            className="btn"
            disabled={status !== 'investigating'}
            onClick={onStop}
          >
            PARAR
          </button>
        </div>
        {errored && (
          <div className="btn-row">
            <button type="button" className="btn warn" onClick={onRetry}>
              TENTAR DE NOVO
            </button>
            <button type="button" className="btn danger" onClick={onRestart}>
              REINICIAR MOTOR
            </button>
          </div>
        )}
      </section>

      <section className="evidence-metrics">
        <div className="metric">
          <span className="metric-k">profundidade</span>
          <span className="metric-v">{evaluation?.depth ?? lastInfo?.depth ?? '—'}</span>
        </div>
        <div className="metric">
          <span className="metric-k">avaliação</span>
          <span className="metric-v">
            {evaluation?.mateIn != null
              ? `mate ${evaluation.mateIn}`
              : evaluation?.scoreCp != null
                ? `${(evaluation.scoreCp / 100).toFixed(2)}`
                : '—'}
          </span>
        </div>
        <div className="metric">
          <span className="metric-k">nós</span>
          <span className="metric-v">
            {evaluation?.nodes?.toLocaleString('pt-BR') ?? '—'}
          </span>
        </div>
        <div className="metric">
          <span className="metric-k">nps</span>
          <span className="metric-v">
            {evaluation?.nps?.toLocaleString('pt-BR') ?? '—'}
          </span>
        </div>
        <div className="metric">
          <span className="metric-k">tempo</span>
          <span className="metric-v">
            {evaluation?.timeMs != null ? `${evaluation.timeMs} ms` : '—'}
          </span>
        </div>
        <div className="metric">
          <span className="metric-k">sessão</span>
          <span className="metric-v mono small">{sessionId ?? '—'}</span>
        </div>
      </section>

      <section className="evidence-pv">
        <div className="section-title">Linha de raciocínio</div>
        <div className="pv-line mono">{pv || '—'}</div>
        <button type="button" className="btn ghost" disabled={!pv} onClick={onCopyPv}>
          COPIAR LINHA
        </button>
      </section>

      <section className="evidence-conclusion">
        <div className="section-title">Conclusão / evidência</div>
        {bestMove ? (
          <div className="best-move-box">
            <div className="best-move-label">MELHOR LANCE</div>
            <div className="best-move-value mono">{bestMove.bestMove}</div>
            {bestMove.ponder && (
              <div className="ponder muted">ponder {bestMove.ponder}</div>
            )}
          </div>
        ) : (
          <div className="muted detective-note">Aguardando resultado da investigação…</div>
        )}
      </section>
    </aside>
  );
}
