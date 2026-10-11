const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'typora.db');

let db = null;

function getDb() {
  if (!db) {
    db = new DatabaseSync(DB_PATH);
    // Optimize performance and concurrency
    db.exec('PRAGMA foreign_keys = ON;');
    db.exec('PRAGMA journal_mode = WAL;');
  }
  return db;
}

function countWordsAndChars(text = '') {
  const chars = text.length;
  const words = (text.trim().match(/[\w\d\u00C0-\u024F\u4E00-\u9FFF\u3040-\u30FF]+/g) || []).length;
  return { words, chars };
}

function initDatabase() {
  const database = getDb();

  database.exec(`
    CREATE TABLE IF NOT EXISTS folders (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      parent_id TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (parent_id) REFERENCES folders(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      folder_id TEXT,
      is_favorite INTEGER NOT NULL DEFAULT 0,
      is_pinned INTEGER NOT NULL DEFAULT 0,
      word_count INTEGER NOT NULL DEFAULT 0,
      char_count INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS document_versions (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      word_count INTEGER NOT NULL DEFAULT 0,
      saved_at INTEGER NOT NULL,
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS uploads (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size INTEGER NOT NULL,
      url TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS docs_fts USING fts5(
      id UNINDEXED,
      title,
      content,
      tokenize = 'porter unicode61'
    );
  `);

  // Setup triggers to keep FTS index synchronized
  try {
    database.exec(`
      CREATE TRIGGER IF NOT EXISTS docs_ai AFTER INSERT ON documents BEGIN
        INSERT INTO docs_fts(id, title, content) VALUES (new.id, new.title, new.content);
      END;

      CREATE TRIGGER IF NOT EXISTS docs_ad AFTER DELETE ON documents BEGIN
        DELETE FROM docs_fts WHERE id = old.id;
      END;

      CREATE TRIGGER IF NOT EXISTS docs_au AFTER UPDATE ON documents BEGIN
        DELETE FROM docs_fts WHERE id = old.id;
        INSERT INTO docs_fts(id, title, content) VALUES (new.id, new.title, new.content);
      END;
    `);
  } catch (err) {
    console.error('Trigger initialization error:', err);
  }

  // Seed sample data if empty
  const countRow = database.prepare('SELECT count(*) as count FROM documents').get();
  if (countRow.count === 0) {
    seedStarterDocuments(database);
  }
}

function seedStarterDocuments(database) {
  const now = Date.now();
  const folderId = 'folder-quickstart';

  database.prepare(`
    INSERT INTO folders (id, name, parent_id, created_at)
    VALUES (?, ?, NULL, ?)
  `).run(folderId, 'Getting Started', now);

  const welcomeContent = `# Welcome to Typora Web 🚀

Typora Web is a modern, distraction-free **Markdown Editor and Viewer** inspired by Typora, featuring a Node.js & SQLite backend, seamless live preview, and full offline **PWA** capabilities.

---

## ✨ Key Typora Features

- **Seamless Live Preview (Typora Mode)**: WYSIWYG seamless in-place editing.
- **Source Code Mode (Ctrl+/)**: Raw Markdown text editor with line numbers.
- **Split View Mode**: Side-by-side editing with synchronized live preview.
- **Distraction-Free Modes**:
  - **Focus Mode**: Dims surrounding text so you focus on the current paragraph.
  - **Typewriter Mode**: Keeps your active line vertically centered on screen.
- **Typora Themes**: GitHub, Night (Dark), Gothic, Newsprint, and Cobalt.
- **Table of Contents (Outline)**: Auto-generated outline sidebar with instant smooth jumping.
- **Full Offline PWA**: Installable app with Service Worker caching and IndexedDB offline persistence.

---

## 📐 Math & LaTeX Equations

Inline math: $E = mc^2$ and Euler's formula: $e^{i\\pi} + 1 = 0$.

Display block equation:

$$\\int_{-\\infty}^{+\\infty} e^{-x^2} dx = \\sqrt{\\pi}$$

$$\\mathbf{X} = \\begin{pmatrix} x_{11} & x_{12} \\\\ x_{21} & x_{22} \\end{pmatrix}$$

---

## 💻 Code Blocks with Syntax Highlighting

\`\`\`javascript
// Express & SQLite backend endpoint
app.get('/api/documents/:id', (req, res) => {
  const doc = db.getDocument(req.params.id);
  if (!doc) return res.status(404).json({ error: 'Document not found' });
  res.json({ data: doc });
});
\`\`\`

\`\`\`python
# Fibonacci sequence generator
def fibonacci(n: int):
    a, b = 0, 1
    for _ in range(n):
        yield a
        a, b = b, a + b

print(list(fibonacci(8)))
\`\`\`

---

## 📊 Interactive Tables

| Feature | Supported | Description |
| :--- | :---: | :--- |
| **Live WYSIWYG** | ✅ | Typora's signature seamless hybrid editing |
| **Offline PWA** | ✅ | Service worker cached, IndexedDB sync |
| **SQLite Backend** | ✅ | Fast ACID storage + FTS5 full-text search |
| **Theme Switcher** | ✅ | GitHub, Night, Gothic, Newsprint, Cobalt |
| **PDF/HTML Export** | ✅ | Clean printing and standalone HTML |

---

## ✅ Interactive Task Lists

- [x] Create Node.js & SQLite backend
- [x] Implement Typora live preview editor
- [x] Build Table of Contents outline navigation
- [x] Configure PWA manifest & Service Worker caching
- [ ] Write your next masterpiece in Typora Web!

---

## 📝 Formatting & Blockquotes

> "Simplicity is prerequisite for reliability."  
> — *Edsger W. Dijkstra*

Text styles: **Bold text**, *italic emphasis*, ~~strikethrough~~, ==highlighted text==, and \`inline code\`.

---

## ⌨️ Useful Keyboard Shortcuts

- **Ctrl + S**: Save document
- **Ctrl + /**: Toggle Source Code / Live Preview
- **Ctrl + B**: **Bold**
- **Ctrl + I**: *Italic*
- **Ctrl + K**: Insert link
- **Ctrl + T**: Insert table
- **Ctrl + Shift + F**: Toggle Focus Mode
- **Ctrl + Shift + T**: Toggle Typewriter Mode
- **Ctrl + Shift + L**: Toggle Left Sidebar
`;

  const { words, chars } = countWordsAndChars(welcomeContent);
  const welcomeId = 'doc-welcome';

  database.prepare(`
    INSERT INTO documents (id, title, content, folder_id, is_favorite, is_pinned, word_count, char_count, created_at, updated_at)
    VALUES (?, ?, ?, ?, 1, 1, ?, ?, ?, ?)
  `).run(welcomeId, 'Welcome to Typora Web', welcomeContent, folderId, words, chars, now, now);

  // Add a second sample document
  const cheatsheetContent = `# Markdown & Typora Syntax Cheatsheet

### Headings
# H1
## H2
### H3
#### H4

### Emphasis
*Italic* or _Italic_
**Bold** or __Bold__
***Bold Italic***
~~Strikethrough~~
==Highlight==

### Lists
1. First ordered item
2. Second ordered item
   - Sub-item
   - Another sub-item

### Links & Images
[Typora](https://typora.io)
![Sample Badge](https://img.shields.io/badge/Typora-Ready-2ea44f?style=flat-square)
`;

  const { words: w2, chars: c2 } = countWordsAndChars(cheatsheetContent);
  const sheetId = 'doc-cheatsheet';

  database.prepare(`
    INSERT INTO documents (id, title, content, folder_id, is_favorite, is_pinned, word_count, char_count, created_at, updated_at)
    VALUES (?, ?, ?, ?, 0, 0, ?, ?, ?, ?)
  `).run(sheetId, 'Markdown Syntax Cheatsheet', cheatsheetContent, folderId, w2, c2, now - 60000, now - 60000);
}

// Documents operations
function listDocuments({ folderId, isFavorite, search } = {}) {
  const database = getDb();
  let sql = `
    SELECT d.id, d.title, d.folder_id, d.is_favorite, d.is_pinned,
           d.word_count, d.char_count, d.created_at, d.updated_at,
           f.name as folder_name,
           substr(d.content, 1, 120) as preview
    FROM documents d
    LEFT JOIN folders f ON d.folder_id = f.id
    WHERE 1=1
  `;
  const params = [];

  if (folderId !== undefined) {
    if (folderId === null || folderId === '') {
      sql += ' AND d.folder_id IS NULL';
    } else {
      sql += ' AND d.folder_id = ?';
      params.push(folderId);
    }
  }

  if (isFavorite) {
    sql += ' AND d.is_favorite = 1';
  }

  sql += ' ORDER BY d.is_pinned DESC, d.updated_at DESC';
  return database.prepare(sql).all(...params);
}

function getDocument(id) {
  const database = getDb();
  const doc = database.prepare(`
    SELECT d.*, f.name as folder_name
    FROM documents d
    LEFT JOIN folders f ON d.folder_id = f.id
    WHERE d.id = ?
  `).get(id);
  return doc || null;
}

function createDocument({ id, title, content = '', folder_id = null, is_favorite = 0, is_pinned = 0 }) {
  const database = getDb();
  const docId = id || crypto.randomUUID();
  const docTitle = title || 'Untitled Document';
  const now = Date.now();
  const { words, chars } = countWordsAndChars(content);

  database.prepare(`
    INSERT INTO documents (id, title, content, folder_id, is_favorite, is_pinned, word_count, char_count, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(docId, docTitle, content, folder_id, is_favorite ? 1 : 0, is_pinned ? 1 : 0, words, chars, now, now);

  return getDocument(docId);
}

function updateDocument(id, updates = {}) {
  const database = getDb();
  const current = getDocument(id);
  if (!current) return null;

  const now = Date.now();
  const title = updates.title !== undefined ? updates.title : current.title;
  const content = updates.content !== undefined ? updates.content : current.content;
  const folder_id = updates.folder_id !== undefined ? updates.folder_id : current.folder_id;
  const is_favorite = updates.is_favorite !== undefined ? (updates.is_favorite ? 1 : 0) : current.is_favorite;
  const is_pinned = updates.is_pinned !== undefined ? (updates.is_pinned ? 1 : 0) : current.is_pinned;

  const { words, chars } = countWordsAndChars(content);

  // If content changed significantly, save a version history snapshot
  if (updates.content !== undefined && updates.content !== current.content) {
    createVersion(id, current.title, current.content, current.word_count);
  }

  database.prepare(`
    UPDATE documents
    SET title = ?, content = ?, folder_id = ?, is_favorite = ?, is_pinned = ?,
        word_count = ?, char_count = ?, updated_at = ?
    WHERE id = ?
  `).run(title, content, folder_id, is_favorite, is_pinned, words, chars, now, id);

  return getDocument(id);
}

function deleteDocument(id) {
  const database = getDb();
  const doc = getDocument(id);
  if (!doc) return false;

  database.prepare('DELETE FROM documents WHERE id = ?').run(id);
  return true;
}

function duplicateDocument(id) {
  const original = getDocument(id);
  if (!original) return null;

  const newId = crypto.randomUUID();
  const newTitle = `${original.title} (Copy)`;
  return createDocument({
    id: newId,
    title: newTitle,
    content: original.content,
    folder_id: original.folder_id
  });
}

// Version History
function createVersion(docId, title, content, wordCount = 0) {
  const database = getDb();
  const versionId = crypto.randomUUID();
  const now = Date.now();

  try {
    database.prepare(`
      INSERT INTO document_versions (id, document_id, title, content, word_count, saved_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(versionId, docId, title, content, wordCount, now);

    // Keep only last 20 revisions per document
    database.prepare(`
      DELETE FROM document_versions
      WHERE document_id = ? AND id NOT IN (
        SELECT id FROM document_versions WHERE document_id = ? ORDER BY saved_at DESC LIMIT 20
      )
    `).run(docId, docId);
  } catch (err) {
    console.error('Error saving document revision:', err);
  }
}

function getVersions(docId) {
  const database = getDb();
  return database.prepare(`
    SELECT id, document_id, title, word_count, saved_at
    FROM document_versions
    WHERE document_id = ?
    ORDER BY saved_at DESC
  `).all(docId);
}

function getVersionContent(versionId) {
  const database = getDb();
  return database.prepare(`
    SELECT * FROM document_versions WHERE id = ?
  `).get(versionId);
}

// Folders operations
function listFolders() {
  const database = getDb();
  return database.prepare(`
    SELECT f.*, COUNT(d.id) as doc_count
    FROM folders f
    LEFT JOIN documents d ON d.folder_id = f.id
    GROUP BY f.id
    ORDER BY f.name ASC
  `).all();
}

function createFolder({ id, name, parent_id = null }) {
  const database = getDb();
  const folderId = id || crypto.randomUUID();
  const now = Date.now();

  database.prepare(`
    INSERT INTO folders (id, name, parent_id, created_at)
    VALUES (?, ?, ?, ?)
  `).run(folderId, name || 'New Folder', parent_id, now);

  return database.prepare('SELECT * FROM folders WHERE id = ?').get(folderId);
}

function updateFolder(id, { name }) {
  const database = getDb();
  database.prepare(`
    UPDATE folders SET name = ? WHERE id = ?
  `).run(name, id);
  return database.prepare('SELECT * FROM folders WHERE id = ?').get(id);
}

function deleteFolder(id) {
  const database = getDb();
  database.prepare('DELETE FROM folders WHERE id = ?').run(id);
  return true;
}

// Full Text Search with FTS5
function searchDocuments(query) {
  if (!query || !query.trim()) return [];
  const database = getDb();
  const cleanQuery = query.trim().replace(/['"/*^:]/g, ' ');
  const terms = cleanQuery.split(/\s+/).filter(Boolean);

  if (terms.length === 0) return [];

  // Prefix matching e.g. "typo*"
  const ftsQuery = terms.map(t => `"${t}"*`).join(' ');

  try {
    const results = database.prepare(`
      SELECT d.id, d.title, d.updated_at, d.word_count,
             snippet(docs_fts, -1, '<mark>', '</mark>', '...', 15) as snippet,
             rank
      FROM docs_fts
      JOIN documents d ON docs_fts.id = d.id
      WHERE docs_fts MATCH ?
      ORDER BY rank
      LIMIT 30
    `).all(ftsQuery);
    return results;
  } catch (err) {
    // Fallback to LIKE query if FTS expression fails
    const likePattern = `%${cleanQuery}%`;
    return database.prepare(`
      SELECT id, title, updated_at, word_count,
             substr(content, 1, 100) as snippet
      FROM documents
      WHERE title LIKE ? OR content LIKE ?
      ORDER BY updated_at DESC
      LIMIT 30
    `).all(likePattern, likePattern);
  }
}

// Uploads
function recordUpload({ id, filename, original_name, mime_type, size, url }) {
  const database = getDb();
  const uploadId = id || crypto.randomUUID();
  const now = Date.now();

  database.prepare(`
    INSERT INTO uploads (id, filename, original_name, mime_type, size, url, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(uploadId, filename, original_name, mime_type, size, url, now);

  return database.prepare('SELECT * FROM uploads WHERE id = ?').get(uploadId);
}

// Overall statistics
function getStats() {
  const database = getDb();
  const docs = database.prepare('SELECT COUNT(*) as count, SUM(word_count) as total_words, SUM(char_count) as total_chars FROM documents').get();
  const folders = database.prepare('SELECT COUNT(*) as count FROM folders').get();
  const uploads = database.prepare('SELECT COUNT(*) as count, SUM(size) as total_bytes FROM uploads').get();

  return {
    documentCount: docs.count || 0,
    totalWords: docs.total_words || 0,
    totalChars: docs.total_chars || 0,
    folderCount: folders.count || 0,
    uploadCount: uploads.count || 0,
    totalUploadBytes: uploads.total_bytes || 0
  };
}

module.exports = {
  initDatabase,
  listDocuments,
  getDocument,
  createDocument,
  updateDocument,
  deleteDocument,
  duplicateDocument,
  createVersion,
  getVersions,
  getVersionContent,
  listFolders,
  createFolder,
  updateFolder,
  deleteFolder,
  searchDocuments,
  recordUpload,
  getStats,
  countWordsAndChars
};
