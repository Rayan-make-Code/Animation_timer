import { useEffect, useRef, useState } from 'react';
import type { NewPreset, Preset } from '../../shared/api';
import { flattenTags } from '../main/CategoryTags';
import { Dial } from '../main/Dial';
import { Footer } from '../main/Footer';
import { blankPreset, PresetEditor, type EditorHandle } from '../main/PresetEditor';
import { PresetRow } from '../main/PresetRow';
import { StartBar, useStart } from '../main/StartBar';
import { PlayIcon } from '../components';
import { errorText, useStore } from '../store';

interface Editing { id?: number; initial: NewPreset; key: number }

let editKey = 0;
/** Сколько показывается уведомление, мс. */
const NOTICE_MS = 5000;
const editOf = (p: Preset): Editing => ({ id: p.id, initial: { name: p.name, description: p.description, categoryIds: p.categoryIds, groups: p.groups }, key: ++editKey });

/** Главный экран: пресеты → циферблат или редактор (с категориями пресета и интервалов) → описание → «Старт» → подвал. */
export function Main() {
  const { presets, reloadPresets, selectedPresetId, selectPreset, firstRun, notice, setNotice, tree } = useStore();
  const [editing, setEditing] = useState<Editing | null>(null);
  // Черновик открытого редактора (для Play в подвале).
  const [draft, setDraft] = useState<{ key: number; preset: NewPreset } | null>(null);
  // null — панель библиотеки следует правилу первого запуска.
  const [panelOpen, setPanelOpen] = useState<boolean | null>(null);
  const open = panelOpen ?? firstRun;
  const list = presets ?? [];
  const preset = list.find((p) => p.id === selectedPresetId) ?? null;

  // Открытый редактор сохраняется сам: при переходе к другому полю (см. PresetEditor), блоку или пресету.
  const editorRef = useRef<EditorHandle>(null);
  // id, полученный новым пресетом при первом автосохранении (для Play в редакторе).
  const savedId = useRef<{ key: number; id: number } | null>(null);
  const editingId = (): number | null => {
    if (!editing) return null;
    if (editing.id != null) return editing.id;
    return savedId.current?.key === editing.key ? savedId.current.id : null;
  };
  const commit = async (): Promise<boolean> => (editing ? (await editorRef.current?.commit()) ?? true : true);
  const pick = async (p: Preset) => {
    if (!(await commit())) return;
    selectPreset(p.id);
    setEditing(editOf(p));
  };
  /** Сохраняет черновик и возвращает циферблат; при ошибке редактор остаётся открытым. */
  const back = async (): Promise<boolean> => {
    const ok = await commit();
    if (ok) setEditing(null);
    return ok;
  };
  const newPreset = async () => {
    if (!(await commit())) return;
    setEditing({ initial: blankPreset(), key: ++editKey });
  };
  /** Автосохранение: редактор остаётся открытым; возвращает id пресета или null при ошибке. */
  const save = async (draft: NewPreset, id?: number): Promise<number | null> => {
    try {
      const saved = await window.sketch.savePreset({ ...draft, id });
      if (editing) savedId.current = { key: editing.key, id: saved };
      await reloadPresets();
      selectPreset(saved);
      return saved;
    } catch (e) {
      setNotice(errorText(e));
      return null;
    }
  };
  // Уведомление короткое и исчезает само через несколько секунд.
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(t);
  }, [notice, setNotice]);

  const remove = async () => {
    if (!preset) return;
    try {
      await window.sketch.deletePreset(preset.id);
      const rest = await reloadPresets();
      selectPreset(rest[0]?.id ?? null);
      setEditing(null);
    } catch (e) {
      setNotice(errorText(e));
    }
  };

  // Play в подвале редактора: сохраняет черновик (как стрелка «назад») и сразу запускает редактируемый пресет.
  const editId = editingId();
  // Проверка «можно ли стартовать» идёт по живому черновику: только что выбранные категории сразу снимают блокировку.
  const editPreset: Preset | null = editing && draft?.key === editing.key ? { id: editId ?? 0, ...draft.preset } : null;
  const { blocked, start } = useStart(editPreset, async () => ((await back()) ? editingId() : null));

  return (
    <>
      <main className="main" onPointerDownCapture={(e) => {
        // Нажатие вне редактора и ряда пресетов только сохраняет черновик; к циферблату ведёт стрелка «назад».
        if (editing && !(e.target as Element).closest('.editor, .preset-row, .start')) void commit();
      }}>
        <PresetRow presets={list} selectedId={selectedPresetId} onPick={(p) => void pick(p)} onNew={() => void newPreset()} />
        {editing ? (
          <PresetEditor key={editing.key} ref={editorRef} presetId={editing.id} initial={editing.initial} tags={flattenTags(tree)} onSave={save} onBack={() => void back()}
            onDraft={(p) => setDraft({ key: editing.key, preset: p })} />
        ) : (
          preset && <Dial key={preset.id} preset={preset} />
        )}
        {preset && !editing && (
          <section className="desc" aria-label="Описание">
            <span className="desc-name">{preset.name}</span>{preset.description ? ` — ${preset.description}` : ''}
          </section>
        )}
        {/* В редакторе кнопок нет: к ним ведёт стрелка «назад». */}
        {!editing && <StartBar preset={preset} onEdit={() => preset && setEditing(editOf(preset))} onDelete={remove} beforeStart={back} />}
        {notice && (
          <div className="notice" role="status">
            <span>{notice}</span>
            <button className="icon-btn" aria-label="Закрыть сообщение" data-tip="Закрыть" onClick={() => setNotice(null)}>✕</button>
          </div>
        )}
      </main>
      <Footer open={open} onToggle={() => setPanelOpen(!open)} action={editing && (
        <button className="icon-btn start-btn editor-play" aria-label="Запустить пресет" aria-disabled={blocked ? true : undefined}
          data-tip={blocked ?? 'Старт'} onClick={() => void start()}>
          <PlayIcon size={22} />
        </button>
      )} />
    </>
  );
}
