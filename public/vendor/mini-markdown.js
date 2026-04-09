(function () {
  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function parseInline(text) {
    let html = escapeHtml(text);
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    return html;
  }

  function flushParagraph(buffer, out) {
    if (!buffer.length) return;
    out.push('<p>' + buffer.map(parseInline).join('<br>') + '</p>');
    buffer.length = 0;
  }

  function flushList(listType, items, out) {
    if (!items.length) return;
    out.push('<' + listType + '>' + items.map(function (item) {
      return '<li>' + parseInline(item) + '</li>';
    }).join('') + '</' + listType + '>');
    items.length = 0;
  }

  function parse(text) {
    const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
    const out = [];
    const paragraph = [];
    const ulItems = [];
    const olItems = [];
    const quoteLines = [];
    let inCodeBlock = false;
    let codeLines = [];

    function flushAll() {
      flushParagraph(paragraph, out);
      flushList('ul', ulItems, out);
      flushList('ol', olItems, out);
      if (quoteLines.length) {
        out.push('<blockquote>' + quoteLines.map(parseInline).join('<br>') + '</blockquote>');
        quoteLines.length = 0;
      }
    }

    for (const line of lines) {
      if (line.startsWith('```')) {
        flushAll();
        if (inCodeBlock) {
          out.push('<pre><code>' + escapeHtml(codeLines.join('\n')) + '</code></pre>');
          codeLines = [];
          inCodeBlock = false;
        } else {
          inCodeBlock = true;
        }
        continue;
      }

      if (inCodeBlock) {
        codeLines.push(line);
        continue;
      }

      if (!line.trim()) {
        flushAll();
        continue;
      }

      const heading = line.match(/^(#{1,3})\s+(.+)$/);
      if (heading) {
        flushAll();
        const level = heading[1].length;
        out.push('<h' + level + '>' + parseInline(heading[2]) + '</h' + level + '>');
        continue;
      }

      const blockquote = line.match(/^>\s?(.*)$/);
      if (blockquote) {
        flushParagraph(paragraph, out);
        flushList('ul', ulItems, out);
        flushList('ol', olItems, out);
        quoteLines.push(blockquote[1]);
        continue;
      }

      const ul = line.match(/^[-*]\s+(.+)$/);
      if (ul) {
        flushParagraph(paragraph, out);
        flushList('ol', olItems, out);
        if (quoteLines.length) {
          out.push('<blockquote>' + quoteLines.map(parseInline).join('<br>') + '</blockquote>');
          quoteLines.length = 0;
        }
        ulItems.push(ul[1]);
        continue;
      }

      const ol = line.match(/^\d+\.\s+(.+)$/);
      if (ol) {
        flushParagraph(paragraph, out);
        flushList('ul', ulItems, out);
        if (quoteLines.length) {
          out.push('<blockquote>' + quoteLines.map(parseInline).join('<br>') + '</blockquote>');
          quoteLines.length = 0;
        }
        olItems.push(ol[1]);
        continue;
      }

      flushList('ul', ulItems, out);
      flushList('ol', olItems, out);
      if (quoteLines.length) {
        out.push('<blockquote>' + quoteLines.map(parseInline).join('<br>') + '</blockquote>');
        quoteLines.length = 0;
      }
      paragraph.push(line);
    }

    flushAll();
    if (inCodeBlock) {
      out.push('<pre><code>' + escapeHtml(codeLines.join('\n')) + '</code></pre>');
    }

    return out.join('');
  }

  window.marked = { parse };
})();
