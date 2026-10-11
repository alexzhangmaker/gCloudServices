# Typora Web — Distraction-Free Markdown Editor & Viewer

> A seamless, modern clone of **Typora** featuring a **Node.js & SQLite** backend service and an offline-first **Progressive Web App (PWA)** with Service Worker caching.

---

## ✨ Features

### 🖋️ Typora-Style Editing & Viewing
- **Seamless Live Preview (Typora Mode)**: WYSIWYG seamless live markdown rendering and formatting.
- **Source Code Mode (`Ctrl+/`)**: Clean, minimalist raw markdown editor with line numbers and monospace typography.
- **Split View Mode**: Side-by-side editing and synchronized live preview.
- **Distraction-Free Modes**:
  - **Focus Mode (`Ctrl+Shift+F`)**: Highlights the active paragraph while softly dimming the rest of the document.
  - **Typewriter Mode (`Ctrl+Shift+T`)**: Keeps your active typing line vertically centered on the screen.
- **5 Built-in Typora Themes**:
  - `GitHub` (Clean, classic light)
  - `Night` (Modern high-contrast dark theme)
  - `Gothic` (Serif literary paper aesthetic)
  - `Newsprint` (Editorial warm newspaper layout)
  - `Cobalt` (Deep blue evening mode)
- **Table of Contents (Outline)**: Automatically extracts `H1`–`H6` headings into an indented outline tree with smooth-scroll navigation.
- **Full LaTeX Math Support**: Inline `$E=mc^2$` and display math `$$\int_a^b f(x)dx$$` powered by **KaTeX**.
- **Code Blocks**: Syntax highlighting via **Prism.js** (JavaScript, Python, Bash, SQL, JSON, Markdown, etc.) with a 1-click **Copy** button.
- **Interactive Task Lists**: Checkbox toggles (`- [ ]` / `- [x]`) that can be clicked directly in live view to update and save the markdown.
- **Drag-and-Drop & Clipboard Image Upload**: Paste screenshots or drag images directly into the editor for automatic backend upload and inline preview.

---

### 🚀 Offline PWA & Service Worker
- **PWA Manifest & App Icons**: Installable as a native desktop or mobile application (`manifest.json` + vector SVG & PNG icons).
- **Service Worker (`sw.js`)**:
  - Pre-caches application shell, themes, KaTeX fonts, Prism syntax engines, and marked renderer.
  - Stale-While-Revalidate caching for static assets.
  - Network-first strategy with offline fallbacks.
- **IndexedDB Offline Persistence (`TyporaStorage`)**:
  - Automatically saves drafts and local revisions into IndexedDB.
  - Queues offline modifications in a sync queue and auto-synchronizes to the SQLite backend when back online.

---

### 💾 Node.js & SQLite Backend Service
- **Built-in `node:sqlite` Database**:
  - ACID-compliant storage with WAL mode enabled.
  - **FTS5 Full-Text Search**: SQLite Full-Text Search 5 with Porter stemming, rank ordering, and snippet match highlights (`<mark>`).
  - Automatic triggers keeping the search index synchronized across document creations, edits, and deletions.
  - **Document Revisions**: Automatically records version history on edits and allows 1-click revision restore.
- **RESTful API**:
  - `GET /api/documents` — List documents with metadata and word counts.
  - `GET /api/documents/:id` — Retrieve document content.
  - `POST /api/documents` — Create document.
  - `PUT /api/documents/:id` — Update document.
  - `DELETE /api/documents/:id` — Delete document.
  - `POST /api/documents/:id/duplicate` — Duplicate document.
  - `GET /api/documents/:id/versions` — View revision history.
  - `POST /api/documents/:id/restore/:versionId` — Restore past revision.
  - `GET /api/search?q=...` — FTS5 full-text search.
  - `POST /api/upload` — Multipart image upload.
  - `POST /api/import` — Import Markdown file (`.md`).
  - `GET /api/export/:id?format=md|html` — Export as Markdown or styled standalone HTML.
  - `GET /api/stats` — Word count, storage, and document metrics.

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| **Ctrl + S** (or **Cmd + S**) | Save document immediately |
| **Ctrl + /** | Toggle between Live Preview and Source Code mode |
| **Ctrl + B** | Bold selection (`**bold**`) |
| **Ctrl + I** | Italic selection (`*italic*`) |
| **Ctrl + K** | Insert link (`[text](url)`) |
| **Tab** / **Shift + Tab** | Indent / Outdent 2 spaces |

---

## 📦 Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Start the Application
```bash
npm start
```
Or for development with automatic reload:
```bash
npm run dev
```

### 3. Open in Browser
Navigate to:
```
http://localhost:3000
```
- Click the **"Install App"** button on the bottom status bar to install Typora Web as a standalone PWA application on your desktop or mobile device.
- Try toggling between **Live**, **Source**, and **Split** modes in the top toolbar.
- Test offline mode by turning on "Offline" in DevTools Network tab: edits are saved locally and synced automatically upon reconnecting!
