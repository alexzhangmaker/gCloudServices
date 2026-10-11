// Master Typora Web Application Controller
(function() {
  let editor = null;
  let currentDoc = null;
  let allDocs = [];
  let currentTheme = 'github';
  let activeTab = 'files';

  // DOM Elements
  const docTitleInput = document.getElementById('doc-title-input');
  const docListElem = document.getElementById('doc-list');
  const outlineListElem = document.getElementById('outline-list');
  const searchInput = document.getElementById('search-input');
  const searchResultsElem = document.getElementById('search-results');
  const saveStatusText = document.getElementById('save-status-text');
  const themeSelect = document.getElementById('theme-select');
  const sidebar = document.getElementById('sidebar');

  // Stats Elements
  const statWords = document.getElementById('stat-words');
  const statChars = document.getElementById('stat-chars');
  const statLines = document.getElementById('stat-lines');
  const statReadTime = document.getElementById('stat-read-time');

  async function init() {
    // 1. Initialize Theme
    currentTheme = await TyporaStorage.getSetting('active_theme', 'github');
    setTheme(currentTheme);
    if (themeSelect) themeSelect.value = currentTheme;

    // 2. Initialize Editor
    editor = new TyporaEditor({
      container: document.getElementById('editor-workspace'),
      onSave: async (doc) => {
        if (!doc) return;
        const updated = await apiClient.updateDocument(doc.id, {
          title: doc.title,
          content: doc.content
        });
        updateDocInList(updated);
      },
      onContentChange: (status) => {
        if (saveStatusText) saveStatusText.innerText = status;
      },
      onOutlineUpdate: (outline) => {
        renderOutline(outline);
      },
      onStatsUpdate: (stats) => {
        if (statWords) statWords.innerText = `${stats.words} words`;
        if (statChars) statChars.innerText = `${stats.chars} chars`;
        if (statLines) statLines.innerText = `${stats.lines} lines`;
        if (statReadTime) statReadTime.innerText = `${stats.readMinutes} min read`;
      }
    });

    // 3. Restore Editor Preferences
    const savedMode = await TyporaStorage.getSetting('active_mode', 'live');
    editor.setMode(savedMode);

    const savedFocus = await TyporaStorage.getSetting('focus_mode', false);
    if (savedFocus) editor.toggleFocusMode();

    const savedTypewriter = await TyporaStorage.getSetting('typewriter_mode', false);
    if (savedTypewriter) editor.toggleTypewriterMode();

    // 4. Load Documents List
    await refreshDocumentsList();

    // 5. Load Initial Document
    const lastDocId = await TyporaStorage.getSetting('last_doc_id', null);
    let initialDoc = allDocs.find(d => d.id === lastDocId);
    if (!initialDoc && allDocs.length > 0) {
      initialDoc = allDocs[0];
    }

    if (initialDoc) {
      await loadDocumentById(initialDoc.id);
    } else {
      await createNewDocument();
    }

    // 6. Bind UI Controls
    bindUIEvents();
  }

  function bindUIEvents() {
    // Document Title Input
    if (docTitleInput) {
      docTitleInput.addEventListener('input', () => {
        if (currentDoc) {
          currentDoc.title = docTitleInput.value.trim() || 'Untitled Document';
          editor.scheduleAutoSave();
          updateDocInList(currentDoc);
        }
      });
    }

    // Sidebar Toggle
    const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
    if (btnToggleSidebar && sidebar) {
      btnToggleSidebar.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
      });
    }

    // Sidebar Tabs (Files, Outline, Search)
    const tabBtns = document.querySelectorAll('.sidebar-tab-btn');
    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-tab');
        switchTab(tab);
      });
    });

    // Theme Switcher
    if (themeSelect) {
      themeSelect.addEventListener('change', (e) => {
        setTheme(e.target.value);
      });
    }

    // Mode Buttons
    document.getElementById('mode-live-btn')?.addEventListener('click', () => editor.setMode('live'));
    document.getElementById('mode-source-btn')?.addEventListener('click', () => editor.setMode('source'));
    document.getElementById('mode-split-btn')?.addEventListener('click', () => editor.setMode('split'));

    // Focus & Typewriter Modes
    document.getElementById('btn-focus-mode')?.addEventListener('click', () => editor.toggleFocusMode());
    document.getElementById('btn-typewriter-mode')?.addEventListener('click', () => editor.toggleTypewriterMode());

    // New Document Buttons
    document.getElementById('btn-new-doc')?.addEventListener('click', () => createNewDocument());
    document.getElementById('btn-sidebar-new-doc')?.addEventListener('click', () => createNewDocument());

    // Search Input
    if (searchInput) {
      let searchDebounce = null;
      searchInput.addEventListener('input', (e) => {
        clearTimeout(searchDebounce);
        searchDebounce = setTimeout(() => {
          handleSearch(e.target.value);
        }, 250);
      });
    }

    // Quick Format Toolbar Buttons
    bindFormattingToolbar();

    // Export & Import Dropdown / Buttons
    bindExportImport();
  }

  function bindFormattingToolbar() {
    document.getElementById('fmt-bold')?.addEventListener('click', () => editor.formatSelection('**', '**', 'bold'));
    document.getElementById('fmt-italic')?.addEventListener('click', () => editor.formatSelection('*', '*', 'italic'));
    document.getElementById('fmt-strike')?.addEventListener('click', () => editor.formatSelection('~~', '~~', 'strikethrough'));
    document.getElementById('fmt-highlight')?.addEventListener('click', () => editor.formatSelection('==', '==', 'highlight'));
    document.getElementById('fmt-code')?.addEventListener('click', () => editor.formatSelection('`', '`', 'code'));
    document.getElementById('fmt-quote')?.addEventListener('click', () => editor.formatSelection('> ', '', 'quote'));
    document.getElementById('fmt-link')?.addEventListener('click', () => editor.insertLink());
    document.getElementById('fmt-image')?.addEventListener('click', () => editor.insertImage());
    document.getElementById('fmt-table')?.addEventListener('click', () => editor.insertTable(3, 3));
    document.getElementById('fmt-math')?.addEventListener('click', () => editor.insertMathBlock());
    document.getElementById('fmt-task')?.addEventListener('click', () => editor.insertTaskList());
    document.getElementById('fmt-codeblock')?.addEventListener('click', () => editor.insertCodeBlock('javascript'));

    const headingSelect = document.getElementById('fmt-heading-select');
    if (headingSelect) {
      headingSelect.addEventListener('change', (e) => {
        const val = parseInt(e.target.value, 10);
        if (val > 0) {
          editor.insertHeading(val);
          headingSelect.value = '';
        }
      });
    }
  }

  function bindExportImport() {
    // Export Dropdown
    const exportSelect = document.getElementById('export-select');
    if (exportSelect) {
      exportSelect.addEventListener('change', (e) => {
        const val = e.target.value;
        if (!val || !currentDoc) return;

        if (val === 'md') {
          downloadFile(`${currentDoc.title || 'document'}.md`, currentDoc.content || '', 'text/markdown');
        } else if (val === 'html') {
          const renderedHtml = TyporaMarkdown.render(currentDoc.content || '');
          const styledHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${currentDoc.title}</title>
  <link rel="stylesheet" href="/css/typora-base.css">
  <link rel="stylesheet" href="/css/themes/${currentTheme}.css">
  <link rel="stylesheet" href="/vendor/katex/katex.min.css">
  <link rel="stylesheet" href="/vendor/prism.css">
  <style>
    body { max-width: 860px; margin: 40px auto; padding: 0 20px; line-height: 1.6; }
    @media print { body { max-width: 100%; margin: 0; } }
  </style>
</head>
<body class="theme-${currentTheme}">
  <article class="typora-editor-content">
    ${renderedHtml}
  </article>
</body>
</html>`;
          downloadFile(`${currentDoc.title || 'document'}.html`, styledHtml, 'text/html');
        } else if (val === 'pdf') {
          window.print();
        }
        exportSelect.value = '';
      });
    }

    // Import Button & Hidden File Input
    const importInput = document.getElementById('import-file-input');
    const importBtn = document.getElementById('btn-import-file');
    if (importBtn && importInput) {
      importBtn.addEventListener('click', () => importInput.click());
      importInput.addEventListener('change', async (e) => {
        if (e.target.files && e.target.files.length > 0) {
          const file = e.target.files[0];
          try {
            const imported = await apiClient.importFile(file);
            await refreshDocumentsList();
            await loadDocumentById(imported.id);
            showToast('Document imported successfully');
          } catch (err) {
            console.error('Import failed:', err);
            showToast('Failed to import file');
          }
          importInput.value = '';
        }
      });
    }

    // Version History
    document.getElementById('btn-versions')?.addEventListener('click', () => showVersionModal());
  }

  function downloadFile(filename, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function switchTab(tab) {
    activeTab = tab;
    document.querySelectorAll('.sidebar-tab-btn').forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-tab') === tab);
    });

    document.getElementById('tab-files').style.display = tab === 'files' ? 'block' : 'none';
    document.getElementById('tab-outline').style.display = tab === 'outline' ? 'block' : 'none';
    document.getElementById('tab-search').style.display = tab === 'search' ? 'block' : 'none';

    if (tab === 'search' && searchInput) {
      searchInput.focus();
    }
  }

  function setTheme(theme) {
    currentTheme = theme;
    document.body.className = document.body.className
      .replace(/theme-\w+/g, '')
      .trim();
    document.body.classList.add(`theme-${theme}`);
    TyporaStorage.setSetting('active_theme', theme);
  }

  async function refreshDocumentsList() {
    allDocs = await apiClient.getDocuments();
    renderDocList(allDocs);
  }

  function renderDocList(docs) {
    if (!docListElem) return;
    docListElem.innerHTML = '';

    if (docs.length === 0) {
      docListElem.innerHTML = '<li style="padding:12px; font-size:12px; color:var(--theme-sidebar-muted); text-align:center;">No documents found</li>';
      return;
    }

    docs.forEach(doc => {
      const li = document.createElement('li');
      li.className = `doc-item ${currentDoc && currentDoc.id === doc.id ? 'active' : ''}`;
      li.setAttribute('data-id', doc.id);

      const titleSpan = document.createElement('span');
      titleSpan.className = 'doc-item-title';
      titleSpan.innerText = doc.title || 'Untitled';

      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'doc-item-actions';

      const dupBtn = document.createElement('button');
      dupBtn.className = 'mini-btn';
      dupBtn.title = 'Duplicate';
      dupBtn.innerHTML = '📋';
      dupBtn.onclick = (e) => {
        e.stopPropagation();
        duplicateDocument(doc.id);
      };

      const delBtn = document.createElement('button');
      delBtn.className = 'mini-btn';
      delBtn.title = 'Delete';
      delBtn.innerHTML = '🗑️';
      delBtn.onclick = (e) => {
        e.stopPropagation();
        deleteDoc(doc.id);
      };

      actionsDiv.appendChild(dupBtn);
      actionsDiv.appendChild(delBtn);

      li.appendChild(titleSpan);
      li.appendChild(actionsDiv);

      li.onclick = () => loadDocumentById(doc.id);
      docListElem.appendChild(li);
    });
  }

  function updateDocInList(doc) {
    const existing = allDocs.find(d => d.id === doc.id);
    if (existing) {
      existing.title = doc.title;
      existing.content = doc.content;
    }
    renderDocList(allDocs);
  }

  async function loadDocumentById(id) {
    const doc = await apiClient.getDocument(id);
    if (!doc) return;

    currentDoc = doc;
    if (docTitleInput) docTitleInput.value = doc.title;
    editor.loadDocument(doc);

    // Update active highlight in sidebar list
    document.querySelectorAll('.doc-item').forEach(el => {
      el.classList.toggle('active', el.getAttribute('data-id') === id);
    });

    TyporaStorage.setSetting('last_doc_id', id);
  }

  async function createNewDocument() {
    const newDoc = await apiClient.createDocument({
      title: 'Untitled Document',
      content: '# Untitled Document\n\n'
    });

    await refreshDocumentsList();
    await loadDocumentById(newDoc.id);
    if (docTitleInput) {
      docTitleInput.select();
      docTitleInput.focus();
    }
  }

  async function duplicateDocument(id) {
    const dup = await apiClient.duplicateDocument(id);
    if (dup) {
      await refreshDocumentsList();
      await loadDocumentById(dup.id);
      showToast('Document duplicated');
    }
  }

  async function deleteDoc(id) {
    if (!confirm('Are you sure you want to delete this document?')) return;

    await apiClient.deleteDocument(id);
    await refreshDocumentsList();

    if (currentDoc && currentDoc.id === id) {
      if (allDocs.length > 0) {
        await loadDocumentById(allDocs[0].id);
      } else {
        await createNewDocument();
      }
    }
    showToast('Document deleted');
  }

  function renderOutline(outline) {
    if (!outlineListElem) return;
    outlineListElem.innerHTML = '';

    if (outline.length === 0) {
      outlineListElem.innerHTML = '<li style="padding:12px; font-size:12px; color:var(--theme-sidebar-muted); text-align:center;">No headings found in document</li>';
      return;
    }

    outline.forEach(item => {
      const li = document.createElement('li');
      li.className = `outline-item depth-${item.depth}`;
      li.innerText = item.title;
      li.onclick = () => {
        editor.scrollToHeading(item.id);
      };
      outlineListElem.appendChild(li);
    });
  }

  async function handleSearch(query) {
    if (!searchResultsElem) return;
    searchResultsElem.innerHTML = '';

    if (!query || !query.trim()) {
      searchResultsElem.innerHTML = '<div style="padding:12px; font-size:12px; color:var(--theme-sidebar-muted); text-align:center;">Type to search all documents...</div>';
      return;
    }

    searchResultsElem.innerHTML = '<div style="padding:12px; font-size:12px; color:var(--theme-sidebar-muted); text-align:center;">Searching...</div>';
    const results = await apiClient.search(query);

    searchResultsElem.innerHTML = '';
    if (results.length === 0) {
      searchResultsElem.innerHTML = '<div style="padding:12px; font-size:12px; color:var(--theme-sidebar-muted); text-align:center;">No matching results</div>';
      return;
    }

    results.forEach(res => {
      const div = document.createElement('div');
      div.className = 'search-result-item';

      const title = document.createElement('div');
      title.className = 'search-result-title';
      title.innerText = res.title;

      const snippet = document.createElement('div');
      snippet.className = 'search-result-snippet';
      snippet.innerHTML = res.snippet || 'No preview';

      div.appendChild(title);
      div.appendChild(snippet);

      div.onclick = async () => {
        await loadDocumentById(res.id);
        switchTab('files');
      };

      searchResultsElem.appendChild(div);
    });
  }

  async function showVersionModal() {
    if (!currentDoc) return;
    const versions = await apiClient.getVersions(currentDoc.id);
    const modal = document.getElementById('version-modal');
    const list = document.getElementById('version-list');
    if (!modal || !list) return;

    list.innerHTML = '';
    if (versions.length === 0) {
      list.innerHTML = '<div style="padding:16px; font-size:13px; color:var(--theme-sidebar-muted); text-align:center;">No previous revisions recorded yet. Revisions are created automatically as you write.</div>';
    } else {
      versions.forEach(v => {
        const item = document.createElement('div');
        item.className = 'version-item';

        const info = document.createElement('div');
        info.innerHTML = `<strong>${v.title}</strong> (${v.word_count} words)<br><small style="color:var(--theme-sidebar-muted);">${new Date(v.saved_at).toLocaleString()}</small>`;

        const restoreBtn = document.createElement('button');
        restoreBtn.className = 'btn-primary';
        restoreBtn.style.padding = '4px 10px';
        restoreBtn.innerText = 'Restore';
        restoreBtn.onclick = async () => {
          if (confirm('Restore this revision? Current unsaved edits will be replaced.')) {
            const restored = await apiClient.restoreVersion(currentDoc.id, v.id);
            await loadDocumentById(restored.id);
            modal.classList.remove('open');
            showToast('Revision restored successfully');
          }
        };

        item.appendChild(info);
        item.appendChild(restoreBtn);
        list.appendChild(item);
      });
    }

    modal.classList.add('open');
    document.getElementById('btn-close-version-modal').onclick = () => {
      modal.classList.remove('open');
    };
  }

  function showToast(message) {
    const container = document.getElementById('toast-container') || createToastContainer();
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerText = message;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 250);
    }, 2400);
  }

  function createToastContainer() {
    const c = document.createElement('div');
    c.id = 'toast-container';
    c.className = 'toast-container';
    document.body.appendChild(c);
    return c;
  }

  // Bootstrap when DOM is ready
  window.addEventListener('DOMContentLoaded', init);
})();
