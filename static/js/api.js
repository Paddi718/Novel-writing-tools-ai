/**
 * API 封装 — 所有后端接口
 */
const API = (() => {
  const BASE = '';

  async function request(method, path, body) {
    const opts = { method, headers: {} };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(BASE + path, opts);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || `HTTP ${res.status}`);
    }
    return res.json();
  }

  return {
    // ── 小说 ──
    listNovels:     ()           => request('GET',  '/api/novels'),
    createNovel:    (data)       => request('POST', '/api/novels', data),
    getNovel:       (name)       => request('GET',  `/api/novels/${encodeURIComponent(name)}`),
    getNovelOverview:(name)      => request('GET',  `/api/novels/${encodeURIComponent(name)}/overview`),
    updateNovel:    (name, data) => request('PUT',  `/api/novels/${encodeURIComponent(name)}`, data),
    deleteNovel:    (name)       => request('DELETE', `/api/novels/${encodeURIComponent(name)}`),

    // ── 章节 ──
    listChapters:   (name)        => request('GET',   `/api/novels/${encodeURIComponent(name)}/chapters`),
    createChapter:  (name, data)  => request('POST',  `/api/novels/${encodeURIComponent(name)}/chapters`, data),
    getChapter:     (name, chId)  => request('GET',   `/api/novels/${encodeURIComponent(name)}/chapters/${chId}`),
    updateChapter:  (name, chId, data) => request('PUT', `/api/novels/${encodeURIComponent(name)}/chapters/${chId}`, data),
    deleteChapter:  (name, chId)  => request('DELETE',`/api/novels/${encodeURIComponent(name)}/chapters/${chId}`),
    reorderChapters:(name, order) => request('PUT',   `/api/novels/${encodeURIComponent(name)}/chapters/reorder`, { order }),

    // ── AI 聊天 ──
    /**
     * 发送消息给 AI 写作助手，流式接收回复
     * @param {string} name 小说名
     * @param {string} chId 章节 ID
     * @param {object} data { message, mode, selected_text, cursor_pos }
     * @param {function} onChunk 收到文本块回调
     * @param {function} onDone 完成回调
     * @param {function} onError 错误回调
     */
    aiChat(name, chId, data, onChunk, onDone, onError) {
      const encoded = encodeURIComponent(name);
      const url = BASE + `/api/novels/${encoded}/chapters/${chId}/ai/chat`;

      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(async (res) => {
        if (!res.ok) {
          const err = await res.json().catch(() => ({ detail: res.statusText }));
          throw new Error(err.detail || `HTTP ${res.status}`);
        }
        return _readSSEStream(res, onChunk, onDone);
      }).catch((err) => {
        onError?.(err.message);
      });
    },

    // ── 章节概要 ──
    getChapterSummary: (name, chId) => request('GET', `/api/novels/${encodeURIComponent(name)}/chapters/${chId}/summary`),
    refreshSummary:    (name, chId) => request('POST', `/api/novels/${encodeURIComponent(name)}/chapters/${chId}/summary`),

    // ── 章节拆分 ──
    splitChapter: (name, chId, data) => request('POST', `/api/novels/${encodeURIComponent(name)}/chapters/${chId}/split`, data),

    // ── 设置 ──
    getSettings:    () => request('GET',  '/api/settings'),
    updateSettings: (d) => request('PUT',  '/api/settings', d),
  };

  async function _readSSEStream(res, onChunk, onDone) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (trimmed === 'event: start' || trimmed === 'event: done') {
          if (trimmed === 'event: done') onDone?.();
          continue;
        }
        if (trimmed.startsWith('data: ')) {
          try {
            const parsed = JSON.parse(trimmed.slice(6));
            if (parsed.text) onChunk?.(parsed.text);
          } catch { /* ignore */ }
        }
      }
    }
  }
})();
