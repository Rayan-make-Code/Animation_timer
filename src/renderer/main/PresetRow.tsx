import type { Preset } from '../../shared/api';
import { formatTotal, totalSec } from '../../core/dial';
import { expandPreset } from '../../core/timer';
import { Icon } from '../components';

/** Ряд пресетов: часы и сумма сессии; в конце кнопка «новый». */
export function PresetRow({ presets, selectedId, onPick, onNew }: {
  presets: Preset[];
  selectedId: number | null;
  onPick: (p: Preset) => void;
  onNew: () => void;
}) {
  return (
    <section className="preset-row" aria-label="Пресеты">
      {presets.map((p) => {
        const total = formatTotal(totalSec(expandPreset(p)));
        const active = p.id === selectedId;
        return (
          <button key={p.id} className={`preset-pick${active ? ' active' : ''}`} aria-label={`${p.name}, ${total}`} aria-pressed={active} data-tip={p.name} onClick={() => onPick(p)}>
            <span className="preset-face"><Icon name="clock" size={44} stroke={1.4} /></span>
            <span className="preset-total">{total}</span>
          </button>
        );
      })}
      <button className="preset-pick" aria-label="Новый пресет" data-tip="Новый пресет" onClick={onNew}>
        <span className="preset-face preset-new"><Icon name="plus" size={18} stroke={2} /></span>
        <span className="preset-total">новый</span>
      </button>
    </section>
  );
}
