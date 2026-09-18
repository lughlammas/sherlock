import type { MatchState } from '../../../shared/types';
import {
  DEFAULT_MATCH_HASH_MB,
  DEFAULT_MATCH_MOVETIME_MS,
} from '../../../shared/types';

type Props = {
  caseNo: string;
  matchState: MatchState | null;
  status: string;
  onStart: (opts: { movetime?: number; depth?: number; hashMb: number }) => void;
  onStop: () => void;
  onNew: () => void;
};

const PRESETS: { id: string; label: string; movetime?: number; depth?: number; hashMb: number }[] = [
  { id: 'full', label: '110% · 4s', movetime: DEFAULT_MATCH_MOVETIME_MS, hashMb: DEFAULT_MATCH_HASH_MB },
  { id: 'stress', label: 'STRESS · 5s · 1024', movetime: 5000, hashMb: 1024 },
  { id: 'depth18', label: 'DEPTH 18', depth: 18, hashMb: DEFAULT_MATCH_HASH_MB },
  { id: 'smoke', label: 'SMOKE · 200ms', movetime: 200, hashMb: 64 },
];

function fmtNodes(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function sideCard(
  label: string,
  tel: MatchState['white'] | undefined,
  active: boolean,
) {
  return (
    <div className={`cross-side${active ? ' active' : ''}`}>
      <div className="cross-side-label">{label}</div>
      <div className="cross-side-meta mono">
        {tel?.thinking ? 'THINKING…' : 'IDLE'}
        {tel ? ` · d${tel.depth} · ${fmtNodes(tel.nodes)} · ${fmtNodes(tel.nps)} nps` : ''}
      </div>
      <div className="cross-side-eval mono">
        {tel?.eval?.mateIn != null
          ? `M${tel.eval.mateIn}`
          : tel?.eval?.scoreCp != null
            ? `${(tel.eval.scoreCp / 100).toFixed(2)}`
            : '—'}
      </div>
    </div>
  );
}

export default function CrossCasePanel({
  caseNo,
  matchState,
  status,
  onStart,
  onStop,
  onNew,
}: Props) {
  const running = !!matchState?.running || status === 'matching';
  const hashDefault = matchState?.hashMb ?? DEFAULT_MATCH_HASH_MB;

  return (
    <aside className="parchment-panel evidence-panel cross-case-panel">
      <div className="caso-n-label">CASO CRUZADO</div>
      <div className="caso-n-value" style={{ fontSize: '1.35rem', letterSpacing: '0.12em' }}>
        Lughnasadh × Lughnasadh
      </div>
      <div className="cross-case-no mono">CASO N.º {caseNo}</div>

      <div className="cross-warn" role="alert">
        <strong>AVISO · FULL POWER</strong>
        <span>
          Dois processos Lughnasadh 0.2 a Hash {hashDefault}MB cada (máx. 4096). Threads do
          motor = 1 → dual process. Alto consumo de bateria e RAM no S21 — intencional.
          Sem limite artificial de força.
        </span>
      </div>

      <div className="cross-symmetry">
        {sideCard('BRANCAS', matchState?.white, matchState?.sideToMove === 'w' && running)}
        <div className="cross-vs" aria-hidden>
          ✕
        </div>
        {sideCard('PRETAS', matchState?.black, matchState?.sideToMove === 'b' && running)}
      </div>

      <div className="field-label">MODO DE BUSCA</div>
      <div className="cross-presets">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            className="btn small"
            disabled={running}
            onClick={() =>
              onStart({
                movetime: p.movetime,
                depth: p.depth,
                hashMb: p.hashMb,
              })
            }
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="btn-row">
        <button
          type="button"
          className="btn primary"
          disabled={running}
          onClick={() =>
            onStart({
              movetime: DEFAULT_MATCH_MOVETIME_MS,
              hashMb: DEFAULT_MATCH_HASH_MB,
            })
          }
        >
          INICIAR PARTIDA
        </button>
        <button type="button" className="btn danger" disabled={!running} onClick={onStop}>
          PARAR
        </button>
        <button type="button" className="btn" onClick={onNew}>
          NOVO JOGO
        </button>
      </div>

      <div className="cross-pgn">
        <div className="field-label">PGN AO VIVO</div>
        <pre className="mono cross-pgn-body">
          {matchState?.pgn?.trim() ||
            matchState?.result ||
            (running ? 'Aguardando lances…' : '—')}
        </pre>
        {matchState?.result && (
          <div className="cross-result mono">
            RESULTADO: {matchState.result}
            {matchState.endReason ? ` (${matchState.endReason})` : ''}
          </div>
        )}
      </div>

      <p className="detective-note">
        Simetria bilateral. Mesmo binário, sessões UCI separadas. A mesa não bloqueia.
      </p>
    </aside>
  );
}
