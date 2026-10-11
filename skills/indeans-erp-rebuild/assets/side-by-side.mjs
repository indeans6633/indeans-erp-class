#!/usr/bin/env node
// 전·후 화면 사진 두 장을 한 장으로 나란히 붙인다. 네트워크 호출 없음. 원본 사진은 건드리지 않는다.
// indeans-erp-rebuild 절차 11(전후 비교 보고서)에서 부른다. 만든 사진은 report.mjs 의 --shot 으로 넣는다
// (report.mjs 는 사진을 위아래로 쌓기만 하므로, 나란히 보이게 하려면 미리 한 장으로 붙인다).
//
// 사용: node <스킬 폴더>/assets/side-by-side.mjs --before "<전.png>" --after "<후.png>" --out "<합친.png>"
//          [--label-before "전"] [--label-after "후"] [--title "목록 · 휴대폰"] [--force]
//
// 종료 코드: 0 완료 · 1 입력·출력 문제(사진 없음·PNG 아님·깨짐·20MB 초과·출력이 입력과 같음·이미 있음) · 3 붙이는 도구 문제
//   (playwright 없음·브라우저 실패 — 그때는 전·후 사진을 따로 --shot 으로 넣고 설명에 "전"·"후"를 적는다).
// 이미 있는 --out 파일은 --force 일 때만 덮어쓴다. 입력 사진과 같은 파일(링크 포함)은 --force 여도 거부한다.
import fs from 'node:fs'
import path from 'node:path'

const VALUE_OPTS = new Set(['--before', '--after', '--out', '--label-before', '--label-after', '--title'])
const opts = {}; let force = false
const usage = '사용: --before <전.png> --after <후.png> --out <합친.png> [--label-before 전] [--label-after 후] [--title 제목] [--force]'
{
  const argv = process.argv.slice(2)
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--force') { force = true; continue }
    if (!VALUE_OPTS.has(a)) { console.error(`모르는 옵션입니다: ${a}\n${usage}`); process.exit(1) }
    const v = argv[i + 1]
    if (v === undefined || v.startsWith('--')) { console.error(`${a} 뒤에 값을 적으세요(빈칸이 있으면 따옴표로 감쌉니다).`); process.exit(1) }
    if (opts[a] !== undefined) { console.error(`${a} 를 두 번 적었습니다.`); process.exit(1) }
    opts[a] = v; i++
  }
}
if (!opts['--before'] || !opts['--after'] || !opts['--out']) { console.error(usage); process.exit(1) }
const esc = (s) => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
const fold = (s) => (process.platform === 'win32' ? s.toLowerCase() : s)
const MAX_BYTES = 20 * 1024 * 1024
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

// PNG 서명 8바이트 + IHDR 확인 후 폭·높이. 실제로 그려지는지는 브라우저 decode() 로 다시 본다.
function loadPng(file) {
  const st = fs.statSync(file)
  if (!st.isFile()) return { err: '파일이 아님' }
  if (st.size > MAX_BYTES) return { err: `20MB 초과(${(st.size / 1024 / 1024).toFixed(1)}MB)` }
  const b = fs.readFileSync(file)
  if (b.length < 33 || !b.subarray(0, 8).equals(PNG_SIG) || b.toString('latin1', 12, 16) !== 'IHDR') return { err: 'PNG 가 아니거나 머리가 깨짐' }
  const w = b.readUInt32BE(16); const h = b.readUInt32BE(20)
  if (!w || !h || w > 20000 || h > 40000) return { err: `크기가 이상함(${w}×${h})` }
  return { w, h, data: b }
}

const sides = []; const inputs = []
for (const [file, label] of [[opts['--before'], opts['--label-before'] || '전'], [opts['--after'], opts['--label-after'] || '후']]) {
  const abs = path.resolve(process.cwd(), file)
  if (!fs.existsSync(abs)) { console.error(`사진이 없습니다: ${abs}`); process.exit(1) }
  const s = loadPng(abs)
  if (s.err) { console.error(`붙일 수 없는 사진입니다(${s.err}): ${abs}`); process.exit(1) }
  const st = fs.statSync(abs)
  inputs.push({ real: fold(fs.realpathSync.native(abs)), dev: st.dev, ino: st.ino })
  sides.push({ ...s, label })
}

const out = path.resolve(process.cwd(), opts['--out'])
{
  let lst = null
  try { lst = fs.lstatSync(out) } catch { /* 없음 */ }
  if (lst) {
    if (lst.isSymbolicLink()) { console.error(`출력 자리가 링크입니다(쓰지 않음): ${out}`); process.exit(1) }
    const st = fs.statSync(out)
    const real = fold(fs.realpathSync.native(out))
    if (inputs.some((x) => x.real === real || (x.ino && x.dev === st.dev && x.ino === st.ino))) { console.error(`출력이 입력 사진과 같은 파일입니다 — 원본을 덮어쓰지 않습니다: ${out}`); process.exit(1) }
    if (!force) { console.error(`출력 파일이 이미 있습니다(덮어쓰려면 --force): ${out}`); process.exit(1) }
  }
  if (path.extname(out).toLowerCase() !== '.png') { console.error('--out 은 .png 로 끝나야 합니다.'); process.exit(1) }
}

let chromium
try {
  ;({ chromium } = await import('playwright'))
} catch {
  console.error('사진을 붙이는 도구(playwright)가 이 프로젝트에 없습니다. 화면 캡처와 같은 도구입니다.')
  console.error('  npm i -D playwright  →  npx playwright install chromium')
  console.error('지금은 전·후 사진을 report.mjs 에 --shot 으로 따로 넣고, 설명(--caption)에 "전"·"후"를 적으세요.')
  process.exit(3)
}

// 한 칸 폭: 휴대폰 사진은 그대로(최대 420), PC 사진은 640 으로 줄인다.
const colW = Math.min(Math.max(...sides.map((s) => s.w)), sides.every((s) => s.w <= 500) ? 420 : 640)
const gap = 24
const pad = 24
const title = opts['--title']
const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0}
body{background:#f4f4f2;color:#1d1d1b;font-family:system-ui,-apple-system,"Malgun Gothic","Apple SD Gothic Neo",sans-serif;padding:${pad}px}
h1{font-size:18px;font-weight:700;margin-bottom:14px}
.row{display:grid;grid-template-columns:repeat(2,${colW}px);gap:${gap}px;align-items:start}
figure{background:#fff;border:1px solid #d8d6d0;border-radius:10px;padding:10px}
figcaption{font-size:15px;font-weight:700;margin-bottom:8px}
img{display:block;width:100%;height:auto;border-radius:6px;border:1px solid #e6e4df}
</style></head><body>${title ? `<h1>${esc(title)}</h1>` : ''}<div class="row">${sides.map((s) =>
  `<figure><figcaption>${esc(s.label)}</figcaption><img src="data:image/png;base64,${s.data.toString('base64')}" alt="${esc(s.label)}"></figure>`).join('')}</div></body></html>`

const tmp = `${out}.tmp-${process.pid}.png`
let browser = null
let code = 0
try {
  try { browser = await chromium.launch() } catch (e) {
    console.error(`브라우저를 띄우지 못했습니다: ${String(e.message).split('\n')[0]}`)
    console.error('한 번만 `npx playwright install chromium` 을 실행한 뒤 다시 시도하세요.')
    code = 3
  }
  if (browser) {
    const page = await browser.newPage({ viewport: { width: colW * 2 + gap + pad * 2 + 2, height: 120 }, deviceScaleFactor: 1 })
    await page.setContent(html, { waitUntil: 'load' })
    const bad = await page.evaluate(async () => {
      const r = []
      for (const [i, img] of [...document.images].entries()) { try { await img.decode(); if (!img.naturalWidth) r.push(i) } catch { r.push(i) } }
      return r
    })
    if (bad.length) {
      console.error(`사진이 깨져 그려지지 않습니다: ${bad.map((i) => (i === 0 ? '전' : '후')).join('·')} — 다시 캡처하세요.`)
      code = 1
    } else {
      fs.mkdirSync(path.dirname(out), { recursive: true })
      await page.screenshot({ path: tmp, fullPage: true })
      fs.renameSync(tmp, out)
      console.log(`나란히 붙였습니다: ${path.relative(process.cwd(), out).split(path.sep).join('/')}`)
    }
  }
} catch (e) {
  console.error(`사진을 붙이지 못했습니다: ${String(e.message).split('\n')[0]}`)
  console.error('지금은 전·후 사진을 report.mjs 에 --shot 으로 따로 넣고, 설명(--caption)에 "전"·"후"를 적으세요.')
  code = 3
} finally {
  if (browser) { try { await browser.close() } catch { /* 무시 */ } }
  try { fs.rmSync(tmp, { force: true }) } catch { /* 무시 */ }
}
process.exit(code)
