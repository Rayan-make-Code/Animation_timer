import { useState } from 'react';
import type { NewPreset, Preset } from '../../shared/api';
import { CategoryTags } from '../main/CategoryTags';
import { Dial } from '../main/Dial';
import { Footer } from '../main/Footer';
import { blankPreset, PresetEditor } from '../main/PresetEditor';
import { PresetRow } from '../main/PresetRow';
import { StartBar } from '../main/StartBar';
import { errorText, useStore } from '../store';

interface Editing { id?: number; initial: NewPreset; key: number }

let editKey = 0;
const editOf = (p: Preset): Editing => ({ id: p.id, initial: { name: p.name, description: p.description, groups: p.groups }, key: ++editKey });

/** Главный экран: пресеты → циферблат или редактор → описание → категории → «Старт» → подвал. */
export function Main() {
  const { presets, reloadPresets, selectedPresetId, selectPreset, firstRun, notice, setNotice } = useStore();
  const [editing, setEditing] = useState<Editing | null>(null);
  // null — панель библиотеки следует правилу первого запуска.
  const [panelOpen, setPanelOpen] = useState<boolean | null>(null);
  const open = panelOpen ?? firstRun;
  const list = presets ?? [];
  const preset = list.find((p) => p.id === selectedPresetId) ?? null;

  const pick = (p: Preset) => {
    selectPreset(p.id);
    // В первый запуск клик сразу открывает редактор, потом — циферблат.
    setEditing(firstRun ? editOf(p) : null);
  };
  const save = async (draft: NewPreset) => {
    try {
      const id = await window.sketch.savePreset({ ...draft, id: editing?.id });
      await reloadPresets();
      selectPreset(id);
      setEditing(null);
    } catch (e) {
      setNotice(errorText(e));
    }
  };
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

  return (
    <>
      <main className="main">
        <PresetRow presets={list} selectedId={selectedPresetId} onPick={pick} onNew={() => setEditing({ initial: blankPreset(), key: ++editKey })} />
        {editing ? (
          <PresetEditor key={editing.key} initial={editing.initial} onCancel={() => setEditing(null)} onSave={save} />
        ) : (
          preset && <Dial key={preset.id} preset={preset} />
        )}
        {preset && (
          <section className="desc" aria-label="Описание">
            <span className="desc-name">{preset.name}</span>{preset.description ? ` — ${preset.description}` : ''}
          </section>
        )}
        <CategoryTags />
        <StartBar preset={preset} onEdit={() => preset && setEditing(editOf(preset))} onDelete={remove} />
        {notice && (
          <div className="notice" role="status">
            <span>{notice}</span>
            <button className="icon-btn" aria-label="Закрыть сообщение" data-tip="Закрыть сообщение" onClick={() => setNotice(null)}>✕</button>
          </div>
        )}
      </main>
      <Footer open={open} onToggle={() => setPanelOpen(!open)} />
    </>
  );
}
