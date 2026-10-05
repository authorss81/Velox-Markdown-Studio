import { describe, it, expect, beforeEach } from 'vitest';
import { del } from 'idb-keyval';
import {
  getRecentFiles,
  saveFileRecord,
  deleteFileRecord,
  clearFileHistory,
  togglePin,
  getAppSettings,
  saveAppSettings,
} from '../storage';
import type { MarkdownFileRecord } from '../../types';

function record(over: Partial<MarkdownFileRecord> & { id: string; name: string }): MarkdownFileRecord {
  return {
    path: '',
    content: '',
    size: 0,
    lastOpened: Date.now(),
    lastModified: Date.now(),
    wordCount: 0,
    readingTimeMinutes: 1,
    isPinned: false,
    tags: [],
    ...over,
  };
}

const names = (files: MarkdownFileRecord[]) => files.map((f) => f.name).join(' | ');

beforeEach(async () => {
  // Each test starts from a known-empty, already-initialised library.
  await clearFileHistory();
});

describe('first run seeding', () => {
  it('seeds the bundled samples exactly once', async () => {
    // Undo the beforeEach initialisation to simulate a genuine first run: the
    // sentinel is what distinguishes "never initialised" from "user cleared it".
    await del('velox_initialized_v1');
    await del('velox_recent_files_v2');

    const first = await getRecentFiles();
    expect(first.length).toBeGreaterThan(0);
    const second = await getRecentFiles();
    expect(names(second)).toBe(names(first));
  });

  it('does not seed again once the sentinel is set', async () => {
    await del('velox_initialized_v1');
    await del('velox_recent_files_v2');
    await getRecentFiles(); // seeds + writes the sentinel

    await clearFileHistory();
    expect(await getRecentFiles()).toHaveLength(0);
  });
});

describe('an emptied library stays empty', () => {
  // Regression: getRecentFiles treated an empty array as "never initialised",
  // so Clear History silently re-seeded the samples on the next read.
  it('stays empty across repeated reads', async () => {
    await clearFileHistory();
    expect(await getRecentFiles()).toHaveLength(0);
    for (let i = 0; i < 5; i++) await getRecentFiles();
    expect(await getRecentFiles()).toHaveLength(0);
  });

  it('does not resurrect samples after a subsequent save', async () => {
    await clearFileHistory();
    await saveFileRecord(record({ id: 'user-1', name: 'mine.md', content: '# mine' }));
    const lib = await getRecentFiles();
    expect(lib).toHaveLength(1);
    expect(lib[0]?.id).toBe('user-1');
  });

  it('stays empty after deleting the last record', async () => {
    await saveFileRecord(record({ id: 'temp', name: 'temp.md' }));
    expect(await getRecentFiles()).toHaveLength(1);
    await deleteFileRecord('temp');
    expect(await getRecentFiles()).toHaveLength(0);
    expect(await getRecentFiles()).toHaveLength(0);
  });
});

describe('record identity', () => {
  // Regression: saveFileRecord matched on `path`, but every path was fabricated
  // as C:\Users\Windows\Documents\<name>, so a\notes.md and b\notes.md collided
  // and the second save overwrote the first document.
  it('keeps two same-named documents distinct', async () => {
    await saveFileRecord(record({ id: 'a', name: 'notes.md', path: 'C:\\a\\notes.md', content: 'AAAA' }));
    await saveFileRecord(record({ id: 'b', name: 'notes.md', path: 'C:\\b\\notes.md', content: 'BBBB' }));

    const lib = await getRecentFiles();
    expect(lib).toHaveLength(2);
    expect(lib.map((f) => f.content).sort()).toEqual(['AAAA', 'BBBB']);
  });

  it('re-saving one document does not touch the other', async () => {
    await saveFileRecord(record({ id: 'a', name: 'notes.md', path: 'C:\\a\\notes.md', content: 'AAAA' }));
    await saveFileRecord(record({ id: 'b', name: 'notes.md', path: 'C:\\b\\notes.md', content: 'BBBB' }));
    await saveFileRecord(record({ id: 'a', name: 'notes.md', path: 'C:\\a\\notes.md', content: 'AAAA2' }));

    const lib = await getRecentFiles();
    expect(lib.find((f) => f.id === 'b')?.content).toBe('BBBB');
    expect(lib.find((f) => f.id === 'a')?.content).toBe('AAAA2');
  });

  it('never changes a record id during a merge', async () => {
    await saveFileRecord(record({ id: 'a', name: 'notes.md', content: 'x' }));
    const before = (await getRecentFiles()).map((f) => f.id).sort();
    await saveFileRecord(record({ id: 'a', name: 'renamed.md', content: 'y' }));
    const after = (await getRecentFiles()).map((f) => f.id).sort();
    expect(after).toEqual(before);
  });
});

describe('user organisation survives a merge', () => {
  it('keeps a pin through a re-save', async () => {
    await saveFileRecord(record({ id: 'a', name: 'a.md' }));
    await togglePin('a');
    expect((await getRecentFiles()).find((f) => f.id === 'a')?.isPinned).toBe(true);

    await saveFileRecord(record({ id: 'a', name: 'a.md', content: 'changed' }));
    expect((await getRecentFiles()).find((f) => f.id === 'a')?.isPinned).toBe(true);
  });

  it('does not let empty or absent tags wipe existing ones', async () => {
    await saveFileRecord(record({ id: 'a', name: 'a.md', tags: ['Draft', 'Mine'] }));

    await saveFileRecord(record({ id: 'a', name: 'a.md', content: 'y', tags: [] }));
    expect((await getRecentFiles()).find((f) => f.id === 'a')?.tags).toEqual(['Draft', 'Mine']);

    await saveFileRecord(record({ id: 'a', name: 'a.md', content: 'z' }));
    expect((await getRecentFiles()).find((f) => f.id === 'a')?.tags).toEqual(['Draft', 'Mine']);
  });

  it('always produces a tags array', async () => {
    await saveFileRecord(record({ id: 'a', name: 'a.md' }));
    await saveFileRecord(record({ id: 'a', name: 'a.md', content: 'q' }));
    expect(Array.isArray((await getRecentFiles()).find((f) => f.id === 'a')?.tags)).toBe(true);
  });
});

describe('concurrent mutations are serialised', () => {
  // Regression: each mutation is a read-modify-write over one shared record, so
  // overlapping writes both read the same snapshot and the second discarded the
  // first, silently dropping files from history.
  it('does not lose records when writes overlap', async () => {
    await Promise.all(
      [1, 2, 3, 4, 5].map((n) => saveFileRecord(record({ id: `r${n}`, name: `${n}.md`, content: String(n) })))
    );
    const lib = await getRecentFiles();
    expect(lib).toHaveLength(5);
    expect(lib.map((f) => f.id).sort()).toEqual(['r1', 'r2', 'r3', 'r4', 'r5']);
  });

  it('does not lose records when a delete overlaps writes', async () => {
    await saveFileRecord(record({ id: 'old', name: 'old.md' }));
    await Promise.all([
      saveFileRecord(record({ id: 'x', name: 'x.md' })),
      deleteFileRecord('old'),
      saveFileRecord(record({ id: 'y', name: 'y.md' })),
    ]);
    const ids = (await getRecentFiles()).map((f) => f.id).sort();
    expect(ids).toContain('x');
    expect(ids).toContain('y');
    expect(ids).not.toContain('old');
  });
});

describe('settings', () => {
  it('uses a font size consistent with first paint', async () => {
    // Was 14 while the component's first render used 16, so every launch
    // rendered at 16 and then snapped to 14.
    expect(getAppSettings().fontSize).toBe(16);
  });

  it('enables autosave by default', () => {
    expect(getAppSettings().autoSave).toBe(true);
  });

  it('round-trips through localStorage', () => {
    saveAppSettings({ ...getAppSettings(), fontSize: 22, wordWrap: false, theme: 'light' });
    const loaded = getAppSettings();
    expect(loaded.fontSize).toBe(22);
    expect(loaded.wordWrap).toBe(false);
    expect(loaded.theme).toBe('light');
  });

  it('merges over defaults when a field is missing', () => {
    localStorage.setItem('velox_settings_v1', JSON.stringify({ theme: 'light' }));
    const loaded = getAppSettings();
    expect(loaded.theme).toBe('light');
    expect(loaded.wordWrap).toBe(true);
  });

  it('survives corrupt settings', () => {
    localStorage.setItem('velox_settings_v1', '{not json');
    expect(() => getAppSettings()).not.toThrow();
    expect(getAppSettings().theme).toBe('dark');
  });
});
