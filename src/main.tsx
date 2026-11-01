import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

// StrictMode is intentionally off: the verbatim repo hero stage owns its own
// WebGL contexts and scroll engine, which cannot survive double-invoked
// effects in development.
// Register PWA service worker for offline support and standalone app installation
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .catch((err) => {
        console.warn('[STΔN PWA] Service worker registration notice:', err);
      });
  });
}

createRoot(document.getElementById('root') as HTMLElement).render(<App />);
