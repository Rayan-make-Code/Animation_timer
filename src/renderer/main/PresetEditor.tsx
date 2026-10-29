import { useEffect, useState, type CSSProperties } from 'react';
import type { NewPreset } from '../../shared/api';
import { validatePreset, type Group } from '../../core/presetModel';
import { addGroup, duplicateGroup, moveGroupUp, parseMmss, removeGroup } from '../../core/presetEdit';
import { Icon, mmss } from '../components';

/** Новый пресет: «Приготовьтесь» (1× без отдыха) и один обычный этап. */
export const blankPreset = (): NewPreset => ({
  name: '',
  description: '',
  groups: addGroup([{ repeats: 1, workLabel: 'Приготовьтесь', workSec: 5, restSec: 0 }]),
});

/** Блоки выезжают по очереди: 0,04 с + 0,08 с на каждый следующий. */
const rise = (i: number): CSSProperties => ({ animationDelay: 0.04 + 0.08 * i + 's' });

/** Поле «м:сс»; пока текст не разбирается, наружу уходит NaN (ошибку покажет validatePreset). */
function MmssInput({ value, label, onChange }: { value: number; label: string; onChange: (sec: number) => void }) {
  const [text, setText] = useState(mmss(value));
  useEffect(() => {
    if (!Number.isNaN(value) && parseMmss(text) !== value) setText(mmss(value));
  }, [value]);
  const bad = parseMmss(text) === null;
  return (
    <input className={`mmss${bad ? ' bad' : ''}`} aria-label={label} aria-invalid={bad} value={text} inputMode="numeric"
      onChange={(e) => { setText(e.target.value); onChange(parseMmss(e.target.value) ?? NaN); }} />
  );
}

/** Редактор пресета на месте циферблата. */
export function PresetEditor({ initial, onCancel, onSave }: {
  initial: NewPreset;
  onCancel: () => void;
  onSave: (p: NewPreset) => Promise<void>;
}) {
  const [draft, setDraft] = useState<NewPreset>(initial);
  const [sel, setSel] = useState(0);
  const [saving, setSaving] = useState(false);
  const errors = validatePreset(draft);
  const groups = draft.groups;
  const setGroups = (g: Group[], nextSel: number) => {
    setDraft({ ...draft, groups: g });
    setSel(Math.max(0, Math.min(nextSel, g.length - 1)));
  };
  const setGroup = (i: number, patch: Partial<Group>) => setDraft({ ...draft, groups: groups.map((g, j) => (j === i ? { ...g, ...patch } : g)) });
  // Первый этап 1× без отдыха — «приготовьтесь» (правило expandPreset): строка без поля отдыха, как в макете.
  const isPrepare = (g: Group, i: number) => i === 0 && groups.length > 1 && g.repeats === 1 && g.restSec === 0;
  const save = async () => {
    setSaving(true);
    try { await onSave(draft); } finally { setSaving(false); }
  };

  return (
    <section className="editor slide" aria-label="Редактирование пресета">
      <div className="ed-fields rise" style={rise(0)}>
        <label>Название<input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
        <label className="wide">Описание<input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></label>
      </div>
      <div className="ed-tools rise" style={rise(1)} role="toolbar" aria-label="Этапы">
        <span className="ed-title">Этапы</span>
        <button className="icon-btn" aria-label="Добавить этап" data-tip="Добавить этап" onClick={() => setGroups(addGroup(groups), groups.length)}><Icon name="plus" /></button>
        <button className="icon-btn" aria-label="Дублировать этап" data-tip="Дублировать этап" onClick={() => setGroups(duplicateGroup(groups, sel), sel + 1)}><Icon name="copy" /></button>
        <button className="icon-btn" aria-label="Переставить этап вверх" data-tip="Переставить этап вверх" disabled={sel === 0} onClick={() => setGroups(moveGroupUp(groups, sel), sel - 1)}><Icon name="up" /></button>
        <button className="icon-btn" aria-label="Удалить этап" data-tip="Удалить этап" disabled={groups.length <= 1} onClick={() => setGroups(removeGroup(groups, sel), sel)}><Icon name="trash" /></button>
      </div>
      {groups.map((g, i) => {
        const n = i + 1;
        const prep = isPrepare(g, i);
        return (
          <div key={i} className={`ed-row rise${i === sel ? ' selected' : ''}`} style={rise(2 + i)} onFocus={() => setSel(i)} onClick={() => setSel(i)}>
            <label className="ed-rep">
              <input aria-label={`Этап ${n}: повторы`} inputMode="numeric" value={Number.isNaN(g.repeats) ? '' : g.repeats}
                onChange={(e) => setGroup(i, { repeats: /^\d+$/.test(e.target.value) ? Number(e.target.value) : NaN })} />
              <span aria-hidden="true">×</span>
            </label>
            <div className="ed-boxes">
              <div className={`ed-box ${prep ? 'prepare' : 'work'}`}>
                <input className="ed-label" aria-label={`Этап ${n}: упражнение`} value={g.workLabel} onChange={(e) => setGroup(i, { workLabel: e.target.value })} />
                <MmssInput label={`Этап ${n}: работа`} value={g.workSec} onChange={(workSec) => setGroup(i, { workSec })} />
              </div>
              {!prep && (
                <div className="ed-box rest">
                  <span className="ed-label">Отдых</span>
                  <MmssInput label={`Этап ${n}: отдых`} value={g.restSec} onChange={(restSec) => setGroup(i, { restSec })} />
                </div>
              )}
            </div>
          </div>
        );
      })}
      <div className="ed-actions rise" style={rise(2 + groups.length)}>
        {errors.length > 0 && <ul className="errors" role="alert">{errors.map((e) => <li key={e}>{e}</li>)}</ul>}
        <div className="ed-buttons">
          <button className="btn" onClick={onCancel}>Отмена</button>
          <button className="btn btn-primary" disabled={errors.length > 0 || saving} onClick={() => void save()}>Сохранить</button>
        </div>
      </div>
    </section>
  );
}
