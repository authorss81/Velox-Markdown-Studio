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
    ]) {
      const found = fs
        .readdirSync(dir)
        .some((f) => f.endsWith('.tsx') && read(f).includes(`aria-label="${label}"`));
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
