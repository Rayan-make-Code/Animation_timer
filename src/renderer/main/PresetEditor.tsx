import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type CSSProperties, type FocusEvent } from 'react';
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
  const bad = text !== '' && parseMmss(text) === null;
  // При входе в поле старое значение стирается (видно подсказкой), ввод идёт с чистого поля.
  const orig = useRef(value);
  const clear = () => { orig.current = value; setText(''); };
  // Секунды, введённые цифрами («90»), при уходе из поля показываются как «1:30»; пустое поле возвращает прежнее значение.
  const tidy = () => {
    if (text === '') return setText(Number.isNaN(orig.current) ? '' : mmss(orig.current));
    const sec = parseMmss(text);
    if (sec !== null) setText(mmss(sec));
  };
  return (
    <input className={`mmss${bad ? ' bad' : ''}`} aria-label={label} aria-invalid={bad} value={text} inputMode="numeric"
      placeholder={Number.isNaN(value) ? '' : mmss(value)}
      onFocus={clear} onBlur={tidy} onChange={(e) => { setText(e.target.value); onChange(e.target.value === '' ? orig.current : parseMmss(e.target.value) ?? NaN); }} />
  );
}

/** Сколько этапов видно в редакторе без прокрутки. */
const VISIBLE_ROWS = 3;

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
  /** Стрелка «назад»: сохранить и вернуть циферблат. */
  onBack: () => void;
}>(function PresetEditor({ presetId, initial, tags, onSave, onBack }, ref) {
  const [draft, setDraft] = useState<NewPreset>(() => ({ ...initial, categoryIds: initial.categoryIds ?? [], groups: withPrepare(initial.groups) }));
  const [sel, setSel] = useState(0);
  const idRef = useRef(presetId);
  // Черновик изменён после последнего сохранения: только тогда переход к другому полю сохраняет.
  const dirty = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    if (mounted.current) dirty.current = true;
    mounted.current = true;
  }, [draft]);
  // Сохранения идут строго по очереди: новый пресет не создаётся дважды.
  const chain = useRef<Promise<boolean>>(Promise.resolve(true));
  const errors = validatePreset(draft);
  const groups = draft.groups;
  // Новый этап добавлен: после отрисовки список плавно прокручивается к нему.
  const reveal = useRef(false);
  const setGroups = (g: Group[], nextSel: number) => {
    reveal.current = g.length > groups.length;
    setDraft({ ...draft, groups: g });
    setSel(Math.max(0, Math.min(nextSel, g.length - 1)));
  };
  // Видно не больше трёх этапов; остальные прокручиваются внутри списка.
  const list = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = list.current;
    if (!el) return;
    const rows = [...el.querySelectorAll<HTMLElement>(':scope > .ed-row')];
    el.style.maxHeight = rows.length > VISIBLE_ROWS ? `${rows.slice(0, VISIBLE_ROWS).reduce((h, r) => h + r.offsetHeight, 0)}px` : '';
  });
  useEffect(() => {
    if (!reveal.current) return;
    reveal.current = false;
    document.querySelector('.editor .ed-row.selected')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [sel, groups.length]);
  const setGroup = (i: number, patch: Partial<Group>) => setDraft({ ...draft, groups: groups.map((g, j) => (j === i ? { ...g, ...patch } : g)) });

  /** Сохраняет черновик (после предыдущего сохранения); при ошибках валидации ничего не пишет. */
  const persist = (d: NewPreset): Promise<boolean> => {
    const run = async () => {
      if (validatePreset(d).length > 0) return false;
      dirty.current = false;
      const id = await onSave(normalize(d), idRef.current);
      if (id === null) dirty.current = true;
      else idRef.current = id;
      return id !== null;
    };
    chain.current = chain.current.then(run, run);
    return chain.current;
  };
  /** Автосохранение: только если черновик менялся. */
  const commit = (): Promise<boolean> => (dirty.current ? persist(draft) : Promise.resolve(true));
  useImperativeHandle(ref, () => ({ commit }), [draft, onSave]);

  // Фокус перешёл в другое поле редактора после изменения: сохраняем.
  const onBlur = (e: FocusEvent<HTMLElement>) => {
    if (e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget)) void commit();
  };
  const toggleTop = (id: number) => setDraft({ ...draft, categoryIds: toggleId(draft.categoryIds ?? [], id) });
  const toggleGroup = (i: number, id: number) =>
    setDraft({ ...draft, groups: groups.map((g, j) => (j === i ? { ...g, categoryIds: toggleId(g.categoryIds ?? [], id) } : g)) });

  return (
    <section className="editor swap" aria-label="Редактирование пресета" onBlur={onBlur}>
      <div className="ed-head">
        <button className="icon-btn" aria-label="Назад к циферблату" data-tip="Назад" onClick={onBack}><Icon name="back" size={16} /></button>
      </div>
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
        <button className="icon-btn" aria-label="Добавить этап" data-tip="Добавить" onClick={() => setGroups(addGroup(groups), groups.length)}><Icon name="plus" /></button>
        <button className="icon-btn" aria-label="Дублировать этап" data-tip="Дублировать" disabled={sel === 0} onClick={() => setGroups(duplicateGroup(groups, sel), sel + 1)}><Icon name="copy" /></button>
        <button className="icon-btn" aria-label="Переставить этап вверх" data-tip="Выше" disabled={sel <= 1} onClick={() => setGroups(moveGroupUp(groups, sel), sel - 1)}><Icon name="up" /></button>
        <button className="icon-btn" aria-label="Удалить этап" data-tip="Удалить" disabled={sel === 0 || groups.length <= 1} onClick={() => setGroups(removeGroup(groups, sel), sel)}><Icon name="trash" /></button>
        <button className="icon-btn ed-save" aria-label="Сохранить пресет" data-tip="Сохранить" disabled={errors.length > 0} onClick={() => void persist(draft)}><Icon name="save" /></button>
      </div>
      {/* Этапы прокручиваются внутри редактора (без полосы), кнопки под ним остаются на месте. */}
      <div className="ed-groups" ref={list}>
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
                </div>
              )}
            </div>
          </div>
        );
      })}
      {errors.length > 0 && <ul className="errors ed-errors rise" style={rise(3 + groups.length)} role="alert">{errors.map((e) => <li key={e}>{e}</li>)}</ul>}
      </div>
    </section>
  );
});
