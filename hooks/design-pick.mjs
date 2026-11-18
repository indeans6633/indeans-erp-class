#!/usr/bin/env node
// 디자인 선택창 — .owner/design/ 의 선택창(index.html)을 이 컴퓨터 안(127.0.0.1)에서만 띄우고,
// 대표가 '이걸로 하기'를 누르면 고른 조합으로 파일을 만든 뒤 끝난다.
// 바깥 인터넷 연결 없음 · 프로젝트 폴더 밖에 쓰지 않음 · Windows(PowerShell)·macOS 양쪽.
//
// 2026-11-17 개정(리허설 반영): 2단계 선택창(테마 4 → 세부 설정)과 새 조합 코드
//   theme-<테마>-<RRGGBB>-<밝기>-<메뉴>-<본문> 을 읽고 만든다. 선택창 '이걸로 하기'가 이 서버에 저장(POST /choose)한다.
//
// 사용(프로젝트 폴더에서):
//   node .owner/hooks/design-pick.mjs --branch B1                       인터뷰 업종 가지로 추천 테마를 먼저 골라 둔 채 연다(?branch=B1)
//   node .owner/hooks/design-pick.mjs                                   추천 없이 연다(인터뷰 전 · 업종 미정)
//   node .owner/hooks/design-pick.mjs --recommend theme-large           테마로 추천(색·밝기·메뉴·본문까지 줄 수 있음: theme-large-CA8A04-light-bottom-cards)
//   node .owner/hooks/design-pick.mjs --code theme-large-CA8A04-light-bottom-cards   서버 없이 그 조합으로 바로 파일을 만든다
//   node .owner/hooks/design-pick.mjs --check                           파일·글꼴·빈 포트·대비만 점검(브라우저를 열지 않는다)
//   그 밖: --no-open(브라우저 안 엶) · --port <번호>(기본: 빈 포트 자동) · --minutes <분>(무응답 제한, 기본 30)
//          --project <폴더>(기본: 이 파일이 든 .owner/hooks 의 프로젝트, 아니면 지금 폴더)
//
// 조합 코드(새): theme-<테마>-<RRGGBB>-<밝기>-<메뉴>-<본문>
//   테마 shop 따뜻한 매장 · large 큰 글씨 · list 촘촘한 목록 · brand 우리 회사 색 / 밝기 light·dark(auto 도 됨)
//   메뉴 side 왼쪽 · top 위쪽 · bottom 아래 탭 / 본문 cards 카드 · table 목록 · board 보드
//   예) theme-large-CA8A04-light-bottom-cards · theme-list-0F766E-light-side-table
//   대표가 「디자인은 … 로 할게요.」 문장을 통째로 붙여도 코드만 골라 읽는다.
// 옛 코드 <구조>-<스타일>-<색 | custom-RRGGBB>-<밝기>[-<모서리>][-<밀도>] 도 그대로 읽는다(이미 고른 수강생용).
//
// 만드는 파일(프로젝트 폴더 기준):
//   .owner/design/choice.json   { theme, nav, body, branch, structure, seed, scheme, code, label, chosen_at } (옛 코드면 family·palette·radius·density)
//   src/styles/tokens.css       고른 조합의 토큰(첫 줄 주석에 조합 코드). 밝기 자동이면 밝게 + 어둡게 두 블록
//   src/styles/base.css         .owner/design/src/base.css 복사(화면 공통 뼈대)
//   src/styles/layout.css       .owner/design/src/layout-<구조>.css (본문 모양) + layout-nav-<메뉴>.css (메뉴 위치) 를 이어 붙임
//   src/styles/fonts/           고른 스타일이 쓰는 글꼴 파일(woff2)과 라이선스 전문(LICENSE-*.txt)
//   이미 있던 세 CSS 가 새것과 다르면 .owner/tmp/design-backup/<시각>/ 에 먼저 남긴다.
//
// 쓰기 안전: 쓰는 자리의 경로를 프로젝트 폴더부터 한 칸씩 lstat 로 확인해 링크(심볼릭 링크·정션 — 끊어진 것 포함)를
//   하나라도 거치면 쓰지 않는다. 기존 파일은 직접 덮어쓰지 않고, 확인한 폴더 안에 새 임시 파일을 만든 뒤 바꿔 끼운다
//   (하드 링크로 프로젝트 밖 파일과 이어져 있어도 밖의 파일은 바뀌지 않는다).
//
// 끝나는 코드: 0 고름(또는 --code·--check 통과) · 1 설치·인자·파일 문제 · 2 고르지 않고 끝남(무응답·중단)
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import crypto from 'node:crypto'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const flag = (n, d = null) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d }
const has = (n) => args.includes(n)

const ROOT = (() => {
  const p = flag('--project')
  if (p) return path.resolve(p)
  if (path.basename(HERE) === 'hooks' && path.basename(path.dirname(HERE)) === '.owner') return path.dirname(path.dirname(HERE))
  return process.cwd()
})()
const DESIGN = path.join(ROOT, '.owner', 'design')
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/')
const lf = (s) => String(s).replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')

// 선택창이 돌려면 있어야 하는 것(설치기가 .owner/design/ 에 넣는다)
const REQUIRED = [
  'index.html', 'app/color-engine.js', 'app/design-rules.js', 'app/selector.js', 'app/selector.css',
  'src/base.css', 'src/layout-list.css', 'src/layout-board.css', 'src/layout-card.css',
  'src/layout-nav-side.css', 'src/layout-nav-top.css', 'src/layout-nav-bottom.css',
  'src/list.html', 'src/board.html', 'src/card.html',
  'fonts/Pretendard-Regular.subset.woff2', 'fonts/Pretendard-Bold.subset.woff2', 'fonts/GowunBatang-Bold.subset.woff2',
  'fonts/LICENSE-Pretendard.txt', 'fonts/LICENSE-GowunBatang.txt',
]

function die(msg, code = 1) { console.error(msg); process.exit(code) }

// 색 엔진·규칙 파일(브라우저용 일반 스크립트)을 이 프로그램 안의 별도 칸(vm)에서 읽는다 — 선택창과 같은 규칙으로 토큰을 만든다
function loadRules() {
  const box = {}
  vm.createContext(box)
  for (const f of ['color-engine.js', 'design-rules.js']) {
    const file = path.join(DESIGN, 'app', f)
    vm.runInContext(fs.readFileSync(file, 'utf8'), box, { filename: file, timeout: 4000 })
  }
  const R = box.ERP_DESIGN
  if (!R || typeof R.tokenCss !== 'function' || typeof R.parseCode !== 'function' || typeof R.selfCheck !== 'function') throw new Error('규칙 파일에서 ERP_DESIGN 을 찾지 못했습니다')
  if (!Array.isArray(R.themes) || typeof R.parseThemeCode !== 'function') throw new Error('규칙 파일이 옛 판입니다(테마 코드를 모름) — 강의 자료의 설치기를 다시 실행하세요')
  return R
}

function missingFiles() {
  if (!fs.existsSync(DESIGN)) return ['.owner/design/ (폴더 전체)']
  return REQUIRED.filter((f) => !fs.existsSync(path.join(DESIGN, f))).map((f) => `.owner/design/${f}`)
}

function needInstall(list) {
  die([
    '선택창 파일이 없습니다 — 설치가 덜 됐거나 다른 폴더에서 실행했습니다.',
    ...list.slice(0, 8).map((f) => `  없음: ${f}`),
    `  프로젝트 폴더로 본 곳: ${ROOT}`,
    '프로젝트 폴더에서 다시 실행하고, 그래도 없으면 강의 자료의 설치기(install.mjs)를 다시 실행하세요.',
  ].join('\n'))
}

/* ── 쓰기 안전 ──────────────────────────────────────────── */
const ROOT_REAL = (() => { try { return fs.realpathSync(ROOT) } catch { return ROOT } })()
const inside = (base, p) => p === base || p.startsWith(base.endsWith(path.sep) ? base : base + path.sep)

// 쓰는 자리가 프로젝트 폴더 안이고, 프로젝트 폴더부터 그 자리까지 어느 칸도 링크가 아닌지.
// 끊어진 링크도 lstat 로는 보이므로 여기서 걸린다(existsSync 는 링크를 따라가서 끊어진 링크를 "없음"으로 본다).
function assertSafeTarget(target, kind = 'file') {
  const abs = path.resolve(target)
  if (!inside(ROOT, abs) || abs === ROOT) throw new Error(`프로젝트 폴더 밖에는 쓰지 않습니다: ${abs}`)
  const parts = path.relative(ROOT, abs).split(path.sep)
  let cur = ROOT
  for (let i = 0; i < parts.length; i++) {
    cur = path.join(cur, parts[i])
    let st
    try { st = fs.lstatSync(cur) } catch (e) { if (e.code === 'ENOENT') break; throw e }
    if (st.isSymbolicLink()) throw new Error(`링크(바로 가기·정션)를 거치는 경로라 쓰지 않습니다: ${rel(cur)} — 그 링크를 지우거나 실제 폴더로 바꾼 뒤 다시 실행하세요`)
    const last = i === parts.length - 1
    if (!last && !st.isDirectory()) throw new Error(`폴더 자리에 파일이 있습니다: ${rel(cur)}`)
    if (last && kind === 'file' && !st.isFile()) throw new Error(`파일 자리에 폴더나 특수 파일이 있습니다: ${rel(cur)}`)
    if (last && kind === 'dir' && !st.isDirectory()) throw new Error(`폴더 자리에 파일이 있습니다: ${rel(cur)}`)
  }
  // 있는 가장 깊은 칸의 실제 경로도 프로젝트 안인지(드라이브 바꾸기·프로젝트 폴더 자체가 링크인 경우 대비)
  let probe = abs
  for (;;) {
    try { fs.lstatSync(probe); break } catch { const up = path.dirname(probe); if (up === probe) break; probe = up }
  }
  const real = fs.realpathSync(probe)
  if (!inside(ROOT_REAL, real)) throw new Error(`프로젝트 폴더 밖을 가리키는 폴더라 쓰지 않습니다: ${rel(probe) || probe}`)
  return abs
}

function sleepMs(ms) { try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms) } catch { /* 기다리지 못하면 바로 */ } }

// 확인한 폴더 안에 새 임시 파일(같은 이름이 있으면 실패 — 'wx')을 만든 뒤 바꿔 끼운다.
// 기존 파일 내용을 그 자리에서 고치지 않으므로, 그 파일이 하드 링크로 밖과 이어져 있어도 밖은 그대로다.
function safeWrite(file, data) {
  assertSafeTarget(file)
  const dir = path.dirname(file)
  assertSafeTarget(dir, 'dir')
  fs.mkdirSync(dir, { recursive: true })
  assertSafeTarget(file)
  const tmp = path.join(dir, `.${path.basename(file)}.${process.pid}.${crypto.randomBytes(5).toString('hex')}.tmp`)
  const fd = fs.openSync(tmp, 'wx')
  try { fs.writeSync(fd, typeof data === 'string' ? Buffer.from(data, 'utf8') : data) } finally { fs.closeSync(fd) }
  let lastErr = null
  for (let i = 0; i < 4; i++) {
    try { fs.renameSync(tmp, file); return } catch (e) { lastErr = e; if (e.code !== 'EPERM' && e.code !== 'EBUSY' && e.code !== 'EACCES') break; sleepMs(150) }
  }
  try { fs.unlinkSync(tmp) } catch { /* 이미 없음 */ }
  throw new Error(`파일을 바꿔 끼우지 못했습니다(${lastErr && lastErr.code}): ${rel(file)} — 그 파일을 연 프로그램을 닫고 다시 실행하세요`)
}

function writeChoice(R, input) {
  const sel = R.normalize(input)
  if (!R.isValid(sel, true)) throw new Error(`알 수 없는 조합입니다: ${JSON.stringify(input)}`)
  const chk = R.selfCheck(sel)
  if (!chk.ok) throw new Error(`글자 대비 검사를 통과하지 못했습니다: ${chk.fails.slice(0, 3).join(', ')} — 다른 색을 고르세요`)
  const code = R.makeCode(sel)
  const styles = path.join(ROOT, 'src', 'styles')
  const fontsDir = path.join(styles, 'fonts')
  const fonts = R.fontsOf(sel)
  const out = [
    { key: 'tokens', file: path.join(styles, 'tokens.css'), body: lf(R.tokenCss(sel, { fontBase: './fonts/' })) },
    { key: 'base', file: path.join(styles, 'base.css'), body: lf(fs.readFileSync(path.join(DESIGN, 'src', 'base.css'), 'utf8')) },
    { key: 'layout', file: path.join(styles, 'layout.css'), body: layoutBody(sel) },
  ]
  for (const f of fonts.files) out.push({ key: 'font', file: path.join(fontsDir, f), body: fs.readFileSync(path.join(DESIGN, 'fonts', f)) })
  for (const f of fonts.licenses) out.push({ key: 'license', file: path.join(fontsDir, f), body: lf(fs.readFileSync(path.join(DESIGN, 'fonts', f), 'utf8')) })
  const choice = sel.theme
    ? {
        theme: sel.theme, seed: sel.seed, scheme: sel.scheme, nav: sel.nav, body: sel.body, structure: sel.structure,
        branch: input.branch || null, code, label: R.label(sel), chosen_at: new Date().toISOString(),
      }
    : {
        structure: sel.structure, family: sel.family, palette: sel.palette, seed: sel.seed,
        scheme: sel.scheme, radius: sel.radius, density: sel.density, code, chosen_at: new Date().toISOString(),
      }
  out.push({ key: 'choice', file: path.join(DESIGN, 'choice.json'), body: JSON.stringify(choice, null, 2) + '\n' })
  out.forEach((o) => assertSafeTarget(o.file))

  // 이미 있던 CSS 가 새것과 다르면 먼저 남긴다(값을 손본 흔적이 사라지지 않게)
  const stamp = choice.chosen_at.replace(/[:.]/g, '-')
  const backupDir = path.join(ROOT, '.owner', 'tmp', 'design-backup', stamp)
  const backed = []
  for (const o of out.slice(0, 3)) {
    if (!fs.existsSync(o.file)) continue
    if (lf(fs.readFileSync(o.file, 'utf8')) === o.body) continue
    safeWrite(path.join(backupDir, path.basename(o.file)), fs.readFileSync(o.file))
    backed.push(path.basename(o.file))
  }
  for (const o of out) {
    if (o.key === 'font' && fs.existsSync(o.file) && Buffer.compare(fs.readFileSync(o.file), o.body) === 0) continue
    safeWrite(o.file, o.body)
  }
  return {
    code,
    label: R.label(sel),
    choice,
    files: out.filter((o) => o.key !== 'font' && o.key !== 'license').map((o) => rel(o.file)).concat(fonts.files.length ? [`${rel(fontsDir)}/ (글꼴 ${fonts.files.length}개 + 라이선스 ${fonts.licenses.length}개)`] : []),
    backup: backed.length ? `${rel(backupDir)}/ (${backed.join(', ')})` : null,
  }
}

// layout.css = 본문 모양(구조) 뼈대 + 메뉴 위치 뼈대(새 코드일 때). 메뉴 위치 절이 뒤에 와서 구조 쪽 메뉴 배치를 덮는다
function layoutBody(sel) {
  const parts = [lf(fs.readFileSync(path.join(DESIGN, 'src', `layout-${sel.structure}.css`), 'utf8'))]
  if (sel.nav) {
    parts.push(`\n/* ── 메뉴 위치: ${sel.nav} (선택창 2단계 「메뉴 위치」 · 조합 코드 theme-…-${sel.nav}-${sel.body}) ── */\n`)
    parts.push(lf(fs.readFileSync(path.join(DESIGN, 'src', `layout-nav-${sel.nav}.css`), 'utf8')))
  }
  return parts.join('\n')
}

function printDone(r) {
  console.log('')
  console.log(`골랐습니다: ${r.label} (${r.code})`)
  console.log(`대표님께 소리 내어 확인: 「${r.label}(${r.code})로 하겠습니다.」`)
  console.log('만든 파일:')
  r.files.forEach((f) => console.log(`  ${f}`))
  if (r.backup) console.log(`전에 있던 파일은 여기에 남겼습니다: ${r.backup}`)
  console.log('다음: company/design.md 를 쓰고 .owner/state.md·progress.json 을 고칩니다(indeans-erp-design 절차). 초안 계획은 새 대화에서(B1, Plan 모드).')
}

function codeHelp(R) {
  return [
    '형식: theme-<테마>-<RRGGBB>-<밝기>-<메뉴>-<본문>   예) theme-large-CA8A04-light-bottom-cards · theme-list-0F766E-light-side-table',
    `  테마: ${R.themes.map((t) => `${t.id}(${t.ko})`).join(' · ')}`,
    '  색: # 없이 여섯 자리(0~9, A~F) — 선택창 아래에 나온 그대로',
    '  밝기: light(밝게) · dark(어둡게) · auto(기기 설정)',
    `  메뉴: ${R.navs.map((n) => `${n.id}(${n.ko})`).join(' · ')}   본문: ${R.bodies.map((b) => `${b.id}(${b.ko})`).join(' · ')}`,
    '옛 형식(<구조>-<스타일>-<색>-<밝기>)도 읽습니다.',
  ].join('\n')
}

/* ── --check : 파일·글꼴·대비·빈 포트만 본다 ─────────────── */
async function runCheck() {
  const problems = []
  const lines = []
  const miss = missingFiles()
  if (miss.length) problems.push(...miss.map((f) => `없음: ${f}`))
  let R = null
  if (!miss.includes('.owner/design/ (폴더 전체)') && fs.existsSync(path.join(DESIGN, 'app', 'design-rules.js')) && fs.existsSync(path.join(DESIGN, 'app', 'color-engine.js'))) {
    try { R = loadRules() } catch (e) { problems.push(`규칙 파일을 읽지 못했습니다: ${e.message}`) }
  }
  if (R) {
    lines.push(`규칙: 구조 ${R.structures.length} · 스타일 ${R.families.length} · 색 ${R.palettes.length}+내 색 · 밝기 ${R.schemes.length} · 모서리 ${R.radii.length} · 밀도 ${R.densities.length}`)
    let sets = 0, pairs = 0
    const bad = []
    for (const f of R.families) for (const p of R.palettes) {
      const r = R.selfCheck({ family: f.id, palette: p.id, scheme: 'auto' })
      sets++; pairs += r.text + r.line
      if (!r.ok) bad.push(`${f.id}-${p.id}: ${r.fails.slice(0, 2).join(', ')}`)
    }
    if (bad.length) problems.push(...bad.slice(0, 5).map((b) => `대비 미달 ${b}`))
    else lines.push(`대비: 스타일×색 ${sets}벌 · 밝게·어둡게 ${pairs}짝 모두 통과`)
    const tbad = []
    let tsets = 0
    for (const t of R.themes) for (const scheme of ['light', 'dark']) {
      const r = R.selfCheck({ theme: t.id, scheme })
      tsets++
      if (!r.ok) tbad.push(`theme-${t.id}-${scheme}: ${r.fails.slice(0, 2).join(', ')}`)
    }
    if (tbad.length) problems.push(...tbad.slice(0, 5).map((b) => `대비 미달 ${b}`))
    else lines.push(`테마: ${R.themes.length}개 × 밝게·어둡게 ${tsets}벌 대비 통과 · 업종 추천 ${Object.keys(R.branchTheme).join('·')}`)
    const needFonts = new Set(R.families.flatMap((f) => { const x = R.fontsOf({ family: f.id }); return [...x.files, ...x.licenses] }))
    const noFont = [...needFonts].filter((f) => !fs.existsSync(path.join(DESIGN, 'fonts', f)))
    if (noFont.length) problems.push(`글꼴 파일이 없습니다(.owner/design/fonts/): ${noFont.join(', ')}`)
    else lines.push(`글꼴: ${needFonts.size}개 파일 있음(.owner/design/fonts/)`)
    try { R.tokenCss({ structure: 'list', ...R.defaults }); R.tokenCss(R.parseCode('theme-list-0F766E-light-side-table')) } catch (e) { problems.push(`토큰을 만들지 못했습니다: ${e.message}`) }
  }
  try {
    const port = await freePort()
    lines.push(`빈 포트: 확보 가능(이번 점검에서 ${port} 번을 잠깐 열었다 닫음)`)
  } catch (e) {
    problems.push(`이 컴퓨터 안(127.0.0.1)에서 빈 포트를 열지 못했습니다: ${e.message} — 보안 프로그램이 막는지 확인하세요. 막혀도 .owner/design/index.html 을 직접 열어 고를 수 있습니다`)
  }
  if (fs.existsSync(path.join(DESIGN, 'choice.json'))) {
    try { lines.push(`이미 고른 조합: ${JSON.parse(fs.readFileSync(path.join(DESIGN, 'choice.json'), 'utf8')).code}`) } catch { lines.push('이미 고른 조합: choice.json 을 읽지 못함') }
  }
  console.log(`선택창 점검 — 프로젝트: ${ROOT}`)
  lines.forEach((l) => console.log(`  ${l}`))
  if (problems.length) {
    console.log(`문제 ${problems.length}건:`)
    problems.forEach((p) => console.log(`  - ${p}`))
    process.exit(1)
  }
  console.log('선택창 점검 통과. `node .owner/hooks/design-pick.mjs` 로 열 수 있습니다.')
  process.exit(0)
}

function freePort(wanted = 0) {
  return new Promise((resolve, reject) => {
    const s = http.createServer()
    s.once('error', reject)
    s.listen(wanted, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)) })
  })
}

/* ── 브라우저 열기(open.mjs 와 같은 방식) ─────────────────── */
function openBrowser(url, onFail) {
  try {
    let child
    if (process.platform === 'win32') {
      child = spawn(process.env.COMSPEC || 'cmd.exe', ['/d', '/s', '/c', `start "" "${url.replaceAll('"', '')}"`], {
        stdio: 'ignore', detached: true, windowsHide: true, windowsVerbatimArguments: true,
      })
    } else if (process.platform === 'darwin') {
      child = spawn('open', [url], { stdio: 'ignore', detached: true })
    } else {
      child = spawn('xdg-open', [url], { stdio: 'ignore', detached: true })
    }
    child.on('error', onFail)
    child.on('exit', (code) => { if (code) onFail(new Error(`종료 코드 ${code}`)) })
    child.unref()
  } catch (e) { onFail(e) }
}

/* ── 선택창 서버 ─────────────────────────────────────────── */
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.md': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
}
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'; frame-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'; object-src 'none'"

async function runServer(R, recommend) {
  const minutes = Math.min(180, Math.max(1, Number(flag('--minutes', '30')) || 30))
  const token = crypto.randomBytes(18).toString('hex')
  const designReal = fs.realpathSync(DESIGN)
  let port = 0
  let idle = null
  let finished = false

  const head = (res, status, type, extra = {}) => res.writeHead(status, {
    'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': CSP, ...extra,
  })
  const json = (res, status, obj) => { head(res, status, 'application/json; charset=utf-8'); res.end(JSON.stringify(obj)) }
  const text = (res, status, msg) => { head(res, status, 'text/plain; charset=utf-8'); res.end(msg) }

  const server = http.createServer((req, res) => {
    handle(req, res).catch((e) => { try { json(res, 500, { ok: false, error: e.message }) } catch { /* 이미 보냄 */ } })
  })

  function resetIdle() {
    clearTimeout(idle)
    idle = setTimeout(() => finish(2, null), minutes * 60 * 1000)
  }

  function finish(code, result) {
    if (finished) return
    finished = true
    clearTimeout(idle)
    if (code === 0 && result) printDone(result)
    else if (code === 2) {
      console.log('')
      console.log(result === 'interrupt'
        ? '선택창을 닫았습니다(고르지 않음). 아무 파일도 만들지 않았습니다.'
        : `${minutes}분 동안 아무 반응이 없어 선택창을 닫았습니다. 아무 파일도 만들지 않았습니다. 다시 열려면 같은 명령을 실행하세요.`)
    }
    server.close()
    if (typeof server.closeAllConnections === 'function') setTimeout(() => server.closeAllConnections(), 150)
    setTimeout(() => process.exit(code), 400)
  }

  function sameOrigin(req) {
    const o = req.headers.origin
    const site = req.headers['sec-fetch-site']
    if (site && site !== 'same-origin') return false
    if (!o) return true
    return o === `http://127.0.0.1:${port}` || o === `http://localhost:${port}`
  }

  function readBody(req, limit) {
    return new Promise((resolve, reject) => {
      let size = 0
      const chunks = []
      req.on('data', (c) => { size += c.length; if (size > limit) { reject(new Error('보낸 내용이 너무 큽니다')); req.destroy() } else chunks.push(c) })
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
      req.on('error', reject)
    })
  }

  const field = (v) => (v == null ? undefined : String(v).slice(0, 40))

  async function handle(req, res) {
    // 이 컴퓨터 안의 주소로 들어온 요청만 받는다(다른 이름으로 이 서버를 부르는 웹 페이지를 막는다)
    const host = String(req.headers.host || '').toLowerCase()
    if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) return text(res, 403, '이 컴퓨터 안의 주소로만 열 수 있습니다.')
    let url
    try { url = new URL(req.url, `http://127.0.0.1:${port}`) } catch { return text(res, 400, '잘못된 주소입니다.') }
    const p = url.pathname

    if (p === '/ping' && req.method === 'GET') return json(res, 200, { ok: true })
    if (p === '/api/state' && req.method === 'GET') {
      resetIdle()
      return json(res, 200, { app: 'erp-design-pick', token, recommend, minutes })
    }
    if ((p === '/touch' || p === '/choose') && req.method === 'POST') {
      if (!sameOrigin(req) || req.headers['x-pick-token'] !== token) return json(res, 403, { ok: false, error: '이 선택창에서 보낸 요청이 아닙니다' })
      resetIdle()
      if (p === '/touch') return json(res, 200, { ok: true })
      if (finished) return json(res, 409, { ok: false, error: '이미 저장했습니다' })
      let sel
      try { sel = JSON.parse(await readBody(req, 4096)) } catch (e) { return json(res, 400, { ok: false, error: `보낸 내용을 읽지 못했습니다: ${e.message}` }) }
      if (!sel || typeof sel !== 'object' || Array.isArray(sel)) return json(res, 400, { ok: false, error: '보낸 내용의 모양이 틀렸습니다' })
      let result
      try {
        if (sel.code != null) {
          // 2단계 선택창: 조합 코드 하나를 보낸다(theme-<테마>-<RRGGBB>-<밝기>-<메뉴>-<본문>)
          const parsed = R.parseCode(String(sel.code).slice(0, 120))
          if (!parsed) throw new Error(`조합 코드를 읽지 못했습니다: ${String(sel.code).slice(0, 80)}`)
          if (recommend && recommend.branch) parsed.branch = recommend.branch
          result = writeChoice(R, parsed)
        } else {
          result = writeChoice(R, {
            theme: field(sel.theme), nav: field(sel.nav), body: field(sel.body),
            structure: field(sel.structure), family: field(sel.family), palette: field(sel.palette), seed: field(sel.seed),
            scheme: field(sel.scheme), radius: field(sel.radius), density: field(sel.density),
          })
        }
      } catch (e) {
        return json(res, 400, { ok: false, error: e.message })
      }
      json(res, 200, { ok: true, code: result.code, label: result.label, files: result.files, backup: result.backup })
      finish(0, result)
      return
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return text(res, 405, '허용되지 않는 요청입니다.')

    // 정적 파일 — .owner/design/ 안의 것만
    let name
    try { name = decodeURIComponent(p) } catch { return text(res, 400, '잘못된 주소입니다.') }
    if (/[\0\\:]/.test(name)) return text(res, 400, '잘못된 주소입니다.')
    if (name === '/' || name === '') name = '/index.html'
    if (name.split('/').some((seg) => seg.startsWith('.'))) return text(res, 403, '열 수 없는 경로입니다.')
    const abs = path.resolve(DESIGN, '.' + name)
    if (!abs.startsWith(DESIGN + path.sep)) return text(res, 403, '열 수 없는 경로입니다.')
    let real
    try { real = fs.realpathSync(abs) } catch { return text(res, 404, '없는 파일입니다.') }
    if (!real.startsWith(designReal + path.sep)) return text(res, 403, '열 수 없는 경로입니다.')
    const st = fs.statSync(real)
    if (!st.isFile()) return text(res, 404, '없는 파일입니다.')
    if (name === '/index.html') resetIdle()
    head(res, 200, TYPES[path.extname(real).toLowerCase()] || 'application/octet-stream', { 'Content-Length': st.size })
    if (req.method === 'HEAD') return res.end()
    fs.createReadStream(real).pipe(res)
  }

  const wanted = Number(flag('--port', '0')) || 0
  await new Promise((resolve, reject) => {
    server.once('error', (e) => {
      if (wanted && e.code === 'EADDRINUSE') {
        console.log(`${wanted} 번 포트는 이미 쓰는 중이라 빈 포트를 골라 엽니다.`)
        server.listen(0, '127.0.0.1', resolve)
      } else reject(e)
    })
    server.listen(wanted, '127.0.0.1', resolve)
  }).catch((e) => die(`선택창을 열지 못했습니다(${e.code || e.message}). 보안 프로그램이 막는지 확인하세요.\n대신 이 파일을 직접 열어 고를 수 있습니다: ${path.join(DESIGN, 'index.html')}`))
  port = server.address().port
  resetIdle()

  const query = recommend && recommend.branch ? `?branch=${recommend.branch}` : recommend && recommend.theme ? `?theme=${recommend.theme}` : ''
  const url = `http://127.0.0.1:${port}/${query}`
  const bar = '='.repeat(Math.max(44, url.length + 12))
  console.log(bar)
  console.log(`  디자인 선택창:  ${url}`)
  console.log(bar)
  console.log('브라우저가 저절로 열리지 않으면 위 주소를 브라우저 주소창에 붙여 넣으세요.')
  console.log('그래도 안 되면 이 파일을 직접 여세요(저장 기능이 없는 판 — 고른 뒤 나오는 조합 코드를 AI 에게 말합니다):')
  console.log(`  ${path.join(DESIGN, 'index.html')}${query}`)
  console.log('선택창: ① 테마 하나 → 「이 테마로 세부 설정」 → ② 밝기·메뉴 위치·본문 모양 → 「이걸로 하기」(여기서 저장됩니다).')
  if (recommend) console.log(`추천 표시: ${recommendLabel(R, recommend)}`)
  // 대표에게 그대로 옮길 말(11-17 r2 반영 — AI 가 주소만 알리고 추천 테마·누를 순서를 빼먹었다)
  const recTheme = recommend && recommend.theme ? (R.themes.find((x) => x.id === recommend.theme) || {}).ko : null
  console.log('')
  console.log('── 대표님께 그대로 전할 말(줄이지 말고 옮기세요) ──')
  console.log(recTheme
    ? `선택창을 엽니다. 인터뷰에서 고르신 업종에 맞춰 「${recTheme}」 테마를 먼저 골라 두었어요 — 다른 테마를 고르셔도 됩니다.`
    : '선택창을 엽니다. 네 가지 테마 중 하나를 골라 주세요.')
  console.log('① 테마 하나를 고르고 「이 테마로 세부 설정」을 누르세요.')
  console.log('② 밝기·메뉴 위치·본문 모양을 보고 맨 아래 「이걸로 하기」를 누르세요. 누르면 저장되고 창은 닫으셔도 됩니다.')
  console.log(`창이 안 보이면 이 주소를 브라우저 주소창에 붙여 넣으세요: ${url}`)
  console.log('── 여기까지 ──')
  console.log(`대표님이 '이걸로 하기'를 누를 때까지 기다립니다(${minutes}분 동안 아무 반응이 없으면 닫힙니다). 멈추려면 Ctrl+C.`)

  if (!has('--no-open')) {
    let warned = false
    openBrowser(url, (e) => {
      if (warned) return
      warned = true
      console.log('')
      console.log(`브라우저를 저절로 열지 못했습니다(${e && e.message ? e.message : '알 수 없음'}). 위 주소를 직접 여세요:`)
      console.log(`  >>>  ${url}  <<<`)
    })
  }

  process.on('SIGINT', () => finish(2, 'interrupt'))
  process.on('SIGTERM', () => finish(2, 'interrupt'))
}

function recommendLabel(R, rec) {
  if (rec.theme) {
    const t = R.themes.find((x) => x.id === rec.theme)
    const parts = [t ? t.ko : rec.theme]
    if (rec.branch) parts.push(`업종 가지 ${rec.branch} ${R.branchName[rec.branch]}`)
    if (rec.seed) parts.push(`색 ${rec.seed}`)
    if (rec.scheme) parts.push(rec.scheme)
    if (rec.nav) parts.push(`메뉴 ${rec.nav}`)
    if (rec.body) parts.push(`본문 ${rec.body}`)
    return parts.join(' · ')
  }
  const parts = []
  if (rec.structure) parts.push(R.byId(R.structures, rec.structure).ko)
  if (rec.family) parts.push(R.byId(R.families, rec.family).ko)
  if (rec.palette) parts.push(R.paletteLabel(rec))
  if (rec.scheme) parts.push(R.byId(R.schemes, rec.scheme).ko)
  return parts.join(' · ')
}

/* ── 시작 ───────────────────────────────────────────────── */
if (has('--check')) {
  await runCheck()
} else {
  const miss = missingFiles()
  if (miss.length) needInstall(miss)
  let R
  try { R = loadRules() } catch (e) { die(`선택창 규칙 파일을 읽지 못했습니다: ${e.message}\n강의 자료의 설치기(install.mjs)를 다시 실행하세요.`) }

  const codeArg = flag('--code')
  if (has('--code')) {
    const sel = codeArg ? R.parseCode(codeArg) : null
    if (!sel) die([`조합 코드를 읽지 못했습니다: ${codeArg || '(비어 있음)'}`, codeHelp(R)].join('\n'))
    try { printDone(writeChoice(R, sel)) } catch (e) { die(`파일을 만들지 못했습니다: ${e.message}`) }
    process.exit(0)
  }

  let recommend = null
  const brArg = flag('--branch')
  const recArg = flag('--recommend')
  if (brArg) {
    const br = R.parseBranch(brArg)
    if (br) recommend = { theme: R.branchTheme[br], branch: br }
    else console.log(`업종 가지를 읽지 못해 추천 없이 엽니다: ${brArg} (B1~B8 중 하나, 예: --branch B5)`)
  }
  if (!recommend && recArg) {
    recommend = R.parseRecommend(recArg)
    if (recommend && !recommend.theme) {
      // 옛 추천(list-bold 등)은 2단계 선택창이 모른다 — 테마 없이 열고 알린다
      console.log(`옛 추천 형식이라 추천 없이 엽니다: ${recArg} — 업종 가지가 있으면 --branch B1~B8 로 여세요.`)
      recommend = null
    } else if (!recommend) console.log(`추천을 읽지 못해 추천 표시 없이 엽니다: ${recArg} (예: --branch B5 · --recommend theme-list)`)
  }
  if (fs.existsSync(path.join(DESIGN, 'choice.json'))) {
    try { console.log(`지금 고른 조합: ${JSON.parse(fs.readFileSync(path.join(DESIGN, 'choice.json'), 'utf8')).code} — 다시 고르면 바뀝니다.`) } catch { /* 무시 */ }
  }
  await runServer(R, recommend)
}
