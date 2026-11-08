// 根据结果和答案生成可发送给 AI 的纯文字，不操作页面
function buildAiText(result, answers, data) {
  var dimensions = data.dimensions.map(function (d) { return d.name + '：' + result.scores[d.key] + '/12'; }).join('\n');
  var responses = data.questions.map(function (q, i) {
    var option = data.options.filter(function (o) { return o.score === answers[i]; })[0];
    return (i + 1) + '. ' + q.text + '：' + option.label;
  }).join('\n');
  var options = data.options.map(function (o) { return o.score + '=' + o.label; }).join('，');
  var replacements = {
    '{总分}': String(result.total),
    '{消耗程度}': result.level.name,
    '{主报告类型名}': result.mainReport.name,
    '{逐行：维度名：x/12}': dimensions,
    '{逐行：题号. 题目：所选选项}': responses
  };
  var text = data.aiTemplate.replace('（0=从不，1=偶尔，2=经常，3=几乎总是）', '（' + options + '）');
  text = text.replace('\n{提示句，有才出现}', result.hints.length ? '\n' + result.hints.join('\n') : '');
  return text.replace(/\{[^{}]+\}/g, function (key) { return replacements[key]; });
}

if (typeof module !== 'undefined' && module.exports) module.exports = { buildAiText: buildAiText };
