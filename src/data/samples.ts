import { MarkdownFileRecord } from '../types';

export const SAMPLE_FILES: Omit<MarkdownFileRecord, 'lastOpened' | 'lastModified'>[] = [
  {
    id: 'sample-welcome',
    name: 'Welcome to Velox Markdown Studio.md',
    path: 'C:\\Users\\Velox\\Documents\\Markdown\\Welcome to Velox Markdown Studio.md',
    content: `# Welcome to Velox Markdown Studio

> [!TIP]
> **Velox Markdown Studio** is a Windows-native styled desktop Markdown workbench built for blazing-fast editing, rich rendering with syntax highlighting, responsive imagery, and permanent memory.

---

## ⚡ Key Highlights

- **Permanent Memory**: Remembers every opened file, search history, pinned favorites, and disk handles across sessions.
- **Dual View Modes**:
  - **Preview View**: Clean typography, syntax-highlighted code blocks, task lists, responsive images, and tables.
  - **Raw View**: High-performance monospaced code editor with line numbers, indentation preservation, and quick search.
  - **Split View**: Side-by-side synchronized live editing and instant rendering.
- **Direct Windows Disk Sync**: Save directly back to your physical \`.md\` file via the **File System Access API** (\`Ctrl+S\`) or **Save As** (\`Ctrl+Shift+S\`).
- **Windows Desktop Installer**: Downloadable native setup package & one-click PWA desktop installation.

---

## 🖼️ Responsive Image Showcase

Images automatically scale fluidly to the viewport with rounded borders, depth shadows, and interactive click-to-zoom:

![Windows Fluent Architecture](https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&w=1200&q=80)
*Figure 1: High-performance computing nodes with modern telemetry backdrop.*

![Fluent Mountain Vista](https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1200&q=80)
*Figure 2: Scenic dynamic range demonstration for responsive media.*

---

## 💻 Code Syntax Highlighting

Velox includes built-in highlight engine with support for TypeScript, Python, Rust, Bash, and more:

\`\`\`typescript
// Windows File System Access Direct-Writer
export async function saveToWindowsDisk(handle: FileSystemFileHandle, text: string): Promise<boolean> {
  const writable = await handle.createWritable();
  await writable.write(text);
  await writable.close();
  console.log("Successfully committed changes to Windows disk!");
  return true;
}
\`\`\`

\`\`\`python
# Real-time Markdown Tokenizer & Word Frequency Analyzer
import re
from collections import Counter

def analyze_markdown(text: str) -> dict:
    words = re.findall(r'\\b\\w+\\b', text.lower())
    reading_time_mins = max(1, len(words) // 200)
    return {
        "total_words": len(words),
        "est_reading_time": f"{reading_time_mins} min",
        "top_keywords": Counter(words).most_common(5)
    }
\`\`\`

---

## 📋 Interactive Task Checklist

- [x] Integrate Windows 11 Fluent mica backdrop
- [x] Configure File System Access API with direct disk save
- [x] Build dual Preview and Raw editor modes
- [x] Permanent IndexedDB session memory & recent files catalog
- [x] Package one-click Windows Desktop Installer
- [ ] Add your first custom markdown note!

---

## 📊 Comparison Matrix

| Feature | Velox Markdown Studio | Generic Web Editor | Windows Notepad |
| :--- | :---: | :---: | :---: |
| **Permanent Memory** | ✅ Yes (IndexedDB) | ❌ Session only | ❌ None |
| **Dual Preview & Raw** | ✅ Full Highlighting | ⚠️ Limited | ❌ Raw only |
| **Direct File System Sync** | ✅ Native Windows API | ❌ Download only | ✅ Local save |
| **Windows Desktop Installer** | ✅ Included (.bat / PWA) | ❌ Web-only | ⚠️ Built-in |
| **Responsive Image Zoom** | ✅ Lightbox viewer | ❌ Static | ❌ No preview |

Enjoy writing and inspecting Markdown at native speed!
`,
    size: 3420,
    wordCount: 420,
    readingTimeMinutes: 2,
    isPinned: true,
    tags: ['Overview', 'Guide', 'Featured'],
  },
  {
    id: 'sample-specs',
    name: 'Technical Specification - Project Nebula.md',
    path: 'C:\\Users\\Velox\\Projects\\Nebula\\Technical Specification - Project Nebula.md',
    content: `# Technical Specification: Project Nebula Core Engine

**Status**: APPROVED  
**Version**: 2.4.0  
**Target Platform**: Windows 11 x64, Linux ARM64

---

## 1. Executive Summary

Project Nebula provides a fault-tolerant distributed ledger engine operating under sub-10 millisecond consensus latencies.

> [!IMPORTANT]
> All node communications are encrypted end-to-end via TLS 1.3 with mandatory mutual authentication (mTLS).

\`\`\`rust
// Consensus Heartbeat Routine
use std::time::Duration;
use tokio::time::sleep;

pub async fn run_consensus_loop(node_id: u64) -> Result<(), &'static str> {
    loop {
        println!("Node [{}] broadcasting consensus pulse...", node_id);
        sleep(Duration::from_millis(50)).await;
    }
}
\`\`\`

## 2. API Endpoints

- \`GET /api/v2/cluster/health\` - Cluster diagnostics
- \`POST /api/v2/transactions/commit\` - Batch transaction ingestion
- \`WS /events/stream\` - Real-time telemetry WebSocket

\`\`\`json
{
  "cluster_id": "nebula-us-east-1",
  "active_nodes": 128,
  "quorum_status": "OPTIMAL",
  "transactions_per_sec": 48500
}
\`\`\`
`,
    size: 1450,
    wordCount: 160,
    readingTimeMinutes: 1,
    isPinned: false,
    tags: ['Specification', 'Architecture'],
  },
  {
    id: 'sample-cheatsheet',
    name: 'Markdown Syntax Quick Reference.md',
    path: 'C:\\Users\\Velox\\Cheatsheets\\Markdown Syntax Quick Reference.md',
    content: `# Markdown Syntax Quick Reference

## Typography & Headers

# Header 1 (\`# Header 1\`)
## Header 2 (\`## Header 2\`)
### Header 3 (\`### Header 3\`)

*Italic text* using \`*Italic*\` or \`_Italic_\`  
**Bold text** using \`**Bold**\` or \`__Bold__\`  
~~Strikethrough~~ using \`~~Strikethrough~~\`  

---

## Code Blocks

Inline code: \`const answer = 42;\`

Multi-line block:
\`\`\`bash
# Install Velox Markdown Studio
npm install
npm run build
\`\`\`

## Blockquotes & Callouts

> Normal blockquote
>
> > Nested blockquote

> [!WARNING]
> Be mindful of uncommitted file edits before switching branches!
`,
    size: 980,
    wordCount: 110,
    readingTimeMinutes: 1,
    isPinned: true,
    tags: ['Cheatsheet', 'Reference'],
  },
];
