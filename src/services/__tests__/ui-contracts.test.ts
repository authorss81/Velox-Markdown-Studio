import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Locks the Phase 5 chrome-consistency fixes: one inset, one control height, one
 * minimum text size, and labels on every icon-only control. All of these
 * regressed silently before because nothing asserted on the class strings.
 */
const COMPONENTS = path.join(process.cwd(), 'src', 'components');

function readComponent(name: string): string {
  return fs.readFileSync(path.join(COMPONENTS, name), 'utf8');
}

function componentSources(): Array<[string, string]> {
  return fs
    .readdirSync(COMPONENTS)
    .filter((f) => f.endsWith('.tsx'))
    .map((f) => [f, readComponent(f)] as [string, string]);
}

describe('chrome consistency contract', () => {
  it('defines the 11px minimum text token', () => {
    const css = fs.readFileSync(path.join(process.cwd(), 'src', 'index.css'), 'utf8');
    expect(css).toMatch(/--text-2xs:\s*0\.6875rem;/);
  });

  it('has no sub-11px text or sub-pixel padding left in components', () => {
    const offenders: string[] = [];
    for (const [file, src] of componentSources()) {
      src.split('\n').forEach((line, i) => {
        if (/text-\[1[01]px\]|py-0\.2/.test(line)) offenders.push(`${file}:${i + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it('has no off-scale fractional steps left in components', () => {
    // On-scale fractions (0.5, 1.5, 2.5) are Tailwind standard; these are not.
    const offenders: string[] = [];
    for (const [file, src] of componentSources()) {
      src.split('\n').forEach((line, i) => {
        if (/[mp][xtyblr]?-4\.5|py-3\.5|h-7\.5|w-4\.5|w-5\.5|h-7\.5/.test(line)) {
          offenders.push(`${file}:${i + 1}`);
        }
      });
    }
    // AppLogo's w-5.5 h-5.5 is a logo render, not a control - exempt by name.
    expect(offenders.filter((o) => !o.startsWith('AppLogo.tsx'))).toEqual([]);
  });

  it('uses one left inset across the four chrome bars', () => {
    for (const [file, cls] of [
      ['TitleBar.tsx', 'pl-4'],
      ['TabBar.tsx', 'px-4'],
      ['CommandBar.tsx', 'px-4'],
      ['StatusBar.tsx', 'px-4'],
    ] as const) {
      expect(readComponent(file), file).toContain(cls);
    }
    // Scoped to the bar roots (the h-[42px]/h-10/h-8 rows): px-3.5, px-2.5 and
    // bare px-3 are legitimate utilities elsewhere, so only the four chrome
    // edges are held to one value.
    for (const file of ['TitleBar.tsx', 'TabBar.tsx', 'CommandBar.tsx', 'StatusBar.tsx']) {
      const roots = readComponent(file)
        .split('\n')
        .filter((line) => /h-\[42px\]|h-10[ "`]|h-8[ "`]/.test(line));
      for (const line of roots) {
        expect(line, file).not.toMatch(/px-3\.5|px-2\.5|px-3(?![\w.])/);
      }
    }
  });

  it('gives every toolbar control the same height', () => {
    const src = readComponent('CommandBar.tsx');
    // Bare p-1/p-1.5 icon buttons were 22px and 26px tall in the same 40px row.
    expect(src).not.toMatch(/className=\{`p-1[ .]/);
    expect(src).not.toMatch(/className=\{`p-1\.5[ .]/);
    // Segment buttons sit in a p-0.5 wrapper, so h-6 totals the same h-7.
    expect(src).toContain('px-2.5 h-6 rounded-md');
  });

  it('keeps toolbar icons at one size', () => {
    const src = readComponent('CommandBar.tsx');
    expect(src).not.toContain('w-3.5 h-3.5');
  });

  it('labels every icon-only toolbar button', () => {
    // A button whose title is immediately followed by a bare ">" has no
    // visible text child, so without aria-label it has no accessible name.
    const lines = readComponent('CommandBar.tsx').split('\n');
    const offenders: string[] = [];
    lines.forEach((line, i) => {
      const m = line.match(/^\s+title="([^"]+)"$/);
      if (!m) return;
      const next = (lines[i + 1] ?? '').trim();
      const after = (lines[i + 2] ?? '').trim();
      if (next === '>' && !after.startsWith('<span') && !after.startsWith('{')) {
        if (!/aria-label=/.test(line) && !/aria-label=/.test(lines[i + 1] ?? '')) {
          offenders.push(`${i + 1}: ${m[1]}`);
        }
      }
    });
    expect(offenders).toEqual([]);
  });

  it('bounds zoom to a legible, useful range', async () => {
    const app = fs.readFileSync(path.join(process.cwd(), 'src', 'App.tsx'), 'utf8');
    expect(app).toContain('Math.min(fontSize + 1, 26)');
    expect(app).toContain('Math.max(fontSize - 1, 13)');
  });
});

describe('split-view resize contract', () => {
  it('renders an accessible, bounded resize handle instead of a fixed split', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const app = fs.readFileSync(path.join(process.cwd(), 'src', 'App.tsx'), 'utf8');

    expect(app).toContain('role="separator"');
    expect(app).toContain('aria-orientation="vertical"');
    expect(app).toContain('aria-valuenow');
    expect(app).toContain('aria-valuemin={25}');
    expect(app).toContain('aria-valuemax={75}');
    expect(app).toMatch(/Math\.min\(0\.75,\s*Math\.max\(0\.25/);
    expect(app).toContain('setPointerCapture');
    expect(app).toContain("e.key === 'ArrowLeft'");
    expect(app).toContain("e.key === 'ArrowRight'");
    expect(app).toContain('splitRatio');
    // The old hard split must be gone.
    expect(app).not.toMatch(/w-1\/2 h-full/);
    expect(app).not.toContain('divide-x');
  });
});

describe('modal accessibility contract', () => {
  const MODALS: ReadonlyArray<readonly [string, string]> = [
    ['ExportModal.tsx', 'Export document'],
    ['SampleFilesModal.tsx', 'Sample Markdown library'],
    ['ShortcutsModal.tsx', 'Keyboard shortcuts reference'],
    ['ImageLightboxModal.tsx', 'Image viewer'],
    ['CommandPalette.tsx', 'Command palette'],
  ];

  it.each(MODALS)('%s exposes a labelled dialog', async (file, label) => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(path.join(process.cwd(), 'src', 'components', file), 'utf8');

    expect(src, file).toContain('role="dialog"');
    expect(src, file).toContain('aria-modal="true"');
    expect(src, file).toContain(label);
    expect(src, file).toContain('tabIndex={-1}');
    expect(src, file).toContain('useModalFocus');
  });

  it('traps focus, closes on Escape and returns focus', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(
      path.join(process.cwd(), 'src', 'hooks', 'useModalFocus.ts'),
      'utf8'
    );
    expect(src).toContain("e.key === 'Escape'");
    expect(src).toContain("e.key !== 'Tab'");
    expect(src).toContain('stopPropagation');
    expect(src).toContain('triggerRef');
    // The effect must not depend on the caller's inline onClose, or focus would
    // reset on every parent render.
    expect(src).toMatch(/},\s*\[isOpen\]\);/);
  });

  it('gives the palette listbox semantics', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(
      path.join(process.cwd(), 'src', 'components', 'CommandPalette.tsx'),
      'utf8'
    );
    expect(src).toContain('role="listbox"');
    expect(src).toContain('role="option"');
    expect(src).toContain('aria-selected');
  });
});

describe('tab strip contract', () => {
  it('exposes tabs with roving focus and keyboard operation', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(
      path.join(process.cwd(), 'src', 'components', 'TabBar.tsx'),
      'utf8'
    );
    expect(src).toContain('role="tablist"');
    expect(src).toContain('role="tab"');
    expect(src).toContain('aria-selected');
    expect(src).toContain("'ArrowLeft'");
    expect(src).toContain("'ArrowRight'");
    expect(src).toContain("e.key === 'Delete'");
    expect(src).toContain('tabIndex={isActive ? 0 : -1}');
  });
});

describe('icon-button label contract', () => {
  it('labels every icon-only control that was missing one', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const dir = path.join(process.cwd(), 'src', 'components');
    const read = (f: string) => fs.readFileSync(path.join(dir, f), 'utf8');

    for (const label of [
      'Decrease font zoom',
      'Increase font zoom',
      'Copy image link',
      'Close viewer',
      'Previous match',
      'Next match',
      'Toggle replace',
      'Close find',
      'Copy Markdown to clipboard',
      'Copy HTML to clipboard',
      'Copy file path',
      'Remove from history',
      'Unpin from Quick Access',
      'Close dialog',
      'New document',
      'Formatting tools',
    ]) {
      const found = fs
        .readdirSync(dir)
        .some((f) => {
          if (!f.endsWith('.tsx')) return false;
          const src = read(f);
          // Literal labels, or the toolbar's data-driven tool.label which carries
          // the tooltip text for all twelve format buttons.
          return (
            src.includes(`aria-label="${label}"`) ||
            (label === 'Formatting tools' && src.includes('aria-label={tool.label}'))
          );
        });
      expect(found, label).toBe(true);
    }
  });
});

describe('table overflow contract', () => {
  it('lets wide tables scroll inside the pane', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const css = fs.readFileSync(path.join(process.cwd(), 'src', 'index.css'), 'utf8');
    // The standalone table rule (not the rhythm group or the themed rules).
    const table = css.match(/^\.markdown-body table \{\s*display: block;[^}]*\}/m)?.[0] ?? '';
    expect(table, 'standalone table rule with display:block').not.toBe('');
    expect(table).toContain('overflow-x: auto');
    expect(table).toContain('max-width: 100%');
  });
});

describe('field-report round contract', () => {
  it('routes generated blockquote color through theme CSS only', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(
      path.join(process.cwd(), 'src', 'services', 'markdown.ts'),
      'utf8'
    );
    const quote = src.match(/return `<blockquote class="([^"]*)"/)?.[1] ?? '';
    expect(quote, 'blockquote classes present').not.toBe('');
    expect(quote).not.toMatch(/text-(slate|sky)-\d+/);
    expect(quote).not.toMatch(/bg-(slate|sky)-\d+/);
  });

  it('measures the caption reserve instead of guessing it', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(path.join(process.cwd(), 'src', 'App.tsx'), 'utf8');
    expect(src).toContain('getTitlebarAreaRect');
    expect(src).toContain('--velox-caption-reserve');
  });

  it('reorders tabs by drag, keyboard and scroll chevrons', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const root = process.cwd();
    const bar = fs.readFileSync(path.join(root, 'src', 'components', 'TabBar.tsx'), 'utf8');
    const app = fs.readFileSync(path.join(root, 'src', 'App.tsx'), 'utf8');
    expect(bar).toContain('onMoveTab');
    expect(bar).toContain('draggable');
    expect(bar).toContain('data-tabid');
    expect(bar).toContain('scrollStrip');
    expect(bar).toContain('ChevronLeft');
    expect(bar).toContain('ChevronRight');
    expect(app).toContain('handleMoveTab');
    expect(app).toContain('onMoveTab={handleMoveTab}');
  });

  it('presents the hero mark on a dark tile in light mode', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(
      path.join(process.cwd(), 'src', 'components', 'HomePage.tsx'),
      'utf8'
    );
    expect(src).toContain("'bg-slate-900 border-slate-800'");
  });
});

describe('radius scale contract', () => {
  it('snaps near-duplicate radii to the canonical steps', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const css = fs.readFileSync(path.join(process.cwd(), 'src', 'index.css'), 'utf8');
    expect(css).toContain('--velox-radius-sm: 0.375rem;');
    expect(css).toContain('--velox-radius-md: 0.5rem;');
    expect(css).toContain('--velox-radius-lg: 0.75rem;');
    // The old 5.6px and 9.6px values must not survive outside token definitions
    // and comments. Proven sub-perceptual by scripts/capture.cjs (113 pixels of
    // 1.2M, antialiased corners only).
    const rules = css
      .split('\n')
      .filter((line) => !line.trim().startsWith('/*') && !line.trim().startsWith('*') && !line.includes('--velox-'));
    for (const line of rules) {
      // Only radius declarations are in scope; 0.6rem margins and the like are
      // spacing, not the radius scale.
      if (!line.includes('border-radius')) continue;
      expect(line, `stray radius: ${line.trim()}`).not.toMatch(/0\.35rem|(?<!\d)0\.6rem/);
    }
  });
});

describe('toolbar overflow contract', () => {
  it('collapses the format group into a menu below 1280px', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(
      path.join(process.cwd(), 'src', 'components', 'CommandBar.tsx'),
      'utf8'
    );
    expect(src).toContain("useMediaQuery('(min-width: 1280px)')");
    expect(src).toContain('aria-haspopup="menu"');
    expect(src).toContain('role="menu"');
    expect(src).toContain('role="menuitem"');
    // One list rendered in two places, never duplicated markup.
    expect(src).toContain('formatTools.map');
    expect(src).not.toContain('hidden xl:flex');
  });

  it('drives labels from one breakpoint, not six prefixes', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(
      path.join(process.cwd(), 'src', 'components', 'CommandBar.tsx'),
      'utf8'
    );
    expect(src).toContain("useMediaQuery('(min-width: 1024px)')");
    expect(src).not.toMatch(/hidden (sm|md|lg):inline/);
  });
});

describe('gutter virtualization contract', () => {
  it('windows long gutters with spacers that preserve geometry', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(
      path.join(process.cwd(), 'src', 'components', 'RawEditor.tsx'),
      'utf8'
    );
    expect(src).toContain('GUTTER_WINDOW_THRESHOLD');
    expect(src).toContain('GUTTER_OVERSCAN');
    expect(src).toContain('data-line={i + 1}');
    expect(src).toContain('aria-hidden="true"');
    // The jump lookup must survive windowing: no bare children[index].
    expect(src).not.toContain('.children[index]');
  });
});

describe('iconography and chrome contract', () => {
  it('uses download semantics for a drop target, not upload', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(path.join(process.cwd(), 'src', 'App.tsx'), 'utf8');
    expect(src).toContain('ArrowDownToLine');
    expect(src).not.toContain('UploadCloud');
  });

  it('distinguishes Export from Save As and panes from actions', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(
      path.join(process.cwd(), 'src', 'components', 'CommandBar.tsx'),
      'utf8'
    );
    expect(src).toContain('Share2');
    expect(src).toContain('SquareCode');
    // Code stays for the Raw view-mode segment; it must not double as the
    // inline-code insert glyph anymore. In the data-driven toolbar the icon
    // precedes the run callback inside each entry.
    const inlineCodeBlock =
      src.match(/key: 'code'[\s\S]*?SquareCode/)?.[0] ?? '';
    expect(inlineCodeBlock).not.toBe('');
  });

  it('uses no emoji in the chrome or generated markup', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const root = process.cwd();
    for (const file of [
      'src/services/markdown.ts',
      'src/components/MarkdownPreview.tsx',
    ]) {
      const src = fs.readFileSync(path.join(root, file), 'utf8');
      expect(src, file).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
    }
  });

  it('keeps the light tab strip legible', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(
      path.join(process.cwd(), 'src', 'components', 'TabBar.tsx'),
      'utf8'
    );
    expect(src).toContain('bg-slate-100 border-slate-300');
    expect(src).not.toContain('bg-slate-200/90');
  });

  it('shares one sans stack between chrome and document', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const css = fs.readFileSync(path.join(process.cwd(), 'src', 'index.css'), 'utf8');
    expect(css).toMatch(/--font-sans:\s*"Segoe UI Variable Text",\s*"Segoe UI"/);
    expect(css).toContain('font-family: var(--font-sans);');
  });

  it('does not pulse transient toast indicators', async () => {
    // The busy pill keeps its pulse: it is a transient activity indicator, not
    // a persistent badge. Toasts are transient too, but theirs added a fourth
    // simultaneous pulse for no information.
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(path.join(process.cwd(), 'src', 'App.tsx'), 'utf8');
    const at = src.indexOf('{toasts.map((toast) => (');
    expect(at, 'toast block found').toBeGreaterThan(-1);
    const toastBlock = src.slice(at, at + 1500);
    expect(toastBlock).not.toContain('animate-ping');
  });

  it('lets the browser skip off-screen gutter rows', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const css = fs.readFileSync(path.join(process.cwd(), 'src', 'index.css'), 'utf8');
    expect(css).toContain('.velox-gutter-row');
    expect(css).toContain('content-visibility: auto');
    const editor = fs.readFileSync(
      path.join(process.cwd(), 'src', 'components', 'RawEditor.tsx'),
      'utf8'
    );
    expect(editor).toContain('velox-gutter-row');
    expect(editor).toContain('min-w-12');
    expect(editor).not.toMatch(/className=\{`w-12 py-4/);
  });
});

describe('feedback contract', () => {
  it('queues toasts with kinds instead of racing a single slot', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(path.join(process.cwd(), 'src', 'App.tsx'), 'utf8');

    // The old single-string state and its compare-by-value timer must be gone.
    expect(src).not.toContain('toastMessage');
    expect(src).not.toContain('prev === msg');
    // Kinds drive tint and dwell time.
    expect(src).toMatch(/kind:\s*'info'\s*\|\s*'success'\s*\|\s*'error'/);
    expect(src).toContain('role="status"');
    expect(src).toContain('aria-live="polite"');
    // Timers are tracked and cancelled on unmount instead of leaking.
    expect(src).toContain('toastTimers');
    expect(src).toContain('clearTimeout');
  });

  it('marks failures as errors and saves as successes', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(path.join(process.cwd(), 'src', 'App.tsx'), 'utf8');
    expect(src).toContain("showToast(`Saved to disk:");
    expect(src).toContain(", 'success')");
    expect(src).toContain(", 'error')");
  });

  it('shows a busy indicator around every slow file operation', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(path.join(process.cwd(), 'src', 'App.tsx'), 'utf8');
    for (const label of ["Opening…", 'Saving…']) {
      expect(src, label).toContain(`setBusy('${label}')`);
    }
    // Every setBusy must be paired with a clearing finally - an early return or
    // a throw must not wedge the indicator on.
    const sets = (src.match(/setBusy\('(?:Opening|Saving)…'\);/g) ?? []).length;
    const clears = (src.match(/setBusy\(null\);/g) ?? []).length;
    expect(sets).toBeGreaterThan(0);
    expect(clears).toBeGreaterThanOrEqual(sets);
  });

  it('celebrates first disk saves, not every save', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(path.join(process.cwd(), 'src', 'App.tsx'), 'utf8');
    expect(src).toContain('celebratedTabs');
    const confettiCalls = (src.match(/^\s*confetti\(/gm) ?? []).length;
    expect(confettiCalls).toBe(2);
  });
});

describe('editor and shell contract', () => {
  it('defines one monospace stack and uses it everywhere', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const css = fs.readFileSync(path.join(process.cwd(), 'src', 'index.css'), 'utf8');
    expect(css).toMatch(/--font-mono:\s*"Cascadia Code",\s*"Cascadia Mono",\s*Consolas/);
    expect(css).not.toMatch(/font-family:\s*"Cascadia Code",\s*Consolas/);

    const editor = fs.readFileSync(
      path.join(process.cwd(), 'src', 'components', 'RawEditor.tsx'),
      'utf8'
    );
    expect(editor).toContain("fontFamily: 'var(--font-mono)'");
    expect(editor).not.toContain('"Cascadia Code", Consolas');
  });

  it('gives every button a pressed state', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const css = fs.readFileSync(path.join(process.cwd(), 'src', 'index.css'), 'utf8');
    expect(css).toMatch(/button:active:not\(\:disabled\)\s*\{\s*filter:\s*brightness\(0\.93\);\s*\}/);
  });

  it('does not double-frame code blocks in light mode', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const css = fs.readFileSync(path.join(process.cwd(), 'src', 'index.css'), 'utf8');
    const lightPre = css.match(/html\.light \.markdown-body pre \{[^}]*\}/)?.[0] ?? '';
    expect(lightPre).toContain('border-color: transparent');
  });

  it('indents and dedents editor selections as blocks', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(
      path.join(process.cwd(), 'src', 'components', 'RawEditor.tsx'),
      'utf8'
    );
    expect(src).toContain('e.shiftKey');
    expect(src).toMatch(/\.map\(\(line\) => \(line\.startsWith\(TAB\)/);
  });

  it('derives line endings from content instead of hardcoding them', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(
      path.join(process.cwd(), 'src', 'components', 'StatusBar.tsx'),
      'utf8'
    );
    expect(src).toContain("includes('\\r\\n')");
    expect(src).not.toMatch(/>\s*CRLF\s*</);
  });

  it('enforces a usable minimum window size', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(path.join(process.cwd(), 'electron', 'main.cjs'), 'utf8');
    expect(src).toContain('minWidth: 900');
    expect(src).toContain('minHeight: 640');
  });
});

describe('outline contract', () => {
  it('toggles the panel from the toolbar only where a preview exists', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const bar = fs.readFileSync(
      path.join(process.cwd(), 'src', 'components', 'CommandBar.tsx'),
      'utf8'
    );
    expect(bar).toContain('showOutline');
    expect(bar).toContain('onToggleOutline');
    expect(bar).toContain('aria-pressed={showOutline}');
    expect(bar).toContain("viewMode !== 'raw'");
    expect(bar).toContain('ListTree');
  });

  it('keeps the panel accessible: landmark, current-row state, close control', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const panel = fs.readFileSync(
      path.join(process.cwd(), 'src', 'components', 'OutlinePanel.tsx'),
      'utf8'
    );
    expect(panel).toContain('aria-label="Document outline"');
    expect(panel).toContain('aria-current');
    expect(panel).toContain('aria-label="Close outline"');
    expect(panel).toContain('No headings in this document.');
  });

  it('scopes heading lookups to the preview container and honours reduced motion', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const preview = fs.readFileSync(
      path.join(process.cwd(), 'src', 'components', 'MarkdownPreview.tsx'),
      'utf8'
    );
    expect(preview).toContain('parseMarkdownWithOutline');
    expect(preview).toContain('CSS.escape');
    expect(preview).toContain('prefers-reduced-motion');
    expect(preview).toContain('IntersectionObserver');
    expect(preview).toContain('container.querySelector');
  });

  it('persists the outline preference and defaults it off', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const root = process.cwd();
    const types = fs.readFileSync(path.join(root, 'src', 'types', 'index.ts'), 'utf8');
    const storage = fs.readFileSync(path.join(root, 'src', 'services', 'storage.ts'), 'utf8');
    const app = fs.readFileSync(path.join(root, 'src', 'App.tsx'), 'utf8');
    expect(types).toContain('showOutline: boolean');
    expect(storage).toContain('showOutline: false');
    expect(app).toContain('settings.showOutline === true');
    expect(app).toContain('persistViewPrefs({ showOutline: next })');
  });
});