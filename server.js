const express = require('express');
const cors = require('cors');
const path = require('node:path');
const fs = require('node:fs');
const multer = require('multer');
const crypto = require('node:crypto');
const db = require('./db/database.js');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize database
db.initDatabase();

// Ensure upload directory exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Keep a .gitkeep in uploads
const gitkeepPath = path.join(uploadDir, '.gitkeep');
if (!fs.existsSync(gitkeepPath)) {
  fs.writeFileSync(gitkeepPath, '');
}

// Multer storage for image/asset uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.png';
    const unique = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`;
    cb(null, unique);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
  fileFilter: (req, file, cb) => {
    // Allow images and markdown attachments
    if (file.mimetype.startsWith('image/') || file.mimetype === 'text/markdown' || file.originalname.endsWith('.md')) {
      cb(null, true);
    } else {
      cb(null, true); // Allow all attachments
    }
  }
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static asset folders
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, filePath) => {
    // Set appropriate caching and Service Worker headers
    if (filePath.endsWith('sw.js')) {
      res.setHeader('Service-Worker-Allowed', '/');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  }
}));

app.use('/uploads', express.static(uploadDir));

// ==========================================
// REST API ENDPOINTS
// ==========================================

// Health Check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'Typora Web Backend', timestamp: Date.now() });
});

// Overall Stats
app.get('/api/stats', (req, res) => {
  try {
    const stats = db.getStats();
    res.json({ success: true, data: stats });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// List Documents
app.get('/api/documents', (req, res) => {
  try {
    const { folder_id, is_favorite, search } = req.query;
    const docs = db.listDocuments({
      folderId: folder_id,
      isFavorite: is_favorite === '1' || is_favorite === 'true',
      search
    });
    res.json({ success: true, data: docs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get Single Document
app.get('/api/documents/:id', (req, res) => {
  try {
    const doc = db.getDocument(req.params.id);
    if (!doc) {
      return res.status(404).json({ success: false, error: 'Document not found' });
    }
    res.json({ success: true, data: doc });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Create Document
app.post('/api/documents', (req, res) => {
  try {
    const { title, content, folder_id, is_favorite, is_pinned } = req.body;
    const doc = db.createDocument({
      title: title || 'Untitled Document',
      content: content || '',
      folder_id: folder_id || null,
      is_favorite: is_favorite ? 1 : 0,
      is_pinned: is_pinned ? 1 : 0
    });
    res.status(201).json({ success: true, data: doc });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update Document
app.put('/api/documents/:id', (req, res) => {
  try {
    const updated = db.updateDocument(req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Document not found' });
    }
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Delete Document
app.delete('/api/documents/:id', (req, res) => {
  try {
    const success = db.deleteDocument(req.params.id);
    if (!success) {
      return res.status(404).json({ success: false, error: 'Document not found' });
    }
    res.json({ success: true, message: 'Document deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Duplicate Document
app.post('/api/documents/:id/duplicate', (req, res) => {
  try {
    const duplicated = db.duplicateDocument(req.params.id);
    if (!duplicated) {
      return res.status(404).json({ success: false, error: 'Document not found' });
    }
    res.json({ success: true, data: duplicated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Version History
app.get('/api/documents/:id/versions', (req, res) => {
  try {
    const versions = db.getVersions(req.params.id);
    res.json({ success: true, data: versions });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Restore Version
app.post('/api/documents/:id/restore/:versionId', (req, res) => {
  try {
    const version = db.getVersionContent(req.params.versionId);
    if (!version || version.document_id !== req.params.id) {
      return res.status(404).json({ success: false, error: 'Version not found' });
    }
    const updated = db.updateDocument(req.params.id, {
      title: version.title,
      content: version.content
    });
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Folders API
app.get('/api/folders', (req, res) => {
  try {
    const folders = db.listFolders();
    res.json({ success: true, data: folders });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/folders', (req, res) => {
  try {
    const { name, parent_id } = req.body;
    const folder = db.createFolder({ name, parent_id });
    res.status(201).json({ success: true, data: folder });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/folders/:id', (req, res) => {
  try {
    const { name } = req.body;
    const updated = db.updateFolder(req.params.id, { name });
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/folders/:id', (req, res) => {
  try {
    db.deleteFolder(req.params.id);
    res.json({ success: true, message: 'Folder deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Search API (FTS5)
app.get('/api/search', (req, res) => {
  try {
    const { q } = req.query;
    if (!q || !q.trim()) {
      return res.json({ success: true, data: [] });
    }
    const results = db.searchDocuments(q);
    res.json({ success: true, data: results });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// File Upload (Images / Assets for Markdown)
app.post('/api/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const fileUrl = `/uploads/${req.file.filename}`;
    const uploadRecord = db.recordUpload({
      filename: req.file.filename,
      original_name: req.file.originalname,
      mime_type: req.file.mimetype,
      size: req.file.size,
      url: fileUrl
    });

    res.json({
      success: true,
      url: fileUrl,
      filename: req.file.filename,
      original_name: req.file.originalname,
      size: req.file.size,
      data: uploadRecord
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Import Markdown file
app.post('/api/import', upload.single('file'), (req, res) => {
  try {
    let content = '';
    let title = 'Imported Document';
    const folder_id = req.body.folder_id || null;

    if (req.file) {
      content = fs.readFileSync(req.file.path, 'utf8');
      title = path.basename(req.file.originalname, path.extname(req.file.originalname));
      // Clean up uploaded temporary import file
      try { fs.unlinkSync(req.file.path); } catch (e) {}
    } else if (req.body.content) {
      content = req.body.content;
      title = req.body.title || 'Imported Document';
    } else {
      return res.status(400).json({ success: false, error: 'No file or content provided' });
    }

    // Try to extract first # heading as title if generic
    const headingMatch = content.match(/^#\s+(.+)$/m);
    if (headingMatch && title === 'Imported Document') {
      title = headingMatch[1].trim();
    }

    const doc = db.createDocument({
      title,
      content,
      folder_id
    });

    res.status(201).json({ success: true, data: doc });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Export Document as Markdown (.md) or Standalone HTML
app.get('/api/export/:id', (req, res) => {
  try {
    const doc = db.getDocument(req.params.id);
    if (!doc) {
      return res.status(404).json({ success: false, error: 'Document not found' });
    }

    const format = (req.query.format || 'md').toLowerCase();
    const safeTitle = (doc.title || 'document').replace(/[^a-zA-Z0-9_\-\u4e00-\u9fa5]/g, '_');

    if (format === 'html') {
      // Export styled HTML with embedded Typora styling
      const htmlOutput = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(doc.title)}</title>
  <link rel="stylesheet" href="/css/typora-base.css">
  <link rel="stylesheet" href="/css/themes/github.css">
  <link rel="stylesheet" href="/vendor/katex/katex.min.css">
  <link rel="stylesheet" href="/vendor/prism.css">
  <style>
    body {
      max-width: 860px;
      margin: 40px auto;
      padding: 0 24px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
      line-height: 1.6;
      color: #24292e;
    }
    @media print {
      body { max-width: 100%; margin: 0; padding: 0; }
    }
  </style>
</head>
<body class="typora-theme-github">
  <article class="typora-content" id="content">
    <!-- Rendered via frontend or browser markdown parser -->
    ${escapeHtml(doc.content)}
  </article>
</body>
</html>`;

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}.html"`);
      return res.send(htmlOutput);
    }

    // Default: Raw Markdown
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}.md"`);
    res.send(doc.content);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

function escapeHtml(text = '') {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Fallback to index.html for SPA client navigation
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api') && !req.path.startsWith('/uploads')) {
    return res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
  next();
});

// Start Server
const server = app.listen(PORT, () => {
  console.log(`=========================================`);
  console.log(`🚀 Typora Web Service is running!`);
  console.log(`📡 URL: http://localhost:${PORT}`);
  console.log(`📁 Database: ${path.join(__dirname, 'db', 'typora.db')}`);
  console.log(`🖼️  Uploads: ${uploadDir}`);
  console.log(`=========================================`);
});

module.exports = { app, server };
