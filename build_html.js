#!/usr/bin/env node
/**
 * 把 questions_raw.json 里的错题（含未作答）渲染成单文件 HTML 错题本。
 * 视觉风格参照 grind-tests 的 print view（奶油纸色、衬线标题、mono 元信息、绿/红选项高亮），
 * 但不分页，作为连续网页阅读。
 *
 * 用法: node build_html.js [questions_raw.json] [输出.html]
 */

const fs = require('fs');
const path = require('path');

const inputPath = process.argv[2] || 'questions_raw.json';
const outputPath = process.argv[3] || 'SAT Practice 4 - 2026-07-09 - 错题.html';

const sections = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const dm = JSON.parse(fs.readFileSync(path.join(__dirname, 'difficulty_map.json'), 'utf8'));

// ---------- 难度查询（同 scraper.js 的编码：32 位 externalId + 1 位分档 + 1 位 E/M/H + 2 位技能索引） ----------
const qbankMap = new Map();
for (let i = 0; i < dm.blob.length; i += 36) {
  qbankMap.set(dm.blob.slice(i, i + 32), dm.blob.slice(i + 32, i + 36));
}
function qbankLookup(externalId) {
  if (!externalId) return null;
  const rec = qbankMap.get(externalId.replace(/-/g, ''));
  if (!rec) return null;
  return {
    band: Number(rec[0]),
    difficulty: { E: 'Easy', M: 'Medium', H: 'Hard' }[rec[1]] || rec[1],
    skill: dm.skills[Number(rec.slice(2))] || '',
  };
}

const DOMAIN_NAMES = {
  CAS: 'Craft and Structure',
  INI: 'Information and Ideas',
  SEC: 'Standard English Conventions',
  EOI: 'Expression of Ideas',
  H: 'Algebra',
  P: 'Advanced Math',
  Q: 'Problem-Solving and Data Analysis',
  S: 'Geometry and Trigonometry',
};
const SECTION_NAMES = { reading: 'Reading and Writing', math: 'Math' };

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ---------- 收集错题 ----------
const wrongItems = [];
let total = 0;
const sectionStats = {};
for (const sec of sections) {
  const sectionName = SECTION_NAMES[sec.id] || sec.id;
  sectionStats[sectionName] = sectionStats[sectionName] || { total: 0, wrong: 0 };
  for (const q of sec.items || []) {
    total += 1;
    sectionStats[sectionName].total += 1;
    if ((q.answer || {}).correct) continue;
    sectionStats[sectionName].wrong += 1;
    wrongItems.push({ q, sectionName, sectionId: sec.id });
  }
}

// ---------- 渲染单题 ----------
function renderQuestion({ q, sectionName, sectionId }, idx) {
  const a = q.answer || {};
  const domain = DOMAIN_NAMES[(q.metadata || {}).PRIMARY_CLASS_CD] || '';
  const qb = qbankLookup(q.externalId);
  const resp = (a.response ?? '').toString().trim();
  const unanswered = !resp;
  const anchor = `q${idx + 1}`;

  const statusHtml = unanswered
    ? `<span class="q-status is-skipped">未作答 · 答案 ${esc(a.correctChoice)}</span>`
    : `<span class="q-status is-wrong">WRONG · 选了 ${esc(resp)} · 答案 ${esc(a.correctChoice)}</span>`;

  const metaBits = [esc(sectionName)];
  if (domain) metaBits.push(esc(domain));
  if (qb) {
    metaBits.push(`难度 ${qb.band}/7 · ${esc(qb.difficulty)}`);
    if (qb.skill) metaBits.push(esc(qb.skill.trim()));
  }

  let choicesHtml = '';
  if (a.choices) {
    const rows = Object.keys(a.choices)
      .sort()
      .map((key) => {
        const cls = ['q-opt'];
        if (key === a.correctChoice) cls.push('is-correct');
        if (key === resp && key !== a.correctChoice) cls.push('is-picked-wrong');
        const tag =
          key === a.correctChoice
            ? '<span class="q-opt-tag ok-tag">✓ 正确</span>'
            : key === resp
              ? '<span class="q-opt-tag bad-tag">✗ 你的选择</span>'
              : '';
        return `<li class="${cls.join(' ')}"><span class="q-opt-letter">${esc(key)}.</span><span class="q-opt-body">${a.choices[key].body || ''}</span>${tag}</li>`;
      });
    choicesHtml = `<ul class="q-options">${rows.join('\n')}</ul>`;
  } else {
    // SPR 填空题
    choicesHtml = `<div class="q-spr">
      <span class="q-spr-cell ${unanswered ? 'is-skipped' : 'is-wrong'}">你的答案：${esc(resp || '（未作答）')}</span>
      <span class="q-spr-cell is-correct">正确答案：${esc(a.correctChoice)}</span>
    </div>`;
  }

  const passage = (q.passage || {}).body || '';
  const prompt = q.prompt || '';
  const rationale = a.rationale || '';

  return `<li class="question" id="${anchor}">
  <header class="q-head">
    <span class="q-no">${esc(sectionId === 'math' ? 'M' : 'R')}${esc(q.displayNumber)}</span>
    <span class="q-meta">${metaBits.join(' · ')}</span>
    ${statusHtml}
  </header>
  ${passage ? `<div class="q-passage">${passage}</div>` : ''}
  ${prompt ? `<div class="q-prompt">${prompt}</div>` : ''}
  ${choicesHtml}
  <button class="q-reveal" type="button">显示答案</button>
  ${
    rationale
      ? `<details class="q-rationale">
    <summary>解析</summary>
    <div class="q-rationale-body">${rationale}</div>
  </details>`
      : ''
  }
</li>`;
}

// ---------- 顶部索引 ----------
function renderIndex() {
  const cells = wrongItems.map(({ q, sectionId }, idx) => {
    const a = q.answer || {};
    const qb = qbankLookup(q.externalId);
    const unanswered = !(a.response ?? '').toString().trim();
    const label = `${sectionId === 'math' ? 'M' : 'R'}${q.displayNumber}`;
    const skill = qb && qb.skill ? qb.skill.trim() : DOMAIN_NAMES[(q.metadata || {}).PRIMARY_CLASS_CD] || '';
    return `<a class="idx-cell ${unanswered ? 'is-skipped' : 'is-wrong'}" href="#q${idx + 1}">
      <span class="idx-no">${esc(label)}</span>
      <span class="idx-skill">${esc(skill)}</span>
      ${qb ? `<span class="idx-band">${qb.band}/7</span>` : ''}
    </a>`;
  });
  return `<nav class="idx">${cells.join('\n')}</nav>`;
}

const title = 'SAT Practice 4 · 错题本';
const dateLabel = '2026-07-09';
const statsLine = Object.entries(sectionStats)
  .map(([name, s]) => `${name} ${s.wrong}/${s.total}`)
  .join(' · ');

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · ${dateLabel}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400..700&family=Instrument+Sans:ital,wght@0,400..700;1,400&family=JetBrains+Mono:wght@400;600;700&display=swap" rel="stylesheet">
<style>
:root {
  --paper: 245 239 228;
  --paper-raised: 250 244 234;
  --ink: 26 22 20;
  --ink-muted: 139 127 110;
  --ink-faint: 178 166 146;
  --hairline: 227 218 199;
  --accent: 139 30 40;
  --ok: 50 135 78;
  --bad: 184 40 52;
  --cb-tag: 42 38 36;
  --font-serif: "Fraunces", "Iowan Old Style", Georgia, serif;
  --font-sans: "Instrument Sans", ui-sans-serif, system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace;
}
* { box-sizing: border-box; }
html { background: rgb(var(--paper)); }
body {
  margin: 0;
  color: rgb(var(--ink));
  font-family: var(--font-sans);
  line-height: 1.6;
  font-size: 16px;
}
.page {
  max-width: 780px;
  margin: 0 auto;
  padding: 3rem 2.25rem 6rem;
  background: rgb(var(--paper-raised));
  min-height: 100vh;
  box-shadow: 0 0 0 1px rgb(var(--hairline));
}
.sr-only {
  position: absolute; width: 1px; height: 1px;
  padding: 0; margin: -1px; overflow: hidden;
  clip: rect(0 0 0 0); white-space: nowrap; border: 0;
}

/* ---- 文档头 ---- */
.doc-head { border-bottom: 1px solid rgb(var(--hairline)); padding-bottom: 1.25rem; margin-bottom: 1.5rem; }
.doc-head h1 { font-family: var(--font-serif); font-size: 1.75rem; letter-spacing: -0.01em; margin: 0; font-weight: 600; }
.doc-head h1 .sub { font-family: var(--font-sans); font-size: 1rem; color: rgb(var(--ink-muted)); font-weight: 400; }
.doc-meta {
  margin: 0.45rem 0 0;
  font-family: var(--font-mono);
  font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase;
  color: rgb(var(--ink-muted));
}

/* ---- 索引 ---- */
.idx {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 0.4rem;
  margin: 0 0 2.25rem;
}
.idx-cell {
  display: flex; align-items: baseline; gap: 0.45rem;
  padding: 0.35rem 0.55rem;
  border: 1px solid rgb(var(--hairline));
  border-radius: 6px;
  text-decoration: none;
  color: rgb(var(--ink));
  background: rgb(var(--paper));
  font-size: 12px;
  transition: border-color 120ms ease;
  min-width: 0;
}
.idx-cell:hover { border-color: rgb(var(--accent)); }
.idx-no { font-family: var(--font-mono); font-weight: 700; font-size: 11px; }
.idx-cell.is-wrong .idx-no { color: rgb(var(--bad)); }
.idx-cell.is-skipped .idx-no { color: rgb(var(--ink-faint)); }
.idx-skill {
  flex: 1; min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  color: rgb(var(--ink-muted));
}
.idx-band { font-family: var(--font-mono); font-size: 10px; color: rgb(var(--ink-faint)); }

/* ---- 工具条 ---- */
.toolbar { display: flex; gap: 0.5rem; margin-bottom: 1.5rem; }
.toolbar button {
  font-family: var(--font-mono);
  font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase;
  padding: 0.45rem 0.8rem;
  border: 1px solid rgb(var(--hairline));
  border-radius: 6px;
  background: rgb(var(--paper));
  color: rgb(var(--ink-muted));
  cursor: pointer;
}
.toolbar button:hover { border-color: rgb(var(--accent)); color: rgb(var(--accent)); }

/* ---- 题目 ---- */
.questions { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 2.25rem; }
.question { border-top: 1px solid rgb(var(--hairline)); padding-top: 1.4rem; scroll-margin-top: 1rem; }
.q-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.6rem 0.9rem; margin-bottom: 0.75rem; }
.q-no {
  font-family: var(--font-mono);
  font-size: 12px; font-weight: 700; letter-spacing: 0.14em;
  background: rgb(var(--cb-tag)); color: rgb(var(--paper));
  padding: 2px 7px; border-radius: 3px;
}
.q-meta {
  font-family: var(--font-mono);
  font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase;
  color: rgb(var(--ink-faint));
}
.q-status {
  margin-left: auto;
  font-family: var(--font-mono);
  font-size: 10.5px; letter-spacing: 0.18em; text-transform: uppercase;
  white-space: nowrap;
}
.q-status.is-wrong { color: rgb(var(--bad)); }
.q-status.is-skipped { color: rgb(var(--ink-muted)); }

.q-passage, .q-prompt { font-size: 1rem; line-height: 1.62; }
.q-passage { margin-bottom: 0.85rem; }
.q-prompt { margin-bottom: 0.9rem; font-weight: 500; }
.q-passage p, .q-prompt p { margin: 0.65rem 0; }
.q-passage p:first-child, .q-prompt p:first-child { margin-top: 0; }
.q-passage p:last-child, .q-prompt p:last-child { margin-bottom: 0; }
.q-passage ul, .q-passage ol { margin: 0.65rem 0; padding-left: 1.4rem; }
.q-passage li { margin: 0.3rem 0; }
.q-passage blockquote {
  margin: 0.85rem 0; padding: 0.1rem 0 0.1rem 1rem;
  border-left: 2px solid rgb(var(--hairline));
  color: rgb(var(--ink));
}
.q-passage table, .q-prompt table {
  width: 100%; border-collapse: collapse;
  margin: 1.1rem 0;
  font-size: 0.875rem; line-height: 1.55;
}
.q-passage th, .q-passage td, .q-prompt th, .q-prompt td {
  border-top: 1px solid rgb(var(--hairline));
  border-bottom: 1px solid rgb(var(--hairline));
  padding: 0.5rem 0.85rem;
  text-align: left; vertical-align: top;
}
.q-passage th, .q-prompt th {
  font-weight: 500; color: rgb(var(--ink-muted));
  font-variant: small-caps; letter-spacing: 0.06em;
  border-top: none;
}
.q-passage figure { margin: 1rem 0; }
.q-passage figure.image { text-align: center; }
.q-passage svg, .q-prompt svg { max-width: 100%; height: auto; }
.q-passage img, .q-prompt img { max-width: 100%; height: auto; }

math { font-size: 1.05em; }

/* ---- 选项 ---- */
.q-options { list-style: none; padding: 0; margin: 0 0 0.9rem; display: flex; flex-direction: column; gap: 0.4rem; }
.q-opt {
  display: flex; gap: 0.6rem; align-items: baseline;
  padding: 0.45rem 0.65rem;
  border: 1px solid transparent; border-radius: 6px;
}
.q-opt-letter { font-family: var(--font-mono); font-weight: 600; color: rgb(var(--ink-muted)); min-width: 1.4em; }
.q-opt-body { flex: 1; min-width: 0; }
.q-opt-body p { margin: 0; display: inline; }
.q-opt-body p + p { display: block; margin-top: 0.4rem; }
.q-opt.is-correct {
  background: color-mix(in srgb, rgb(var(--ok)) 13%, transparent);
  border-color: color-mix(in srgb, rgb(var(--ok)) 45%, transparent);
}
.q-opt.is-picked-wrong {
  background: color-mix(in srgb, rgb(var(--bad)) 9%, transparent);
  border-color: color-mix(in srgb, rgb(var(--bad)) 40%, transparent);
}
.q-opt-tag {
  font-family: var(--font-mono);
  font-size: 9.5px; letter-spacing: 0.14em; text-transform: uppercase;
  white-space: nowrap; align-self: center;
}
.ok-tag { color: rgb(var(--ok)); }
.bad-tag { color: rgb(var(--bad)); }

/* ---- 遮挡答案（重做模式） ---- */
.q-reveal {
  display: none;
  font-family: var(--font-mono);
  font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase;
  padding: 0.35rem 0.7rem;
  margin-bottom: 0.9rem;
  border: 1px solid rgb(var(--hairline)); border-radius: 6px;
  background: rgb(var(--paper)); color: rgb(var(--ink-muted));
  cursor: pointer;
}
.q-reveal:hover { border-color: rgb(var(--accent)); color: rgb(var(--accent)); }
body.answers-hidden .q-reveal { display: inline-flex; }

body.answers-hidden .question:not(.is-revealed) .q-status,
body.answers-hidden .question:not(.is-revealed) .q-opt-tag,
body.answers-hidden .question:not(.is-revealed) .q-spr-cell.is-correct,
body.answers-hidden .question:not(.is-revealed) .q-rationale { display: none; }

body.answers-hidden .question:not(.is-revealed) .q-opt.is-correct,
body.answers-hidden .question:not(.is-revealed) .q-opt.is-picked-wrong {
  background: transparent;
  border-color: transparent;
}

/* ---- SPR 填空 ---- */
.q-spr { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.9rem; }
.q-spr-cell {
  font-family: var(--font-mono); font-size: 13px;
  padding: 0.45rem 0.75rem;
  border-radius: 6px; border: 1px solid transparent;
}
.q-spr-cell.is-correct {
  background: color-mix(in srgb, rgb(var(--ok)) 13%, transparent);
  border-color: color-mix(in srgb, rgb(var(--ok)) 45%, transparent);
  color: rgb(var(--ok));
}
.q-spr-cell.is-wrong {
  background: color-mix(in srgb, rgb(var(--bad)) 9%, transparent);
  border-color: color-mix(in srgb, rgb(var(--bad)) 40%, transparent);
  color: rgb(var(--bad));
}
.q-spr-cell.is-skipped {
  border-color: rgb(var(--hairline));
  color: rgb(var(--ink-muted));
}

/* ---- 解析 ---- */
.q-rationale {
  margin-top: 0.5rem;
  border: 1px solid rgb(var(--hairline));
  border-radius: 8px;
  background: rgb(var(--paper));
}
.q-rationale summary {
  cursor: pointer;
  padding: 0.55rem 0.85rem;
  font-family: var(--font-mono);
  font-size: 10.5px; letter-spacing: 0.18em; text-transform: uppercase;
  color: rgb(var(--ink-muted));
  user-select: none;
}
.q-rationale summary:hover { color: rgb(var(--accent)); }
.q-rationale[open] summary { border-bottom: 1px solid rgb(var(--hairline)); }
.q-rationale-body {
  padding: 0.85rem 1rem;
  font-size: 0.925rem; line-height: 1.65;
  color: rgb(var(--ink));
}
.q-rationale-body p { margin: 0.7rem 0; }
.q-rationale-body p:first-child { margin-top: 0; }
.q-rationale-body p:last-child { margin-bottom: 0; }

/* ---- 回到顶部 ---- */
.backtop {
  position: fixed; right: 1.25rem; bottom: 1.25rem;
  font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.1em;
  padding: 0.5rem 0.75rem;
  border: 1px solid rgb(var(--hairline)); border-radius: 6px;
  background: rgb(var(--paper-raised)); color: rgb(var(--ink-muted));
  text-decoration: none;
}
.backtop:hover { border-color: rgb(var(--accent)); color: rgb(var(--accent)); }

@media (max-width: 640px) {
  .page { padding: 2rem 1.1rem 4rem; }
  .q-status { margin-left: 0; }
}
</style>
</head>
<body>
<div class="page">
  <header class="doc-head">
    <h1>SAT Practice 4 <span class="sub">· 错题本</span></h1>
    <p class="doc-meta">${dateLabel} · 错题（含未作答）${wrongItems.length} / 共 ${total} 题</p>
    <p class="doc-meta">${esc(statsLine)}</p>
  </header>

  ${renderIndex()}

  <div class="toolbar">
    <button id="toggle-answers" type="button">遮挡答案</button>
    <button id="toggle-rationale" type="button">展开全部解析</button>
  </div>

  <ol class="questions">
${wrongItems.map(renderQuestion).join('\n')}
  </ol>
</div>
<a class="backtop" href="#">↑ TOP</a>
<script>
// <mfenced> 已从 MathML Core 移除（Chrome/Safari 不渲染括号），转成显式 <mo> 定界符
(function () {
  const NS = 'http://www.w3.org/1998/Math/MathML';
  let el;
  while ((el = document.querySelector('mfenced'))) {
    const open = el.getAttribute('open') ?? '(';
    const close = el.getAttribute('close') ?? ')';
    const row = document.createElementNS(NS, 'mrow');
    const mo = (ch) => {
      const m = document.createElementNS(NS, 'mo');
      m.textContent = ch;
      return m;
    };
    row.appendChild(mo(open));
    const kids = Array.from(el.children);
    kids.forEach((kid, i) => {
      if (i > 0) row.appendChild(mo(','));
      row.appendChild(kid);
    });
    row.appendChild(mo(close));
    el.replaceWith(row);
  }
})();
(function () {
  const btn = document.getElementById('toggle-rationale');
  let open = false;
  btn.addEventListener('click', () => {
    open = !open;
    document.querySelectorAll('.q-rationale').forEach((d) => (d.open = open));
    btn.textContent = open ? '收起全部解析' : '展开全部解析';
  });
})();
// 遮挡答案（重做模式）：隐藏正确选项高亮、标签、题头答案、SPR 答案、解析。
// 每题的「显示答案」按钮可单独揭开该题。
(function () {
  const btn = document.getElementById('toggle-answers');
  const resetReveals = () => {
    document.querySelectorAll('.question.is-revealed').forEach((q) => q.classList.remove('is-revealed'));
    document.querySelectorAll('.q-reveal').forEach((b) => (b.textContent = '显示答案'));
  };
  btn.addEventListener('click', () => {
    const hidden = document.body.classList.toggle('answers-hidden');
    btn.textContent = hidden ? '显示答案' : '遮挡答案';
    resetReveals();
  });
  document.querySelectorAll('.q-reveal').forEach((b) => {
    b.addEventListener('click', () => {
      const q = b.closest('.question');
      const revealed = q.classList.toggle('is-revealed');
      b.textContent = revealed ? '重新遮挡' : '显示答案';
    });
  });
})();
</script>
</body>
</html>
`;

fs.writeFileSync(outputPath, html);
console.log(`已生成 ${outputPath}（${wrongItems.length} 题）`);
