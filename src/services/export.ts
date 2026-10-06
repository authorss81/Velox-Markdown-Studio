/**
 * Export and Download Utilities for Velox Markdown Studio
 * Supports Blob download with Data URI fallback for strict iframe sandboxes
 */

export function downloadTextFile(filename: string, content: string, mimeType: string = 'text/plain') {
  try {
    const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      if (document.body.contains(a)) {
        document.body.removeChild(a);
      }
      URL.revokeObjectURL(url);
    }, 500);
    return true;
  } catch (err) {
    console.warn('Blob download failed, trying data URI fallback:', err);
    try {
      const dataUri = `data:${mimeType};charset=utf-8,${encodeURIComponent(content)}`;
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = dataUri;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        if (document.body.contains(a)) {
          document.body.removeChild(a);
        }
      }, 500);
      return true;
    } catch (e) {
      console.error('All download methods failed:', e);
      return false;
    }
  }
}

/** Escape text for interpolation into HTML text content or an attribute value. */
function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function generateStandaloneHtml(filename: string, htmlBody: string): string {
  // The filename reaches this template from the document being previewed, so a
  // name containing "</title><script>…" would otherwise break out of the title.
  const cleanTitle = escapeHtml(filename.replace(/\.md$/i, ''));
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' data: blob: https:; style-src 'unsafe-inline'; font-src data:; script-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'">
  <title>${cleanTitle} - Velox Markdown</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      line-height: 1.62;
      color: #1e293b;
      max-width: 860px;
      margin: 40px auto;
      padding: 0 24px;
      background-color: #ffffff;
    }
    h1, h2, h3, h4, h5, h6 { font-weight: 700; color: #0f172a; }
    h1 { font-size: 2.2rem; border-bottom: 2px solid #e2e8f0; padding-bottom: 0.3em; margin: 2.25rem 0 0.75rem; }
    h1:first-child { margin-top: 0; }
    h2 { font-size: 1.6rem; border-bottom: 1px solid #f1f5f9; padding-bottom: 0.3em; margin: 2rem 0 0.625rem; }
    p, ul, ol, blockquote, table { margin-top: 0; margin-bottom: 1rem; }
    blockquote { border-left: 4px solid #0078d4; background: rgba(0, 120, 212, 0.08); padding: 12px 18px; margin: 16px 0; border-radius: 0 8px 8px 0; color: #334155; font-style: italic; }
    code { font-family: "Cascadia Code", Consolas, monospace; background: #f1f5f9; color: #0284c7; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; }
    pre { background: #0f172a; color: #f8fafc; padding: 18px; border-radius: 8px; overflow-x: auto; margin: 18px 0; }
    pre code { background: transparent; color: inherit; padding: 0; }
    table { width: 100%; border-collapse: collapse; margin: 18px 0; }
    th, td { border: 1px solid #cbd5e1; padding: 10px 14px; text-align: left; }
    th { background: #f8fafc; font-weight: 600; color: #0f172a; }
    img { max-width: 100%; height: auto; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); margin: 18px auto; display: block; }
    strong, b { font-weight: 700; color: #000; }
    em, i { font-style: italic; }
    a { color: #0078d4; text-decoration: underline; }
  </style>
</head>
<body>
  ${htmlBody}
</body>
</html>`;
}

export function exportDocumentAsHtml(filename: string, htmlBody: string) {
  const cleanTitle = filename.replace(/\.md$/i, '').replace(/[\\/:*?"<>|]/g, '_');
  const htmlDoc = generateStandaloneHtml(filename, htmlBody);
  return downloadTextFile(`${cleanTitle}.html`, htmlDoc, 'text/html');
}
