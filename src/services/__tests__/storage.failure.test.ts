import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The failure path is tested in its own file because vi.mock is hoisted per
 * module graph, and mocking idb-keyval for the whole suite would break every
 * happy-path test.
 *
 * The behaviour under test: saveAllRecentFiles used to catch backend errors,
 * log a warning and resolve. Callers therefore cleared the tab's dirty flag and
 * showed "Saved", while nothing had actually been written - the UI reported a
 * successful save for a document that was never persisted.
 */
vi.mock('idb-keyval', () => ({
  get: vi.fn(async () => {
    throw new DOMException('simulated IndexedDB outage', 'UnknownError');
  }),
  set: vi.fn(async () => {
    throw new DOMException('simulated IndexedDB outage', 'UnknownError');
  }),
  del: vi.fn(async () => {
    throw new DOMException('simulated IndexedDB outage', 'UnknownError');
  }),
}));

const { saveAllRecentFiles, getRecentFiles, clearFileHistory } = await import('../storage');

const record = {
  id: 'z',
  name: 'z.md',
  path: '',
  content: '# z',
  size: 4,
  lastOpened: 1,
  lastModified: 1,
  wordCount: 1,
  readingTimeMinutes: 1,
  isPinned: false,
  tags: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('storage outage is reported, not swallowed', () => {
  it('rejects when IndexedDB writes fail', async () => {
    await expect(saveAllRecentFiles([record])).rejects.toThrow(/persist/i);
  });

  it('degrades to an empty library rather than throwing on read', async () => {
    // A read must not fail because storage is down: the Home view would never
    // populate and the user would see an unexplained blank screen. The problem is
    // surfaced on the next save instead.
    await expect(getRecentFiles()).resolves.toEqual([]);
  });

  it('rejects when clearing history with storage unavailable', async () => {
    await expect(clearFileHistory()).rejects.toThrow(/unavailable|clear/i);
  });
});
