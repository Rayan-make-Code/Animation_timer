import { TipLayer } from './components';
import iconUrl from './assets/icon.png';
import { Main } from './screens/Main';
import { Session } from './screens/Session';
import { StoreProvider, useStore } from './store';

function Shell() {
  const { session } = useStore();
  if (session) return <Session />;
  return (
    <div className="app">
      <header className="titlebar">
        <img className="app-icon" src={iconUrl} alt="" />
        <span className="app-name">MIYP Timer</span>
        <div className="window-controls">
          <button aria-label="Свернуть" data-tip="Свернуть" onClick={() => window.sketch.minimize()}>–</button>
          <button className="close" aria-label="Закрыть" data-tip="Закрыть" onClick={() => window.sketch.close()}>✕</button>
        </div>
      </header>
      <Main />
    </div>
  );
}

export function App() {
  return (
    <StoreProvider>
      <Shell />
      <TipLayer />
    </StoreProvider>
  );
}
