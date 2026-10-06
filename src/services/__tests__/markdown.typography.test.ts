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
    expect(css).toContain('font-size: 2.15rem;');
    expect(css).toContain('font-size: 1.65rem;');
    expect(css).toContain('font-size: 1.35rem;');
    expect(css).toContain('font-size: 1.15rem;');
    expect(css).toMatch(/\.markdown-body > :first-child \{\s*margin-top: 0 !important;\s*\}/);
  });

  it('uses the shared flow token for blocks and preserves body size', () => {
    expect(css).toContain('font-size: 1.05rem;');
    expect(css).toMatch(/line-height: var\(--velox-leading-body\);/);
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
