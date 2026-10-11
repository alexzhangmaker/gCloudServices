// Markdown Parsing, KaTeX Math, Prism Syntax Highlighting, and Outline Extraction
(function() {
  // Configure marked
  if (typeof marked !== 'undefined') {
    marked.setOptions({
      gfm: true,
      breaks: true,
      pedantic: false
    });
  }

  function slugify(text) {
    return (text || '')
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  // Pre-process math so marked doesn't mangle LaTeX symbols like _, *, \, etc.
  function processMath(markdown) {
    const mathBlocks = [];
    const mathInlines = [];

    // Block math: $$ ... $$
    let text = markdown.replace(/\$\$([\s\S]+?)\$\$/g, (match, formula) => {
      const idx = mathBlocks.length;
      let rendered = '';
      try {
        if (typeof katex !== 'undefined') {
          rendered = katex.renderToString(formula.trim(), { displayMode: true, throwOnError: false });
        } else {
          rendered = `$$${formula}$$`;
        }
      } catch (err) {
        rendered = `<div class="katex-error">${formula}</div>`;
      }
      mathBlocks.push(`<div class="typora-math-block" data-raw-math="${encodeURIComponent(formula)}">${rendered}</div>`);
      return `%%MATHBLOCK_${idx}%%`;
    });

    // Inline math: $ ... $ (avoid matching \$ or currency like $100)
    text = text.replace(/(?<!\\)\$([^\$\n]+?)(?<!\\)\$/g, (match, formula) => {
      // Ignore if purely digits
      if (/^\s*\d+([\.,]\d+)?\s*$/.test(formula)) return match;
      const idx = mathInlines.length;
      let rendered = '';
      try {
        if (typeof katex !== 'undefined') {
          rendered = katex.renderToString(formula.trim(), { displayMode: false, throwOnError: false });
        } else {
          rendered = `$${formula}$`;
        }
      } catch (err) {
        rendered = formula;
      }
      mathInlines.push(`<span class="typora-math-inline" data-raw-math="${encodeURIComponent(formula)}">${rendered}</span>`);
      return `%%MATHINLINE_${idx}%%`;
    });

    return { text, mathBlocks, mathInlines };
  }

  function restoreMath(html, mathBlocks, mathInlines) {
    let result = html;
    mathBlocks.forEach((rendered, idx) => {
      result = result.replace(`%%MATHBLOCK_${idx}%%`, rendered);
    });
    mathInlines.forEach((rendered, idx) => {
      result = result.replace(`%%MATHINLINE_${idx}%%`, rendered);
    });
    return result;
  }

  // Process highlights ==mark==
  function processHighlights(text) {
    return text.replace(/==([^=\n]+)==/g, '<mark class="markdown-highlight">$1</mark>');
  }

  // Render markdown to full Typora HTML
  function renderMarkdown(markdown = '', options = {}) {
    if (!markdown.trim()) {
      return '<p class="empty-doc-placeholder" style="color:var(--theme-sidebar-muted); font-style:italic;">Type something to start writing...</p>';
    }

    const { text: processedText, mathBlocks, mathInlines } = processMath(markdown);
    const withHighlights = processHighlights(processedText);

    // Custom renderer for marked (compatible with marked v12-v18)
    const renderer = new marked.Renderer();

    // Headings with IDs for TOC outline navigation
    let headingCounter = 0;
    renderer.heading = function(token) {
      headingCounter++;
      let text = '';
      let depth = 1;
      let innerHtml = '';

      if (token && typeof token === 'object' && token.depth) {
        depth = token.depth;
        text = token.text || '';
        innerHtml = this.parser && token.tokens ? this.parser.parseInline(token.tokens) : text;
      } else {
        text = arguments[0] || '';
        depth = arguments[1] || 1;
        innerHtml = text;
      }

      const cleanText = text.replace(/<[^>]*>?/gm, '');
      const id = 'heading-' + headingCounter + '-' + (slugify(cleanText) || 'sec');
      return `<h${depth} id="${id}" data-heading-depth="${depth}">${innerHtml}</h${depth}>\n`;
    };

    // Task lists and list items
    let taskIndex = 0;
    renderer.listitem = function(item) {
      let content = '';
      let isTask = false;
      let isChecked = false;

      if (item && typeof item === 'object') {
        isTask = !!item.task;
        isChecked = !!item.checked;
        content = this.parser && item.tokens ? this.parser.parse(item.tokens) : (item.text || '');
      } else {
        content = item || '';
      }

      if (isTask) {
        const itemIndex = taskIndex++;
        const checkedAttr = isChecked ? 'checked' : '';
        const itemClass = isChecked ? 'task-list-item checked' : 'task-list-item';
        const cleanContent = content.replace(/^\s*<input[^>]*>/, '').trim();
        return `<li class="${itemClass}" data-task-index="${itemIndex}">
          <input type="checkbox" ${checkedAttr} data-task-idx="${itemIndex}" />
          <span>${cleanContent}</span>
        </li>\n`;
      }
      return `<li>${content}</li>\n`;
    };

    renderer.list = function(token) {
      let ordered = false;
      let start = '';
      let body = '';
      let isTaskList = false;

      if (token && typeof token === 'object' && Array.isArray(token.items)) {
        ordered = !!token.ordered;
        start = token.start;
        for (const item of token.items) {
          if (item.task) isTaskList = true;
          body += this.listitem(item);
        }
      } else {
        body = (typeof token === 'string' ? token : (token && token.body ? token.body : ''));
        ordered = !!(arguments[1] || (token && token.ordered));
        start = arguments[2] || (token && token.start);
        isTaskList = typeof body === 'string' && body.includes('class="task-list-item"');
      }

      const type = ordered ? 'ol' : 'ul';
      const listClass = isTaskList ? ' class="task-list"' : '';
      const startAttr = (ordered && start && start !== 1) ? ` start="${start}"` : '';
      return `<${type}${listClass}${startAttr}>\n${body}</${type}>\n`;
    };

    // Code blocks with syntax highlighting & Copy button
    renderer.code = function(token) {
      let text = '';
      let lang = '';

      if (token && typeof token === 'object') {
        text = token.text || '';
        lang = token.lang || '';
      } else {
        text = arguments[0] || '';
        lang = arguments[1] || '';
      }

      const cleanLang = (lang || '').toLowerCase().trim();
      let highlightedCode = '';

      if (cleanLang && typeof Prism !== 'undefined' && Prism.languages[cleanLang]) {
        try {
          highlightedCode = Prism.highlight(text, Prism.languages[cleanLang], cleanLang);
        } catch (e) {
          highlightedCode = escapeHtml(text);
        }
      } else {
        highlightedCode = escapeHtml(text);
      }

      const displayLang = cleanLang || 'plaintext';
      return `
        <div class="typora-code-block-wrapper">
          <div class="typora-code-block-header">
            <span>${displayLang}</span>
            <button type="button" class="typora-code-copy-btn" onclick="TyporaMarkdown.copyCodeBlock(this)">Copy</button>
          </div>
          <pre><code class="language-${cleanLang}">${highlightedCode}</code></pre>
        </div>
      `;
    };

    // Tables wrapped in responsive overflow container
    const defaultTable = renderer.table;
    renderer.table = function(token) {
      let tableHtml = '';
      try {
        tableHtml = defaultTable.call(this, token);
      } catch (e) {
        const header = token.header || '';
        const rows = token.rows || '';
        tableHtml = `<table><thead>${header}</thead><tbody>${rows}</tbody></table>`;
      }
      return `<div class="typora-table-wrapper">${tableHtml}</div>`;
    };

    let rawHtml = marked.parse(withHighlights, { renderer });
    let finalHtml = restoreMath(rawHtml, mathBlocks, mathInlines);

    // Sanitize with DOMPurify if available
    if (typeof DOMPurify !== 'undefined') {
      finalHtml = DOMPurify.sanitize(finalHtml, {
        ADD_TAGS: ['mark', 'span', 'div', 'input'],
        ADD_ATTR: ['id', 'class', 'data-heading-depth', 'data-task-index', 'data-task-idx', 'data-raw-math', 'checked', 'type', 'style']
      });
    }

    return finalHtml;
  }

  // Extract Table of Contents Outline
  function extractOutline(markdown = '') {
    const lines = markdown.split('\n');
    const outline = [];
    let counter = 0;
    let inCodeBlock = false;

    lines.forEach((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('```')) {
        inCodeBlock = !inCodeBlock;
        return;
      }
      if (inCodeBlock) return;

      const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
      if (headingMatch) {
        counter++;
        const depth = headingMatch[1].length;
        const rawTitle = headingMatch[2].trim();
        const cleanTitle = rawTitle.replace(/[*_~`]/g, '');
        const id = 'heading-' + counter + '-' + (slugify(cleanTitle) || 'sec');

        outline.push({
          id,
          depth,
          title: cleanTitle
        });
      }
    });

    return outline;
  }

  function copyCodeBlock(button) {
    const wrapper = button.closest('.typora-code-block-wrapper');
    if (!wrapper) return;
    const code = wrapper.querySelector('pre code');
    if (!code) return;

    navigator.clipboard.writeText(code.innerText).then(() => {
      const originalText = button.innerText;
      button.innerText = 'Copied!';
      setTimeout(() => {
        button.innerText = originalText;
      }, 1500);
    });
  }

  function escapeHtml(text = '') {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  window.TyporaMarkdown = {
    render: renderMarkdown,
    extractOutline,
    copyCodeBlock,
    slugify
  };
})();
