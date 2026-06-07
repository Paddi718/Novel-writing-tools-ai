/**
 * APP — 小说写作工具前端逻辑
 */
(function () {
  'use strict';
  console.log('[app.js] loaded');

  /* ================================================================
     状态
     ================================================================ */
  const state = {
    novels: [],
    currentNovelName: null,
    chapters: [],
    currentChapterId: null,
    isPreview: false,
    modified: false,
    aiSettings: null,
    chatOpen: false,
    chatWorking: false,
    novelSettings: { last_chapter_id: '', overview_view: 'grid', overview_reversed: false, sidebar_reversed: false },
    lastAIMode: 'chat',  // 跟踪最近一次 AI 交互模式
  };

  /* ================================================================
     DOM
     ================================================================ */
  const $ = (sel) => document.querySelector(sel);
  const dom = {};

  function cacheDom() {
    const ids = [
      'novelList', 'chapterSection', 'chapterList', 'searchInput', 'searchResults',
      'emptyState', 'novelOverview', 'editorPanel', 'chapterTitle',
      'editor', 'previewArea', 'wordCount', 'chapterStatus',
      'statusText', 'btnTheme', 'btnFocus', 'btnNewNovel', 'btnNewChapter', 'btnSave',
      'btnPreview', 'homeLink',
      'modalOverlay', 'newNovelForm', 'btnCancelModal',
      'newChapterOverlay', 'newChapterForm', 'newChapterTitle', 'btnCancelNewChapter',
      'btnSettings', 'settingsOverlay', 'settingsForm',
      'btnCancelSettings', 'selProvider', 'tempSlider', 'tempValue',
      'btnAIChat', 'chatDock', 'chatMessages', 'chatInput',
      'summarySection', 'summaryContent', 'btnRefreshSummary',
      'btnSend', 'btnCloseChat', 'chatModel', 'chatQuick',
      'btnExportDialog', 'btnReverseOrder', 'btnReverseSidebar', 'exportDialogOverlay', 'exportDialogList',
      'searchContext',
      'exportDialogCount', 'btnExportSelectAll', 'btnExportDeselectAll',
      'btnCancelExport', 'btnConfirmExport',
      'overviewTitle', 'overviewMeta', 'overviewDesc', 'overviewChapters',
      'overviewNovelSummary', 'overviewNSContent', 'overviewNSToggle', 'overviewExportBar',
      'btnEditNovel', 'editNovelOverlay', 'editNovelForm',
      'editNovelTitle', 'editNovelAuthor', 'editNovelDesc', 'btnCancelEditNovel',
      'summaryHeader', 'btnSummaryToggle', 'summaryResizeHandle',
    ];
    ids.forEach(id => { dom[id] = $(`#${id}`); });
    dom.apiKeyLabel = $('#apiKeyLabel');
  }

  /* ================================================================
     工具
     ================================================================ */
  function wordCount(text) {
    let count = 0;
    for (const ch of text) {
      if (ch >= '一' && ch <= '鿿' || ch >= '　' && ch <= '〿') count++;
      else if (/[a-zA-Z]/.test(ch)) count++;
    }
    return count;
  }

  function setStatus(msg) { dom.statusText.textContent = msg; }

  function showToast(msg, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = msg;
    container.appendChild(el);
    setTimeout(() => { if (el.parentNode) el.remove(); }, 3000);
  }

  function debounce(fn, ms) {
    let timer;
    return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function formatNum(n) {
    if (!n) return '0';
    if (n >= 10000) return (n / 10000).toFixed(1) + 'w';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
    return String(n);
  }

  /** 搜索结果高亮 */
  function highlightText(text, query) {
    if (!query) return escapeHtml(text);
    const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const re = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return escaped.replace(re, '<em>$1</em>');
  }

  /** 从结构化概要中提取【概要】部分 */
  function extractSummary(summary) {
    if (!summary) return '';
    const m = summary.match(/【概要】([\s\S]*?)(?=【|$)/);
    return m ? m[1].trim() : summary.trim();
  }

  /* ================================================================
     小说
     ================================================================ */
  async function loadNovels() {
    try {
      state.novels = await API.listNovels();
      renderNovelList();
      if (state.currentNovelName) {
        if (state.novels.find(n => n.name === state.currentNovelName)) {
          await loadChapters();
        } else {
          selectNovel(null);
        }
      }
    } catch (e) { console.error(e); setStatus('加载失败'); }
  }

  function renderNovelList() {
    // 下拉选择器
    let html = `<select class="novel-select" id="novelSelect">
      <option value="">— 选择小说 —</option>`;
    state.novels.forEach(n => {
      const sel = n.name === state.currentNovelName ? ' selected' : '';
      html += `<option value="${escapeHtml(n.name)}"${sel}>${escapeHtml(n.title)}</option>`;
    });
    html += `</select>`;
    // 当前小说详情 + 目录概览按钮
    const cur = state.novels.find(n => n.name === state.currentNovelName);
    if (cur) {
      html += `<div class="novel-info">
        <span class="novel-meta">${cur.chapter_count} 章 · ${formatNum(cur.total_words)} 字${cur.author ? ' · ' + escapeHtml(cur.author) : ''}</span>
      </div>`;
      html += `<button class="btn btn-overview" id="btnOverviewSidebar">📖 目录概览</button>`;
    }
    dom.novelList.innerHTML = html;

    const sel = document.getElementById('novelSelect');
    if (sel) {
      sel.addEventListener('change', () => {
        if (sel.value) selectNovel(sel.value);
      });
    }
    document.getElementById('btnOverviewSidebar')?.addEventListener('click', async () => {
      await goToOverview();
    });
  }

  async function selectNovel(name) {
    state.currentNovelName = name;
    state.currentChapterId = null;
    closeChat();
    hideEditor();
    hideOverview();
    if (!name) { showEmptyState(); renderNovelList(); return; }
    await loadChapters();
    renderNovelList();
    // 先从服务端加载设置（含 last_chapter_id 等）
    let overviewData = null;
    try {
      overviewData = await API.getNovelOverview(state.currentNovelName);
      if (overviewData) _applyNovelSettings(overviewData.settings || {});
    } catch { /* ignore */ }
    // 检查是否有上次编辑的章节
    const lastChapterId = state.novelSettings.last_chapter_id;
    const hasLastChapter = lastChapterId && state.chapters.some(c => c.id === lastChapterId);
    if (hasLastChapter) {
      // 有上次编辑记录 → 直接加载章节，跳过概览
      await selectChapter(lastChapterId);
    } else if (overviewData) {
      // 首次打开 → 显示目录概览
      renderNovelOverview(overviewData);
      showOverview();
    }
    // 恢复侧边栏逆序
    if (_sidebarReversed) {
      const items = [...dom.chapterList.querySelectorAll('.chapter-item')];
      items.reverse().forEach(el => dom.chapterList.appendChild(el));
    }
    setStatus(name);
  }

  async function createNovel(data) {
    try {
      await API.createNovel(data);
      await loadNovels();
      selectNovel(data.title);
      setStatus(`已创建「${data.title}」`);
    } catch (e) { setStatus(`创建失败：${e.message}`); }
  }

  async function deleteNovel(name) {
    if (!confirm(`删除「${name}」及其所有章节？不可撤销。`)) return;
    try {
      await API.deleteNovel(name);
      if (state.currentNovelName === name) selectNovel(null);
      await loadNovels();
      setStatus(`已删除`);
    } catch (e) { setStatus(`删除失败：${e.message}`); }
  }

  function openEditNovel() {
    const name = state.currentNovelName;
    if (!name) return;
    // 从 novels 列表中找到当前小说
    const novel = state.novels.find(n => n.name === name);
    if (!novel) return;
    dom.editNovelTitle.value = novel.title || '';
    dom.editNovelAuthor.value = novel.author || '';
    dom.editNovelDesc.value = novel.description || '';
    dom.editNovelOverlay.style.display = 'flex';
  }

  async function saveEditNovel(data) {
    const name = state.currentNovelName;
    if (!name) return;
    try {
      const result = await API.updateNovel(name, data);
      dom.editNovelOverlay.style.display = 'none';
      // 用新名称重新加载概览（名称可能因重命名变化）
      await selectNovel(result.name);
      setStatus(`已更新「${result.title}」`);
    } catch (e) { setStatus(`更新失败：${e.message}`); }
  }

  /* ================================================================
     章节
     ================================================================ */
  async function loadChapters() {
    if (!state.currentNovelName) return;
    try {
      const novel = await API.getNovel(state.currentNovelName);
      state.chapters = novel.chapters || [];
      dom.chapterSection.style.display = 'block';
      renderChapterList();
      if (state.currentChapterId) {
        if (state.chapters.find(c => c.id === state.currentChapterId)) {
          await loadChapterContent(state.currentChapterId);
        } else {
          state.currentChapterId = null;
          showEmptyState();
        }
      }
    } catch (e) { dom.chapterSection.style.display = 'none'; }
  }

  function renderChapterList() {
    dom.chapterList.innerHTML = state.chapters.map(ch =>
      `<div class="chapter-item ${ch.id === state.currentChapterId ? 'active' : ''}"
            data-id="${ch.id}" draggable="true">
        <span class="ch-order">${ch.order + 1}</span>
        <span class="ch-title">${escapeHtml(ch.title) || '（未命名）'}</span>
        <button class="ch-summary-btn" data-id="${ch.id}" title="AI 概要">📋</button>
        <span class="ch-wc">${formatNum(ch.word_count)}</span>
        <button class="ch-del" data-id="${ch.id}" title="删除">&times;</button>
      </div>`
    ).join('');
    setupDragSort();
    // 保持侧边栏逆序状态
    if (_sidebarReversed) {
      const items = [...dom.chapterList.querySelectorAll('.chapter-item')];
      items.reverse().forEach(el => dom.chapterList.appendChild(el));
    }
  }

  // 章节列表点击委托（在 bindEvents 中绑定一次）

  async function selectChapter(chapterId, searchQuery) {
    if (state.currentChapterId === chapterId && !searchQuery) return;
    resetChatState();
    closeChat();
    if (state.modified) {
      _savingWithoutReload = true;
      await saveCurrentChapter();
      _savingWithoutReload = false;
    }
    state.currentChapterId = chapterId;
    _pendingSearchQuery = searchQuery || '';
    hideOverview();
    _saveNovelSettings({ last_chapter_id: chapterId });
    await loadChapterContent(chapterId);
  }

  let _loadChapterReqId = 0;
  let _pendingSearchQuery = '';

  async function loadChapterContent(chapterId) {
    if (!state.currentNovelName || !chapterId) return;
    const reqId = ++_loadChapterReqId;
    try {
      const ch = await API.getChapter(state.currentNovelName, chapterId);
      if (_loadChapterReqId !== reqId) return;
      dom.chapterTitle.value = ch.title || '';
      dom.editor.value = ch.content || '';
      dom.editorPanel.style.display = 'flex';
      dom.emptyState.style.display = 'none';
      updateWordCount(ch.content || '');
      dom.chapterStatus.textContent = '';
      state.modified = false;
      dom.chapterList.querySelectorAll('.chapter-item').forEach(el =>
        el.classList.toggle('active', el.dataset.id === chapterId));
      focusEditor();
      // 跳转到搜索关键词位置（延时确保 textarea 布局完成）
      if (_pendingSearchQuery) {
        const query = _pendingSearchQuery;
        _pendingSearchQuery = '';
        setTimeout(() => {
          const ta = dom.editor;
          const idx = ta.value.toLowerCase().indexOf(query.toLowerCase());
          if (idx >= 0) {
            ta.selectionStart = idx;
            ta.selectionEnd = idx + query.length;
            // 行数 × 行高计算滚动位置
            const preText = ta.value.slice(0, idx);
            const lines = preText.split('\n').length;
            const lh = parseInt(getComputedStyle(ta).lineHeight) || 24;
            const target = Math.max(0, lines * lh - ta.clientHeight / 3);
            ta.scrollTop = target;
            // 聚焦确保选中可见
            ta.focus();
          }
        }, 100);
      }
      // 自动加载概要
      _loadSummaryIfExists(chapterId);
    } catch (e) {
      if (_loadChapterReqId === reqId) {
        setStatus(`加载失败：${e.message}`);
      }
    }
  }

  let _summaryCollapsed = false;

  function toggleSummaryCollapse() {
    _summaryCollapsed = !_summaryCollapsed;
    dom.summarySection.classList.toggle('collapsed', _summaryCollapsed);
  }

  function expandSummary() {
    _summaryCollapsed = false;
    dom.summarySection.classList.remove('collapsed');
    dom.summarySection.style.height = ''; // 恢复默认
  }

  async function _loadSummaryIfExists(chapterId) {
    if (!state.currentNovelName) return;
    expandSummary();
    try {
      const result = await API.getChapterSummary(state.currentNovelName, chapterId);
      if (result.summary) {
        dom.summaryContent.innerHTML = `<div class="summary-text">${renderMarkdown(result.summary)}</div>`;
        dom.summarySection.style.display = 'flex';
      } else {
        dom.summarySection.style.display = 'none';
      }
    } catch {
      dom.summarySection.style.display = 'none';
    }
  }

  let _savingWithoutReload = false;

  async function saveCurrentChapter() {
    if (!state.currentNovelName || !state.currentChapterId || !state.modified) return;
    try {
      await API.updateChapter(state.currentNovelName, state.currentChapterId, {
        title: dom.chapterTitle.value.trim() || '未命名章节',
        content: dom.editor.value,
      });
      state.modified = false;
      dom.chapterStatus.textContent = '已保存';
      updateWordCount(dom.editor.value);
      // 只更新章节列表显示（字数、标题），不重载编辑器内容
      if (!_savingWithoutReload) {
        const novel = await API.getNovel(state.currentNovelName);
        state.chapters = novel.chapters || [];
        renderChapterList();
      }
    } catch (e) { setStatus(`保存失败：${e.message}`); }
  }

  const autoSave = debounce(async () => {
    if (state.modified) {
      dom.chapterStatus.textContent = '💾 保存中…';
      dom.chapterStatus.style.color = 'var(--text-secondary)';
      await saveCurrentChapter();
      dom.chapterStatus.textContent = '✓ 已保存';
      dom.chapterStatus.style.color = 'var(--success)';
      setTimeout(() => { dom.chapterStatus.style.color = ''; }, 1500);
    }
  }, 1500);

  function openNewChapterModal() {
    if (!state.currentNovelName) { showToast('请先选择一部小说', 'error'); return; }
    dom.newChapterTitle.value = '';
    dom.newChapterOverlay.style.display = 'flex';
    setTimeout(() => dom.newChapterTitle.focus(), 100);
  }

  function closeNewChapterModal() {
    dom.newChapterOverlay.style.display = 'none';
  }

  async function createChapter(title) {
    if (!title || !state.currentNovelName) return;
    closeNewChapterModal();
    try {
      await API.createChapter(state.currentNovelName, { title });
      await loadChapters();
      const chapters = await API.listChapters(state.currentNovelName);
      const last = chapters[chapters.length - 1];
      if (last) await selectChapter(last.id);
      setStatus(`已添加「${title}」`);
    } catch (e) { setStatus(`创建失败：${e.message}`); }
  }

  async function deleteChapter(chapterId) {
    if (!confirm('确定删除？')) return;
    try {
      await API.deleteChapter(state.currentNovelName, chapterId);
      if (state.currentChapterId === chapterId) { state.currentChapterId = null; showEmptyState(); }
      await loadChapters();
      setStatus('已删除');
    } catch (e) { setStatus(`删除失败：${e.message}`); }
  }

  function setupDragSort() {
    let dragEl = null;
    dom.chapterList.querySelectorAll('.chapter-item').forEach(item => {
      item.addEventListener('dragstart', (e) => { dragEl = item; item.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; });
      item.addEventListener('dragend', () => { item.classList.remove('dragging'); document.querySelectorAll('.chapter-item').forEach(el => el.classList.remove('drag-over')); });
      item.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; document.querySelectorAll('.chapter-item').forEach(el => el.classList.remove('drag-over')); if (item !== dragEl) item.classList.add('drag-over'); });
      item.addEventListener('dragleave', () => item.classList.remove('drag-over'));
      item.addEventListener('drop', async (e) => {
        e.preventDefault(); item.classList.remove('drag-over');
        if (!dragEl || dragEl === item) return;
        const ids = state.chapters.map(c => c.id);
        const fi = ids.indexOf(dragEl.dataset.id), ti = ids.indexOf(item.dataset.id);
        if (fi === -1 || ti === -1) return;
        ids.splice(fi, 1); ids.splice(ti, 0, dragEl.dataset.id);
        try { await API.reorderChapters(state.currentNovelName, ids); await loadChapters(); setStatus('顺序已调整'); }
        catch (e) { setStatus('排序失败'); }
      });
    });
  }

  /* ================================================================
     概要
     ================================================================ */
  let _summaryLoading = false;

  async function toggleSummary(chapterId) {
    if (!state.currentNovelName) return;
    // 如果请求的就是当前选中的章节，跳转到概要区
    if (chapterId !== state.currentChapterId) {
      await selectChapter(chapterId);
    }
    dom.summarySection.style.display = 'flex';
    dom.summaryContent.textContent = '加载中…';
    _summaryLoading = true;
    try {
      const result = await API.getChapterSummary(state.currentNovelName, chapterId);
      if (result.summary) {
        dom.summaryContent.innerHTML = `<div class="summary-text">${renderMarkdown(result.summary)}</div>`;
      } else {
        dom.summaryContent.innerHTML = `<span class="summary-placeholder">暂无概要</span>`;
      }
    } catch (e) {
      dom.summaryContent.innerHTML = `<span class="summary-placeholder">生成失败：${e.message}</span>`;
    }
    _summaryLoading = false;
  }

  /* ================================================================
     编辑器
     ================================================================ */
  function updateWordCount(text) { dom.wordCount.textContent = formatNum(wordCount(text || '')) + ' 字'; }

  function updateSelectedCount() {
    const sel = getSelectedText();
    if (sel) {
      const wc = wordCount(sel);
      dom.wordCount.textContent = `${formatNum(wordCount(dom.editor.value))} 字（选中 ${formatNum(wc)} 字）`;
    } else {
      dom.wordCount.textContent = formatNum(wordCount(dom.editor.value)) + ' 字';
    }
  }

  function togglePreview() {
    state.isPreview = !state.isPreview;
    if (state.isPreview) {
      dom.editor.style.display = 'none';
      dom.previewArea.style.display = 'block';
      dom.btnPreview.textContent = '编辑';
      dom.previewArea.innerHTML = renderMarkdown(dom.editor.value);
    } else {
      dom.editor.style.display = 'block';
      dom.previewArea.style.display = 'none';
      dom.btnPreview.textContent = '预览';
      focusEditor();
    }
  }

  function renderMarkdown(text) {
    let h = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    h = h.replace(/```(\w*)\n([\s\S]*?)```/g, (_, l, c) => `<pre><code class="lang-${l}">${c.trim()}</code></pre>`);
    h = h.replace(/`([^`]+)`/g, '<code>$1</code>');
    h = h.replace(/^#### (.+)$/gm, '<h4>$1</h4>').replace(/^### (.+)$/gm, '<h3>$1</h3>');
    h = h.replace(/^## (.+)$/gm, '<h2>$1</h2>').replace(/^# (.+)$/gm, '<h1>$1</h1>');
    h = h.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');
    h = h.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    h = h.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>');
    h = h.replace(/^---$/gm, '<hr>');
    const lines = h.split('\n');
    let inB = false; const r = [];
    for (const line of lines) {
      if (line.startsWith('<pre>') || line.startsWith('<blockquote>') || line.startsWith('<h')) { r.push(line); inB = line.startsWith('<pre>') || line.startsWith('<blockquote>'); continue; }
      if (inB) { r.push(line); if (line.startsWith('</pre>') || line.startsWith('</blockquote>')) inB = false; continue; }
      if (line.trim() === '') r.push('</p><p>');
      else if (line.startsWith('<')) r.push(line);
      else r.push(line);
    }
    h = '<p>' + r.join('\n') + '</p>';
    h = h.replace(/<\/p><p><\/p><p>/g, '</p><p>').replace(/<p><\/p>/g, '').replace(/<p><hr><\/p>/g, '<hr>');
    return h;
  }

  function focusEditor() { dom.editor.focus(); }

  function showEmptyState() {
    dom.editorPanel.style.display = 'none';
    dom.novelOverview.style.display = 'none';
    dom.emptyState.style.display = 'flex';
    dom.summarySection.style.display = 'none';
    closeChat();
  }

  // ── 活动栏切换 ──
  function switchActivity(panelId) {
    document.querySelectorAll('.activity-btn').forEach(b => b.classList.toggle('active', b.dataset.panel === panelId));
    document.querySelectorAll('.sidebar-panel').forEach(p => p.classList.toggle('active', p.dataset.panel === panelId));
    if (panelId === 'search') {
      dom.searchInput?.focus();
    }
  }
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.activity-btn');
    if (btn) { e.preventDefault(); switchActivity(btn.dataset.panel); }
  });

  // ── 专注模式 ──
  let _focusMode = false;
  function toggleFocus() {
    _focusMode = !_focusMode;
    document.body.classList.toggle('focus-mode', _focusMode);
    dom.btnFocus.textContent = _focusMode ? '📖' : '🔲';
    dom.btnFocus.title = _focusMode ? '退出专注模式' : '专注模式';
    if (_focusMode) closeChat();
  }

  // ── 导出弹窗 ──
  function openExportDialog() {
    if (!state.currentNovelName || !state.chapters.length) {
      showToast('请先选择一部小说', 'error');
      return;
    }
    const chapters = state.chapters;
    dom.exportDialogList.innerHTML = chapters.map(ch =>
      `<label class="export-dialog-item">
        <input type="checkbox" class="edi-cb" data-id="${ch.id}" checked>
        <span class="edi-title">第${ch.order + 1}章 ${escapeHtml(ch.title)}</span>
        <span class="edi-wc">${formatNum(ch.word_count)} 字</span>
      </label>`
    ).join('');
    updateExportCount();
    dom.exportDialogOverlay.style.display = 'flex';
  }

  function updateExportCount() {
    const checked = dom.exportDialogList.querySelectorAll('.edi-cb:checked').length;
    dom.exportDialogCount.textContent = `已选 ${checked} 章`;
  }

  function closeExportDialog() {
    dom.exportDialogOverlay.style.display = 'none';
  }

  async function confirmExport() {
    const checked = [...dom.exportDialogList.querySelectorAll('.edi-cb:checked')];
    if (!checked.length) { showToast('请至少选择一章', 'error'); return; }
    const ids = checked.map(cb => cb.dataset.id);
    const name = state.currentNovelName;
    // 读取选中的导出格式
    const fmtEl = document.querySelector('input[name="exportFormat"]:checked');
    const fmt = fmtEl ? fmtEl.value : 'txt';
    closeExportDialog();
    try {
      const url = `/api/novels/${encodeURIComponent(name)}/export/zip-selected`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chapter_ids: ids, format: fmt }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || '导出失败');
      }
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${name}_selected.zip`;
      a.click();
      URL.revokeObjectURL(a.href);
      showToast(`已导出 ${ids.length} 章（${fmt.toUpperCase()}）`, 'success');
    } catch (e) {
      showToast('导出失败：' + e.message, 'error');
    }
  }

  // ── 章节逆序（各自独立，纯前端） ──
  let _sidebarReversed = false;
  let _overviewReversed = false;

  function reverseSidebar() {
    if (!state.chapters.length) return;
    _sidebarReversed = !_sidebarReversed;
    const chapters = [...state.chapters].reverse();
    // 重新渲染侧边栏
    dom.chapterList.innerHTML = chapters.map(ch =>
      `<div class="chapter-item ${ch.id === state.currentChapterId ? 'active' : ''}"
            data-id="${ch.id}" draggable="true">
        <span class="ch-order">${ch.order + 1}</span>
        <span class="ch-title">${escapeHtml(ch.title) || '（未命名）'}</span>
        <span class="ch-wc">${formatNum(ch.word_count)}</span>
        <button class="ch-del" data-id="${ch.id}" title="删除">&times;</button>
      </div>`
    ).join('');
    _saveNovelSettings({ sidebar_reversed: _sidebarReversed });
    showToast(_sidebarReversed ? '侧边栏已逆序' : '侧边栏已恢复', 'info');
  }

  function reverseOverview() {
    if (!state.currentNovelName) return;
    _overviewReversed = !_overviewReversed;
    const blocks = [...dom.overviewChapters.querySelectorAll('.overview-chapter-block')];
    blocks.reverse().forEach(el => dom.overviewChapters.appendChild(el));
    _saveNovelSettings({ overview_reversed: _overviewReversed });
    showToast(_overviewReversed ? '概览已逆序' : '概览已恢复', 'info');
  }

  // ── 主题切换 ──
  function initTheme() {
    const saved = localStorage.getItem('novel-theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const dark = saved ? saved === 'dark' : prefersDark;
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    dom.btnTheme.textContent = dark ? '☀️' : '🌙';
  }
  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const dark = current !== 'dark';
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    localStorage.setItem('novel-theme', dark ? 'dark' : 'light');
    dom.btnTheme.textContent = dark ? '☀️' : '🌙';
  }

  function hideEditor() {
    dom.editorPanel.style.display = 'none';
    dom.summarySection.style.display = 'none';
  }

  /** 从编辑器返回目录概览 */
  async function goToOverview() {
    if (!state.currentNovelName) return;
    if (state.currentChapterId && state.modified) {
      await saveCurrentChapter();
    }
    state.currentChapterId = null;
    hideEditor();
    closeChat();
    await loadNovelOverview();
  }

  // ── 小说目录概览 ──

  function showOverview() {
    dom.emptyState.style.display = 'none';
    dom.editorPanel.style.display = 'none';
    dom.novelOverview.style.display = 'block';
    dom.summarySection.style.display = 'none';
  }

  function hideOverview() {
    dom.novelOverview.style.display = 'none';
  }

  /** 应用小说设置：视图模式、逆序状态 */
  function _applyNovelSettings(settings) {
    if (!settings) return;
    state.novelSettings = {
      last_chapter_id: settings.last_chapter_id || '',
      overview_view: settings.overview_view || 'grid',
      overview_reversed: !!settings.overview_reversed,
      sidebar_reversed: !!settings.sidebar_reversed,
    };
    // 恢复概览视图模式
    const view = state.novelSettings.overview_view;
    const toggles = dom.overviewViewToggles;
    if (toggles) {
      toggles.querySelectorAll('.view-btn').forEach(b => b.classList.toggle('active', b.dataset.view === view));
    }
    dom.overviewChapters.classList.toggle('list-view', view === 'list');
    dom.overviewChapters.classList.toggle('grid-view', view === 'grid');
    // 恢复逆序状态（由各自的函数处理）
    _overviewReversed = state.novelSettings.overview_reversed;
    _sidebarReversed = state.novelSettings.sidebar_reversed;
  }

  /** 保存局部设置到后端（合并当前设置） */
  let _settingsSaveTimer = null;
  function _saveNovelSettings(partial) {
    if (!state.currentNovelName) return;
    // 先合并到内存
    Object.assign(state.novelSettings, partial);
    // 防抖保存
    clearTimeout(_settingsSaveTimer);
    _settingsSaveTimer = setTimeout(async () => {
      try {
        await API.updateNovelSettings(state.currentNovelName, state.novelSettings);
      } catch { /* 静默失败，不影响用户操作 */ }
    }, 500);
  }

  async function loadNovelOverview() {
    if (!state.currentNovelName) return;
    try {
      const data = await API.getNovelOverview(state.currentNovelName);
      renderNovelOverview(data);
      _applyNovelSettings(data.settings || {});
      // 恢复概览逆序
      if (_overviewReversed) {
        const blocks = [...dom.overviewChapters.querySelectorAll('.overview-chapter-block')];
        blocks.reverse().forEach(el => dom.overviewChapters.appendChild(el));
      }
      showOverview();
    } catch (e) {
      console.error(e);
      showEmptyState();
    }
  }

  function renderNovelOverview(data) {
    const name = state.currentNovelName;
    dom.overviewTitle.textContent = data.title || data.name;
    const metaParts = [];
    if (data.author) metaParts.push(`作者：${data.author}`);
    metaParts.push(`${data.chapter_count} 章 · ${formatNum(data.total_words)} 字`);
    if (data.updated_at) metaParts.push(`更新：${data.updated_at}`);
    dom.overviewMeta.textContent = metaParts.join('  ·  ');
    dom.overviewDesc.textContent = data.description || '';

    // 加载全文梗概
    API.getNovelSummary(name).then(result => {
      if (result.summary) {
        dom.overviewNSContent.innerHTML = renderMarkdown(result.summary);
        dom.overviewNSContent.classList.remove('expanded');
        dom.overviewNSToggle.textContent = '展开全部 ▼';
        dom.overviewNovelSummary.style.display = 'block';
      } else {
        dom.overviewNovelSummary.style.display = 'none';
      }
    }).catch(() => { dom.overviewNovelSummary.style.display = 'none'; });

    // 导出 + 全文梗概按钮
    dom.overviewExportBar.innerHTML = `
      <button class="btn btn-small btn-export" data-action="zip" data-format="txt">📦 导出 .txt</button>
      <button class="btn btn-small btn-export" data-action="zip" data-format="md">📦 导出 .md</button>
      <button class="btn btn-small btn-ai btn-export" data-action="summary">📖 全文梗概</button>
    `;
    dom.overviewExportBar.onclick = (e) => {
      const btn = e.target.closest('.btn-export');
      if (!btn) return;
      const cur = state.currentNovelName;
      if (!cur) return;
      if (btn.dataset.action === 'zip') API.exportNovelZip(cur, btn.dataset.format || 'txt');
      else if (btn.dataset.action === 'summary') {
        dom.overviewNSContent.textContent = '生成中…';
        dom.overviewNSContent.classList.remove('expanded');
        dom.overviewNSToggle.textContent = '展开全部 ▼';
        dom.overviewNovelSummary.style.display = 'block';
        API.getNovelSummary(cur).then(r => {
          dom.overviewNSContent.textContent = r.summary || '暂无足够概要生成全文梗概';
        }).catch(e => {
          dom.overviewNSContent.textContent = '生成失败：' + e.message;
        });
      }
    };

    dom.overviewChapters.innerHTML = data.chapters.map((ch, i) =>
      `<div class="overview-chapter-block" data-id="${ch.id}">
        <div class="ch-block-header">
          <span class="ch-block-order">第 ${i + 1} 章</span>
          <span class="ch-block-title">${escapeHtml(ch.title) || '（未命名）'}</span>
          <span class="ch-block-wc">${formatNum(ch.word_count)} 字</span>
          <button class="ch-download-btn" data-format="txt" title="下载 TXT">⬇️</button>
          <button class="ch-download-btn" data-format="md" title="下载 MD">📝</button>
        </div>
        <div class="ch-block-summary">${escapeHtml(extractSummary(ch.summary)) || ''}</div>
      </div>`
    ).join('');
  }

  /* ================================================================
     AI 聊天
     ================================================================ */
  let _chatChapterId = null; // 当前对话所属的章节 ID
  let _chatRequestId = 0;    // 每次 sendMessage 递增，用于忽略过期回调
  let _chatHistories = {};   // {chapterId: innerHTML} 按章节保存聊天历史

  function resetChatState() {
    state.chatWorking = false;
    state.lastAIMode = 'chat';
    dom.btnSend.disabled = false;
    _chatRequestId++; // 使之前所有 onChunk/onDone/onError 失效
  }

  function openChat(mode = 'chat', selectedText = '') {
    if (!state.currentNovelName || !state.currentChapterId) {
      setStatus('请先选择一个章节');
      return;
    }
    if (!state.aiSettings?.provider) {
      setStatus('请先在 ⚙️ 设置 中配置 AI');
      openSettings();
      return;
    }

    dom.chatDock.classList.add('open');
    state.chatOpen = true;
    dom.chatModel.textContent = modelLabel();

    // 切换章节：保存当前章节对话 + 恢复目标章节对话
    if (_chatChapterId !== state.currentChapterId) {
      // 保存当前章节的对话
      if (_chatChapterId) {
        _chatHistories[_chatChapterId] = dom.chatMessages.innerHTML;
      }
      // 恢复目标章节的历史对话
      if (_chatHistories[state.currentChapterId]) {
        dom.chatMessages.innerHTML = _chatHistories[state.currentChapterId];
        // 恢复的消息按钮丢失了事件监听，去掉
        dom.chatMessages.querySelectorAll('.msg-actions').forEach(el => el.remove());
        // 清除残留的加载动画
        dom.chatMessages.querySelectorAll('.typing-dots').forEach(el => el.textContent = '');
      } else {
        dom.chatMessages.innerHTML = '';
      }
      _chatChapterId = state.currentChapterId;
    }

    // 根据 mode 自动发送
    if (mode === 'chat') {
      // 只有空对话时才加欢迎语
      if (dom.chatMessages.children.length === 0) {
        addSystemMsg('随时可以向我提问，我会结合当前章节内容回答。');
      }
    } else {
      const modeNames = { continue: '续写', polish: '润色', expand: '扩写', condense: '缩写', rewrite: '重写', split: '拆分章节' };
      const label = modeNames[mode] || mode;
      let msg = '';

      if (mode === 'continue') {
        msg = '请根据当前章节内容续写下去，保持风格一致。';
        addSystemMsg('已将光标前的内容作为上下文发送给 AI。');
      } else if (mode === 'split') {
        msg = '请分析本章内容，建议一个合适的拆分位置（字数位置），并给出新章节的标题建议。';
        addSystemMsg('已发送当前章节内容进行分析。');
      } else if (mode === 'polish') {
        if (!selectedText) {
          const sel = getSelectedText();
          if (!sel) { setStatus('请先在编辑器中选中文本'); closeChat(); return; }
          selectedText = sel;
        }
        msg = `请润色以下文字，改进表达方式，不改变原意：\n\n${selectedText}`;
        addSystemMsg(`已发送选中文本（${wordCount(selectedText)} 字）进行「${label}」。`);
      } else {
        if (!selectedText) {
          const sel = getSelectedText();
          if (!sel) { setStatus('请先在编辑器中选中文本'); closeChat(); return; }
          selectedText = sel;
        }
        const hints = { expand: '扩写以下文字，增加细节描写', condense: '缩写以下文字，更加精炼', rewrite: '用不同的风格重写以下文字' };
        msg = `${hints[mode] || label}：\n\n${selectedText}`;
        addSystemMsg(`已发送选中文本（${wordCount(selectedText)} 字）进行「${label}」。`);
      }

      // 自动发送
      sendMessage(msg, mode, selectedText);
    }

    dom.chatInput.focus();
  }

  function closeChat() {
    // 关闭前保存当前章节的对话
    if (_chatChapterId) {
      _chatHistories[_chatChapterId] = dom.chatMessages.innerHTML;
    }
    resetChatState();
    dom.chatDock.classList.remove('open');
    state.chatOpen = false;
  }

  /** AI 在后台完成生成后，回填缓存的聊天历史 */
  function _finalizeChatHistory(chapterId, fullText) {
    if (!_chatHistories[chapterId]) return;
    const div = document.createElement('div');
    div.innerHTML = _chatHistories[chapterId];
    const msgs = div.querySelectorAll('.msg');
    const last = msgs[msgs.length - 1];
    if (last && last.classList.contains('assistant')) {
      const bubble = last.querySelector('.msg-bubble');
      if (bubble) {
        bubble.textContent = fullText;
        const dots = bubble.querySelector('.typing-dots');
        if (dots) dots.remove();
      }
    }
    _chatHistories[chapterId] = div.innerHTML;
  }

  function getSelectedText() {
    // 预览模式：从 DOM 选中获取
    if (state.isPreview) {
      const sel = window.getSelection();
      return sel?.toString()?.trim() || '';
    }
    // 编辑模式：从 textarea 选中获取
    const ta = dom.editor;
    return ta.value.slice(ta.selectionStart, ta.selectionEnd);
  }

  function modelLabel() {
    const s = state.aiSettings || {};
    if (s.provider === 'claude') return 'Claude CLI';
    if (s.provider === 'openai') return s.model || 'OpenAI';
    if (s.provider === 'anthropic') return s.model || 'Anthropic';
    return '';
  }

  async function sendMessage(msg, mode = 'chat', selectedText = '') {
    if (!msg.trim() || state.chatWorking) return;

    state.chatWorking = true;
    dom.btnSend.disabled = true;
    state.lastAIMode = mode;

    // 先把编辑器内容保存到磁盘，AI 才能读到
    if (state.modified) {
      await saveCurrentChapter();
    }

    // 添加用户消息
    addUserMsg(msg);

    // 添加 AI 占位消息
    const aiMsgEl = addAssistantMsg('');

    // 续写用全文做上下文；其他模式用光标位置
    const cursorPos = (mode === 'continue') ? -1 : (dom.editor.selectionStart || dom.editor.value.length);

    let fullText = '';
    const reqId = ++_chatRequestId;
    const originChapterId = state.currentChapterId;
    const onChunk = (chunk) => {
      if (_chatRequestId !== reqId) return;
      fullText += chunk;
      updateAssistantMsg(aiMsgEl, fullText);
    };
    const onDone = () => {
      if (_chatRequestId !== reqId) {
        // 切换章节后 AI 才完成 → 回填历史缓存 + 如果已切回则更新可见 DOM
        _finalizeChatHistory(originChapterId, fullText);
        if (state.currentChapterId === originChapterId && state.chatOpen) {
          const msgs = dom.chatMessages.querySelectorAll('.msg');
          const lastMsg = msgs[msgs.length - 1];
          if (lastMsg && lastMsg.classList.contains('assistant')) {
            const bubble = lastMsg.querySelector('.msg-bubble');
            if (bubble) bubble.textContent = fullText;
          }
        }
        state.chatWorking = false;
        dom.btnSend.disabled = false;
        return;
      }
      state.chatWorking = false;
      dom.btnSend.disabled = false;
      addApplyButton(aiMsgEl, fullText);
    };
    const onError = (err) => {
      if (_chatRequestId !== reqId) return;
      state.chatWorking = false;
      dom.btnSend.disabled = false;
      updateAssistantMsg(aiMsgEl, `错误：${err}`);
    };

    API.aiChat(
      state.currentNovelName,
      state.currentChapterId,
      { message: msg, mode, selected_text: selectedText, cursor_pos: cursorPos,
        target_length: state.aiSettings?.target_length || 0 },
      onChunk, onDone, onError
    );

    // 清空输入
    dom.chatInput.value = '';
    dom.chatInput.style.height = 'auto';
    scrollChat();
  }

  function addSystemMsg(text) {
    const el = document.createElement('div');
    el.className = 'msg system';
    el.innerHTML = `<div class="msg-bubble">${escapeHtml(text)}</div>`;
    dom.chatMessages.appendChild(el);
    scrollChat();
    return el;
  }

  function addUserMsg(text) {
    const el = document.createElement('div');
    el.className = 'msg user';
    el.innerHTML = `<div class="msg-label">我</div><div class="msg-bubble">${escapeHtml(text)}</div>`;
    dom.chatMessages.appendChild(el);
    scrollChat();
    return el;
  }

  function addAssistantMsg(text) {
    const el = document.createElement('div');
    el.className = 'msg assistant';
    el.innerHTML = `<div class="msg-label">AI 助手</div>
      <div class="msg-bubble" id="aiBubble">${escapeHtml(text) || '<span class="typing-dots"></span>'}</div>`;
    dom.chatMessages.appendChild(el);
    scrollChat();
    return el;
  }

  function updateAssistantMsg(el, text) {
    const bubble = el.querySelector('.msg-bubble') || el;
    bubble.textContent = text;
    scrollChat();
  }

  function addApplyButton(aiMsgEl, fullText) {
    if (!fullText.trim()) return;
    const isTitle = /^[^\n]{1,80}$/.test(fullText.trim());
    const isSplit = state.lastAIMode === 'split';

    const bubble = aiMsgEl.querySelector('.msg-bubble');
    const actions = document.createElement('div');
    actions.className = 'msg-actions';

    if (isSplit) {
      // 拆分模式：显示「执行拆分」按钮
      actions.innerHTML = `<button class="btn btn-small btn-accept btn-do-split">执行拆分</button>
        <button class="btn btn-small btn-reject">不要了</button>`;
      bubble.after(actions);
      actions.querySelector('.btn-do-split')
        ?.addEventListener('click', () => execSplit(fullText));
      actions.querySelector('.btn-reject')
        ?.addEventListener('click', () => { aiMsgEl.remove(); setStatus('已忽略'); });
    } else {
      actions.innerHTML = isTitle
        ? `<button class="btn btn-small btn-accept btn-set-title">设为标题</button>
           <button class="btn btn-small btn-apply-body">插入正文</button>
           <button class="btn btn-small btn-reject">不要了</button>`
        : `<button class="btn btn-small btn-accept btn-apply">插入正文</button>
           <button class="btn btn-small btn-set-title">设为标题</button>
           <button class="btn btn-small btn-reject">不要了</button>`;
      bubble.after(actions);
      actions.querySelector('.btn-apply, .btn-apply-body')
        ?.addEventListener('click', () => applyAIText(fullText));
      actions.querySelector('.btn-set-title')
        ?.addEventListener('click', () => applyAsTitle(fullText));
      actions.querySelector('.btn-reject')
        ?.addEventListener('click', () => { aiMsgEl.remove(); setStatus('已忽略'); });
    }
    scrollChat();
  }

  /** 执行章节拆分 */
  async function execSplit(aiResponse) {
    // 让用户确认拆分点
    const content = dom.editor.value;
    if (!content.trim()) { setStatus('章节为空，无法拆分'); return; }

    const mid = Math.floor(content.length / 2);
    const input = prompt(
      `AI 分析：\n${aiResponse.slice(0, 200)}\n---\n请输入拆分位置（字数，从0到${content.length}）：`,
      mid
    );
    if (input === null) return;
    const splitAt = parseInt(input, 10);
    if (isNaN(splitAt) || splitAt <= 0 || splitAt >= content.length) {
      setStatus('拆分位置不合法'); return;
    }

    const newTitle = prompt('新章节标题：', '');
    if (newTitle === null) return;

    try {
      setStatus('正在拆分…');
      const result = await API.splitChapter(
        state.currentNovelName, state.currentChapterId,
        { split_point: splitAt, new_title: newTitle }
      );
      setStatus(`已拆分为「${result.old_chapter.title}」和「${result.new_chapter.title}」`);
      await loadChapters();
      // 自动跳转到新章节
      await selectChapter(result.new_chapter.id);
    } catch (e) {
      setStatus(`拆分失败：${e.message}`);
    }
  }

  function applyAsTitle(text) {
    dom.chapterTitle.value = text.trim();
    state.modified = true;
    dom.chapterStatus.textContent = '未保存';
    setStatus('已设为章节标题');
  }

  function applyAIText(text) {
    if (!text) return;
    const cleaned = cleanAIText(text);
    if (!cleaned) { setStatus('AI 回复中没有可应用的正文'); return; }
    const ta = dom.editor;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const before = ta.value.slice(0, start);
    const after = ta.value.slice(end);
    ta.value = before + cleaned + after;
    ta.selectionStart = ta.selectionEnd = start + cleaned.length;
    state.modified = true;
    dom.chapterStatus.textContent = '未保存';
    updateWordCount(ta.value);
    setStatus(`已应用 ${wordCount(cleaned)} 字`);
    focusEditor();
  }

  /** 清洗 AI 输出：去掉引导语、备注、多余的标点 */
  function cleanAIText(text) {
    if (!text) return '';
    let t = text.trim();

    // 去掉引号包裹（AI 有时会把正文用引号括起来）
    if (t.startsWith('「') && t.endsWith('」')) t = t.slice(1, -1).trim();
    if (t.startsWith('"') && t.endsWith('"')) t = t.slice(1, -1).trim();
    if (t.startsWith('"') && t.endsWith('"')) t = t.slice(1, -1).trim();
    if (t.startsWith('「')) t = t.replace(/^「+/, '').trim();
    if (t.endsWith('」')) t = t.replace(/」+$/, '').trim();

    // 常见引导语前缀（逐行检查，去掉第一行如果是引导语）
    const LEADERS = [
      /^好的[，,、:：.。!！]*/,
      /^好的吧[，,、:：.。!！]*/,
      /^没问题[，,、:：.。!！]*/,
      /^当然[，,、:：.。!！]*/,
      /^可以[的了][，,、:：.。!！]*/,
      /^我来[为你给].*?[：:：]+\s*/,
      /^这是[你给].*?[：:：]+\s*/,
      /^以下[是为的给]?.*?[：:：]+\s*/,
      /^根据[你您]的.*?[，,][：:：]?\s*/,
      /^请看[：:：]+\s*/,
      /^(已为你|已经为你|为你|帮你).*?[：:：]+\s*/,
      /^[零一二三四五六七八九十]+[、.．,，].*?[：:：]+\s*/,
      /^步骤[一二三四五六七八九十]?[：:：]+\s*/,
      /^回复[：:：]*\s*/,
      /^答案[：:：]*\s*/,
      /^结果[：:：]*\s*/,
      /^修改[后版]?[：:：]*\s*/,
      /^润色[后版]?[：:：]*\s*/,
      /^扩写[后版]?[：:：]*\s*/,
      /^缩写[后版]?[：:：]*\s*/,
      /^重写[后版]?[：:：]*\s*/,
      /^续写[结果内容]?[：:：]*\s*/,
      /^当然[可以没问题][，,。.]*\s*/,
      /^好[的吧了][，,。.]*\s*/,
      /^为您.*?[：:：]+\s*/,
      /^为你.*?[：:：]+\s*/,
    ];

    const lines = t.split('\n');
    // 检查第一行是否匹配引导语
    if (lines.length > 1) {
      const first = lines[0].trim();
      let isLeader = false;
      for (const re of LEADERS) {
        if (re.test(first)) { isLeader = true; break; }
      }
      // 也检查一些纯引导性质的关键词
      if (/^(好的|没问题|当然|可以|请看|以下|这是我|我来|已为你)/.test(first)) isLeader = true;
      if (isLeader) {
        lines.shift();
        t = lines.join('\n').trim();
      }
    } else {
      // 单行也尝试清洗
      for (const re of LEADERS) {
        t = t.replace(re, '').trim();
      }
    }

    // 去掉末尾的询问/备注
    t = t.replace(/\n*你觉得怎么样[？?].*$/, '');
    t = t.replace(/\n*如果需要[，,].*$/, '');
    t = t.replace(/\n*希望[这这对].*$/, '');
    t = t.replace(/\n*如有[需要疑问问题].*$/, '');
    t = t.replace(/\n*请[告诉告知让我知道].*$/, '');
    t = t.replace(/\(.*?\)/g, '');  // 去掉括号备注 (笑) (注) 等
    t = t.replace(/（.*?）/g, '');  // 去掉中文括号备注

    return t.trim();
  }

  function scrollChat() {
    dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;
  }

  /* ================================================================
     AI 设置
     ================================================================ */
  async function loadSettings() {
    try {
      state.aiSettings = await API.getSettings();
    } catch {
      state.aiSettings = { provider: 'claude', api_key: '', api_base: '', model: '', max_tokens: 4096, temperature: 0.7 };
    }
  }

  function openSettings() {
    const s = state.aiSettings || {};
    dom.selProvider.value = s.provider || 'claude';
    dom.settingsForm.querySelector('[name="api_key"]').value = s.api_key || '';
    dom.settingsForm.querySelector('[name="api_base"]').value = s.api_base || '';
    dom.settingsForm.querySelector('[name="model"]').value = s.model || '';
    dom.settingsForm.querySelector('[name="max_tokens"]').value = s.max_tokens || 4096;
    dom.settingsForm.querySelector('[name="target_length"]').value = s.target_length || 0;
    dom.settingsForm.querySelector('[name="writing_instruction"]').value = s.writing_instruction || '';
    dom.tempSlider.value = s.temperature ?? 0.7;
    dom.tempValue.textContent = (s.temperature ?? 0.7).toFixed(2);
    toggleApiKeyField(s.provider || 'claude');
    dom.settingsOverlay.style.display = 'flex';
  }

  function closeSettings() { dom.settingsOverlay.style.display = 'none'; }

  function toggleApiKeyField(provider) { dom.apiKeyLabel.style.display = provider === 'claude' ? 'none' : 'block'; }

  async function saveSettings(data) {
    try {
      state.aiSettings = await API.updateSettings(data);
      setStatus('AI 设置已保存');
      closeSettings();
      if (state.chatOpen) dom.chatModel.textContent = modelLabel();
    } catch (e) { setStatus(`保存失败：${e.message}`); }
  }

  /* ================================================================
     键盘
     ================================================================ */
  function setupKeyboard() {
    document.addEventListener('keydown', (e) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key === 's') { e.preventDefault(); saveCurrentChapter(); }
      if (ctrl && e.shiftKey && e.key === 'F') { e.preventDefault(); toggleFocus(); }
      if (ctrl && e.shiftKey && e.key === 'D') { e.preventDefault(); toggleTheme(); }
      if (ctrl && e.key === 'f' && !state.isPreview) {
        e.preventDefault();
        switchActivity('search');
        setTimeout(() => { dom.searchInput?.focus(); dom.searchInput?.select(); }, 50);
      }
      if (e.key === 'Escape') {
        if (_focusMode) { toggleFocus(); return; }
        if (state.chatOpen) { closeChat(); focusEditor(); }
      }
    });

    // 关闭页面时提醒未保存
    window.addEventListener('beforeunload', (e) => {
      if (state.modified) {
        e.preventDefault();
        e.returnValue = '';
      }
    });

    // Chat 输入框 Enter 发送
    dom.chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!state.chatWorking && dom.chatInput.value.trim()) {
          sendMessage(dom.chatInput.value);
        }
      }
    });

    // 自动调整输入框高度
    dom.chatInput.addEventListener('input', () => {
      dom.chatInput.style.height = 'auto';
      dom.chatInput.style.height = Math.min(dom.chatInput.scrollHeight, 120) + 'px';
      dom.btnSend.disabled = !dom.chatInput.value.trim() || state.chatWorking;
    });
  }

  /* ================================================================
     事件
     ================================================================ */
  function bindEvents() {
    // 小说目录概览 — 视图切换
    dom.overviewViewToggles = dom.overviewChapters.parentElement.querySelector('.overview-view-toggles');
    if (dom.overviewViewToggles) {
      dom.overviewViewToggles.addEventListener('click', (e) => {
        const btn = e.target.closest('.view-btn');
        if (!btn) return;
        dom.overviewViewToggles.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const view = btn.dataset.view; // 'list' or 'grid'
        dom.overviewChapters.classList.toggle('list-view', view === 'list');
        dom.overviewChapters.classList.toggle('grid-view', view === 'grid');
        _saveNovelSettings({ overview_view: view });
      });
    }

    // ── 搜索 ──
    let _searchTimer = null;
    let _searchScope = 'all';
    let _lastSearchQuery = '';  // 记住最后搜索的词

    function updateSearchContext() {
      const ctx = dom.searchContext;
      if (!state.currentNovelName) {
        ctx.textContent = '请先选择一部小说';
        return;
      }
      if (_searchScope === 'chapter' && state.currentChapterId) {
        const ch = state.chapters.find(c => c.id === state.currentChapterId);
        ctx.textContent = `《${state.currentNovelName}》 → 第${ch ? ch.order + 1 : '?'}章`;
      } else {
        ctx.textContent = `《${state.currentNovelName}》 — 全部章节`;
      }
    }

    /** 执行搜索（复用当前搜索词和范围） */
    async function _doSearch() {
      const q = dom.searchInput.value.trim();
      if (!q || !state.currentNovelName) {
        dom.searchResults.classList.remove('has-results');
        dom.searchResults.innerHTML = '';
        return;
      }
      _lastSearchQuery = q;
      try {
        const params = `q=${encodeURIComponent(q)}&scope=${_searchScope}`;
        const cid = (_searchScope === 'chapter') ? state.currentChapterId : '';
        const url = `/api/novels/${encodeURIComponent(state.currentNovelName)}/search?${params}${cid ? `&chapter_id=${cid}` : ''}`;
        const res = await fetch(url);
        const data = await res.json();
        if (data.results.length === 0) {
          dom.searchResults.innerHTML = '<div class="search-result-empty">未找到匹配内容</div>';
          dom.searchResults.classList.add('has-results');
          return;
        }
        dom.searchResults.innerHTML = data.results.map(r =>
          `<div class="search-result-item" data-chapter="${r.chapter_id}">
            <div class="sr-chapter">第${r.chapter_order+1}章 ${r.chapter_title}（${r.match_count}处）</div>
            <div class="sr-snippet">${highlightText(r.snippet, q)}</div>
          </div>`
        ).join('');
        dom.searchResults.classList.add('has-results');
      } catch { /* ignore */ }
    }

    // 输入时触发搜索
    dom.searchInput.addEventListener('input', () => {
      clearTimeout(_searchTimer);
      const q = dom.searchInput.value.trim();
      if (!q || !state.currentNovelName) {
        dom.searchResults.classList.remove('has-results');
        dom.searchResults.innerHTML = '';
        return;
      }
      _searchTimer = setTimeout(_doSearch, 300);
    });

    // 点击结果 → 跳转章节，保留搜索面板
    dom.searchResults.addEventListener('click', (e) => {
      const item = e.target.closest('.search-result-item');
      if (item) {
        const q = dom.searchInput.value.trim();
        selectChapter(item.dataset.chapter, q);
      }
    });

    // 点击搜索面板外部关闭
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.sidebar-panel[data-panel="search"]') &&
          !e.target.closest('.activity-bar')) {
        dom.searchResults.classList.remove('has-results');
      }
    });

    // 检索范围切换 → 保留搜索词，立即重新搜索
    document.querySelector('.search-scope')?.addEventListener('click', async (e) => {
      const btn = e.target.closest('.scope-btn');
      if (!btn) return;
      document.querySelectorAll('.scope-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _searchScope = btn.dataset.scope;
      dom.searchInput.placeholder = _searchScope === 'all' ? '搜索所有章节…' : '搜索当前章节…';
      updateSearchContext();
      dom.searchInput.focus();
      // 如果已有搜索词，自动重新搜索
      if (dom.searchInput.value.trim()) {
        await _doSearch();
      }
    });

    // 小说/章节变化时更新搜索上下文和结果
    const _origSelectNovel = selectNovel;
    selectNovel = function(name) {
      _origSelectNovel(name);
      setTimeout(() => {
        updateSearchContext();
        if (dom.searchInput.value.trim()) _doSearch();
      }, 200);
    };
    const _origSelectChapter = selectChapter;
    selectChapter = function(id, searchQuery) {
      _origSelectChapter(id, searchQuery);
      setTimeout(() => {
        updateSearchContext();
        // 本章检索模式下，切换章节后重新搜索
        if (_searchScope === 'chapter' && dom.searchInput.value.trim()) _doSearch();
      }, 400);
    };

    // 小说目录概览 — 点击章节块进入编辑 / 下载按钮
    dom.overviewChapters.addEventListener('click', (e) => {
      const dl = e.target.closest('.ch-download-btn');
      if (dl) {
        e.stopPropagation();
        const block = dl.closest('.overview-chapter-block');
        if (block && state.currentNovelName) {
          API.downloadChapter(state.currentNovelName, block.dataset.id, dl.dataset.format || 'txt');
        }
        return;
      }
      const block = e.target.closest('.overview-chapter-block');
      if (block) selectChapter(block.dataset.id);
    });

    // 章节列表事件委托（只绑定一次）
    dom.chapterList.addEventListener('click', (e) => {
      const d = e.target.closest('.ch-del');
      if (d) { e.stopPropagation(); deleteChapter(d.dataset.id); return; }
      const s = e.target.closest('.ch-summary-btn');
      if (s) { e.stopPropagation(); toggleSummary(s.dataset.id); return; }
      const item = e.target.closest('.chapter-item');
      if (item) selectChapter(item.dataset.id);
    });

    // 新建小说
    dom.btnCancelModal.addEventListener('click', () => dom.modalOverlay.style.display = 'none');
    dom.modalOverlay.addEventListener('click', (e) => { if (e.target === dom.modalOverlay) dom.modalOverlay.style.display = 'none'; });
    dom.newNovelForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(dom.newNovelForm));
      dom.modalOverlay.style.display = 'none';
      await createNovel(data);
    });

    // 新建章节弹窗
    dom.btnCancelNewChapter.addEventListener('click', closeNewChapterModal);
    dom.newChapterOverlay.addEventListener('click', (e) => {
      if (e.target === dom.newChapterOverlay) closeNewChapterModal();
    });
    dom.newChapterForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = dom.newChapterTitle.value.trim();
      if (title) await createChapter(title);
    });
    dom.newChapterTitle.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        dom.newChapterForm.requestSubmit();
      }
    });

    dom.btnNewChapter.addEventListener('click', openNewChapterModal);
    dom.btnSave.addEventListener('click', saveCurrentChapter);
    dom.btnPreview.addEventListener('click', togglePreview);

    dom.homeLink.addEventListener('click', (e) => { e.preventDefault(); selectNovel(null); });

    dom.editor.addEventListener('input', () => {
      state.modified = true;
      dom.chapterStatus.textContent = '未保存';
      updateWordCount(dom.editor.value);
      autoSave();
    });
    // 选中文本时显示选中字数
    dom.editor.addEventListener('select', updateSelectedCount);
    document.addEventListener('selectionchange', updateSelectedCount);
    dom.chapterTitle.addEventListener('input', () => { state.modified = true; dom.chapterStatus.textContent = '未保存'; });

    dom.novelList.addEventListener('contextmenu', (e) => {
      if (!state.currentNovelName) return;
      e.preventDefault();
      if (confirm(`删除「${state.currentNovelName}」？`)) deleteNovel(state.currentNovelName);
    });

    // 主题切换
    dom.btnTheme.addEventListener('click', toggleTheme);
    // 专注模式
    dom.btnFocus.addEventListener('click', toggleFocus);
    // 导出弹窗
    dom.btnExportDialog.addEventListener('click', openExportDialog);
    dom.btnCancelExport.addEventListener('click', closeExportDialog);
    dom.btnConfirmExport.addEventListener('click', confirmExport);
    dom.exportDialogOverlay.addEventListener('click', (e) => {
      if (e.target === dom.exportDialogOverlay) closeExportDialog();
    });
    dom.exportDialogList.addEventListener('change', updateExportCount);
    dom.btnExportSelectAll.addEventListener('click', () => {
      dom.exportDialogList.querySelectorAll('.edi-cb').forEach(cb => cb.checked = true);
      updateExportCount();
    });
    dom.btnExportDeselectAll.addEventListener('click', () => {
      dom.exportDialogList.querySelectorAll('.edi-cb').forEach(cb => cb.checked = false);
      updateExportCount();
    });
    // 导出格式选择高亮
    document.querySelector('.export-format-select')?.addEventListener('click', (e) => {
      const label = e.target.closest('.export-format-option');
      if (!label) return;
      document.querySelectorAll('.export-format-option').forEach(el => el.classList.remove('active'));
      label.classList.add('active');
    });
    // 全文梗概展开/收起
    dom.overviewNSToggle.addEventListener('click', () => {
      const expanded = dom.overviewNSContent.classList.toggle('expanded');
      dom.overviewNSToggle.textContent = expanded ? '收起 ▲' : '展开全部 ▼';
    });

    // 逆序排列（各自独立）
    dom.btnReverseOrder.addEventListener('click', reverseOverview);
    dom.btnReverseSidebar.addEventListener('click', reverseSidebar);

    // AI 设置
    dom.btnSettings.addEventListener('click', () => { try { openSettings(); } catch (e) { console.error(e); setStatus('设置出错'); } });
    dom.btnNewNovel.addEventListener('click', () => { try { dom.modalOverlay.style.display = 'flex'; } catch (e) { console.error(e); } });
    dom.btnCancelSettings.addEventListener('click', closeSettings);
    dom.settingsOverlay.addEventListener('click', (e) => { if (e.target === dom.settingsOverlay) closeSettings(); });
    dom.selProvider.addEventListener('change', (e) => toggleApiKeyField(e.target.value));
    dom.tempSlider.addEventListener('input', () => { dom.tempValue.textContent = parseFloat(dom.tempSlider.value).toFixed(2); });
    dom.settingsForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(dom.settingsForm));
      data.max_tokens = parseInt(data.max_tokens, 10) || 4096;
      data.temperature = parseFloat(data.temperature) || 0.7;
      data.target_length = parseInt(data.target_length, 10) || 0;
      saveSettings(data);
    });

    // 编辑小说
    dom.btnEditNovel.addEventListener('click', openEditNovel);
    dom.btnCancelEditNovel.addEventListener('click', () => { dom.editNovelOverlay.style.display = 'none'; });
    dom.editNovelOverlay.addEventListener('click', (e) => { if (e.target === dom.editNovelOverlay) dom.editNovelOverlay.style.display = 'none'; });
    dom.editNovelForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(dom.editNovelForm));
      await saveEditNovel(data);
    });

    // AI 聊天
    dom.btnAIChat.addEventListener('click', () => {
      if (state.chatOpen) { closeChat(); }
      else { openChat('chat'); }
    });
    dom.btnCloseChat.addEventListener('click', closeChat);

    // 刷新概要
    dom.btnRefreshSummary.addEventListener('click', async () => {
      if (!state.currentChapterId || _summaryLoading) return;
      dom.summaryContent.textContent = '重新生成中…';
      try {
        const result = await API.refreshSummary(state.currentNovelName, state.currentChapterId);
        if (result.summary) {
          dom.summaryContent.innerHTML = `<div class="summary-text">${renderMarkdown(result.summary)}</div>`;
        } else {
          dom.summaryContent.innerHTML = `<span class="summary-placeholder">生成失败</span>`;
        }
      } catch (e) {
        dom.summaryContent.innerHTML = `<span class="summary-placeholder">${e.message}</span>`;
      }
    });

    // 概要折叠/展开
    const toggleSummaryFn = () => toggleSummaryCollapse();
    dom.summaryHeader.addEventListener('click', toggleSummaryFn);
    dom.btnSummaryToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleSummaryCollapse();
    });

    // 概要拖拽调整高度
    let _resizeStartY = 0, _resizeStartH = 0;
    dom.summaryResizeHandle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      _resizeStartY = e.clientY;
      _resizeStartH = dom.summarySection.offsetHeight;
      dom.summarySection.classList.add('resizing');
      document.addEventListener('mousemove', _onResizeMove);
      document.addEventListener('mouseup', _onResizeUp);
    });
    function _onResizeMove(e) {
      const delta = e.clientY - _resizeStartY;
      const newH = Math.min(Math.max(_resizeStartH - delta, 80), 500);
      dom.summarySection.style.height = newH + 'px';
    }
    function _onResizeUp() {
      dom.summarySection.classList.remove('resizing');
      document.removeEventListener('mousemove', _onResizeMove);
      document.removeEventListener('mouseup', _onResizeUp);
    }

    dom.btnSend.addEventListener('click', () => {
      if (dom.chatInput.value.trim()) sendMessage(dom.chatInput.value);
    });

    // 快捷按钮
    // 下拉菜单切换
    document.addEventListener('click', (e) => {
      const menu = document.getElementById('aiDropdownMenu');
      if (menu && !e.target.closest('.ai-dropdown')) {
        menu.classList.remove('show');
      }
    });
    document.getElementById('aiQuickBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      document.getElementById('aiDropdownMenu')?.classList.toggle('show');
    });

    dom.chatQuick.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-mode]');
      if (!btn) return;
      // 关闭下拉菜单
      document.getElementById('aiDropdownMenu')?.classList.remove('show');
      if (state.chatWorking) return;
      const mode = btn.dataset.mode;
      const sel = getSelectedText();
      // 如果已打开则复用，否则打开并自动发送
      if (!state.chatOpen) {
        openChat(mode, sel);
      } else {
        // 已在聊天中，直接发送
        const modeNames = { continue: '续写', polish: '润色', expand: '扩写', condense: '缩写', rewrite: '重写', split: '拆分章节' };
        let msg;
        if (mode === 'continue') {
          addSystemMsg('已根据当前章节续写。');
          msg = '请继续写下去，保持风格一致。';
        } else if (mode === 'split') {
          addSystemMsg('正在分析章节结构…');
          msg = '请分析本章内容，建议一个合适的拆分位置和标题。';
        } else if (!sel) {
          setStatus('请先在编辑器中选中文本');
          return;
        } else if (mode === 'polish') {
          msg = `请润色以下文字：\n\n${sel}`;
        } else {
          const hints = { expand: '请扩写', condense: '请缩写', rewrite: '请重写' };
          msg = `${hints[mode] || ''}以下文字：\n\n${sel}`;
        }
        sendMessage(msg, mode, sel);
      }
    });
  }

  /* ================================================================
     启动
     ================================================================ */
  async function init() {
    try {
      console.log('[app.js] init() start');
      cacheDom();
      console.log('[app.js] cacheDom done');
      initTheme();
      setupKeyboard();
      console.log('[app.js] setupKeyboard done');
      bindEvents();
      console.log('[app.js] bindEvents done');
      await loadSettings();
      await loadNovels();
      setStatus('就绪');
    } catch (e) {
      console.error('[FATAL] init error:', e);
      setStatus('初始化失败: ' + e.message);
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
