// 计分与结果判定：不碰页面元素，只做计算，方便测试。文案全部来自 data.js（QUIZ_DATA）
// 浏览器里先加载 data.js，再加载本文件；Node 测试里通过 require 加载
// judge(answers)：入参为 20 个数字（每题 0~3 分，按题号顺序），返回结果对象，字段见下
//   total          总分 0~60
//   level          消耗程度 { name, explain, advice }
//   scores         五维分数 { A, B, C, D, E }，各 0~12
//   mainReport     主报告 { id, name, markdown }
//   mildNote       轻度失衡说明（总分 13~26 时才有，否则为 null），显示在主报告前
//   hints          提示句数组，顺序：并列提示、高频提示（每个维度一句）、次高提示；同一维度最多出现一次
//   extraAdvice    附带的建议节数组 [{ id, dim, name, markdown }]（dim 是带出这份建议的维度 key），最多 2 个，仅总分 ≥13 时才有
//   topDims        最高分维度（可能并列）；mainDim 为实际决定主报告的维度
// 注意：入参不合法（不是 20 个 0~3 的整数）会抛出错误

var QUIZ_DATA_REF = typeof QUIZ_DATA !== 'undefined' ? QUIZ_DATA : require('./data.js');

var DIM_KEYS = ['A', 'B', 'C', 'D', 'E'];
// 并列时的优先级（只是实现约定，不代表严重程度）
var TIE_PRIORITY = ['B', 'C', 'E', 'A', 'D'];
// 维度 → 报告 id（B、C 同属贬低控制型）
var DIM_TO_REPORT = { A: 'caregiver', B: 'control', C: 'control', D: 'oneSided', E: 'tug' };

function dimName(key) {
  return QUIZ_DATA_REF.dimensions.filter(function (d) { return d.key === key; })[0].name;
}

function fillHint(template, keys) {
  return template.replace('{dims}', keys.map(function (k) { return '「' + dimName(k) + '」'; }).join('、'));
}

// 取总分所在的消耗程度档
function findLevel(total) {
  return QUIZ_DATA_REF.levels.filter(function (l) { return total >= l.min && total <= l.max; })[0];
}

// 取报告里的“建议节”：以 #### 开头、标题含“建议”的那一节，到下一个 #### 标题之前（含标题行）
// 找不到或不止一节时抛出错误，避免悄悄显示错的内容
function extractAdviceSection(markdown) {
  var lines = markdown.split('\n');
  var starts = [];
  lines.forEach(function (line, i) {
    if (/^####\s/.test(line) && line.indexOf('建议') !== -1) starts.push(i);
  });
  if (starts.length !== 1) throw new Error('报告里的建议节应当恰好有 1 节，实际 ' + starts.length + ' 节');
  var end = lines.length;
  for (var i = starts[0] + 1; i < lines.length; i++) {
    if (/^####\s/.test(lines[i])) { end = i; break; }
  }
  return lines.slice(starts[0], end).join('\n').trim();
}

function judge(answers) {
  if (!Array.isArray(answers) || answers.length !== 20) throw new Error('需要 20 题的答案');
  answers.forEach(function (a) {
    if (a !== 0 && a !== 1 && a !== 2 && a !== 3) throw new Error('每题答案必须是 0~3 的整数');
  });

  // 五维分数与总分
  var scores = {};
  var total = 0;
  DIM_KEYS.forEach(function (key, i) {
    scores[key] = answers.slice(i * 4, i * 4 + 4).reduce(function (s, v) { return s + v; }, 0);
    total += scores[key];
  });

  var hints = QUIZ_DATA_REF.hints;
  var level = findLevel(total);
  var max = Math.max.apply(null, DIM_KEYS.map(function (k) { return scores[k]; }));
  var topDims = TIE_PRIORITY.filter(function (k) { return scores[k] === max; }); // 已按优先级排序

  // 主报告
  var mainDim = null;
  var mainId = 'nourish';
  if (total >= 13) {
    mainDim = topDims[0];
    mainId = DIM_TO_REPORT[mainDim];
  }

  // 提示句：每个维度最多被提到一次
  var mentioned = {};
  var out = [];
  function mark(keys) { keys.forEach(function (k) { mentioned[k] = true; }); }

  // a. 并列提示（总分 ≥13 且最高分维度 ≥2 个）
  if (total >= 13 && topDims.length >= 2) {
    out.push(fillHint(hints.tie, topDims));
    mark(topDims);
  }
  // b. 高频提示：任一维度 ≥9，每个维度一句
  var frequentTemplate = total <= 12 ? hints.frequentLow : hints.frequentHigh;
  TIE_PRIORITY.forEach(function (k) {
    if (scores[k] >= 9 && !mentioned[k]) {
      out.push(fillHint(frequentTemplate, [k]));
      mark([k]);
    }
  });
  // c. 次高提示：去掉最高分维度后的最高维度，≥6 分才提示，并列全部列出
  var secondDims = [];
  if (total >= 13) {
    var rest = TIE_PRIORITY.filter(function (k) { return topDims.indexOf(k) === -1; });
    if (rest.length) {
      var secondMax = Math.max.apply(null, rest.map(function (k) { return scores[k]; }));
      if (secondMax >= 6) secondDims = rest.filter(function (k) { return scores[k] === secondMax; });
    }
    var shown = secondDims.filter(function (k) { return !mentioned[k]; });
    if (shown.length) {
      out.push(fillHint(hints.secondary, shown));
      mark(shown);
    }
  }

  // d. 轻度失衡说明
  var mildNote = total >= 13 && total <= 26 ? hints.mild : null;

  // 附带建议节：候选 = 并列最高中未被选为主报告的维度 + 次高维度，映射成报告后去掉主报告、去重，按优先级最多 2 个
  var extraAdvice = [];
  if (total >= 13) {
    var candidates = topDims.slice(1).concat(secondDims);
    var seen = {};
    seen[mainId] = true;
    TIE_PRIORITY.filter(function (k) { return candidates.indexOf(k) !== -1; }).forEach(function (k) {
      var id = DIM_TO_REPORT[k];
      if (seen[id] || extraAdvice.length >= 2) return;
      seen[id] = true;
      var report = QUIZ_DATA_REF.reports[id];
      extraAdvice.push({ id: id, dim: k, name: report.name, markdown: extractAdviceSection(report.markdown) });
    });
  }

  var main = QUIZ_DATA_REF.reports[mainId];
  return {
    total: total,
    level: { name: level.name, explain: level.explain, advice: level.advice },
    scores: scores,
    mainReport: { id: mainId, name: main.name, markdown: main.markdown },
    mainDim: mainDim,
    topDims: topDims,
    mildNote: mildNote,
    hints: out,
    extraAdvice: extraAdvice,
  };
}

// 供 Node 测试加载；浏览器里没有 module，不受影响
if (typeof module !== 'undefined' && module.exports) module.exports = { judge: judge, extractAdviceSection: extractAdviceSection };
