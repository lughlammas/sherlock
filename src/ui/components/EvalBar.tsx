import type { Evaluation } from '../../../shared/types';

interface Props {
  evaluation: Evaluation | null;
  turn: 'w' | 'b';
}

function whiteAdvantagePct(evaluation: Evaluation | null): number {
  if (!evaluation) return 50;
  if (evaluation.mateIn != null) {
    if (evaluation.mateIn > 0) return 97;
    if (evaluation.mateIn < 0) return 3;
    return 50;
  }
  const cp = evaluation.scoreCp ?? 0;
  // logistic-ish mapping
  const clamped = Math.max(-800, Math.min(800, cp));
  return 50 + (clamped / 800) * 45;
}

export default function EvalBar({ evaluation }: Props) {
  const pct = whiteAdvantagePct(evaluation);
  let label = '—';
  if (evaluation) {
    if (evaluation.mateIn != null) {
      label = evaluation.mateIn > 0 ? `M${evaluation.mateIn}` : `-M${Math.abs(evaluation.mateIn)}`;
    } else if (evaluation.scoreCp != null) {
      const v = evaluation.scoreCp / 100;
      label = `${v >= 0 ? '+' : ''}${v.toFixed(2)}`;
    }
  }

  return (
    <div className="eval-bar" title="Evaluation (White POV)">
      <div className="eval-bar-track">
        <div className="eval-bar-white" style={{ height: `${pct}%` }} />
      </div>
      <div className="eval-bar-label">{label}</div>
    </div>
  );
}
