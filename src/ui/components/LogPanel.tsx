import type { LogEntry } from '../../hooks/useSherlockSocket';

interface Props {
  logs: LogEntry[];
  onClear: () => void;
}

export default function LogPanel({ logs, onClear }: Props) {
  return (
    <section className="log-panel">
      <div className="log-header">
        <span className="section-title">Trilha técnica</span>
        <button type="button" className="btn ghost small" onClick={onClear}>
          Limpar
        </button>
      </div>
      <div className="log-body mono">
        {logs.length === 0 && <div className="muted">Nenhuma entrada ainda.</div>}
        {[...logs].reverse().map((l) => (
          <div key={l.id} className={`log-line log-${l.kind} log-${l.level ?? ''}`}>
            <span className="log-time">
              {new Date(l.at).toLocaleTimeString('pt-BR', { hour12: false })}
            </span>
            {l.kind === 'uci' && (
              <span className={`log-dir dir-${l.direction}`}>
                {l.direction === 'out' ? '→' : '←'}
              </span>
            )}
            <span className="log-text">{l.text}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
