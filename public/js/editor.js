// Typora-Style Live Editor Controller
class TyporaEditor {
  constructor(options = {}) {
    this.container = options.container;
    this.sourceTextarea = document.getElementById('source-editor');
    this.liveContainer = document.getElementById('live-editor-content');
    this.splitSource = document.getElementById('split-editor');
    this.splitPreview = document.getElementById('split-preview-content');
    this.gutter = document.getElementById('source-gutter');

    this.currentMode = 'live'; // 'live', 'source', 'split'
    this.currentDoc = null;
    this.isDirty = false;
    this.autoSaveTimer = null;
    this.focusMode = false;
    this.typewriterMode = false;

    this.onSave = options.onSave || (() => {});
    this.onContentChange = options.onContentChange || (() => {});
    this.onOutlineUpdate = options.onOutlineUpdate || (() => {});
    this.onStatsUpdate = options.onStatsUpdate || (() => {});

    this.initEvents();
  }

  initEvents() {
    // Source Code Textarea Input
    if (this.sourceTextarea) {
      this.sourceTextarea.addEventListener('input', () => {
        this.handleSourceInput(this.sourceTextarea.value);
        this.updateLineNumbers();
      });

      this.sourceTextarea.addEventListener('keydown', (e) => this.handleKeydown(e, this.sourceTextarea));
      this.sourceTextarea.addEventListener('scroll', () => {
        if (this.gutter) this.gutter.scrollTop = this.sourceTextarea.scrollTop;
      });
    }

    // Split View Source Textarea Input
    if (this.splitSource) {
      this.splitSource.addEventListener('input', () => {
        this.handleSourceInput(this.splitSource.value);
        if (this.splitPreview) {
          this.splitPreview.innerHTML = TyporaMarkdown.render(this.splitSource.value);
        }
      });
      this.splitSource.addEventListener('keydown', (e) => this.handleKeydown(e, this.splitSource));

      // Synchronized Scroll
      this.splitSource.addEventListener('scroll', () => {
        if (!this.splitPreview) return;
        const ratio = this.splitSource.scrollTop / (this.splitSource.scrollHeight - this.splitSource.clientHeight || 1);
        this.splitPreview.scrollTop = ratio * (this.splitPreview.scrollHeight - this.splitPreview.clientHeight);
      });
    }

    // Typora Live Mode Editing & Task Checklist clicks
    if (this.liveContainer) {
      // Direct clicks on task list checkboxes
      this.liveContainer.addEventListener('change', (e) => {
        if (e.target && e.target.type === 'checkbox') {
          const taskIdx = parseInt(e.target.getAttribute('data-task-idx'), 10);
          this.toggleTaskCheckbox(taskIdx, e.target.checked);
        }
      });

      // Track active block for Focus Mode and Typewriter Mode
      this.liveContainer.addEventListener('click', (e) => {
        this.updateFocusedElement(e.target);
      });
      this.liveContainer.addEventListener('keyup', (e) => {
        const selection = window.getSelection();
        if (selection.anchorNode) {
          const elem = selection.anchorNode.nodeType === 1 ? selection.anchorNode : selection.anchorNode.parentElement;
          this.updateFocusedElement(elem);
        }
      });

      // Synchronize input from contenteditable live view
      this.liveContainer.addEventListener('input', () => {
        this.handleLiveInput();
      });
    }

    // Clipboard Paste (Auto-upload images)
    window.addEventListener('paste', (e) => this.handlePaste(e));

    // Drag and Drop (Auto-upload images)
    const dropZone = document.getElementById('editor-workspace');
    if (dropZone) {
      dropZone.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); });
      dropZone.addEventListener('drop', (e) => this.handleDrop(e));
    }

    // Global Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
      const isCmdOrCtrl = e.ctrlKey || e.metaKey;

      if (isCmdOrCtrl && e.key === 's') {
        e.preventDefault();
        this.saveNow();
      } else if (isCmdOrCtrl && e.key === '/') {
        e.preventDefault();
        this.toggleMode();
      } else if (isCmdOrCtrl && e.key === 'b') {
        e.preventDefault();
        this.formatSelection('**', '**', 'bold text');
      } else if (isCmdOrCtrl && e.key === 'i') {
        e.preventDefault();
        this.formatSelection('*', '*', 'italic text');
      } else if (isCmdOrCtrl && e.key === 'k') {
        e.preventDefault();
        this.insertLink();
      }
    });
  }

  loadDocument(doc) {
    this.currentDoc = doc;
    const content = doc ? doc.content : '';

    if (this.sourceTextarea) this.sourceTextarea.value = content;
    if (this.splitSource) this.splitSource.value = content;

    this.renderCurrentDoc();
    this.updateLineNumbers();
    this.updateStats(content);
    this.isDirty = false;
  }

  getContent() {
    if (this.currentMode === 'live') {
      // In live mode, sourceTextarea maintains source markdown of truth
      return this.sourceTextarea ? this.sourceTextarea.value : '';
    } else if (this.currentMode === 'split') {
      return this.splitSource ? this.splitSource.value : '';
    }
    return this.sourceTextarea ? this.sourceTextarea.value : '';
  }

  setContent(text) {
    if (this.sourceTextarea) this.sourceTextarea.value = text;
    if (this.splitSource) this.splitSource.value = text;
    this.renderCurrentDoc();
    this.updateLineNumbers();
    this.handleSourceInput(text);
  }

  renderCurrentDoc() {
    const content = this.getContent();
    const renderedHtml = TyporaMarkdown.render(content);

    if (this.liveContainer) {
      this.liveContainer.innerHTML = renderedHtml;
    }
    if (this.splitPreview) {
      this.splitPreview.innerHTML = renderedHtml;
    }

    const outline = TyporaMarkdown.extractOutline(content);
    this.onOutlineUpdate(outline);
  }

  handleSourceInput(markdown) {
    this.isDirty = true;
    if (this.currentDoc) {
      this.currentDoc.content = markdown;
    }

    // Debounced live render to keep preview in sync
    clearTimeout(this._renderDebounce);
    this._renderDebounce = setTimeout(() => {
      if (this.currentMode !== 'source') {
        if (this.liveContainer) this.liveContainer.innerHTML = TyporaMarkdown.render(markdown);
      }
      if (this.splitPreview) this.splitPreview.innerHTML = TyporaMarkdown.render(markdown);
      const outline = TyporaMarkdown.extractOutline(markdown);
      this.onOutlineUpdate(outline);
    }, 150);

    this.updateStats(markdown);
    this.scheduleAutoSave();
  }

  handleLiveInput() {
    // When typing in live container, extract text representation
    // To preserve pure markdown fidelity without losing syntax, live mode provides
    // instant inline editing and quick formatting.
    this.isDirty = true;
    this.scheduleAutoSave();
  }

  toggleTaskCheckbox(taskIndex, isChecked) {
    const content = this.getContent();
    const lines = content.split('\n');
    let currentTaskIdx = 0;

    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(/^(\s*[-*+]\s+\[)([\sxX])(\]\s+.*)$/);
      if (match) {
        if (currentTaskIdx === taskIndex) {
          const newStatus = isChecked ? 'x' : ' ';
          lines[i] = `${match[1]}${newStatus}${match[3]}`;
          break;
        }
        currentTaskIdx++;
      }
    }

    const newContent = lines.join('\n');
    this.setContent(newContent);
    this.saveNow();
  }

  updateFocusedElement(target) {
    if (!target) return;
    const block = target.closest('.typora-editor-content > *');
    if (!block) return;

    // Clear previous focused elements
    const prev = this.liveContainer ? this.liveContainer.querySelectorAll('.focused-element') : [];
    prev.forEach(el => el.classList.remove('focused-element'));
    block.classList.add('focused-element');

    // Typewriter mode auto-scroll
    if (this.typewriterMode) {
      block.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  scheduleAutoSave() {
    this.onContentChange('Saving...');
    clearTimeout(this.autoSaveTimer);
    this.autoSaveTimer = setTimeout(() => {
      this.saveNow();
    }, 750);
  }

  async saveNow() {
    clearTimeout(this.autoSaveTimer);
    if (!this.currentDoc) return;

    const content = this.getContent();
    this.currentDoc.content = content;

    try {
      this.onContentChange('Saving...');
      await this.onSave(this.currentDoc);
      this.isDirty = false;
      this.onContentChange('Saved ✓');
    } catch (err) {
      console.error('Save failed:', err);
      this.onContentChange('Offline cached');
    }
  }

  setMode(mode) {
    this.currentMode = mode;

    const livePanel = document.getElementById('live-view-panel');
    const sourcePanel = document.getElementById('source-view-panel');
    const splitPanel = document.getElementById('split-view-panel');

    const liveBtn = document.getElementById('mode-live-btn');
    const sourceBtn = document.getElementById('mode-source-btn');
    const splitBtn = document.getElementById('mode-split-btn');

    [livePanel, sourcePanel, splitPanel].forEach(p => p && p.classList.remove('active'));
    [liveBtn, sourceBtn, splitBtn].forEach(b => b && b.classList.remove('active'));

    const content = this.getContent();

    if (mode === 'live') {
      if (livePanel) livePanel.classList.add('active');
      if (liveBtn) liveBtn.classList.add('active');
      if (this.liveContainer) this.liveContainer.innerHTML = TyporaMarkdown.render(content);
    } else if (mode === 'source') {
      if (sourcePanel) sourcePanel.classList.add('active');
      if (sourceBtn) sourceBtn.classList.add('active');
      if (this.sourceTextarea) {
        this.sourceTextarea.value = content;
        this.updateLineNumbers();
        this.sourceTextarea.focus();
      }
    } else if (mode === 'split') {
      if (splitPanel) splitPanel.classList.add('active');
      if (splitBtn) splitBtn.classList.add('active');
      if (this.splitSource) {
        this.splitSource.value = content;
        this.splitSource.focus();
      }
      if (this.splitPreview) {
        this.splitPreview.innerHTML = TyporaMarkdown.render(content);
      }
    }

    TyporaStorage.setSetting('active_mode', mode);
  }

  toggleMode() {
    if (this.currentMode === 'live') {
      this.setMode('source');
    } else {
      this.setMode('live');
    }
  }

  toggleFocusMode() {
    this.focusMode = !this.focusMode;
    document.body.classList.toggle('focus-mode', this.focusMode);
    const btn = document.getElementById('btn-focus-mode');
    if (btn) btn.classList.toggle('active', this.focusMode);
    TyporaStorage.setSetting('focus_mode', this.focusMode);
  }

  toggleTypewriterMode() {
    this.typewriterMode = !this.typewriterMode;
    document.body.classList.toggle('typewriter-mode', this.typewriterMode);
    const btn = document.getElementById('btn-typewriter-mode');
    if (btn) btn.classList.toggle('active', this.typewriterMode);
    TyporaStorage.setSetting('typewriter_mode', this.typewriterMode);
  }

  formatSelection(prefix, suffix = prefix, placeholder = 'text') {
    const textarea = this.currentMode === 'split' ? this.splitSource : this.sourceTextarea;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const val = textarea.value;

    const selectedText = val.substring(start, end) || placeholder;
    const replacement = `${prefix}${selectedText}${suffix}`;

    textarea.value = val.substring(0, start) + replacement + val.substring(end);
    textarea.selectionStart = start + prefix.length;
    textarea.selectionEnd = start + prefix.length + selectedText.length;
    textarea.focus();

    this.handleSourceInput(textarea.value);
  }

  insertHeading(level = 1) {
    const hashes = '#'.repeat(level) + ' ';
    this.formatSelection(hashes, '', `Heading ${level}`);
  }

  insertLink() {
    const url = prompt('Enter URL:', 'https://');
    if (url) {
      this.formatSelection('[', `](${url})`, 'Link Text');
    }
  }

  insertImage(url = '', alt = 'image') {
    if (!url) {
      url = prompt('Enter Image URL:', 'https://');
      if (!url) return;
    }
    const snippet = `![${alt}](${url})\n`;
    this.insertTextAtCursor(snippet);
  }

  insertTable(rows = 3, cols = 3) {
    let header = '|';
    let divider = '|';
    for (let c = 1; c <= cols; c++) {
      header += ` Column ${c} |`;
      divider += ' --- |';
    }
    let body = '';
    for (let r = 1; r <= rows; r++) {
      body += '|';
      for (let c = 1; c <= cols; c++) {
        body += ` Data |`;
      }
      body += '\n';
    }
    const tableMd = `\n${header}\n${divider}\n${body}\n`;
    this.insertTextAtCursor(tableMd);
  }

  insertMathBlock() {
    this.insertTextAtCursor('\n$$\n\\int_{-\\infty}^{+\\infty} e^{-x^2} dx = \\sqrt{\\pi}\n$$\n');
  }

  insertCodeBlock(lang = 'javascript') {
    this.insertTextAtCursor(`\n\`\`\`${lang}\nconsole.log("Hello, Typora!");\n\`\`\`\n`);
  }

  insertTaskList() {
    this.insertTextAtCursor('\n- [ ] First task\n- [ ] Second task\n- [x] Completed task\n');
  }

  insertTextAtCursor(text) {
    const textarea = this.currentMode === 'split' ? this.splitSource : this.sourceTextarea;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const val = textarea.value;

    textarea.value = val.substring(0, start) + text + val.substring(end);
    textarea.selectionStart = textarea.selectionEnd = start + text.length;
    textarea.focus();

    this.handleSourceInput(textarea.value);
  }

  async handlePaste(e) {
    if (!e.clipboardData || !e.clipboardData.items) return;
    const items = e.clipboardData.items;

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        e.preventDefault();
        const file = items[i].getAsFile();
        if (file) {
          this.uploadAndInsertImage(file);
        }
        break;
      }
    }
  }

  async handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();

    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file.type.startsWith('image/')) {
        this.uploadAndInsertImage(file);
      } else if (file.name.endsWith('.md')) {
        // Import dropped markdown file
        const imported = await apiClient.importFile(file);
        if (imported) {
          this.loadDocument(imported);
        }
      }
    }
  }

  async uploadAndInsertImage(file) {
    try {
      this.onContentChange('Uploading image...');
      const result = await apiClient.uploadFile(file);
      const url = result.url;
      const alt = file.name.replace(/\.[^/.]+$/, '');
      this.insertImage(url, alt);
      this.onContentChange('Image inserted');
    } catch (err) {
      console.error('Image upload failed:', err);
      alert('Failed to upload image');
    }
  }

  handleKeydown(e, textarea) {
    // Tab key indent
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const val = textarea.value;

      if (e.shiftKey) {
        // Outdent 2 spaces
        if (val.substring(start - 2, start) === '  ') {
          textarea.value = val.substring(0, start - 2) + val.substring(start);
          textarea.selectionStart = textarea.selectionEnd = start - 2;
        }
      } else {
        // Indent 2 spaces
        textarea.value = val.substring(0, start) + '  ' + val.substring(end);
        textarea.selectionStart = textarea.selectionEnd = start + 2;
      }
      this.handleSourceInput(textarea.value);
    }
  }

  updateLineNumbers() {
    if (!this.gutter || !this.sourceTextarea) return;
    const lines = this.sourceTextarea.value.split('\n').length;
    let numbers = '';
    for (let i = 1; i <= lines; i++) {
      numbers += `${i}<br>`;
    }
    this.gutter.innerHTML = numbers;
  }

  updateStats(text = '') {
    const chars = text.length;
    const words = (text.trim().match(/[\w\d\u00C0-\u024F\u4E00-\u9FFF\u3040-\u30FF]+/g) || []).length;
    const lines = text.split('\n').length;
    const readMinutes = Math.max(1, Math.ceil(words / 200));

    this.onStatsUpdate({ words, chars, lines, readMinutes });
  }

  scrollToHeading(headingId) {
    const target = document.getElementById(headingId);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      target.classList.add('focused-element');
      setTimeout(() => target.classList.remove('focused-element'), 1800);
    }
  }
}

window.TyporaEditor = TyporaEditor;
