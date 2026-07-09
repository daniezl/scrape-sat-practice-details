# SAT MyPractice 错题抓取器

从 College Board [MyPractice](https://mypractice.collegeboard.org) 的成绩详情页抓取全部题目（含题干、选项、你的作答、正确答案、官方解析），并导出为纯文本 `.txt` 文件。

## 原理

成绩详情页（Score Details）加载时会请求
`digitalpractice-api.collegeboard.org/mspractice-testresults-prod/questions`
接口，一次性返回该场考试全部题目的完整数据（题干 HTML、MathML 公式、图表的无障碍长描述、解析等）。
`scraper.js` 在页面里拦截这个请求，把 HTML/MathML 转成可读的纯文本并触发下载，
不需要翻页、不需要逐题点开。

## 使用方法

1. 用 Chrome/Edge 打开 https://mypractice.collegeboard.org 并登录，进入 "My Tests"。
2. 按 F12 打开开发者工具的 Console，把 `scraper.js` 的全部内容粘贴进去回车。
   - 如果浏览器提示不允许粘贴，先输入 `allow pasting` 回车再粘贴。
3. 点击某场考试的 "Review Your Test"，进入 Score Details 页面。
4. 数据加载完成后会自动下载一份「错题」txt（含未作答的题目）。

如果你已经在 Score Details 页面上，粘贴脚本后刷新一下页面即可。

也可以在 Console 里手动调用：

```js
satScraper.exportWrong()  // 只导出错题（含未作答）
satScraper.exportAll()    // 导出全部题目
satScraper.data           // 查看原始 JSON 数据
```

## 生成 HTML 错题本

除了纯文本，还可以把原始 JSON 渲染成单文件 HTML 错题本（保留 MathML 公式、SVG 图表、
选项高亮，解析默认折叠、可一键展开，顶部有按技能点分类的题目索引）。工具条里的
「遮挡答案」按钮会进入重做模式：隐藏正确选项高亮、你的作答、题头答案和解析，每题下方出现
「显示答案」可单独揭开某一题，方便先自己重做再逐题对答案。

```bash
node build_html.js questions_raw.json "输出文件名.html"
```

两个参数都可省略，默认读取 `questions_raw.json`。生成的 HTML 不依赖任何本地资源，
直接双击用浏览器打开即可（字体从 Google Fonts 加载，离线时回退系统字体）。

## 导出格式说明

- 每道题包含：所属 section、题号、知识领域、难度、技能点、题目材料、问题、选项、你的答案、正确答案、官方解析。
- 难度为 7 级制（`难度: 6/7（Hard）`），来自 College Board Question Bank 的
  `score_band_range_cd`（1–7）和 `difficulty`（E/M/H）字段。成绩接口本身不带难度，
  脚本内嵌了一份题库映射表（约 3000 题，按 `externalId` 匹配），官方模拟题都能查到。
- MathML 数学公式转成线性写法，如 `-7/8 = (0-4)/(8-d)`、`4x^2 + bx-45`。
- 图表（SVG）无法转成文本，用官方的无障碍描述代替（`[图表] ...` 和 `[Long description ...]`，
  其中包含坐标点、柱状图数值等关键数据）。
- 数学填空题（SPR）没有选项，正确答案可能列出多种等价写法，如 `203/50, 4.06`。

## 文件

| 文件 | 说明 |
| --- | --- |
| `scraper.js` | 抓取脚本，粘贴到浏览器 Console 使用（内嵌题库难度表） |
| `build_html.js` | 把 `questions_raw.json` 渲染成单文件 HTML 错题本 |
| `difficulty_map.json` | 题库难度映射源数据（从 Question Bank 提取） |
| `questions_raw.json` | 示例：一次抓到的原始接口数据 |
| `SAT Practice 4 - 2026-07-09 - 错题.txt` | 示例：导出的错题纯文本 |
| `SAT Practice 4 - 2026-07-09 - 错题.html` | 示例：生成的 HTML 错题本 |
