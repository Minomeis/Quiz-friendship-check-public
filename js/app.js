// 页面逻辑：开始页 → 答题页 → 结果页的切换、进度保存、结果与报告的显示
// 依赖（浏览器里按顺序先加载）：data.js（QUIZ_DATA）、markdown.js（renderMarkdown / escapeHtml）、scoring.js（judge）
// 文案全部来自 data.js；这里只处理显示规则和流程

(function () {
  var STORAGE_KEY = 'friendship-check:v1';
  var TOTAL = QUIZ_DATA.questions.length; // 20
  var ADVANCE_DELAY = 160; // 点选项后停一下再翻题（毫秒），让人看到选中效果

  // 状态：stage 为 start / quiz / result；answers 为 20 项，未答为 null；index 为当前题序号（从 0 起）
  var state = { stage: 'start', answers: [], index: 0 };
  var locked = false; // 点选项后到翻题完成之间锁住，防止连续快速点击跳题或重复计分

  function $(id) { return document.getElementById(id); }

  // ---------- 本地存储（不可用时静默忽略，页面照常使用） ----------
  function saveState() {
    try {
      if (state.stage === 'start') localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, JSON.stringify({ stage: state.stage, answers: state.answers, index: state.index }));
    } catch (e) { /* 隐私模式等情况：不保存 */ }
  }

  function clearState() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* 忽略 */ }
  }

  // 读取并校验存档；存档缺失、损坏或不合法都当作没有存档
  function loadState() {
    var saved;
    try {
      saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    } catch (e) { return null; }
    if (!saved || (saved.stage !== 'quiz' && saved.stage !== 'result')) return null;
    var a = saved.answers;
    if (!Array.isArray(a) || a.length !== TOTAL) return null;
    for (var i = 0; i < TOTAL; i++) {
      if (a[i] !== null && a[i] !== 0 && a[i] !== 1 && a[i] !== 2 && a[i] !== 3) return null;
    }
    if (saved.stage === 'result') {
      if (a.indexOf(null) !== -1) return null;
      return { stage: 'result', answers: a, index: TOTAL - 1 };
    }
    // 答题中：当前题不能跳过未答的题
    var firstEmpty = a.indexOf(null);
    var limit = firstEmpty === -1 ? TOTAL - 1 : firstEmpty;
    var idx = typeof saved.index === 'number' && saved.index >= 0 ? Math.floor(saved.index) : 0;
    return { stage: 'quiz', answers: a, index: Math.min(idx, limit) };
  }

  // ---------- 视图切换 ----------
  function show(name) {
    ['start', 'quiz', 'result'].forEach(function (v) { $('view-' + v).hidden = v !== name; });
    window.scrollTo(0, 0);
  }

  // ---------- 开始页 ----------
  function renderStart() {
    $('start-title').textContent = QUIZ_DATA.title;
    $('start-subtitle').textContent = QUIZ_DATA.subtitle;
    $('start-intro').innerHTML = renderMarkdown(QUIZ_DATA.intro);
    $('start-disclaimer').textContent = QUIZ_DATA.disclaimer;
    $('result-disclaimer').textContent = QUIZ_DATA.disclaimer;
  }

  function startQuiz() {
    state = { stage: 'quiz', answers: new Array(TOTAL).fill(null), index: 0 };
    locked = false;
    saveState();
    renderQuestion();
    show('quiz');
  }

  // ---------- 答题页 ----------
  function renderQuestion() {
    var i = state.index;
    $('quiz-count').textContent = '第 ' + (i + 1) + '/' + TOTAL + ' 题';
    $('quiz-progress').setAttribute('aria-valuenow', String(i + 1));
    $('quiz-progress-fill').style.width = ((i + 1) / TOTAL * 100) + '%';
    $('quiz-text').textContent = QUIZ_DATA.questions[i].text;
    $('btn-prev').hidden = i === 0;

    var box = $('quiz-options');
    box.innerHTML = '';
    QUIZ_DATA.options.forEach(function (opt) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'option';
      b.textContent = opt.label;
      var picked = state.answers[i] === opt.score;
      if (picked) b.classList.add('selected');
      b.setAttribute('aria-pressed', picked ? 'true' : 'false');
      b.addEventListener('click', function () { choose(opt.score, b); });
      box.appendChild(b);
    });
  }

  function choose(score, button) {
    if (locked || state.stage !== 'quiz') return;
    locked = true;
    state.answers[state.index] = score;
    button.classList.add('selected');
    button.setAttribute('aria-pressed', 'true');
    saveState();
    setTimeout(function () {
      if (state.index < TOTAL - 1) {
        state.index += 1;
        saveState();
        renderQuestion();
      } else {
        finish();
      }
      locked = false;
    }, ADVANCE_DELAY);
  }

  function goPrev() {
    if (locked || state.stage !== 'quiz' || state.index === 0) return;
    state.index -= 1;
    saveState();
    renderQuestion();
  }

  function finish() {
    state.stage = 'result';
    saveState();
    renderResult();
    show('result');
  }

  // ---------- 结果页 ----------
  // 报告显示规则：小标题去掉开头的“01｜”这类编号；“五条建议”只显示每条小标题，详细文字默认折叠
  function stripHeadingNumber(line) {
    return line.replace(/^(#{1,6})\s+\d+｜/, '$1 ');
  }

  // 把建议节的行拆成：小标题行（整行加粗的 ①~⑤ 开头）+ 它下面的详细文字
  function renderAdviceItems(lines) {
    var intro = [];
    var items = [];
    lines.forEach(function (line) {
      var m = line.match(/^\*\*([①②③④⑤][^*]*)\*\*$/);
      if (m) items.push({ title: m[1], body: [] });
      else if (items.length) items[items.length - 1].body.push(line);
      else intro.push(line);
    });
    var html = intro.join('\n').trim() ? renderMarkdown(intro.join('\n')) : '';
    html += '<div class="tips">' + items.map(function (it) {
      return '<details class="tip"><summary>' + escapeHtml(it.title) + '</summary>' +
        '<div class="tip-body">' + renderMarkdown(it.body.join('\n')) + '</div></details>';
    }).join('') + '</div>';
    return html;
  }

  // 把一份报告（或建议节）的 Markdown 转成 HTML
  // customAdviceTitle：有值时，建议节的原标题行换成它（附带建议用）；没有则沿用原标题（去掉编号）
  function renderReport(markdown, customAdviceTitle) {
    var sections = [];
    var cur = { head: null, lines: [] };
    markdown.split('\n').forEach(function (line) {
      if (/^####\s/.test(line)) {
        sections.push(cur);
        cur = { head: line, lines: [] };
      } else {
        cur.lines.push(line);
      }
    });
    sections.push(cur);

    return sections.map(function (sec) {
      var isAdvice = sec.head && sec.head.indexOf('建议') !== -1;
      var head = sec.head ? stripHeadingNumber(sec.head) : null;
      if (isAdvice) {
        var headHtml = customAdviceTitle ? '<h4>' + escapeHtml(customAdviceTitle) + '</h4>' : renderMarkdown(head);
        return headHtml + renderAdviceItems(sec.lines);
      }
      return renderMarkdown((head ? head + '\n' : '') + sec.lines.join('\n'));
    }).join('\n');
  }

  function dimNameOf(key) {
    return QUIZ_DATA.dimensions.filter(function (d) { return d.key === key; })[0].name;
  }

  function renderResult() {
    var r = judge(state.answers);
    var html = '';

    // a. 结果卡片（尽量一屏放下，方便截图）
    html += '<div class="card">' +
      '<p class="card-kicker">你的友情类型</p>' +
      '<h2 class="card-type">' + escapeHtml(r.mainReport.name) + '</h2>' +
      '<p class="card-total"><span class="card-num">' + r.total + '</span><span class="card-max">/60</span>' +
      '<span class="card-level">' + escapeHtml(r.level.name) + '</span></p>' +
      '<ul class="bars">' + QUIZ_DATA.dimensions.map(function (d) {
        var s = r.scores[d.key];
        return '<li><span class="bar-name">' + escapeHtml(d.name) + '</span>' +
          '<span class="bar-track"><i style="width:' + (s / 12 * 100) + '%"></i></span>' +
          '<span class="bar-val">' + s + '/12</span></li>';
      }).join('') + '</ul></div>' +
      '<p class="save-note">点「保存结果」生成长图，保存到相册</p>' +
      '<div class="result-actions"><button type="button" id="btn-save-card" class="btn btn-ghost">保存结果</button>' +
      '<button type="button" id="btn-ai-card" class="btn btn-ghost">复制给 AI，聊聊我的结果</button></div>';

    // b. 提示句
    if (r.hints.length) {
      html += '<div class="hints">' + r.hints.map(function (h) { return '<p>' + escapeHtml(h) + '</p>'; }).join('') + '</div>';
    }

    // c. 消耗程度的解释和建议
    html += '<section class="level-box"><h3>消耗程度：' + escapeHtml(r.level.name) + '</h3>' +
      '<p>' + escapeHtml(r.level.explain) + '</p>' +
      '<p><strong>建议：</strong>' + escapeHtml(r.level.advice) + '</p></section>';

    // d. 轻度失衡说明
    if (r.mildNote) html += '<p class="mild-note">' + escapeHtml(r.mildNote) + '</p>';

    // e. 主报告全文
    html += '<article class="report">' + renderReport(r.mainReport.markdown) + '</article>';

    // f. 附带建议（标题用带出这份建议的维度名）
    r.extraAdvice.forEach(function (ex) {
      html += '<article class="report report-extra">' +
        renderReport(ex.markdown, '关于「' + dimNameOf(ex.dim) + '」的建议') + '</article>';
    });

    $('result-body').innerHTML = html;
    $('btn-save-card').addEventListener('click', openSave);
    $('btn-ai-card').addEventListener('click', copyAiText);
  }

  var copying = false;
  var noticeTimer;
  function closeCopyNotice() {
    clearTimeout(noticeTimer);
    $('copy-notice').hidden = true;
  }
  function closeCopyLayer() {
    $('copy-layer').hidden = true;
    $('copy-text').value = '';
  }
  async function copyAiText() {
    if (copying || state.stage !== 'result' || !$('copy-layer').hidden) return;
    copying = true;
    var text = buildAiText(judge(state.answers), state.answers, QUIZ_DATA);
    closeCopyNotice();
    try {
      await navigator.clipboard.writeText(text);
      $('copy-notice').hidden = false;
      noticeTimer = setTimeout(closeCopyNotice, 5000);
    } catch (e) {
      $('copy-text').value = text;
      $('copy-layer').hidden = false;
      $('copy-text').focus();
    } finally {
      copying = false;
    }
  }

  var generating = false;
  var imageUrls = [];
  var imageVersion = '';
  function openSave() { if (!generating) { $('save-layer').hidden = false; $('save-short').focus(); } }
  function closeSave() { if (!generating) $('save-layer').hidden = true; }
  function closePreview() { $('preview-layer').hidden = true; $('preview-images').innerHTML = ''; imageUrls = []; }
  async function generateShare(version) {
    if (generating) return;
    generating = true;
    ['save-short', 'save-full', 'save-cancel'].forEach(function (id) { $(id).disabled = true; });
    $('save-status').textContent = '正在生成…';
    $('save-status').hidden = false;
    try {
      await new Promise(function (resolve) { setTimeout(resolve, 30); });
      imageUrls = await ShareImage.generate(judge(state.answers), QUIZ_DATA, version, window.devicePixelRatio || 1);
      imageVersion = version;
      $('preview-images').innerHTML = '';
      imageUrls.forEach(function (url, i) {
        var img = document.createElement('img');
        img.src = url;
        img.alt = '结果长图第 ' + (i + 1) + ' 张';
        $('preview-images').appendChild(img);
      });
      $('save-layer').hidden = true;
      $('preview-layer').hidden = false;
      $('preview-layer').scrollTop = 0;
      $('save-status').hidden = true;
    } catch (e) {
      $('save-status').textContent = '生成失败，请重试。';
    } finally {
      generating = false;
      ['save-short', 'save-full', 'save-cancel'].forEach(function (id) { $(id).disabled = false; });
    }
  }
  function downloadImages() {
    imageUrls.forEach(function (url, i) {
      var a = document.createElement('a');
      a.href = url;
      a.download = 'friendship-check-' + (imageVersion === 'short' ? '简版' : '完整版') + '-' + (i + 1) + '.png';
      document.body.appendChild(a); a.click(); a.remove();
    });
  }

  // ---------- 重新测试 ----------
  function openConfirm() {
    $('confirm-layer').hidden = false;
    $('btn-cancel').focus();
  }

  function closeConfirm() {
    $('confirm-layer').hidden = true;
    $('btn-restart').focus();
  }

  function restart() {
    $('confirm-layer').hidden = true;
    closeCopyNotice();
    closeCopyLayer();
    state = { stage: 'start', answers: [], index: 0 };
    locked = false;
    clearState();
    $('result-body').innerHTML = '';
    show('start');
  }

  // ---------- 启动 ----------
  function init() {
    renderStart();
    $('btn-start').addEventListener('click', startQuiz);
    $('btn-save-bottom').addEventListener('click', openSave);
    $('btn-ai-bottom').addEventListener('click', copyAiText);
    $('copy-notice-close').addEventListener('click', closeCopyNotice);
    $('copy-close').addEventListener('click', closeCopyLayer);
    $('save-cancel').addEventListener('click', closeSave);
    $('save-short').addEventListener('click', function () { generateShare('short'); });
    $('save-full').addEventListener('click', function () { generateShare('full'); });
    $('preview-close').addEventListener('click', closePreview);
    $('download-images').addEventListener('click', downloadImages);
    $('btn-prev').addEventListener('click', goPrev);
    $('btn-restart').addEventListener('click', openConfirm);
    $('btn-cancel').addEventListener('click', closeConfirm);
    $('btn-confirm').addEventListener('click', restart);
    // 点遮罩空白处等同取消；按 Esc 也取消
    $('confirm-layer').addEventListener('click', function (e) { if (e.target === this) closeConfirm(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !$('confirm-layer').hidden) closeConfirm();
    });

    var saved = loadState();
    if (saved) {
      state = saved;
      if (state.stage === 'result') {
        try {
          renderResult();
          show('result');
          return;
        } catch (e) { /* 存档数据异常：回到开始页 */ }
        state = { stage: 'start', answers: [], index: 0 };
        clearState();
      } else {
        renderQuestion();
        show('quiz');
        return;
      }
    }
    show('start');
  }

  init();
})();
