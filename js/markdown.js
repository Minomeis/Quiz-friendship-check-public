// Markdown 显示函数：只支持定稿实际用到的格式——标题（# ~ ######）、加粗（**）、段落、列表（- 开头）
// 不支持的语法（引用、表格、链接、图片、斜体、有序列表等）会当作普通文字显示，不会报错
// renderMarkdown(src)：入参 Markdown 字符串，返回 HTML 字符串；不碰页面元素
// 注意：先对文字做 HTML 转义，再套标签，所以文案里的 < > & " ' 不会变成标签
function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// 行内格式：转义后把 **文字** 换成 <strong>
function renderInline(text) {
  return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

function renderMarkdown(src) {
  var lines = String(src).replace(/\r/g, '').split('\n');
  var html = [];
  var para = []; // 正在累积的段落行
  var items = []; // 正在累积的列表项

  function flushPara() {
    if (para.length) html.push('<p>' + para.map(renderInline).join('<br>') + '</p>');
    para = [];
  }
  function flushList() {
    if (items.length) {
      html.push('<ul>' + items.map(function (t) { return '<li>' + renderInline(t) + '</li>'; }).join('') + '</ul>');
    }
    items = [];
  }

  lines.forEach(function (raw) {
    var line = raw.replace(/\s+$/, '');
    var heading = line.match(/^(#{1,6})\s+(.+)$/);
    var item = line.match(/^-\s+(.+)$/);
    if (line === '') {
      flushPara();
      flushList();
    } else if (heading) {
      flushPara();
      flushList();
      html.push('<h' + heading[1].length + '>' + renderInline(heading[2]) + '</h' + heading[1].length + '>');
    } else if (item) {
      flushPara();
      items.push(item[1]);
    } else {
      flushList();
      para.push(line);
    }
  });
  flushPara();
  flushList();
  return html.join('\n');
}

// 供 Node 测试加载；浏览器里没有 module，不受影响
if (typeof module !== 'undefined' && module.exports) module.exports = { renderMarkdown: renderMarkdown, escapeHtml: escapeHtml };
