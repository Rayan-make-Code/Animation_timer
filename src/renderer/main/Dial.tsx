import type { Preset } from '../../shared/api';
import { dialTicks, formatClock, mmss, totalSec, type Phase } from '../../core/dial';
import { expandPreset } from '../../core/timer';

const PHASE_COLOR: Record<Phase, string> = { prepare: '#b9bbc6', work: '#7cc4ff', rest: '#7fd39b' };

/** «00:05» — минуты всегда двумя цифрами. */
const clock2 = (sec: number) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;

/** Циферблат пресета: 60 засечек по фазам, длинная засечка — начало отдыха. */
export function Dial({ preset }: { preset: Preset }) {
  const steps = expandPreset(preset);
  if (steps.length === 0) return null;
  const ticks = dialTicks(steps);
  const [first, second] = steps;
  return (
    <section className="dial-wrap slide" aria-label="Циферблат пресета">
      <div className="dial">
        {ticks.map((t, i) => (
          <span key={i} className={`dial-tick${t.long ? ' long' : ''}`} style={{ background: PHASE_COLOR[t.phase], transform: `rotate(${t.deg}deg)` }} />
        ))}
        <div className="dial-face">
          <span className="dial-total">{formatClock(totalSec(steps))}</span>
          <span className="dial-first">{clock2(first.sec)} <span className="dial-sep">|</span> <span className="dial-ready">ГОТОВ</span></span>
          <span className="dial-rule" />
          <span className="dial-step">1. {first.label}</span>
        </div>
      </div>
      {second && <div className="dial-next">» 2. {second.label} — {mmss(second.sec)}</div>}
    </section>
  );
}
