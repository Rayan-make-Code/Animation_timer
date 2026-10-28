import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';
import type { SketchApi } from '../shared/api';

declare global {
  interface Window { sketch: SketchApi }
}

createRoot(document.getElementById('root')!).render(<App />);
