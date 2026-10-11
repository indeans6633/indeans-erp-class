#!/usr/bin/env node
// 가져온 앱 자동 진단 — 읽기만 한다. 네트워크 호출 없음. 앱 파일을 고치지 않는다(--out 으로 지정한 결과 파일 하나만 쓴다).
// indeans-erp-rebuild 절차 1(커밋 전 비밀값 확인)·3(진단)에서 부른다. AI 가 결과를 읽어 company/rebuild-diagnosis.md 를 쓴다.
//
// 사용: node <스킬 폴더>/assets/rebuild-scan.mjs [--project "<폴더>"] [--out ".owner/tmp/rebuild-scan.md"]
//   --out 이 있으면 그 파일에 UTF-8 로 쓴다(폴더가 없으면 만든다). 없으면 표준출력으로 낸다.
//   셸 리디렉션(>) 대신 --out 을 쓴다 — Windows PowerShell 5.1 의 > 는 UTF-16 파일을 만든다.
//
// 지키는 것:
//   - 이름이 .env · .env.* · .envrc 인 파일은 **열지 않는다**(있는지·git 이 추적하는지만 본다). 그런 이름의 폴더에는 들어가지 않는다.
//   - 결과의 **모든 줄**에 비밀값 가리기를 한 번 더 건다(40자 이상 토큰·sk-·eyJ·key=·password= 류 → [가림]).
//   - 링크(심볼릭 링크·정션)는 따라가지 않는다. 직접 읽는 파일(package.json·.gitignore·index.html·migrations)도 같은 검사를 거친다.
//   - 파일 하나 512KB 초과·전체 3,000개 초과분은 읽지 않고 "건너뜀 n개"로 적는다. 읽기 실패도 적는다.
//   - 과거 커밋 이력은 검사하지 않는다(지금 기록·스테이징만).
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

// ---- 옵션: 값 옵션은 한 번씩, 값이 반드시 있어야 한다 ----
const VALUE_OPTS = new Set(['--project', '--out'])
const opts = {}
{
  const argv = process.argv.slice(2)
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!VALUE_OPTS.has(a)) { console.error(`모르는 옵션입니다: ${a}\n사용: --project "<폴더>" --out "<결과 파일>"`); process.exit(1) }
    const v = argv[i + 1]
    if (v === undefined || v.startsWith('--')) { console.error(`${a} 뒤에 값을 적으세요(경로에 빈칸이 있으면 따옴표로 감쌉니다).`); process.exit(1) }
    if (opts[a] !== undefined) { console.error(`${a} 를 두 번 적었습니다.`); process.exit(1) }
    opts[a] = v; i++
  }
}
const root = path.resolve(opts['--project'] || process.cwd())
let realRoot
try { realRoot = fs.realpathSync.native(root) } catch { console.error(`폴더가 없습니다: ${root}`); process.exit(1) }
const fold = (s) => (process.platform === 'win32' ? s.toLowerCase() : s)

const isEnvName = (name) => { const n = name.toLowerCase(); return n === '.env' || n.startsWith('.env.') || n === '.envrc' }

// 프로젝트 안 상대 경로를 검사한다: 각 단계가 링크가 아니고 .env 이름이 아니며, 실제 경로가 프로젝트 안이어야 한다.
// 돌려주는 값: { ok, abs, kind('file'|'dir'), reason }
function checkPath(relPath) {
  const parts = relPath.split(/[\\/]+/).filter(Boolean)
  let cur = root
  let st = null
  for (const part of parts) {
    if (part === '..') return { ok: false, reason: '프로젝트 밖' }
    if (isEnvName(part)) return { ok: false, reason: '.env 이름' }
    cur = path.join(cur, part)
    try { st = fs.lstatSync(cur) } catch { return { ok: false, reason: '없음' } }
    if (st.isSymbolicLink()) return { ok: false, reason: '링크(따라가지 않음)' }
  }
  try {
    const rp = fold(fs.realpathSync.native(cur)); const rr = fold(realRoot)
    if (rp !== rr && !rp.startsWith(rr.endsWith(path.sep) ? rr : rr + path.sep)) return { ok: false, reason: '실제 경로가 프로젝트 밖' }
  } catch { return { ok: false, reason: '실제 경로 확인 실패' } }
  return { ok: true, abs: cur, kind: st && st.isDirectory() ? 'dir' : st && st.isFile() ? 'file' : 'other' }
}

const MAX_BYTES = 512 * 1024
const MAX_FILES = 3000
const skipped = { big: [], over: 0, readFail: [], links: [], directRefused: [] }
const cache = new Map()
const rel = (p) => path.relative(root, p).split(path.sep).join('/')
function read(abs) {
  if (cache.has(abs)) return cache.get(abs)
  let t = null
  try {
    const st = fs.lstatSync(abs)
    if (st.isSymbolicLink() || st.nlink > 1) { skipped.links.push(rel(abs) + (st.nlink > 1 ? '(하드 링크)' : '')); t = null }
    else if (st.size > MAX_BYTES) { skipped.big.push(rel(abs)); t = null }
    else t = fs.readFileSync(abs, 'utf8')
  } catch { skipped.readFail.push(rel(abs)); t = null }
  cache.set(abs, t)
  return t
}
const txt = (abs) => read(abs) || ''
// 직접 읽는 파일 — 공통 경로 검사를 거친다
function readDirect(relPath) {
  const c = checkPath(relPath)
  if (!c.ok) { if (c.reason !== '없음') skipped.directRefused.push(`${relPath}(${c.reason})`); return { exists: c.reason !== '없음', text: null, reason: c.reason } }
  if (c.kind !== 'file') return { exists: true, text: null, reason: '파일이 아님' }
  const t = read(c.abs)
  return { exists: true, text: t, reason: t === null ? '읽지 못함' : null }
}

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.nuxt', '.output', '.vercel', '.turbo', 'coverage', '.cache', '.vite',
  '.owner', '.claude', '.agents', '.codex', 'course', 'reports'])
const TEXT_EXT = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.vue', '.svelte', '.astro', '.html', '.css', '.scss', '.sass', '.less', '.json', '.sql', '.md'])
const CODE_EXT = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.vue', '.svelte', '.astro', '.html'])

const envFound = []        // 프로젝트 안 .env 계열 파일 상대 경로(열지 않음)
const envDirs = []
const all = []
let seen = 0
function walk(dir) {
  let entries = []
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { skipped.readFail.push(rel(dir) + '/'); return }
  for (const e of entries) {
    const p = path.join(dir, e.name)
    if (e.isSymbolicLink()) { skipped.links.push(rel(p)); continue }
    if (isEnvName(e.name)) { if (e.isDirectory()) envDirs.push(rel(p)); else envFound.push(rel(p)); continue }
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(p); continue }
    if (!e.isFile()) continue
    try { if (fs.lstatSync(p).nlink > 1) { skipped.links.push(rel(p) + '(하드 링크)'); continue } } catch { skipped.readFail.push(rel(p)); continue }
    seen++
    if (all.length >= MAX_FILES) { skipped.over++; continue }
    all.push(p)
  }
}
{
  const pj = checkPath('package.json'); const ih = checkPath('index.html')
  if (!(pj.ok && pj.kind === 'file') && !(ih.ok && ih.kind === 'file')) {
    console.error(`앱 폴더로 보이지 않습니다(package.json·index.html 없음 또는 링크): ${root}`)
    process.exit(1)
  }
}
walk(root)

const textFiles = all.filter((p) => TEXT_EXT.has(path.extname(p).toLowerCase()))
const srcFiles = textFiles.filter((p) => /^(src|app|pages|components|lib|public|routes)\//.test(rel(p)) || /^[^/]+\.(html|js|ts|mjs|cjs)$/.test(rel(p)))
const codeFiles = srcFiles.filter((p) => CODE_EXT.has(path.extname(p).toLowerCase()))
const cssFiles = textFiles.filter((p) => /\.(css|scss|sass|less)$/i.test(p))
const out = []
const h = (t) => out.push('', `## ${t}`, '')
const li = (t) => out.push(`- ${t}`)
const RAW = '\u0000RAW\u0000'   // 이 표시로 시작하는 줄은 가리기를 건너뛴다(경로만 담은 줄)
const NOT_SURE ='자동으로 확인하지 못함 — 캡처·코드로 확인'

out.push('# 가져온 앱 자동 진단 결과 (rebuild-scan)', '', `폴더: ${root}`, `시각: ${new Date().toISOString()}`, '',
  '> 글자로 찾은 결과다. 판정은 AI 가 references/diagnosis.md 기준으로 다시 한다. 비밀값은 파일 이름과 종류만 적었고, 모든 줄에 가리기를 한 번 더 걸었다.',
  '> "못 찾음"은 "없음"이 아니다 — 자동으로 확인하지 못한 것이다.')

// ---- 1. 스택 ----
let pkg = {}
let pkgNote = ''
{
  const r = readDirect('package.json')
  if (!r.exists) pkgNote = 'package.json 없음(단일 HTML 앱일 수 있다)'
  else if (r.text === null) pkgNote = `package.json 을 읽지 못함(${r.reason}) — ${NOT_SURE}`
  else {
    try {
      const v = JSON.parse(r.text.replace(new RegExp('^' + String.fromCharCode(0xFEFF)), '') || 'null')
      if (v && typeof v === 'object' && !Array.isArray(v)) pkg = v
      else pkgNote = 'package.json 내용이 객체가 아님 — 확인 못 함'
    } catch { pkgNote = 'package.json 이 JSON 으로 읽히지 않음 — 확인 못 함' }
  }
}
const objOr = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {})
const depsRun = objOr(pkg.dependencies)
const depsDev = objOr(pkg.devDependencies)
const deps = { ...depsRun, ...depsDev }
const has = (n) => Object.prototype.hasOwnProperty.call(deps, n)
const pick = (pairs) => pairs.filter(([n]) => has(n)).map(([n, label]) => `${label}(${deps[n]})`)
h('1. 스택')
if (pkgNote) li(pkgNote)
li(`화면 틀: ${pick([['react', 'React'], ['vue', 'Vue'], ['svelte', 'Svelte'], ['@sveltejs/kit', 'SvelteKit'], ['next', 'Next.js'], ['nuxt', 'Nuxt'], ['@angular/core', 'Angular'], ['solid-js', 'Solid'], ['preact', 'Preact'], ['lit', 'Lit'], ['astro', 'Astro']]).join(' · ') || '(못 찾음)'}`)
li(`만드는 도구: ${pick([['vite', 'Vite'], ['react-scripts', 'CRA'], ['next', 'Next.js'], ['parcel', 'Parcel'], ['webpack', 'webpack']]).join(' · ') || '(못 찾음)'}`)
li(`TypeScript: ${has('typescript') || codeFiles.some((p) => /\.tsx?$/.test(p)) ? '있음' : '못 찾음'}`)
li(`모양(스타일): ${pick([['tailwindcss', 'Tailwind'], ['styled-components', 'styled-components'], ['@emotion/react', 'Emotion'], ['@mui/material', 'MUI'], ['antd', 'Ant Design'], ['@chakra-ui/react', 'Chakra'], ['bootstrap', 'Bootstrap'], ['sass', 'Sass']]).join(' · ') || '일반 CSS(라이브러리 못 찾음)'}`)
li(`화면 이동: ${pick([['react-router-dom', 'react-router'], ['vue-router', 'vue-router'], ['@tanstack/react-router', 'TanStack Router']]).join(' · ') || '(라이브러리 못 찾음 — 상태값 또는 파일 경로로 이동)'}`)
li(`저장 관련 라이브러리: ${pick([['@supabase/supabase-js', 'Supabase'], ['firebase', 'Firebase'], ['dexie', 'Dexie(IndexedDB)'], ['localforage', 'localForage'], ['zustand', 'Zustand'], ['@prisma/client', 'Prisma'], ['drizzle-orm', 'Drizzle'], ['better-sqlite3', 'SQLite'], ['axios', 'axios']]).join(' · ') || '(못 찾음)'}`)
const scripts = objOr(pkg.scripts)
li(`실행 명령(scripts): ${Object.keys(scripts).length ? Object.entries(scripts).map(([k, v]) => `${k} = \`${String(v)}\``).join(' · ') : '(없음)'}`)
const LIFECYCLE = ['preinstall', 'install', 'postinstall', 'prepare', 'predev', 'dev', 'prestart', 'start', 'prebuild', 'build']
const DATA_CMD = /migrat|seed|prisma\s+(db|migrate)|drizzle-kit\s+(push|migrate)|supabase\s+(db|migration)|\bdb[:\s]|knex|sequelize|typeorm|reset|truncate|drop\b/i
const risky = LIFECYCLE.filter((k) => typeof scripts[k] === 'string' && DATA_CMD.test(scripts[k]))
li(`설치·실행 때 자동으로 도는 명령 중 데이터를 바꿀 수 있는 것: ${risky.length ? risky.map((k) => `${k} = \`${scripts[k]}\``).join(' · ') + ' — **실행 전에 대표에게 묻는다**' : '못 찾음(그래도 npm run 으로 이어진 다른 스크립트는 사람이 한 번 본다)'}`)
li(`의존성 개수: dependencies ${Object.keys(depsRun).length} · devDependencies ${Object.keys(depsDev).length} · node_modules ${fs.existsSync(path.join(root, 'node_modules')) ? '있음' : '없음(npm install 필요)'}`)
if (fs.existsSync(path.join(root, 'apps')) || fs.existsSync(path.join(root, 'packages')) || typeof pkg.workspaces !== 'undefined') li('여러 앱이 한 저장소에 든 구조(apps/·packages/·workspaces)로 보인다 — **지원 범위 밖**, 대표와 어느 앱을 볼지 먼저 정한다')

// ---- 2. 화면 ----
h('2. 화면 수와 이름')
const SCREEN_DIRS = ['src/pages', 'src/screens', 'src/views', 'src/routes', 'src/app', 'app', 'pages', 'routes']
const screenFiles = codeFiles.filter((p) => SCREEN_DIRS.some((d) => rel(p).startsWith(d + '/'))
  && !/(\.test|\.spec|\.stories)\./.test(p) && !/\/(styles?|components|lib|utils|hooks)\//.test(rel(p)))
if (screenFiles.length) screenFiles.forEach((p) => li(`\`${rel(p)}\``))
else li('화면 폴더(pages·screens·views·routes·app)를 못 찾음 — App 파일 안에서 화면을 나누는지 아래 경로·상태값으로 본다')
const routeHits = new Set()
for (const p of codeFiles) {
  const t = txt(p)
  for (const m of t.matchAll(/(?:path\s*[:=]\s*|<Route[^>]*path=)["'`]([^"'`]{1,80})["'`]/g)) routeHits.add(m[1])
  for (const m of t.matchAll(/useState\(\s*["'`]([a-z][\w-]{1,30})["'`]\s*\)/gi)) if (/page|screen|view|tab|home|dash/i.test(m[1])) routeHits.add(`(상태값) ${m[1]}`)
}
li(`찾은 경로·화면 이름: ${[...routeHits].slice(0, 20).join(' · ') || '(못 찾음)'}`)
li(`화면이 아닌 코드 파일(부품 등): ${codeFiles.length - screenFiles.length}개`)

// ---- 3. 저장 방식 ----
h('3. 저장 방식')
const countFiles = (re) => codeFiles.filter((p) => re.test(txt(p))).map(rel)
const ls = countFiles(/localStorage|sessionStorage/)
const idb = countFiles(/indexedDB|Dexie|localforage/i)
const supa = countFiles(/createClient\s*\(|supabase\.from\(/)
const fb = countFiles(/firebase|firestore/i)
const api = countFiles(/fetch\(\s*["'`]https?:|axios\.(get|post|put|delete)\(/)
li(`브라우저 저장(localStorage·sessionStorage): ${ls.length ? ls.join(', ') : '못 찾음'}`)
li(`브라우저 DB(IndexedDB): ${idb.length ? idb.join(', ') : '못 찾음'}`)
li(`Supabase 호출: ${supa.length ? supa.join(', ') : '못 찾음'}`)
li(`Firebase: ${fb.length ? fb.join(', ') : '못 찾음'}`)
li(`외부 주소로 보내는 호출: ${api.length ? api.join(', ') : '못 찾음'}`)
// 저장 키 — 실제 저장 호출의 첫 인자 문자열과 persist(..., { name }) 만 모은다
const keys = new Set()
for (const p of codeFiles) {
  const t = txt(p)
  for (const m of t.matchAll(/\b(?:local|session)Storage\s*\.\s*(?:getItem|setItem|removeItem)\s*\(\s*(["'`])([^"'`\n]{1,60})\1/g)) keys.add(m[2])
  for (const m of t.matchAll(/\bpersist\s*\(/g)) {
    const seg = t.slice(m.index, m.index + 4000)
    const n = seg.match(/\bname\s*:\s*(["'`])([^"'`\n]{1,60})\1/)
    if (n) keys.add(`${n[2]} (persist 이름)`)
  }
  for (const m of t.matchAll(/new\s+Dexie\s*\(\s*(["'`])([^"'`\n]{1,60})\1/g)) keys.add(`${m[2]} (IndexedDB 이름)`)
}
li(`브라우저 저장 키(리빌딩 때 그대로 둔다): ${[...keys].join(' · ') || '(못 찾음 — 동적 키·감싼 함수일 수 있다. 저장 코드를 직접 보고 적는다. "없음"으로 판정하지 않는다)'}`)
const fallback = codeFiles.filter((p) => { const t = txt(p); return /createClient|supabase/.test(t) && /localStorage/.test(t) }).map(rel)
if (fallback.length) li(`데이터베이스와 브라우저 저장을 한 파일에서 같이 쓴다(폴백일 수 있다): ${fallback.join(', ')}`)
// 실제 연결 단서 — 값은 적지 않고 파일·이름만
const urlFiles = codeFiles.filter((p) => /https:\/\/[a-z0-9-]+\.supabase\.(co|in)\b|firebaseio\.com|firebaseapp\.com/i.test(txt(p))).map(rel)
const envNames = new Set()
for (const p of codeFiles) for (const m of txt(p).matchAll(/(?:import\.meta\.env|process\.env)\.([A-Z][A-Z0-9_]{2,60})/g)) envNames.add(m[1])
li(`소스 안 실제 서비스 주소: ${urlFiles.length ? urlFiles.join(', ') + '(주소는 적지 않음)' : '못 찾음'}`)
li(`코드가 읽는 접속 정보 이름: ${[...envNames].slice(0, 15).join(' · ') || '못 찾음'}`)
const dbCode = supa.length || fb.length
const dbPlace = urlFiles.length || envFound.length
li(`운영 데이터 연결 가능성: ${dbCode && dbPlace ? '**살아 있을 수 있음**(연결 코드 + 접속 정보 자리가 함께 있다) — 쓰기 시험 전에 대표에게 "지금 이 앱에 실제 업무 데이터가 들어 있나요?"를 묻는다' : dbCode ? '연결 코드는 있으나 접속 정보 자리를 못 찾음 — 확실하지 않으면 살아 있는 것으로 다룬다' : '데이터베이스 연결 코드를 못 찾음'}`)

// ---- 4·5. 로그인·권한 ----
h('4. 로그인')
const auth = countFiles(/signInWith|signIn\(|auth\.sign|onAuthStateChange|getSession\(|type=["']password["']|login/i)
li(auth.length ? `로그인 흔적: ${auth.join(', ')}` : `로그인 흔적 못 찾음 — ${NOT_SURE}(서버 미들웨어·외부 인증일 수 있다)`)
h('5. 권한(역할)')
const roles = countFiles(/\brole\b|isAdmin|is_admin|\badmin\b|\bowner\b|\bstaff\b/)
li(roles.length ? `역할 흔적: ${roles.join(', ')}` : `역할 구분 흔적 못 찾음 — ${NOT_SURE}`)

// ---- 6. 디자인 토큰 ----
h('6. 디자인 토큰 유무')
const styleFiles = all.map(rel).filter((r) => /^(src\/)?(index|App|app|globals?|main|style|styles|theme)\.(css|scss|less)$/i.test(r)
  || /^(src\/)?app\/globals\.(css|scss)$/.test(r) || /^src\/app\.(css|scss)$/.test(r) || /^src\/styles?\//.test(r) || /^(assets|src\/assets)\/.*\.(css|scss)$/.test(r)
  || /^tailwind\.config\.(js|cjs|mjs|ts)$/.test(r) || /^postcss\.config\.(js|cjs|mjs)$/.test(r) || /(^|\/)theme\.(js|ts|jsx|tsx)$/.test(r))
li(`전역 스타일·설정 파일: ${styleFiles.join(' · ') || '(못 찾음)'}`)
const ENTRY = ['src/main.jsx', 'src/main.tsx', 'src/main.js', 'src/main.ts', 'src/index.jsx', 'src/index.tsx', 'src/index.js', 'src/index.ts',
  'app/layout.tsx', 'app/layout.jsx', 'app/layout.js', 'src/app/layout.tsx', 'src/app/layout.jsx', 'src/app/layout.js',
  'pages/_app.tsx', 'pages/_app.jsx', 'pages/_app.js', 'src/pages/_app.tsx', 'src/pages/_app.jsx', 'src/pages/_app.js',
  'src/routes/+layout.svelte', 'nuxt.config.ts', 'nuxt.config.js', 'app.vue', 'src/App.vue', 'index.html']
li(`전역 스타일 진입점 후보(restyle.md 1절 표로 고른다): ${ENTRY.filter((f) => checkPath(f).ok).join(' · ') || '(못 찾음 — 멈추고 대표와 확인)'}`)
let varDefs = 0
for (const p of cssFiles) varDefs += (txt(p).match(/--[\w-]+\s*:/g) || []).length
li(`CSS 변수 정의: ${varDefs}개${varDefs === 0 ? ' — 색·크기를 한 곳에서 바꿀 자리를 못 찾음' : ''}`)
const hexCount = new Map()
let hexTotal = 0
for (const p of [...codeFiles, ...cssFiles, ...all.filter((x) => /tailwind\.config\./.test(x))]) {
  for (const m of txt(p).matchAll(/#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g)) { hexTotal++; const k = m[0].toLowerCase(); hexCount.set(k, (hexCount.get(k) || 0) + 1) }
}
const topHex = [...hexCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, n]) => `${k}(${n})`)
li(`직접 적은 색: ${hexTotal}곳 · 많이 쓴 색 ${topHex.join(' ') || '(없음)'}`)
const inline = codeFiles.reduce((n, p) => n + (txt(p).match(/style=\{\{/g) || []).length, 0)
const arbitrary = codeFiles.reduce((n, p) => n + (txt(p).match(/\b(?:bg|text|border|from|to|ring)-\[#/g) || []).length, 0)
const alphaCls = codeFiles.reduce((n, p) => n + (txt(p).match(/\b(?:bg|text|border|ring|from|to|via|fill|stroke)-[a-z][\w-]*\/\d{1,3}\b/g) || []).length, 0)
const darkCls = codeFiles.reduce((n, p) => n + (txt(p).match(/\bdark:[\w-]/g) || []).length, 0)
li(`화면 파일 안 인라인 스타일: ${inline}곳 · Tailwind 임의 색 클래스(bg-[#…] 등): ${arbitrary}곳 · 불투명도 색 클래스(bg-x/50 등): ${alphaCls}곳 · dark: 클래스: ${darkCls}곳`)
const twv4 = cssFiles.some((p) => /@import\s+["']tailwindcss["']|@theme\b/.test(txt(p)))
if (has('tailwindcss')) li(`Tailwind 판: ${twv4 ? '4(설정이 CSS 의 @theme 에 있다)' : '3 이하(설정이 tailwind.config 에 있다)'} · 진입 CSS 의 지시문(@tailwind / @import "tailwindcss")은 지우면 모든 클래스가 사라진다`)
li(`번들 디자인 토큰(src/styles/tokens.css): ${checkPath('src/styles/tokens.css').ok ? '있음 — 같은 이름 파일 교체 전 참조 목록을 만든다(restyle.md 2-2)' : '없음'}`)

// ---- 7. 검수·검사 체계 ----
h('7. 검수·검사 체계')
li(`check·test·lint 스크립트: ${['check', 'test', 'lint', 'typecheck'].filter((k) => scripts[k]).map((k) => `${k} = \`${scripts[k]}\``).join(' · ') || '못 찾음'}`)
const tests = all.filter((p) => /(\.test|\.spec)\.(js|jsx|ts|tsx|mjs|cjs)$/.test(p) || /(^|\/)(__tests__|tests?|e2e)\//.test(rel(p))).length
li(`시험 파일: ${tests}개`)
li(`번들 검수 훅(.owner/hooks/erp-check.mjs): ${fs.existsSync(path.join(root, '.owner', 'hooks', 'erp-check.mjs')) ? '설치됨' : '없음'}`)
li(`화면 사진 도구(playwright): ${has('playwright') || has('@playwright/test') ? '있음' : '없음 — 캡처 전에 설치'}`)

// ---- 8. 비밀값 노출 ----
h('8. 비밀값 노출 (파일 이름만)')
const git = (...a) => {
  const r = spawnSync('git', a, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  return { ok: !r.error && r.status === 0, status: r.error ? -1 : r.status, out: r.stdout || '' }
}
const nul = (s) => s.split('\0').filter(Boolean)
const inRepo = git('rev-parse', '--is-inside-work-tree').ok
li(`폴더 안 .env 계열 파일(열지 않았다): ${envFound.join(', ') || '없음'}${envDirs.length ? ` · .env 이름 폴더(들어가지 않음): ${envDirs.join(', ')}` : ''}`)
const envPath = (f) => f.split('/').some(isEnvName)
if (!inRepo) li('git 저장소 아님 — 기록 검사 없음(절차 1에서 git init)')
else {
  const lsf = git('ls-files', '-z')
  const head = git('rev-parse', '--verify', '-q', 'HEAD')
  const tree = head.ok ? git('ls-tree', '-r', '-z', '--name-only', 'HEAD') : { ok: true, out: '' }
  if (!lsf.ok || !tree.ok) li('git 이 추적하는 .env 계열: **확인 못 함**(git 명령 실패) — "없음"이 아니다')
  else {
    const committed = nul(tree.out).filter(envPath)
    // 스테이징된 변경 — HEAD 에 이미 있는 경로라도 인덱스에 변경이 올라가 있으면 표시한다(status 의 X 칸)
    const st = git('status', '--porcelain', '-z')
    const stagedEnv = []
    if (st.ok) {
      const parts = st.out.split('\0')
      for (let i = 0; i < parts.length; i++) {
        const e = parts[i]; if (e.length < 4) continue
        const x = e[0]; const p = e.slice(3)
        if (x === 'R' || x === 'C') i++   // 이름 바꿈은 옛 경로가 한 칸 더 온다
        if (x !== ' ' && x !== '?' && x !== '!' && envPath(p)) stagedEnv.push(`${p}(${x})`)
      }
    }
    li(`마지막 커밋에 들어 있는 .env 계열: ${committed.length ? committed.join(', ') + ' — 예시 파일(.env.example 등)이 아니면 **치명**' : '없음'}`)
    li(`스테이징된(아직 커밋 전) .env 계열 변경: ${!st.ok ? '**확인 못 함**' : stagedEnv.length ? stagedEnv.join(', ') + ' — 커밋 전에 스테이징에서 뺀다(git restore --staged)' : '없음'}`)
  }
  li('과거 커밋 이력: **검사 안 함** — 예전에 커밋했다가 지운 .env 는 이 결과에 안 나온다')
  const ig = (p, noIndex) => { const r = git('check-ignore', '-q', ...(noIndex ? ['--no-index'] : []), '--', p); return r.status === 0 ? '무시됨' : r.status === 1 ? '**무시 안 됨**' : '확인 못 함' }
  for (const f of envFound) li(`.gitignore 판정(실제 파일): \`${f}\` — ${ig(f, false)}`)
  li(`.gitignore 판정(가상 경로): .env — ${ig('.env', true)} · .env.local — ${ig('.env.local', true)} · .owner/tmp/x — ${ig('.owner/tmp/x', true)} · .owner/backup/x — ${ig('.owner/backup/x', true)}`)
}
const KEY_PATTERNS = [
  ['비밀 키 모양(sk-…)', /\bsk-[A-Za-z0-9_-]{20,}/], ['결제 키 모양(sk_live_…)', /\bsk_live_[A-Za-z0-9]{10,}/],
  ['service_role 언급', /service_role/], ['JWT 모양(eyJ…)', /\beyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\./],
  ['Google 키 모양(AIza…)', /\bAIza[0-9A-Za-z_-]{30,}/], ['GitHub 토큰 모양', /\bgh[pousr]_[A-Za-z0-9]{30,}/],
  ['Slack 토큰 모양', /\bxox[abprs]-[A-Za-z0-9-]{10,}/], ['웹후크 주소', /discord(?:app)?\.com\/api\/webhooks\/|hooks\.slack\.com\/services\//],
  ['개인 키 블록', /-----BEGIN [A-Z ]*PRIVATE KEY-----/], ['비밀번호 대입', /\b(?:password|passwd|secret)\s*[:=]\s*["'`][^"'`\s]{6,}["'`]/i],
  ['인증 헤더 토큰(Authorization)', /\bBearer\s+[A-Za-z0-9._~+/-]{8,}|\bAuthorization\s*[:=]\s*["'`]?[A-Za-z]/i],
  ['키 대입(token·apikey 등)', /\b(?:token|apikey|api_key|access_token)=[^\s"'`&;,${}]+/i],
  ['접속 주소 안 비밀번호', /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^\s:@/]+:[^\s@/]+@/i],
]
const keyHits = []   // { path, kinds } — 표시용 문자열을 다시 파싱하지 않는다(경로에 백틱이 있어도 안전)
for (const p of textFiles) {
  if (/package-lock\.json$|\.md$/.test(p)) continue
  const t = read(p)
  if (t === null) continue
  const kinds = KEY_PATTERNS.filter(([, re]) => re.test(t)).map(([k]) => k)
  if (kinds.length) keyHits.push({ path: rel(p), kinds })
}
if (keyHits.length) keyHits.forEach((k) => li(`소스 안 키 모양: \`${k.path}\` — ${k.kinds.join(', ')}`))
else li('소스 안 키 모양: 못 찾음(읽지 못한·건너뛴 파일은 맨 아래 목록)')
{
  const keyPaths = keyHits.map((k) => k.path)
  const linkPaths = skipped.links.map((l) => l.replace(/\(하드 링크\)$/, ''))
  const cands = [...new Set([...keyPaths, ...linkPaths])]
  out.push(RAW + `- 커밋에서 뺄 후보(키 모양 파일 · 링크·하드 링크 — .env 계열은 따로 뺀다): ${cands.length ? cands.map((c) => `\`${c}\``).join(' · ') : '없음'}`)
}

// ---- 9. 회사 말 ----
h('9. 회사 말 사용 (화면 글자)')
const JARGON = /\b(Dashboard|Settings|Submit|Inventory|Item|Items|Add Item|Save|Delete|Cancel|Edit|Search|Status|Error|Loading|Login|Logout|Home|Profile|Admin|CRUD|ID|null|undefined|NaN|Success|Failed|Update|Create|Total|Quantity|Price|Name|Category|Date)\b/
const en = new Map(); let ko = 0
for (const p of codeFiles.filter((x) => /\.(jsx|tsx|vue|svelte|astro|html)$/.test(x))) {
  const t = txt(p)
  for (const m of t.matchAll(/>\s*([^<>{}\n]{2,60}?)\s*</g)) {
    const s = m[1].trim()
    if (/[가-힣]/.test(s)) { ko++; continue }
    if (/^[A-Za-z][A-Za-z0-9 &/'.,!?:-]{1,58}$/.test(s) && /[a-z]/i.test(s)) en.set(s, (en.get(s) || 0) + 1)
  }
  for (const m of t.matchAll(/(?:placeholder|title|aria-label|label)=["']([A-Za-z][^"']{1,40})["']/g)) en.set(m[1], (en.get(m[1]) || 0) + 1)
}
const enList = [...en.keys()]
li(`영어 화면 글자: ${enList.length}종 · 한글 화면 글자: ${ko}곳`)
li(`영어 글자 예(최대 20): ${enList.slice(0, 20).map((s) => `"${s}"`).join(' · ') || '(없음)'}`)
li(`개발 용어로 보이는 것: ${enList.filter((s) => JARGON.test(s)).slice(0, 15).map((s) => `"${s}"`).join(' · ') || '(없음)'}`)

// ---- 10. 휴대폰 375 폭 ----
h('10. 휴대폰 375 폭 위험 (글자로 찾은 것 — 캡처로 확인한다)')
for (const p of codeFiles) {
  const t = txt(p)
  const ths = (t.match(/<th[\s>]/g) || []).length
  if (/<table[\s>]/.test(t)) li(`표: \`${rel(p)}\` — 머리 칸 ${ths}개${ths >= 5 ? ' (5칸 이상 — 폰에서 가로로 밀리기 쉽다)' : ''}`)
  const fixed = [...t.matchAll(/\b(?:min-)?w-\[(\d{3,})px\]/g)].map((m) => Number(m[1])).filter((n) => n > 360)
  if (fixed.length) li(`고정 폭 클래스: \`${rel(p)}\` — ${fixed.join(', ')}px`)
  const cols = [...t.matchAll(/(?<![:\w-])grid-cols-(\d+)/g)].map((m) => Number(m[1])).filter((n) => n >= 4)
  if (cols.length) li(`좁은 화면 규칙 없는 격자: \`${rel(p)}\` — grid-cols-${cols.join(', ')}`)
}
for (const p of cssFiles) {
  const wide = [...txt(p).matchAll(/(?:^|[;{\s])(?:min-)?width\s*:\s*(\d{3,})px/g)].map((m) => Number(m[1])).filter((n) => n > 360)
  if (wide.length) li(`CSS 고정 폭: \`${rel(p)}\` — ${wide.join(', ')}px`)
}
{
  const cands = ['index.html', 'public/index.html', 'src/index.html', 'app/layout.tsx', 'app/layout.jsx', 'src/app/layout.tsx', 'src/app.html', 'nuxt.config.ts']
  const found = cands.filter((f) => { const r = readDirect(f); return r.text && /name=["']viewport["']|\bviewport\b/.test(r.text) })
  li(`viewport 설정: ${found.length ? `찾음(${found.join(', ')})` : NOT_SURE}`)
}

// ---- 11. 기존 데이터베이스 기록 ----
h('11. 기존 데이터베이스 기록')
{
  const c = checkPath('supabase/migrations')
  if (!c.ok && c.reason === '없음') li('supabase/migrations 없음')
  else if (!c.ok) li(`supabase/migrations: 확인 못 함(${c.reason})`)
  else if (c.kind !== 'dir') li('supabase/migrations 가 폴더가 아니다 — 확인 못 함')
  else {
    let files = []
    try { files = fs.readdirSync(c.abs).filter((f) => f.toLowerCase().endsWith('.sql')).sort() } catch { li('supabase/migrations 를 읽지 못함 — 확인 못 함') }
    const style = !files.length ? '(파일 없음)' : files.every((f) => /^\d{4}_/.test(f)) ? '네 자리 번호(NNNN_)' : files.every((f) => /^\d{14}_/.test(f)) ? '시각 번호(14자리 — Supabase CLI)' : '섞임'
    li(`supabase/migrations: ${files.length}개 · 이름 모양 ${style} · 마지막 ${files[files.length - 1] || '(없음)'}`)
    for (const f of files) {
      const r = readDirect(`supabase/migrations/${f}`)
      if (r.text === null) { li(`\`${f}\` — 읽지 못함(${r.reason})`); continue }
      const t = r.text.toLowerCase().replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
      const tables = [...t.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:"?([a-z_][\w]*)"?\.)?"?([a-z_][\w]*)"?/g)].map((m) => (m[1] && m[1] !== 'public' ? `${m[1]}.` : '') + m[2])
      li(`\`${f}\` — 만든 표 ${tables.join(', ') || '없음'} · 잠금 켜기 ${(t.match(/enable\s+row\s+level\s+security/g) || []).length} · 잠금 끄기 ${(t.match(/disable\s+row\s+level\s+security/g) || []).length} · 정책 ${(t.match(/create\s+policy/g) || []).length} (주석은 뺀 글자 수 — 실제 상태는 SQL 조회로)`)
    }
  }
}
for (const f of ['prisma/schema.prisma', 'drizzle.config.ts', 'firestore.rules', 'firebase.json', 'supabase/config.toml']) if (checkPath(f).ok) li(`그 밖의 데이터 설정: \`${f}\``)
const dbFiles = all.map(rel).filter((r) => /\.(sqlite3?|db)$|-wal$|-journal$/i.test(r))
if (dbFiles.length) li(`프로젝트 안 데이터 파일: ${dbFiles.join(', ')} — 백업 전에 앱을 끈다`)

// ---- 12. 되돌릴 지점 ----
h('12. 되돌릴 지점과 변경 전 빌드')
const top = git('rev-parse', '--show-toplevel')
li(`git 저장소: ${top.ok ? top.out.trim() : '없음 — 절차 1에서 git init'}`)
if (top.ok) {
  const cnt = git('rev-list', '--count', 'HEAD')
  const st = git('status', '--porcelain')
  li(`커밋 수: ${cnt.ok ? cnt.out.trim() : '0(아직 커밋 없음)'} · 커밋 안 한 변경: ${st.ok ? st.out.split(/\r?\n/).filter(Boolean).length + '개' : '확인 못 함'}`)
}
li('변경 전 `npm run build` 결과: 이 스크립트는 실행하지 않는다 — 절차 4에서 돌려 진단 문서 「변경 전 빌드」에 적는다(회귀 구분용)')

// ---- 건너뜀 ----
h('읽지 않은 것')
li(`512KB 넘어 건너뜀: ${skipped.big.length}개${skipped.big.length ? ` (${skipped.big.slice(0, 10).join(', ')}${skipped.big.length > 10 ? ' …' : ''})` : ''}`)
li(`파일 수 상한(${MAX_FILES}) 넘어 건너뜀: ${skipped.over}개 (전체 ${seen}개)`)
li(`읽기 실패: ${skipped.readFail.length}개${skipped.readFail.length ? ` (${skipped.readFail.slice(0, 10).join(', ')})` : ''}`)
li(`링크(따라가지 않음): ${skipped.links.length}개${skipped.links.length ? ` (${skipped.links.slice(0, 10).join(', ')})` : ''}`)
if (skipped.directRefused.length) li(`직접 읽기 거부: ${skipped.directRefused.join(', ')}`)

// ---- 모든 줄에 비밀값 가리기 ----
const MASK = '[가림]'
// 경로(앞에 / 또는 \ 가 있고 뒤에 .확장자가 오는 이름 조각)는 긴 토큰 규칙에서 뺀다 — 경로 안 = 뒤 값은 위 규칙이 가린다.
function mask(s) {
  if (s.startsWith(RAW)) return s.slice(RAW.length)   // 파일 시스템에서 얻은 경로만 담은 줄(커밋에서 뺄 후보) — 원본 유지
  return s
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----|$)/g, MASK)
    .replace(/\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/[^\s`'"]+/gi, MASK)
    .replace(/(\/\/)[^\s/:@`'"]+:[^\s/@`'"]+@/g, `$1${MASK}@`)
    .replace(/\b(Authorization)(\s*[:=]\s*)[^"'`\n]*/gi, `$1$2${MASK}`)
    .replace(/\bBearer\s+[^\s"'`]+/gi, `Bearer ${MASK}`)
    .replace(/\b(token|apikey|api_key|access_token|password|passwd|pwd|secret|key)=[^\s"'`&;,]+/gi, `$1=${MASK}`)
    .replace(/\bsk[-_][A-Za-z0-9_-]{8,}/g, MASK)
    .replace(/\beyJ[A-Za-z0-9_-]{8,}(?:\.[A-Za-z0-9_-]*){0,2}/g, MASK)
    .replace(/\b(?:AIza[0-9A-Za-z_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|xox[abprs]-[A-Za-z0-9-]{8,})/g, MASK)
    .replace(/\b([A-Za-z_]*(?:key|token|secret|password|passwd|pwd|auth)[A-Za-z_]*)(\s*[=:]\s*)(?!\[가림\])(["']?)[^\s"'`&;,]{4,}\3/gi, `$1$2${MASK}`)
    .replace(/[A-Za-z0-9_\-+=]{40,}/g, (m, off, all) => {
      const isPath = /[\\/]/.test(all[off - 1] || '') && /^\.[A-Za-z0-9]{1,6}\b/.test(all.slice(off + m.length))
      return !isPath && /\d/.test(m) && /[A-Za-z]/.test(m) ? MASK : m
    })
}
const body = out.map(mask).join('\n') + '\n'

if (opts['--out']) {
  const o = path.resolve(opts['--out'])
  if (isEnvName(path.basename(o))) { console.error('결과 파일 이름이 .env 계열입니다. 다른 이름을 쓰세요.'); process.exit(1) }
  try { if (fs.lstatSync(o).isSymbolicLink()) { console.error(`결과 파일 자리가 링크입니다(쓰지 않음): ${o}`); process.exit(1) } } catch { /* 없음 */ }
  fs.mkdirSync(path.dirname(o), { recursive: true })
  fs.writeFileSync(o, body, 'utf8')
  console.log(`진단 결과를 썼습니다: ${path.relative(process.cwd(), o).split(path.sep).join('/') || o} (${out.length}줄)`)
} else process.stdout.write(body)
