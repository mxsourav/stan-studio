import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

// StrictMode is intentionally off: the verbatim repo hero stage owns its own
// WebGL contexts and scroll engine, which cannot survive double-invoked
// effects in development.
createRoot(document.getElementById('root') as HTMLElement).render(<App />);
