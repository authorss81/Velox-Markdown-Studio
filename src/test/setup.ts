import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import DOMPurify from 'dompurify';

/**
 * Guards against the single most dangerous failure mode for this suite.
 *
 * DOMPurify silently degrades to a pass-through when the DOM it binds to lacks
 * createNodeIterator. That happened for real during development: under happy-dom
 * every XSS test "passed" while `sanitize()` was returning its input untouched,
 * because `DOMPurify.isSupported` was false and it returns `dirty` unchanged.
 *
 * So the environment's capability is asserted once, loudly, before any test runs.
 * If a future dependency change breaks the DOM again, the suite fails to start
 * rather than quietly proving nothing.
 */
if (DOMPurify.isSupported !== true) {
  throw new Error(
    'DOMPurify.isSupported is false in this environment, so the sanitiser is a ' +
      'no-op and the XSS assertions would pass vacuously. Check that jsdom ' +
      'exposes document.createNodeIterator.'
  );
}

afterEach(() => {
  cleanup();
  // Storage tests assert on an exact library contents, so no state may leak.
  localStorage.clear();
});
