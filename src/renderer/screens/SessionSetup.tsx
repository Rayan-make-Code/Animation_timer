import { useEffect, useState } from 'react';
import type { CategoryNode, Preset } from '../../shared/api';
import { expandPreset, totalWork } from '../../core/timer';
import { mmss, TreeView } from '../components';
import { errorText, useStore } from '../store';

export function SessionSetup() {
  const { selected, setSession, setNotice } = useStore();
  const [tree, setTree] = useState<CategoryNode[]>([]);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [presetId, setPresetId] = useState<number | null>(null);

  useEffect(() => {
    void window.sketch.getTree().then(setTree);
    void window.sketch.listPresets().then((p) => { setPresets(p); setPresetId((cur) => cur ?? p[0]?.id ?? null); });
  }, []);

  const preset = presets.find((p) => p.id === presetId);
  const steps = preset ? expandPreset(preset) : [];
  const duration = steps.reduce((s, x) => s + x.sec, 0);

  const start = async () => {
    if (!preset) return;
    try {
      const queue = await window.sketch.buildQueue(selected, totalWork(steps));
      await window.sketch.setFullscreen(true);
      setSession({ preset, queue });
    } catch (e) {
      setNotice(errorText(e));
    }
  };

  return (
    <section>
      <h1>Новая сессия</h1>
      <h2>Категории</h2>
      {tree.length === 0 ? <p className="muted">Сначала подключите библиотеку.</p> : <TreeView nodes={tree} selectable />}
      <h2>Таймер</h2>
      {presets.length === 0 ? (
        <p className="muted">Создайте пресет на вкладке «Пресеты».</p>
      ) : (
        <label className="inline">Пресет
          <select value={presetId ?? ''} onChange={(e) => setPresetId(Number(e.target.value))}>
            {presets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      )}
      {preset && <p className="muted">Рисунков: {totalWork(steps)}, общая длительность: {mmss(duration)}</p>}
      <button className="primary" disabled={!preset || selected.length === 0} onClick={start}>Начать</button>
      {selected.length === 0 && <p className="muted small">Отметьте хотя бы одну категорию.</p>}
    </section>
  );
}
