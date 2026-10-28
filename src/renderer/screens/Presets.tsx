import { useCallback, useEffect, useState } from 'react';
import type { NewPreset, Preset } from '../../shared/api';
import { validatePreset, type Group } from '../../core/presetModel';
import { mmss } from '../components';
import { errorText, useStore } from '../store';

const blankGroup = (): Group => ({ repeats: 1, workLabel: 'Наброски', workSec: 60, restSec: 15 });
const blank = (): NewPreset => ({ name: '', description: '', groups: [blankGroup()] });

export function Presets() {
  const { setNotice } = useStore();
  const [list, setList] = useState<Preset[]>([]);
  const [editId, setEditId] = useState<number | undefined>(undefined);
  const [draft, setDraft] = useState<NewPreset | null>(null);

  const load = useCallback(() => window.sketch.listPresets().then(setList), []);
  useEffect(() => { void load(); }, [load]);

  const errors = draft ? validatePreset(draft) : [];
  const setGroup = (i: number, patch: Partial<Group>) => setDraft((d) => d && { ...d, groups: d.groups.map((g, j) => (j === i ? { ...g, ...patch } : g)) });
  const num = (v: string) => (v === '' ? 0 : Number(v));
  const guard = async (fn: () => Promise<unknown>) => {
    try { await fn(); await load(); } catch (e) { setNotice(errorText(e)); }
  };

  return (
    <section className="presets">
      <h1>Пресеты таймера</h1>
      <div className="split">
        <div>
          <button className="primary" onClick={() => { setEditId(undefined); setDraft(blank()); }}>Новый пресет</button>
          <ul className="list">
            {list.map((p) => (
              <li key={p.id} className="list-row">
                <button className="link" onClick={() => { setEditId(p.id); setDraft({ name: p.name, description: p.description, groups: p.groups }); }}>{p.name}</button>
                <span className="muted small">{p.groups.reduce((n, g) => n + g.repeats, 0)} интервалов</span>
                <button onClick={() => guard(() => window.sketch.copyPreset(p.id))}>Копировать</button>
                <button onClick={() => guard(async () => {
                  await window.sketch.deletePreset(p.id);
                  if (editId === p.id) setDraft(null);
                })}>Удалить</button>
              </li>
            ))}
          </ul>
          {list.length === 0 && <p className="muted">Пресетов пока нет.</p>}
        </div>

        {draft && (
          <form className="editor" onSubmit={(e) => e.preventDefault()}>
            <label>Название<input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
            <label>Описание<input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></label>
            {draft.groups.map((g, i) => (
              <fieldset key={i} className="group">
                <legend>Этап {i + 1}</legend>
                <label>Повторов<input type="number" min={1} value={g.repeats} onChange={(e) => setGroup(i, { repeats: num(e.target.value) })} /></label>
                <label>Упражнение<input value={g.workLabel} onChange={(e) => setGroup(i, { workLabel: e.target.value })} /></label>
                <label>Работа, сек<input type="number" min={1} value={g.workSec} onChange={(e) => setGroup(i, { workSec: num(e.target.value) })} /></label>
                <label>Отдых, сек<input type="number" min={0} value={g.restSec} onChange={(e) => setGroup(i, { restSec: num(e.target.value) })} /></label>
                <span className="muted small">{mmss(g.workSec)} + {mmss(g.restSec)}</span>
                <button type="button" aria-label={`Удалить этап ${i + 1}`} onClick={() => setDraft({ ...draft, groups: draft.groups.filter((_, j) => j !== i) })}>✕</button>
              </fieldset>
            ))}
            <div className="toolbar">
              <button type="button" onClick={() => setDraft({ ...draft, groups: [...draft.groups, blankGroup()] })}>Добавить этап</button>
              <button type="button" className="primary" disabled={errors.length > 0} onClick={() => guard(async () => {
                const id = await window.sketch.savePreset({ ...draft, id: editId });
                setEditId(id);
                setNotice('Пресет сохранён.');
              })}>Сохранить</button>
              <button type="button" onClick={() => setDraft(null)}>Закрыть</button>
            </div>
            {errors.length > 0 && <ul className="errors" role="alert">{errors.map((e) => <li key={e}>{e}</li>)}</ul>}
          </form>
        )}
      </div>
    </section>
  );
}
