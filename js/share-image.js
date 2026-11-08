// 结果长图的内容排版和绘制，排版函数不读取页面元素。
var ShareImage = (function () {
  var WIDTH = 375, LEFT = 24, RIGHT = 351;
  var FONT = '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif';

  function layout(result, data, version, measure, ratio) {
    ratio = Math.max(1, Math.min(Number(ratio) || 1, 16384 / WIDTH));
    var pixelWidth = Math.round(WIDTH * ratio);
    var limit = Math.floor(Math.floor(Math.min(16384, 16777216 / pixelWidth)) / ratio);
    var pages = [[]], y = 38;
    function next() { pages.push([]); y = 38; }
    function add(command, height) {
      if (y + height > limit - 30 && pages[pages.length - 1].length) next();
      command.y = y;
      pages[pages.length - 1].push(command);
      y += height;
    }
    function text(source, kind) {
      if (!source) { y += 8; return; }
      var size = kind === 'title' ? 22 : kind === 'heading' ? 18 : kind === 'small' ? 13 : 16;
      var leading = Math.round(size * 1.65), bold = kind === 'heading' || kind === 'title' || kind === 'bold';
      var segments = String(source).split(/(\*\*.*?\*\*)/g), chars = [];
      segments.forEach(function (segment) {
        var strong = /^\*\*/.test(segment);
        Array.from(strong ? segment.slice(2, -2) : segment).forEach(function (c) { chars.push({ c: c, bold: strong || bold }); });
      });
      var lines = [], line = [], width = 0;
      chars.forEach(function (item) {
        var w = measure(item.c, size, item.bold);
        if (line.length && width + w > RIGHT - LEFT) {
          if (/^[，。！？；：、）》」』】,.!?;:]/.test(item.c) && line.length > 1) {
            var tail = [];
            while (line.length > 1 && /^[，。！？；：、）》」』】,.!?;:]/.test(line[line.length - 1].c)) tail.unshift(line.pop());
            tail.unshift(line.pop());
            lines.push(line); line = tail;
            width = tail.reduce(function (sum, c) { return sum + c.width; }, 0);
          } else { lines.push(line); line = []; width = 0; }
        }
        item.width = w; line.push(item); width += w;
      });
      if (line.length) lines.push(line);
      lines.forEach(function (items) {
        var x = LEFT;
        var runs = [];
        items.forEach(function (item) {
          var previous = runs[runs.length - 1];
          if (previous && previous.bold === item.bold) previous.text += item.c;
          else runs.push({ text: item.c, x: x, bold: item.bold });
          x += item.width;
        });
        add({ type: 'text', text: items.map(function (c) { return c.c; }).join(''), runs: runs, size: size, color: kind === 'title' || kind === 'heading' ? '#b85a34' : '#4a3b32' }, leading);
      });
      y += kind === 'heading' || kind === 'title' ? 10 : 5;
    }
    function report(markdown, short, customTitle) {
      var section = '', inAdvice = false;
      markdown.split('\n').forEach(function (raw) {
        var heading = raw.match(/^####\s+(.+)/);
        if (heading) {
          section = heading[1].replace(/^\d+｜/, '');
          inAdvice = section.indexOf('建议') !== -1;
          if (!short || inAdvice || section.indexOf('最后，送给你一句话') !== -1) text(customTitle && inAdvice ? customTitle : section, 'heading');
          return;
        }
        var adviceTitle = /^\*\*[①②③④⑤]/.test(raw);
        if (short && !(inAdvice && adviceTitle) && section.indexOf('最后，送给你一句话') === -1) return;
        if (!raw.trim()) { y += 5; return; }
        var top = raw.match(/^#{1,6}\s+(.+)/);
        if (top) text(top[1], 'title');
        else if (/^-\s/.test(raw)) text('• ' + raw.replace(/^-\s+/, ''), 'body');
        else text(raw, adviceTitle ? 'bold' : 'body');
      });
    }
    text('你的友情类型', 'small');
    text(result.mainReport.name, 'title');
    text(result.total + '/60　' + result.level.name, 'heading');
    data.dimensions.forEach(function (d) {
      add({ type: 'bar', name: d.name, score: result.scores[d.key] }, 32);
    });
    pages[0].unshift({ type: 'card', y: 18, height: y - 6 });
    y += 15;
    result.hints.forEach(function (hint) { text(hint, 'body'); });
    if (version === 'full') {
      text('消耗程度：' + result.level.name, 'heading');
      text(result.level.explain, 'body');
      text('**建议：**' + result.level.advice, 'body');
      if (result.mildNote) text(result.mildNote, 'body');
    }
    report(result.mainReport.markdown, version === 'short');
    if (version === 'full') {
      result.extraAdvice.forEach(function (extra) {
        var dim = data.dimensions.filter(function (d) { return d.key === extra.dim; })[0];
        report(extra.markdown, false, '关于「' + dim.name + '」的建议');
      });
      text(data.disclaimer, 'small');
    }
    // 二维码区域作为整体留在最后一张，不会切到两张图。
    if (y + 230 > limit - 30 && pages[pages.length - 1].length) next();
    add({ type: 'qr' }, 150);
    text(data.shareText, 'small');
    return { pages: pages, ratio: ratio, width: pixelWidth, limit: limit };
  }

  function drawPage(canvas, commands, width, height, ratio, qr, page, total) {
    canvas.width = width;
    canvas.height = Math.ceil(height * ratio);
    var ctx = canvas.getContext('2d');
    ctx.scale(ratio, ratio);
    ctx.fillStyle = '#fdf6ee'; ctx.fillRect(0, 0, WIDTH, height);
    ctx.textBaseline = 'top';
    commands.forEach(function (cmd) {
      if (cmd.type === 'card') {
        ctx.fillStyle = '#fff'; ctx.fillRect(12, cmd.y, WIDTH - 24, cmd.height);
      } else if (cmd.type === 'text') {
        ctx.fillStyle = cmd.color;
        cmd.runs.forEach(function (run) { ctx.font = (run.bold ? '700 ' : '400 ') + cmd.size + 'px ' + FONT; ctx.fillText(run.text, run.x, cmd.y); });
      } else if (cmd.type === 'bar') {
        ctx.font = '14px ' + FONT; ctx.fillStyle = '#4a3b32'; ctx.fillText(cmd.name, LEFT, cmd.y);
        ctx.fillStyle = '#f1e3d3'; ctx.fillRect(150, cmd.y + 4, 135, 9);
        ctx.fillStyle = '#b85a34'; ctx.fillRect(150, cmd.y + 4, 135 * cmd.score / 12, 9);
        ctx.fillStyle = '#7a685c'; ctx.fillText(cmd.score + '/12', 300, cmd.y);
      } else if (cmd.type === 'qr') {
        if (qr) ctx.drawImage(qr, 127, cmd.y, 120, 120);
        else { ctx.fillStyle = '#bbb'; ctx.fillRect(127, cmd.y, 120, 120); }
      }
    });
    if (total > 1) { ctx.textAlign = 'right'; ctx.fillStyle = '#7a685c'; ctx.font = '13px ' + FONT; ctx.fillText(page + '/' + total, RIGHT, 12); }
  }
  function loadQr() {
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { resolve(null); };
      img.src = 'img/xhs-qr.png';
    });
  }
  async function generate(result, data, version, ratio) {
    var measureCanvas = document.createElement('canvas'), context = measureCanvas.getContext('2d');
    var plan = layout(result, data, version, function (s, size, bold) {
      context.font = (bold ? '700 ' : '400 ') + size + 'px ' + FONT;
      return context.measureText(s).width;
    }, ratio);
    var qr = await loadQr();
    return plan.pages.map(function (commands, index) {
      var canvas = document.createElement('canvas');
      var last = commands[commands.length - 1];
      var height = Math.min(plan.limit, last.y + (last.type === 'qr' ? 150 : last.type === 'bar' ? 32 : Math.ceil(last.size * 1.65)) + 25);
      drawPage(canvas, commands, plan.width, height, plan.ratio, qr, index + 1, plan.pages.length);
      return canvas.toDataURL('image/png');
    });
  }
  return { layout: layout, drawPage: drawPage, generate: generate };
})();
