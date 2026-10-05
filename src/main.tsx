import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

const container = document.getElementById('root');

if (!container) {
  throw new Error('Root element #root is missing from index.html');
}

/**
 * StrictMode is deliberate: it double-invokes render and effects in development,
 * which is exactly what surfaced impure state updaters in this codebase (the
 * theme toggle used to perform DOM writes, a localStorage write and a toast
 * inside a setState updater, producing doubled toasts).
 *
 * The outer boundary is the last line of defence. Everything that matters is also
 * wrapped more narrowly inside App, so this only catches a failure in the shell
 * itself - where there is no tab state left to protect.
 */
createRoot(container).render(
  <StrictMode>
    <ErrorBoundary label="Velox Markdown Studio">
      <App />
    </ErrorBoundary>
  </StrictMode>
);
