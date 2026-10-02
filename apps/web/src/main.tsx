import React from 'react';
import ReactDOM from 'react-dom/client';
import { generateAllCSS } from '@aurevo/design-system';
import { App } from './App';
import { Providers } from './providers';
import { ErrorBoundary } from './components/ErrorBoundary';
import './styles/global.css';

// Inject the design-system token/theme stylesheet (root light theme + dark
// theme) before first paint so components render with correct variables.

window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();

  const key = 'aurevo-preload-reload';

  if (!sessionStorage.getItem(key)) {
    sessionStorage.setItem(key, '1');
    window.location.reload();
  } else {
    sessionStorage.removeItem(key);
  }
});
const style = document.createElement('style');
style.textContent = generateAllCSS();
document.head.appendChild(style);


window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();

  const key = 'aurevo-preload-reload';

  if (!sessionStorage.getItem(key)) {
    sessionStorage.setItem(key, '1');
    window.location.reload();
  } else {
    sessionStorage.removeItem(key);
  }
});
const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Root element #root not found');
}


window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();

  const key = 'aurevo-preload-reload';

  if (!sessionStorage.getItem(key)) {
    sessionStorage.setItem(key, '1');
    window.location.reload();
  } else {
    sessionStorage.removeItem(key);
  }
});
ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <ErrorBoundary>
      <Providers>
        <App />
      </Providers>
    </ErrorBoundary>
  </React.StrictMode>
);
