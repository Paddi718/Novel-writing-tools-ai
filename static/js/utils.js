/**
 * 纯工具函数 — 不依赖 DOM / 状态的纯数据变换
 * 通过 APP.Utils 命名空间暴露，供 app.js 解构引用
 */
(function () {
  'use strict';

  const Utils = {

    wordCount(text) {
      let count = 0;
      for (const ch of text || '') {
        if (ch >= '一' && ch <= '鿿' || ch >= '　' && ch <= '〿') count++;
        else if (/[a-zA-Z]/.test(ch)) count++;
      }
      return count;
    },

    escapeHtml(str) {
      if (!str) return '';
      return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    },

    formatNum(n) {
      if (!n) return '0';
      if (n >= 10000) return (n / 10000).toFixed(1) + 'w';
      if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
      return String(n);
    },

    debounce(fn, ms) {
      let timer;
      return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
    },

    /** 搜索结果高亮 */
    highlightText(text, query) {
      if (!query) return Utils.escapeHtml(text);
      const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const re = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
      return escaped.replace(re, '<em>$1</em>');
    },

    /** 从结构化概要中提取【概要】部分 */
    extractSummary(summary) {
      if (!summary) return '';
      const m = summary.match(/【概要】([\s\S]*?)(?=【|$)/);
      return m ? m[1].trim() : summary.trim();
    },

    /** 简易 Markdown → HTML 渲染 */
    renderMarkdown(text) {
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
    },

    /** 清洗 AI 输出：去掉引导语、备注、多余标点 */
    cleanAIText(text) {
      if (!text) return '';
      let t = text.trim();

      // 去掉引号包裹
      if (t.startsWith('「') && t.endsWith('」')) t = t.slice(1, -1).trim();
      if (t.startsWith('"') && t.endsWith('"')) t = t.slice(1, -1).trim();
      if (t.startsWith('"') && t.endsWith('"')) t = t.slice(1, -1).trim();
      if (t.startsWith('「')) t = t.replace(/^「+/, '').trim();
      if (t.endsWith('」')) t = t.replace(/」+$/, '').trim();

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
      if (lines.length > 1) {
        const first = lines[0].trim();
        let isLeader = false;
        for (const re of LEADERS) {
          if (re.test(first)) { isLeader = true; break; }
        }
        if (/^(好的|没问题|当然|可以|请看|以下|这是我|我来|已为你)/.test(first)) isLeader = true;
        if (isLeader) {
          lines.shift();
          t = lines.join('\n').trim();
        }
      } else {
        for (const re of LEADERS) {
          t = t.replace(re, '').trim();
        }
      }

      t = t.replace(/\n*你觉得怎么样[？?].*$/, '');
      t = t.replace(/\n*如果需要[，,].*$/, '');
      t = t.replace(/\n*希望[这这对].*$/, '');
      t = t.replace(/\n*如有[需要疑问问题].*$/, '');
      t = t.replace(/\n*请[告诉告知让我知道].*$/, '');
      t = t.replace(/\(.*?\)/g, '');
      t = t.replace(/（.*?）/g, '');

      return t.trim();
    },

  };

  window.APP = window.APP || {};
  window.APP.Utils = Utils;
})();
