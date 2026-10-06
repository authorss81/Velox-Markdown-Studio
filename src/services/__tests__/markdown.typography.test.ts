import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { generateStandaloneHtml } from '../export';

const cssPath = path.join(process.cwd(), 'src', 'index.css');
const css = fs.readFileSync(cssPath, 'utf8');

describe('preview rhythm contract', () => {
  it('centralizes rhythm in Phase 5 tokens', () => {
    const tokens: ReadonlyArray<readonly [string, string]> = [
      ['--velox-leading-body', '1.62'],
      ['--velox-space-flow', '1rem'],
      ['--velox-space-h1-top', '2.25rem'],
      ['--velox-space-h1-bottom', '0.75rem'],
      ['--velox-space-h2-top', '2rem'],
      ['--velox-space-h2-bottom', '0.625rem'],
      ['--velox-space-h3-top', '1.75rem'],
      ['--velox-space-h3-bottom', '0.5rem'],
      ['--velox-space-h4-top', '1.5rem'],
      ['--velox-space-h4-bottom', '0.375rem'],
    ];

    for (const [token, value] of tokens) {
      expect(css, `missing ${token}`).toContain(`${token}: ${value};`);
    }
  });

  it('uses fixed rhythm instead of heading-size-dependent em margins', () => {
    expect(css).toMatch(/\.markdown-body h1 \{[\s\S]*?margin-top: var\(--velox-space-h1-top\);/);
    expect(css).toMatch(/\.markdown-body h2 \{[\s\S]*?margin-top: var\(--velox-space-h2-top\);/);
    expect(css).toMatch(/\.markdown-body h3 \{[\s\S]*?margin-top: var\(--velox-space-h3-top\);/);
    expect(css).toMatch(/\.markdown-body h4 \{[\s\S]*?margin-top: var\(--velox-space-h4-top\);/);
    expect(css).not.toMatch(/\.markdown-body h1 \{[\s\S]*?margin-top: 1\.8em;/);
    expect(css).not.toMatch(/\.markdown-body h2 \{[\s\S]*?margin-top: 1\.6em;/);
  });

  it('keeps heading sizes but removes top dead space from the first block', () => {
    // Sizes are em so the zoom control scales the whole document; each value
    // reproduces the previous rem size to the sub-pixel at the default base.
    expect(css).toContain('font-size: 2.05em;');
    expect(css).toContain('font-size: 1.57em;');
    expect(css).toContain('font-size: 1.29em;');
    expect(css).toContain('font-size: 1.1em;');
    expect(css).toContain('font-size: 1em;'); // blockquote
    expect(css).toContain('font-size: 0.93em;'); // tables
    expect(css).toContain('font-size: 0.91em;'); // fenced code
    expect(css).not.toMatch(/\.markdown-body (h1|h2|h3|h4|blockquote|table|pre code) \{[^}]*font-size:\s*[\d.]+rem/);
    expect(css).toMatch(/\.markdown-body > :first-child \{\s*margin-top: 0 !important;\s*\}/);
  });

  it('drives the body size from the zoom variable, not a fixed rem', () => {
    expect(css).toMatch(/\.markdown-body \{[^}]*font-size:\s*calc\(var\(--preview-fs,\s*16px\)\s*\*\s*1\.05\)/);
  });

  it('wires the zoom prop to the CSS variable in the preview container', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(
      path.join(process.cwd(), 'src', 'components', 'MarkdownPreview.tsx'),
      'utf8'
    );
    expect(src).toMatch(/'--preview-fs':\s*`?\$\{fontSize\}px/);
    // The old inline font-size only affected inheriting descendants, which is
    // why zoom never resized headings, code or tables.
    expect(src).not.toMatch(/style=\{\{\s*fontSize:/);
  });

  it('uses the shared flow token for blocks and preserves body size', () => {
    expect(css).toMatch(/font-size:\s*calc\(var\(--preview-fs,\s*16px\)\s*\*\s*1\.05\)/);
    expect(css).toMatch(/margin-bottom: var\(--velox-space-flow\);/);
  });

  it('matches standalone export rhythm to the in-app preview', () => {
    const html = generateStandaloneHtml('Example.md', '<h1>Example</h1><p>Text.</p>');
    expect(html).toContain('line-height: 1.62;');
    expect(html).toContain('margin: 2.25rem 0 0.75rem;');
    expect(html).toContain('margin: 2rem 0 0.625rem;');
    expect(html).toContain('margin-top: 0; margin-bottom: 1rem;');
    expect(html).toContain('h1:first-child { margin-top: 0; }');
  });
});

describe('preview color tokens', () => {
  const darkTokens: Record<string, string> = {
    '--velox-md-text': '#e2e8f0',
    '--velox-md-strong': '#ffffff',
    '--velox-md-emphasis': '#f1f5f9',
    '--velox-md-heading': '#f8fafc',
    '--velox-md-h1-border': 'rgba(255, 255, 255, 0.12)',
    '--velox-md-h2-border': 'rgba(255, 255, 255, 0.1)',
    '--velox-md-link': '#38bdf8',
    '--velox-md-link-hover': '#7dd3fc',
    '--velox-md-inline-code-bg': 'rgba(51, 65, 85, 0.7)',
    '--velox-md-inline-code-text': '#38bdf8',
    '--velox-md-inline-code-border': 'rgba(255, 255, 255, 0.1)',
    '--velox-md-pre-bg': '#090d16',
    '--velox-md-pre-border': 'rgba(255, 255, 255, 0.12)',
    '--velox-md-pre-shadow': '0 4px 20px rgba(0, 0, 0, 0.5)',
    '--velox-md-quote-border': '#0078d4',
    '--velox-md-quote-bg': 'rgba(0, 120, 212, 0.1)',
    '--velox-md-quote-text': '#cbd5e1',
    '--velox-md-table-border': 'rgba(255, 255, 255, 0.12)',
    '--velox-md-th-bg': 'rgba(30, 41, 59, 0.9)',
    '--velox-md-th-text': '#f8fafc',
    '--velox-md-th-border': 'rgba(255, 255, 255, 0.15)',
    '--velox-md-td-border': 'rgba(255, 255, 255, 0.08)',
    '--velox-md-td-text': '#cbd5e1',
    '--velox-md-row-alt-bg': 'rgba(15, 23, 42, 0.5)',
    '--velox-md-row-hover-bg': 'rgba(30, 41, 59, 0.6)',
    '--velox-md-hr-border': 'rgba(255, 255, 255, 0.15)',
  };

  const lightTokens: Record<string, string> = {
    '--velox-md-text': '#1e293b',
    '--velox-md-strong': '#020617',
    '--velox-md-emphasis': '#0f172a',
    '--velox-md-heading': '#0f172a',
    '--velox-md-h1-border': '#cbd5e1',
    '--velox-md-h2-border': '#e2e8f0',
    '--velox-md-link': '#0369a1',
    '--velox-md-link-hover': '#0369a1',
    '--velox-md-inline-code-bg': '#f1f5f9',
    '--velox-md-inline-code-text': '#0369a1',
    '--velox-md-inline-code-border': '#cbd5e1',
    '--velox-md-pre-bg': '#1e293b',
    '--velox-md-pre-shadow': '0 4px 16px rgba(0, 0, 0, 0.12)',
    '--velox-md-quote-border': '#0284c7',
    '--velox-md-quote-bg': '#f0f9ff',
    '--velox-md-quote-text': '#334155',
    '--velox-md-table-border': '#cbd5e1',
    '--velox-md-th-bg': '#f8fafc',
    '--velox-md-th-text': '#0f172a',
    '--velox-md-th-border': '#cbd5e1',
    '--velox-md-td-border': '#e2e8f0',
    '--velox-md-td-text': '#334155',
    '--velox-md-row-alt-bg': '#f8fafc',
    '--velox-md-row-hover-bg': '#f1f5f9',
    '--velox-md-table-shadow': '0 2px 8px rgba(0, 0, 0, 0.04)',
    '--velox-md-hr-border': '#cbd5e1',
  };

  function themedColorDeclarations(theme: 'dark' | 'light'): string[] {
    const startMarker =
      theme === 'dark' ? '/* DARK THEME MARKDOWN */' : '/* LIGHT THEME MARKDOWN */';
    const endMarker =
      theme === 'dark' ? '/* LIGHT THEME MARKDOWN */' : '/* Headings sizing';
    const section = css.slice(css.indexOf(startMarker), css.indexOf(endMarker));
    const matches = section.match(
      /(?:^|\n)\s*(?:color|background(?:-color)?|border(?:-[a-z-]+)?|box-shadow|accent-color)\s*:[^;]+;/g
    );
    return matches ?? [];
  }

  it.each([
    ['dark', darkTokens],
    ['light', lightTokens],
  ] as const)('locks %s preview colors while routing them through tokens', (theme, tokens) => {
    for (const [token, value] of Object.entries(tokens)) {
      expect(css, `missing ${theme} ${token}`).toContain(`${token}: ${value};`);
    }

    for (const declaration of themedColorDeclarations(theme)) {
      // Token definitions are checked above; every rendered color declaration
      // must consume one. `transparent` is the absence of a color, not one.
      if (declaration.includes('--velox-md-')) continue;
      if (/:\s*transparent\s*;/.test(declaration)) continue;
      expect(declaration).toMatch(/var\(--velox-md-[a-z-]+\)/);
    }
  });

  it('routes shared image and checkbox chrome through existing tokens', () => {
    expect(css).toContain('accent-color: var(--accent-blue);');
    expect(css).toContain('border-radius: var(--velox-md-image-radius);');
    expect(css).toContain('margin: var(--velox-md-image-margin);');
    expect(css).toContain('border: var(--velox-md-image-border);');
    expect(css).toContain('box-shadow: var(--velox-md-image-shadow);');
    expect(css).toContain('box-shadow: var(--velox-md-image-hover-shadow);');
  });
});

describe('app chrome CSS contract', () => {
  it('makes dark: follow the app theme class instead of the OS', () => {
    // Without this variant, Tailwind compiles dark: to prefers-color-scheme, so
    // on a light-OS machine with the app theme dark, every dark: element
    // rendered its light-mode colour.
    expect(css).toMatch(/@custom-variant\s+dark\s*\(\s*&:where\(\.dark,\s*\.dark\s*\*\)\s*\)/);
  });

  it('provides one focus-visible ring for the whole app', () => {
    expect(css).toMatch(/:where\(button,\s*a,\s*input,\s*textarea,\s*select,\s*\[tabindex\]\)\s*:focus-visible/);
    expect(css).toMatch(/outline:\s*2px solid var\(--accent-blue\);/);
    expect(css).toMatch(/outline-offset:\s*2px;/);
  });

  it('has no outline-none suppressions left in components', async () => {
    // Every one of these defeated the global focus rule. Assert at the source
    // level so a newly added input cannot silently reintroduce one.
    const fs = await import('node:fs');
    const path = await import('node:path');
    const dir = path.join(process.cwd(), 'src', 'components');
    const offenders: string[] = [];
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith('.tsx')) continue;
      const src = fs.readFileSync(path.join(dir, file), 'utf8');
      if (/outline-none/.test(src)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it('implements the animation classes the components already use', () => {
    for (const cls of ['.animate-in', '.fade-in', '.slide-in-from-bottom-2', '.zoom-in-95', '.no-scrollbar']) {
      expect(css, `missing ${cls}`).toContain(cls);
    }
    expect(css).toMatch(/@keyframes velox-fade-in/);
    expect(css).toMatch(/@keyframes velox-slide-in-from-bottom/);
    expect(css).toMatch(/@keyframes velox-zoom-in/);
    expect(css).toMatch(/\.no-scrollbar::-webkit-scrollbar/);
  });

  it('honours prefers-reduced-motion', () => {
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
    expect(css).toMatch(/animation-duration:\s*0\.01ms/);
    expect(css).toMatch(/transition-duration:\s*0\.01ms/);
  });

  it('defines themed scrollbar values instead of duplicating rules', () => {
    expect(css).toContain('--velox-md-scrollbar-thumb: #64748b;');
    expect(css).toContain('--velox-md-scrollbar-thumb-hover: #7c8aa3;');
    expect(css).toContain('--velox-md-scrollbar-thumb: #94a3b8;');
    expect(css).toContain('--velox-md-scrollbar-thumb-hover: #64748b;');
    expect(css).toContain('::-webkit-scrollbar-corner');
  });
});

describe('contrast contract', () => {
  it('defines the muted-text token per theme', () => {
    // Light keeps slate-500 (#64748b, 4.8:1 on white) so existing light
    // rendering is pixel-identical; dark resolves to slate-400.
    expect(css).toContain('--velox-muted: #64748b;');
    expect(css).toMatch(/\.dark\s*\{\s*--velox-muted:\s*#94a3b8;\s*\}/);
  });

  it('leaves no unconditional text-slate-500 in components', async () => {
    // Every remaining occurrence must belong to a theme ternary (the light
    // branch of a correct pair). A bare text-slate-500 on a dark surface is
    // 3.9:1 and fails AA. Ternaries can span lines, so allow a 3-line lookbehind
    // for the condition.
    const fs = await import('node:fs');
    const path = await import('node:path');
    const dir = path.join(process.cwd(), 'src', 'components');
    const offenders: string[] = [];
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith('.tsx')) continue;
      const lines = fs.readFileSync(path.join(dir, file), 'utf8').split('\n');
      lines.forEach((line, i) => {
        if (!/text-slate-500/.test(line)) return;
        const context = lines.slice(Math.max(0, i - 3), i + 1).join('\n');
        if (!/isLight|theme\s*===/.test(context)) {
          offenders.push(`${file}:${i + 1}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });

  it('pairs white text with sky-700, never sky-600', async () => {
    // white on sky-600 is 4.10:1; on sky-700 it is 5.9:1. Hover states
    // (hover:bg-sky-600) and tints (bg-sky-600/20) are exempt.
    const fs = await import('node:fs');
    const path = await import('node:path');
    const dir = path.join(process.cwd(), 'src', 'components');
    const offenders: string[] = [];
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith('.tsx')) continue;
      const src = fs.readFileSync(path.join(dir, file), 'utf8');
      src.split('\n').forEach((line, i) => {
        const stripped = line.replace(/hover:bg-sky-600/g, '').replace(/bg-sky-600\/20/g, '');
        if (/(?<![\w-:])bg-sky-600(?![\w-])/.test(stripped) && /text-white/.test(stripped)) {
          offenders.push(`${file}:${i + 1}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });

  it('gives the gutter legible numbers and no third black', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(
      path.join(process.cwd(), 'src', 'components', 'RawEditor.tsx'),
      'utf8'
    );
    // Was 2.56:1 dark / 2.34:1 light; the one element stared at while navigating.
    expect(src).not.toContain('bg-[#090d16]');
    expect(src).toContain('tabular-nums');
    // The old placeholder pair (400 on white, 600 on near-black) both failed.
    // The new pairing is light 500 / dark 400; assert the exact lines so a
    // future edit cannot silently swap them back.
    expect(src).toContain('selection:text-slate-950 placeholder-slate-500');
    expect(src).toContain('selection:text-white placeholder-slate-400');
    expect(src).not.toContain('placeholder-slate-600');
  });
});
