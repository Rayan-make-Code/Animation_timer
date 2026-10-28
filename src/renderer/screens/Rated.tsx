import { useCallback, useEffect, useState } from 'react';
import type { ImageRow } from '../../shared/api';
import { Thumb } from '../components';
import { errorText, useStore } from '../store';

export function Rated({ rating }: { rating: 1 | -1 }) {
  const { setNotice } = useStore();
  const [rows, setRows] = useState<ImageRow[] | null>(null);
  const load = useCallback(() => window.sketch.listRated(rating).then(setRows).catch((e) => setNotice(errorText(e))), [rating, setNotice]);
  useEffect(() => { void load(); }, [load]);

  const title = rating === 1 ? 'Лайки' : 'Дизлайки';
  return (
    <section>
      <h1>{title}</h1>
      {rows?.length === 0 && <p className="muted">{rating === 1 ? 'Лайкнутых изображений пока нет.' : 'Дизлайкнутых изображений пока нет.'}</p>}
      <div className="grid">
        {rows?.map((r) => (
          <figure key={r.id} className="card">
            <Thumb id={r.id} alt={r.fileName} />
            <figcaption className="ellipsis" title={r.relPath}>{r.fileName}</figcaption>
            <button onClick={async () => { await window.sketch.setRating(r.id, 0); await load(); }}>Снять оценку</button>
          </figure>
        ))}
      </div>
    </section>
  );
}
