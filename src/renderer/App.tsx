import { Library } from './screens/Library';
import { Presets } from './screens/Presets';
import { Rated } from './screens/Rated';
import { Session } from './screens/Session';
import { SessionSetup } from './screens/SessionSetup';
import { StoreProvider, useStore, type Tab } from './store';

const NAV: { tab: Tab; label: string }[] = [
  { tab: 'library', label: 'Библиотека' },
  { tab: 'liked', label: 'Лайки' },
  { tab: 'disliked', label: 'Дизлайки' },
  { tab: 'presets', label: 'Пресеты' },
  { tab: 'setup', label: 'Сессия' },
];

function Shell() {
  const { tab, setTab, session, notice, setNotice } = useStore();
  if (session) return <Session />;
  return (
    <div className="app">
      <header className="titlebar">
        <span className="app-name">Sketch Timer</span>
        <div className="window-controls">
          <button aria-label="Свернуть" onClick={() => window.sketch.minimize()}>–</button>
          <button className="close" aria-label="Закрыть" onClick={() => window.sketch.close()}>✕</button>
        </div>
      </header>
      <div className="body">
        <nav className="sidebar" aria-label="Разделы">
          <div className="nav">
            {NAV.map((n) => (
              <button key={n.tab} className={`nav-item${tab === n.tab ? ' active' : ''}`} aria-current={tab === n.tab ? 'page' : undefined} onClick={() => setTab(n.tab)}>
                {n.label}
              </button>
            ))}
          </div>
        </nav>
        <main className="content">
          {notice && (
            <div className="notice" role="status">
              <span>{notice}</span>
              <button className="ghost" onClick={() => setNotice(null)} aria-label="Закрыть сообщение">✕</button>
            </div>
          )}
          {tab === 'library' && <Library />}
          {tab === 'liked' && <Rated rating={1} />}
          {tab === 'disliked' && <Rated rating={-1} />}
          {tab === 'presets' && <Presets />}
          {tab === 'setup' && <SessionSetup />}
        </main>
      </div>
    </div>
  );
}

export function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
