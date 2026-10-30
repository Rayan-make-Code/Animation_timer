import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type CSSProperties, type FocusEvent } from 'react';
import type { NewPreset } from '../../shared/api';
import { validatePreset, type Group } from '../../core/presetModel';
import { addGroup, duplicateGroup, moveGroupUp, parseMmss, removeGroup } from '../../core/presetEdit';
import { Icon, mmss } from '../components';
import type { CategoryTag } from './CategoryTags';

/** Новый пресет: «Приготовьтесь» (1× без отдыха) и один обычный этап. */
export const blankPreset = (): NewPreset => ({
  name: '',
  description: '',
  categoryIds: [],
  groups: addGroup([PREPARE]),
});

/** Подготовка — первый этап: всегда 1× без отдыха, повторы не настраиваются. */
const PREPARE: Group = { repeats: 1, workLabel: 'Приготовьтесь', workSec: 5, restSec: 0, categoryIds: [] };
const isPrepareShape = (g: Group | undefined) => !!g && g.repeats === 1 && g.restSec === 0;

/** Открытый пресет без подготовки (старые записи) получает её первым этапом. */
export const withPrepare = (groups: Group[]): Group[] => (isPrepareShape(groups[0]) ? groups : [PREPARE, ...groups]);

/** Перед сохранением подготовка всегда 1× без отдыха и без своих категорий: её изображение берётся из первого интервала. */
const normalize = (p: NewPreset): NewPreset => ({ ...p, groups: [{ ...p.groups[0], repeats: 1, restSec: 0, categoryIds: [] }, ...p.groups.slice(1)] });

const toggleId = (ids: number[], id: number) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);

/** Кнопки-теги категорий: те же стили, что на главном экране. */
function CategoryChips({ tags, selected, label, onToggle }: { tags: CategoryTag[]; selected: number[]; label: string; onToggle: (id: number) => void }) {
  return (
    <div className="tags" role="group" aria-label={label}>
      {tags.map((t) => (
        <button key={t.id} type="button" className={`chip${t.sub ? ' sub' : ''}`} aria-pressed={selected.includes(t.id)} onClick={() => onToggle(t.id)}>
          {t.name}
        </button>
      ))}
    </div>
  );
}

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

export interface EditorHandle {
  /** Сохраняет черновик; false — есть ошибки или сохранение не удалось, редактор остаётся открытым. */
  commit(): Promise<boolean>;
}

/**
 * Редактор пресета на месте циферблата. Кнопок «Сохранить» и «Отмена» нет: черновик сохраняется сам,
 * когда фокус уходит в другое поле редактора, и при выходе из редактора (см. Main).
 */
export const PresetEditor = forwardRef<EditorHandle, {
  /** id уже сохранённого пресета; для нового пресета undefined до первого автосохранения. */
  presetId?: number;
  initial: NewPreset;
  tags: CategoryTag[];
  /** Возвращает id сохранённого пресета или null при ошибке. */
  onSave: (p: NewPreset, id?: number) => Promise<number | null>;
}>(function PresetEditor({ presetId, initial, tags, onSave }, ref) {
  const [draft, setDraft] = useState<NewPreset>(() => ({ ...initial, categoryIds: initial.categoryIds ?? [], groups: withPrepare(initial.groups) }));
  const [sel, setSel] = useState(0);
  const idRef = useRef(presetId);
  const errors = validatePreset(draft);
  const groups = draft.groups;
  const setGroups = (g: Group[], nextSel: number) => {
    setDraft({ ...draft, groups: g });
    setSel(Math.max(0, Math.min(nextSel, g.length - 1)));
  };
  const setGroup = (i: number, patch: Partial<Group>) => setDraft({ ...draft, groups: groups.map((g, j) => (j === i ? { ...g, ...patch } : g)) });

  /** Сохраняет переданный черновик; при ошибках валидации ничего не пишет. */
  const persist = async (d: NewPreset): Promise<boolean> => {
    if (validatePreset(d).length > 0) return false;
    const id = await onSave(normalize(d), idRef.current);
    if (id !== null) idRef.current = id;
    return id !== null;
  };
  const commit = () => persist(draft);
  useImperativeHandle(ref, () => ({ commit }), [draft, onSave]);

  // Фокус перешёл из одного поля редактора в другое: сохраняем, как только поле заполнено.
  const onBlur = (e: FocusEvent<HTMLElement>) => {
    if (e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget)) void commit();
  };
  // Переключение тега сразу сохраняет черновик: кнопка не даёт перейти к другому полю.
  const toggleTop = (id: number) => {
    const d = { ...draft, categoryIds: toggleId(draft.categoryIds ?? [], id) };
    setDraft(d);
    void persist(d);
  };
  const toggleGroup = (i: number, id: number) => {
    const d = { ...draft, groups: groups.map((g, j) => (j === i ? { ...g, categoryIds: toggleId(g.categoryIds ?? [], id) } : g)) };
    setDraft(d);
    void persist(d);
  };

  return (
    <section className="editor swap" aria-label="Редактирование пресета" onBlur={onBlur}>
      <div className="ed-fields rise" style={rise(0)}>
        <label>Название<input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
        <label className="wide">Описание<input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></label>
      </div>
      <div className="ed-cats rise" style={rise(1)}>
        <span className="ed-title">Категории пресета</span>
        {tags.length > 0
          ? <CategoryChips tags={tags} selected={draft.categoryIds ?? []} label="Категории пресета" onToggle={toggleTop} />
          : <span className="ed-hint">Нет папок с изображениями: подключите библиотеку.</span>}
      </div>
      <div className="ed-tools rise" style={rise(2)} role="toolbar" aria-label="Этапы">
        <span className="ed-title">Этапы</span>
        <button className="icon-btn" aria-label="Добавить этап" data-tip="Добавить этап" onClick={() => setGroups(addGroup(groups), groups.length)}><Icon name="plus" /></button>
        <button className="icon-btn" aria-label="Дублировать этап" data-tip="Дублировать этап" disabled={sel === 0} onClick={() => setGroups(duplicateGroup(groups, sel), sel + 1)}><Icon name="copy" /></button>
        <button className="icon-btn" aria-label="Переставить этап вверх" data-tip="Переставить этап вверх" disabled={sel <= 1} onClick={() => setGroups(moveGroupUp(groups, sel), sel - 1)}><Icon name="up" /></button>
        <button className="icon-btn" aria-label="Удалить этап" data-tip="Удалить этап" disabled={sel === 0 || groups.length <= 1} onClick={() => setGroups(removeGroup(groups, sel), sel)}><Icon name="trash" /></button>
      </div>
      {groups.map((g, i) => {
        const n = i + 1;
        // Строка подготовки (первая) без поля повторов, отдыха и своих категорий.
        const prep = i === 0;
        const own = g.categoryIds ?? [];
        return (
          <div key={i} className={`ed-row rise${i === sel ? ' selected' : ''}`} style={rise(3 + i)} onFocus={() => setSel(i)} onClick={() => setSel(i)}>
            {prep ? (
              <span className="ed-rep-fixed" aria-label={`Этап ${n}: повторов 1`}>1×</span>
            ) : (
              <label className="ed-rep">
                <input aria-label={`Этап ${n}: повторы`} inputMode="numeric" value={Number.isNaN(g.repeats) ? '' : g.repeats}
                  onChange={(e) => setGroup(i, { repeats: /^\d+$/.test(e.target.value) ? Number(e.target.value) : NaN })} />
                <span aria-hidden="true">×</span>
              </label>
            )}
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
              {!prep && tags.length > 0 && (
                <div className="ed-row-cats">
                  <CategoryChips tags={tags} selected={own} label={`Этап ${n}: категории`} onToggle={(id) => toggleGroup(i, id)} />
                  {own.length === 0 && <span className="ed-hint">как у пресета</span>}
                </div>
              )}
            </div>
          </div>
        );
      })}
      {errors.length > 0 && <ul className="errors ed-errors rise" style={rise(3 + groups.length)} role="alert">{errors.map((e) => <li key={e}>{e}</li>)}</ul>}
    </section>
  );
});
