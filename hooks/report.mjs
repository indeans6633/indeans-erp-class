#!/usr/bin/env node
// 작업 보고서를 한 장의 HTML 로 만들어 브라우저로 연다. 네트워크 호출 없음.
// 사용: node .owner/hooks/report.mjs --title "제목" --body <본문.md> [--shot <사진경로> ...] [옵션]
//   --body -          본문을 파이프로 넘긴다(파일 대신 표준입력)
//   --shot <경로>      사진을 넣는다(여러 번 쓸 수 있다, 1~3장 권장)
//   --caption "설명"   바로 앞 --shot 의 설명(생략 가능)
//   --slug 이름        파일 이름 뒷부분(생략하면 제목에서 만든다)
//   --out reports      저장 폴더(기본 reports)
//   --date 2026-09-18  날짜(기본 오늘 — 이 컴퓨터의 시간대 기준)
//   --no-open          만들기만 하고 열지 않는다
//
// 본문은 markdown 을 조금만 알아듣는다: ## 제목 · 목록(-, 1.) · 표 · > 인용 · **굵게** · `코드` · ---
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const argv = process.argv.slice(2)
const flag = (n, d = null) => { const i = argv.indexOf(n); return i >= 0 ? (argv[i + 1] ?? d) : d }
const has = (n) => argv.includes(n)

// --shot 과 --caption 은 순서대로 짝을 짓는다.
const shots = []
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--shot' && argv[i + 1]) shots.push({ src: argv[i + 1], caption: '' })
  if (argv[i] === '--caption' && argv[i + 1] && shots.length) shots[shots.length - 1].caption = argv[i + 1]
}

const title = flag('--title')
const bodyArg = flag('--body')
if (!title) { console.error('--title "보고서 제목" 을 지정하세요.'); process.exit(1) }
if (!bodyArg) {
  console.error('--body <본문.md> 를 지정하세요(따옴표·줄바꿈이 섞인 본문은 파일로 넘깁니다).')
  console.error('표준입력으로 넘기려면 --body - 로 지정하세요.')
  process.exit(1)
}

let body = ''
if (bodyArg === '-') {
  body = fs.readFileSync(0, 'utf8')
} else {
  const bp = path.resolve(process.cwd(), bodyArg)
  if (!fs.existsSync(bp)) { console.error(`본문 파일이 없습니다: ${bp}`); process.exit(1) }
  body = fs.readFileSync(bp, 'utf8')
}
body = body.replace(/^\uFEFF/, '').replaceAll('\r\n', '\n')

// 날짜는 이 컴퓨터의 시간대로 적는다. toISOString 은 세계 표준시라 한국에서 오전 9시 전에는 전날 날짜가 된다(2026-10-09 리허설).
const localYmd = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
const date = flag('--date', localYmd())
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { console.error('--date 는 2026-09-18 형식입니다.'); process.exit(1) }
const slugify = (s) => s.trim().replace(/\s+/g, '-').replace(/[^\p{L}\p{N}\-_]+/gu, '').replace(/-{2,}/g, '-').replace(/^-|-$/g, '').slice(0, 60)
const slug = slugify(flag('--slug') || title) || 'report'
const outDir = path.resolve(process.cwd(), flag('--out', 'reports'))
const outFile = path.join(outDir, `${date}-${slug}.html`)

// ---- 사진: 보고서 폴더 안에 있으면 그대로 참조, 밖에 있으면 안으로 복사한다 ----
fs.mkdirSync(outDir, { recursive: true })
const shotDir = path.join(outDir, 'shots', `${date}-${slug}`)
const embedded = []
for (const s of shots) {
  const abs = path.resolve(process.cwd(), s.src)
  if (!fs.existsSync(abs)) { console.error(`사진이 없습니다(건너뜁니다): ${abs}`); continue }
  let rel = path.relative(outDir, abs)
  if (rel.startsWith('..')) {
    fs.mkdirSync(shotDir, { recursive: true })
    const dst = path.join(shotDir, path.basename(abs))
    fs.copyFileSync(abs, dst)
    rel = path.relative(outDir, dst)
  }
  embedded.push({ rel: rel.split(path.sep).join('/'), caption: s.caption, abs })
}

// ---- markdown 일부만 HTML 로 ----
const esc = (s) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
const inline = (s) => esc(s)
  .replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
const cells = (line) => line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim())

function render(md) {
  const lines = md.split('\n')
  const out = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) { i++; continue }
    if (/^```/.test(line)) {
      const buf = []
      i++
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++])
      i++
      out.push(`<pre>${esc(buf.join('\n'))}</pre>`)
      continue
    }
    if (/^-{3,}\s*$/.test(line)) { out.push('<hr>'); i++; continue }
    const h = line.match(/^(#{1,6})\s+(.*)$/)
    // 보고서 제목이 h1 이므로 본문의 큰 절(#·##)은 h2 로 내린다.
    if (h) { const lv = Math.min(4, Math.max(2, h[1].length)); out.push(`<h${lv}>${inline(h[2])}</h${lv}>`); i++; continue }
    if (/^\s*\|/.test(line) && /^\s*\|[\s:|-]+\|?\s*$/.test(lines[i + 1] || '')) {
      const head = cells(line)
      i += 2
      const rows = []
      while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(cells(lines[i++]))
      out.push('<div class="tw"><table><thead><tr>' + head.map((c) => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>'
        + rows.map((r) => '<tr>' + r.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>').join('')
        + '</tbody></table></div>')
      continue
    }
    if (/^\s*>\s?/.test(line)) {
      const buf = []
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, ''))
      out.push(`<blockquote>${inline(buf.join(' '))}</blockquote>`)
      continue
    }
    if (/^\s*(?:[-*]\s+|\d+[.)]\s+)/.test(line)) {
      const ordered = /^\s*\d+[.)]\s+/.test(line)
      const items = []
      while (i < lines.length && /^\s*(?:[-*]\s+|\d+[.)]\s+)/.test(lines[i])) {
        items.push(lines[i++].replace(/^\s*(?:[-*]\s+|\d+[.)]\s+)/, ''))
      }
      const tag = ordered ? 'ol' : 'ul'
      out.push(`<${tag}>` + items.map((t) => `<li>${inline(t)}</li>`).join('') + `</${tag}>`)
      continue
    }
    const buf = []
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|```|\s*[-*]\s|\s*\d+[.)]\s|\s*>|\s*\|)/.test(lines[i]) && !/^-{3,}\s*$/.test(lines[i])) {
      buf.push(lines[i++])
    }
    if (buf.length) out.push(`<p>${inline(buf.join(' '))}</p>`)
    else i++
  }
  return out.join('\n')
}

const shotHtml = embedded.length
  ? `<h2>바뀐 화면</h2>\n` + embedded.map((s) => `<figure><img src="${esc(s.rel)}" alt="${esc(s.caption || '화면 사진')}">${s.caption ? `<figcaption>${inline(s.caption)}</figcaption>` : ''}</figure>`).join('\n')
  : ''

const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} — ${esc(date)}</title>
<style>
:root{
  --bg:#f7f6f4; --card:#ffffff; --text:#23211f; --muted:#6d6864;
  --line:#e6e2dd; --line-strong:#d4cec7; --accent:#8a6a4a; --accent-soft:#f3ede6;
}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{
  margin:0; background:var(--bg); color:var(--text);
  font-family:"맑은 고딕","Malgun Gothic",-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo",system-ui,sans-serif;
  font-size:15px; line-height:1.75;
}
.wrap{max-width:840px; margin:0 auto; padding:32px 20px 72px}
header{border-bottom:1px solid var(--line-strong); padding-bottom:18px; margin-bottom:28px}
.date{color:var(--muted); font-size:12.5px; letter-spacing:.02em}
h1{font-size:23px; line-height:1.4; margin:6px 0 0; font-weight:650}
h2{font-size:17px; margin:34px 0 10px; font-weight:650}
h3{font-size:15px; margin:24px 0 8px; font-weight:650}
h4{font-size:14px; margin:20px 0 6px; font-weight:650; color:var(--muted)}
p{margin:0 0 12px}
ul,ol{margin:0 0 14px; padding-left:22px}
li{margin:3px 0}
hr{border:0; border-top:1px solid var(--line); margin:28px 0}
strong{font-weight:650}
code{background:var(--accent-soft); border-radius:5px; padding:1px 5px; font-size:13px;
  font-family:ui-monospace,SFMono-Regular,Consolas,"D2Coding",monospace}
pre{background:#fff; border:1px solid var(--line); border-radius:12px; padding:14px 16px;
  overflow-x:auto; font-size:13px; line-height:1.6}
blockquote{margin:0 0 14px; padding:10px 16px; background:var(--accent-soft);
  border:1px solid var(--line); border-radius:10px; color:#42392f}
.tw{overflow-x:auto; margin:0 0 16px}
table{border-collapse:collapse; width:100%; background:var(--card);
  border:1px solid var(--line); border-radius:12px; overflow:hidden; font-size:14px}
th,td{text-align:left; padding:9px 12px; border-bottom:1px solid var(--line); vertical-align:top}
th{background:#faf8f6; font-weight:600; white-space:nowrap}
tr:last-child td{border-bottom:0}
figure{margin:0 0 22px; background:var(--card); border:1px solid var(--line);
  border-radius:14px; padding:12px; box-shadow:0 1px 2px rgba(35,33,31,.04)}
figure img{display:block; width:100%; height:auto; border-radius:8px}
figcaption{margin-top:9px; font-size:12.5px; color:var(--muted)}
footer{margin-top:44px; padding-top:16px; border-top:1px solid var(--line);
  color:var(--muted); font-size:12.5px}
@media print{ body{background:#fff} .wrap{padding:0} figure{break-inside:avoid} }
</style>
</head>
<body>
<div class="wrap">
<header>
  <div class="date">${esc(date)} 작업 보고</div>
  <h1>${esc(title)}</h1>
</header>
${render(body)}
${shotHtml}
<footer>내 컴퓨터 안에서 만든 보고서입니다. 어디로도 전송되지 않습니다.</footer>
</div>
</body>
</html>
`

fs.writeFileSync(outFile, html, 'utf8')
console.log(`보고서를 만들었습니다: ${outFile}`)
if (embedded.length) console.log(`사진 ${embedded.length}장 포함`)

if (!has('--no-open')) {
  const opener = path.join(HERE, 'open.mjs')
  if (fs.existsSync(opener)) {
    const r = spawnSync(process.execPath, [opener, outFile], { stdio: 'inherit' })
    if (r.status !== 0) console.log(`직접 열어 보세요: ${outFile}`)
  } else {
    console.log(`직접 열어 보세요: ${outFile}`)
  }
}
