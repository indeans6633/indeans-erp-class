#!/usr/bin/env node
// 인디언즈 ERP 클래스 설치기 — 네트워크 호출 없음. 이 저장소에 든 것을 내 ERP 프로젝트에 한 번에 넣는다.
// 스킬 17종 · 에이전트 4종(감독 2·검증 1·감사 1) · 훅 4종(검수·명령 보호·배포 전 확인·주간 점검 알림)과 도우미 스크립트 4종
// · 디자인 선택창 · 회차 자료 · 진행 상태 문서 · 프로젝트 지침(CLAUDE.md·AGENTS.md — 없을 때만 네 줄).
// 회차를 고르는 인자는 없다(통합 번들이다).
//
// 사용: node install.mjs --project "C:\path\to\my-erp" [--target both|claude|codex] [--dry-run]
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const flag = (n, d = null) => { const i = args.indexOf(n); return i >= 0 ? (args[i + 1] ?? d) : d }
const has = (n) => args.includes(n)

const project = flag('--project')
const target = flag('--target', 'both')
const dry = has('--dry-run')
const legacyWeek = flag('--week')

const die = (msg) => { console.error(`설치 중단: ${msg}`); process.exit(1) }
if (!project) die('--project <내 ERP 프로젝트 폴더 절대경로> 를 지정하세요.')
if (!['both', 'claude', 'codex'].includes(target)) die('--target 은 both | claude | codex 중 하나입니다.')
if (legacyWeek) console.log('--week 는 더 쓰지 않습니다(저장소 하나에 전부 들어 있습니다). 이 저장소에 든 것을 그대로 설치합니다.')

const root = path.resolve(project)
if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) die(`프로젝트 폴더가 없습니다: ${root}`)
// 링크·정션(Windows junction)을 거친 경로에는 설치하지 않는다 — 그 너머의 다른 폴더에 쓰게 된다.
// 지정한 경로의 각 단계를 lstat 으로 본다(Node 는 Windows 정션도 링크로 알려 준다).
const linkOnPath = (p) => {
  const parts = []
  for (let cur = path.resolve(p); ; cur = path.dirname(cur)) { parts.unshift(cur); if (path.dirname(cur) === cur) break }
  for (const q of parts) { try { if (fs.lstatSync(q).isSymbolicLink()) return q } catch { return null } }
  return null
}
const viaLink = linkOnPath(root)
if (viaLink) die(`링크·정션을 거친 경로에는 설치하지 않습니다(${viaLink}). 실제 폴더 경로로 다시 실행하세요: ${fs.realpathSync.native(root)}`)
// 내려받은 강의 저장소 폴더(또는 그 안의 하위 폴더)에서 `--project "."` 로 실행하면 그 폴더에 설치돼 버린다 — 성공 메시지가 떠서
// 수강생은 됐다고 믿지만 정작 자기 프로젝트는 비어 있다(수강생 환경 실측 2026-09-17에서 실제로 재현). 실제 경로로 비교한다.
const sameOrInside = (a, b) => {
  const fold = (s) => (process.platform === 'win32' ? s.toLowerCase() : s)
  const ra = fold(fs.realpathSync.native(a)); const rb = fold(fs.realpathSync.native(b))
  return ra === rb || ra.startsWith(rb.endsWith(path.sep) ? rb : rb + path.sep)
}
if (sameOrInside(root, HERE)) {
  die('여기는 내려받은 강의 자료 폴더(또는 그 안)입니다. 강의 자료 폴더 밖의 내 ERP 프로젝트 폴더를 --project 로 지정하세요.\n'
    + `  예: node "${path.join(HERE, 'install.mjs')}" --project "C:\\work\\my-erp" --target both`)
}
if (['manifest.json', 'install.mjs'].every((f) => fs.existsSync(path.join(root, f))) && fs.existsSync(path.join(root, 'skills'))) {
  die('지정한 폴더가 강의 자료 폴더로 보입니다(설치기와 스킬 폴더가 함께 있습니다). 내 ERP 프로젝트 폴더를 지정하세요.')
}

const manifest = JSON.parse(fs.readFileSync(path.join(HERE, 'manifest.json'), 'utf8'))

// 가져온 앱 감지 — 다른 도구로 만들어 온 앱이 이 폴더에 이미 있는지 설치 전에 본다(아무것도 쓰지 않는다).
// 기준의 단일 원본은 skills/indeans-erp-rebuild/SKILL.md 「기존 앱 감지 기준」이다. 바꾸면 그쪽과 같이 고친다.
//   ① package.json 의 dependencies 가 하나 이상이거나, dependencies·devDependencies 에 UI 틀(react·vue·svelte·next·nuxt·
//      @angular/core·solid-js·preact·lit·astro)이 있다
//   ② src/·app/·pages/ 아래(src/styles/ 제외, 7단계 깊이까지) 화면 파일 — .jsx·.tsx·.vue·.svelte·.astro 가 1개 이상,
//      또는 .js·.ts 가 있고 맨 위·src/·app/ 에 index.html·app.html 이 있다(.js·.ts 만으로는 앱으로 보지 않는다)
//   ③ .owner/progress.json 의 company.name 이 비어 있다(파일이 없어도). 파일이 있는데 못 읽으면 **감지하지 않고** 알린다.
//   한계: 여러 앱이 든 저장소(apps/*)·7단계보다 깊은 화면은 보지 않는다(지원 범위 밖 — README·SKILL 에 같은 줄).
const UI_EXT = new Set(['.jsx', '.tsx', '.vue', '.svelte', '.astro'])
const JS_EXT = new Set(['.js', '.ts'])
const UI_DEPS = ['react', 'vue', 'svelte', 'next', 'nuxt', '@angular/core', 'solid-js', 'preact', 'lit', 'astro']
function findScreenFiles(dir, found, depth = 0) {
  if (depth > 6) return
  let entries = []
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
  for (const e of entries) {
    if (e.isSymbolicLink()) continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || p === path.join(root, 'src', 'styles')) continue
      findScreenFiles(p, found, depth + 1)
      if (found.ui) return
      continue
    }
    const ext = path.extname(e.name).toLowerCase()
    if (UI_EXT.has(ext)) { found.ui = true; return }
    if (JS_EXT.has(ext)) found.js = true
  }
}
// 진행 문서는 여기서 한 번만 읽는다 — 기존 앱 감지와 마지막 「다음:」 안내(진행 중인 프로젝트 재설치)가 같이 쓴다.
// 파일이 있는데 못 읽으면(깨졌거나 인코딩이 다름) 감지하지 않고 알린다.
const progressPath = path.join(root, '.owner', 'progress.json')
const progressExists = fs.existsSync(progressPath)
let existingProgress = null
let progressUnreadable = false
if (progressExists) {
  try { existingProgress = JSON.parse(fs.readFileSync(progressPath, 'utf8').replace(new RegExp('^' + String.fromCharCode(0xFEFF)), '')) } catch { existingProgress = null }
  if (!existingProgress || typeof existingProgress !== 'object' || Array.isArray(existingProgress)) { existingProgress = null; progressUnreadable = true }
}
function detectImportedApp() {
  let pkg = null
  try { pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8').replace(new RegExp('^' + String.fromCharCode(0xFEFF)), '')) } catch { return false }
  if (!pkg || typeof pkg !== 'object' || Array.isArray(pkg)) return false
  const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {})
  const run = obj(pkg.dependencies); const dev = obj(pkg.devDependencies)
  if (!Object.keys(run).length && !UI_DEPS.some((d) => d in run || d in dev)) return false
  const found = { ui: false, js: false }
  for (const d of ['src', 'app', 'pages']) { findScreenFiles(path.join(root, d), found); if (found.ui) break }
  const htmlEntry = ['', 'src', 'app'].some((d) => ['index.html', 'app.html'].some((f) => fs.existsSync(path.join(root, d, f))))
  if (!found.ui && !(found.js && htmlEntry)) return false
  if (progressUnreadable) return false
  const prog = existingProgress
  if (prog && prog.company && typeof prog.company.name === 'string' && prog.company.name.trim()) return false
  return true
}
const importedApp = detectImportedApp()
const wantClaude = target === 'both' || target === 'claude'
const wantCodex = target === 'both' || target === 'codex'

const hash = (buf) => crypto.createHash('sha256').update(buf).digest('hex')
const rel = (dst) => path.relative(root, dst).split(path.sep).join('/')
// 줄 끝(CRLF/LF)만 다른 것은 "같은 내용"으로 본다 — **글자 파일만.** 그림 같은 바이너리는 바이트 그대로 비교한다
// (바이너리를 글자로 바꾸면 서로 다른 바이트가 같은 대체 문자로 바뀌어 같다고 잘못 볼 수 있다).
// git 의 eol 설정 한 줄로 프로젝트 전체 줄 끝이 바뀌면, 그것을 고친 것으로 세어
// 수백 개가 갱신·.new 로 뜨는 일이 생긴다(2026-09-18 리허설 실측 186개).
const TEXT_EXT = new Set(['.md', '.mjs', '.js', '.cjs', '.ts', '.json', '.css', '.html', '.txt', '.svg', '.sql', '.toml', '.yml', '.yaml', '.csv'])
const isText = (p) => TEXT_EXT.has(path.extname(p).toLowerCase())
const normEq = (a, b) => a.toString('utf8').replace(/\r\n/g, '\n') === b.toString('utf8').replace(/\r\n/g, '\n')
const sameContent = (a, b, p) => a.equals(b) || (isText(p) && normEq(a, b))
// 설치 대상 안쪽 경로에 링크가 끼어 있으면(예: .owner 를 다른 폴더로 연결) 쓰지 않는다.
const linkInside = (dst) => {
  const relParts = path.relative(root, dst).split(path.sep)
  let cur = root
  for (const part of relParts) {
    cur = path.join(cur, part)
    try { if (fs.lstatSync(cur).isSymbolicLink()) return cur } catch { return null }
  }
  return null
}
function walk(dir, skip = () => false) {
  const out = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (skip(p)) continue
    if (e.isDirectory()) out.push(...walk(p, skip)); else out.push(p)
  }
  return out
}

// ---------------------------------------------------------------- 설치 목록 만들기
// plan 항목: { dst, data(Buffer), once?(있으면 이미 있을 때 건드리지 않음), group }
const plan = []
const notes = []
const add = (dst, data, group, once = false) => plan.push({ dst, data: Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8'), group, once })

// ① 스킬 — 한 스킬이 여러 회차에 걸쳐 쓰이면(인터뷰 1·2회차 등) 매니페스트에 두 번 나온다. 한 번만 넣는다.
const skillIds = [...new Set([...manifest.sessions.flatMap((s) => s.skills), ...(manifest.final?.skills || [])])]
const skillDirs = wantClaude && wantCodex ? ['.claude/skills', '.agents/skills'] : wantClaude ? ['.claude/skills'] : ['.agents/skills']
const foundSkills = []
const missingSkills = []
for (const id of skillIds) {
  const src = path.join(HERE, 'skills', id)
  if (!fs.existsSync(path.join(src, 'SKILL.md'))) { missingSkills.push(id); continue }
  foundSkills.push(id)
  for (const f of walk(src)) {
    const sub = path.relative(src, f)
    for (const t of skillDirs) add(path.join(root, t, id, sub), fs.readFileSync(f), '스킬')
  }
}
if (missingSkills.length) notes.push(`이 저장소에 아직 없는 스킬 ${missingSkills.length}종은 건너뛰었습니다: ${missingSkills.join(', ')}`)

// ② 감독 에이전트 — 원본 한 벌에서 도구별 파일을 만든다
function parseAgent(file) {
  const raw = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '').replaceAll('\r\n', '\n')
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!m) return null
  const meta = {}
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/)
    if (kv) meta[kv[1]] = kv[2].trim()
  }
  return { meta, body: m[2].trim() + '\n', front: m[1] }
}
const tomlStr = (s) => '"' + String(s).replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\n', ' ') + '"'
// TOML 다중행 기본 문자열(""") — 역슬래시와 따옴표 3개를 이스케이프해야 본문이 깨지지 않는다.
const tomlBlock = (s) => '"""\n' + String(s).replaceAll('\\', '\\\\').replaceAll('"""', '\\"\\"\\"') + '"""'

const agentsDir = path.join(HERE, 'agents-src')
const foundAgents = []
for (const name of manifest.agents || []) {
  const src = path.join(agentsDir, `${name}.md`)
  if (!fs.existsSync(src)) { notes.push(`감독 에이전트 원본이 없어 건너뜁니다: agents-src/${name}.md`); continue }
  const a = parseAgent(src)
  if (!a) { notes.push(`감독 에이전트 원본의 머리말(---)을 읽지 못해 건너뜁니다: agents-src/${name}.md`); continue }
  foundAgents.push(name)
  if (wantClaude) add(path.join(root, '.claude', 'agents', `${name}.md`), `---\n${a.front}\n---\n\n${a.body}`, '감독 에이전트')
  if (wantCodex) {
    const tools = a.meta.tools ? `허용 도구: ${a.meta.tools}. 그 밖의 도구는 쓰지 않는다.\n\n` : ''
    const toml = [
      `name = ${tomlStr(a.meta.name || name)}`,
      `description = ${tomlStr(a.meta.description || '')}`,
      `developer_instructions = ${tomlBlock(tools + a.body)}`,
      '',
    ].join('\n')
    add(path.join(root, '.codex', 'agents', `${name}.toml`), toml, '감독 에이전트')
  }
}

// ③ 훅과 도우미 스크립트 — 전부 .owner/hooks/ 로 복사한다. 도구에 등록하는 것은 아래 훅 등록에서
//    hooks/templates/ 의 조각 파일에 적힌 것(검수·배포 전 확인·주간 점검 알림)뿐이다.
//    나머지(open·capture·report·design-pick)는 스킬이 부르는 도우미라 등록하지 않는다.
//    파일이 아직 없으면(다른 작업이 만드는 중) 건너뛰고 알린다.
const hooksSrc = path.join(HERE, 'hooks')
const foundHooks = []
for (const f of manifest.hooks || []) {
  const src = path.join(hooksSrc, f)
  if (!fs.existsSync(src)) { notes.push(`훅 파일이 없어 건너뜁니다: hooks/${f}`); continue }
  foundHooks.push(f)
  add(path.join(root, '.owner', 'hooks', f), fs.readFileSync(src), '훅·도우미')
}

// ④ 디자인 선택창
// 목업 폴더(images/design/src/)에서 **뼈대 CSS 와 목업 HTML 은 함께 설치한다.**
// 구조별 목업 3개(화면 3개씩)의 클래스·배치를 초안이 그대로 이어받아야 화면 인상이 선택창에서 본 것과 같아진다
// (선택창 design-pick.mjs 가 tokens·base·layout CSS 를 src/styles/ 에 만들고, draft 스킬이 고른 구조의 목업 HTML 을 읽는다).
// 넣는 것만 적은 허용 목록이다 — 여기 없는 파일(제작·빌드 입력 전용)은 넣지 않는다. 선택창 파일은 app/·fonts/ 에 있다.
const MOCK_KEEP = (name) => name === 'base.css' || /^layout-[\w-]+\.css$/.test(name) || /\.html$/i.test(name)
const imgSrc = path.join(HERE, manifest.images || 'images/design')
let imgCount = 0
const imgSkippedSrc = []
if (fs.existsSync(imgSrc)) {
  const mockDir = path.join(imgSrc, 'src')
  for (const f of walk(imgSrc)) {
    const inMock = f.startsWith(mockDir + path.sep)
    if (inMock && !MOCK_KEEP(path.basename(f))) { imgSkippedSrc.push(path.basename(f)); continue }
    add(path.join(root, '.owner', 'design', path.relative(imgSrc, f)), fs.readFileSync(f), '디자인 선택창')
    imgCount++
  }
  if (imgSkippedSrc.length) notes.push(`목업 폴더의 제작 전용 파일 ${imgSkippedSrc.length}개는 넣지 않았습니다: ${imgSkippedSrc.join(', ')}`)
} else {
  notes.push('디자인 선택창이 이 저장소에 아직 없어 건너뜁니다(.owner/design).')
}

// ⑤ 회차 자료
const courseDirs = [...manifest.sessions.map((s) => `session-${String(s.session).padStart(2, '0')}`), 'final']
const foundCourse = []
for (const d of courseDirs) {
  const src = path.join(HERE, 'course', d)
  if (!fs.existsSync(src)) { notes.push(`수업 자료가 아직 없어 건너뜁니다: course/${d}`); continue }
  foundCourse.push(d)
  for (const f of walk(src)) add(path.join(root, 'course', d, path.relative(src, f)), fs.readFileSync(f), '회차 자료')
}

// ⑥ 진행 상태 문서 — 이미 있으면 절대 건드리지 않는다(수강생의 기록이다)
const tplDir = path.join(HERE, 'templates')
const stateTpl = path.join(tplDir, 'owner-state.md')
const progTpl = path.join(tplDir, 'owner-progress.json')
if (fs.existsSync(stateTpl)) add(path.join(root, '.owner', 'state.md'), fs.readFileSync(stateTpl), '상태 문서', true)
if (fs.existsSync(progTpl)) {
  // 가져온 앱이면 새로 만드는 진행 문서에 imported_app.detected 를 true 로 적는다(이미 있는 진행 문서는 그대로 둔다).
  let progData = fs.readFileSync(progTpl)
  if (importedApp) {
    // 템플릿의 줄 모양을 그대로 두려고 그 한 칸만 글자로 바꾼다. 바꾼 뒤 JSON 으로 읽혀야만 쓴다.
    const text = progData.toString('utf8')
    const changed = text.replace(/("imported_app"\s*:\s*\{\s*"detected"\s*:\s*)false/, '$1true')
    try {
      if (changed !== text && JSON.parse(changed).imported_app.detected === true) progData = Buffer.from(changed, 'utf8')
    } catch { /* 못 바꾸면 그대로 넣는다 — 스킬이 감지 기준으로 다시 본다 */ }
  }
  add(path.join(root, '.owner', 'progress.json'), progData, '상태 문서', true)
}

// ⑦ 보고서 폴더
add(path.join(root, 'reports', '.gitkeep'), '', '보고서 폴더', true)

// ⑧ 프로젝트 지침(CLAUDE.md·AGENTS.md) — 없을 때만 네 줄로 만든다. 있으면 절대 건드리지 않고(수강생 파일이다) 빠진 줄만 알려 준다.
//    한국어 줄은 2026-10-09 리허설에서 백그라운드 작업 알림이 여러 번 끼어든 뒤 AI 가 한국어 대표에게 영어로 답한 일 때문이다.
//    PID 줄은 2026-10-11 리허설 D 에서 미리보기 서버를 끄려던 `taskkill /IM node.exe` 가 이 컴퓨터의 node 전부를 끈 일 때문이다.
const PROJECT_RULES = [
  '- 항상 한국어로 답한다(백그라운드 알림이 끼어들어도).',
  '- 스킬은 이름으로 부르면 그 절차대로 따른다.',
  '- 작업이 끝나면 .owner/state.md 를 갱신한다.',
  '- 서버·프로세스는 자기가 띄운 것만 번호(PID)로 끈다. 이름으로 전부 끄는 명령(taskkill /IM · pkill · killall · Stop-Process -Name)은 쓰지 않는다.',
]
const RULE_KEYS = [/한국어/, /스킬[^\n]*이름/, /\.owner\/state\.md/, /PID/]
const guideFiles = [wantClaude ? 'CLAUDE.md' : null, wantCodex ? 'AGENTS.md' : null].filter(Boolean)
for (const g of guideFiles) add(path.join(root, g), PROJECT_RULES.join('\n') + '\n', '프로젝트 지침', true)

if (!foundSkills.length && !foundAgents.length && !foundHooks.length) {
  die('이 저장소에 설치할 내용이 없습니다. 저장소를 제대로 내려받았는지 확인하세요.')
}

// ---------------------------------------------------------------- 설치 기록
const statePath = path.join(root, '.owner', 'install-state.json')
let state = { installed: [], hashes: {} }
if (fs.existsSync(statePath)) {
  // 구문만 보지 않고 자료형까지 본다 — null·숫자·배열이 들어 있으면 그대로 쓰다가 설치기가 죽는다.
  try {
    const s = JSON.parse(fs.readFileSync(statePath, 'utf8').replace(/^\uFEFF/, ''))
    if (!s || typeof s !== 'object' || Array.isArray(s)) throw new Error('맨 바깥이 JSON 객체가 아닙니다')
    if (!Array.isArray(s.installed)) throw new Error('installed 가 목록이 아닙니다')
    if (!s.hashes || typeof s.hashes !== 'object' || Array.isArray(s.hashes)) throw new Error('hashes 가 객체가 아닙니다')
    const installed = s.installed.filter((x) => typeof x === 'string' && x && !x.includes('..'))
    const goodHashes = Object.fromEntries(Object.entries(s.hashes).filter(([k, v]) => typeof k === 'string' && typeof v === 'string' && /^[0-9a-f]{64}$/.test(v)))
    if (installed.length !== s.installed.length || Object.keys(goodHashes).length !== Object.keys(s.hashes).length) {
      notes.push('설치 기록에 형식이 맞지 않는 줄이 있어 그 줄은 버렸습니다(해당 파일은 직접 고친 파일처럼 보호됩니다).')
    }
    state = { ...s, installed, hashes: goodHashes, installed_commit: typeof s.installed_commit === 'string' && /^[0-9a-f]{7,40}$/i.test(s.installed_commit) ? s.installed_commit : null }
  } catch (e) {
    notes.push(`설치 기록(.owner/install-state.json)을 읽지 못해(${e.message}) 새로 시작합니다. 직접 만든 파일은 그대로 보호됩니다.`)
    state = { installed: [], hashes: {} }
  }
}
const installedSet = new Set(state.installed)
const hashes = { ...state.hashes }

// ---------------------------------------------------------------- 충돌 검사 — 쓰기 전에 모든 대상을 정한다
// 대상마다 out(실제로 쓸 경로)을 정한다. 우리가 넣었고 손대지 않은 파일만 그 자리에서 바꾸고,
// 손댔거나 손댔는지 알 수 없는(기록에 해시가 없는) 파일은 원본을 두고 <이름>.new 로 쓴다.
// .new 자리에 이미 다른 내용의 파일이 있으면, 그것이 전에 우리가 쓴 그대로일 때만 바꾼다(아니면 충돌).
const conflicts = []
const linked = []
const skips = []
const eolOnly = []   // 내용은 같고 줄 끝만 다른 파일 — 그대로 둔다(갱신으로 세지 않는다)
for (const item of plan) {
  const r = rel(item.dst)
  const lk = linkInside(item.dst)
  if (lk) { linked.push(`${r} (링크: ${rel(lk) || lk})`); continue }
  if (!fs.existsSync(item.dst)) { item.out = item.dst; continue }
  if (item.once) { skips.push(r); continue }        // 있으면 그대로 둔다
  const cur = fs.readFileSync(item.dst)
  if (cur.equals(item.data)) { skips.push(r); continue }
  if (isText(item.dst) && normEq(cur, item.data)) {
    skips.push(r)
    eolOnly.push(r)
    installedSet.add(r)
    hashes[r] = hash(cur)                            // 지금 파일 그대로를 기록해 다음 설치에서 고친 것으로 보지 않게 한다
    continue
  }
  if (!installedSet.has(r)) { conflicts.push(r); continue }   // 우리가 넣은 적 없는 파일
  const rec = hashes[r]
  if (rec && rec === hash(cur)) { item.out = item.dst; item.kind = 'update'; continue }
  // 손댔거나(해시가 다름) 손댔는지 알 수 없다(해시 없음) → 원본은 두고 .new
  const newPath = item.dst + '.new'
  const newRel = r + '.new'
  if (fs.existsSync(newPath)) {
    const curNew = fs.readFileSync(newPath)
    if (sameContent(curNew, item.data, item.dst)) { skips.push(newRel); item.kind = 'kept-same'; continue }
    if (!(hashes[newRel] && hashes[newRel] === hash(curNew))) { conflicts.push(`${newRel} (직접 만든 .new 로 보임)`); continue }
  }
  item.out = newPath
  item.kind = 'kept'
}
if (linked.length) {
  console.error('다음 자리는 프로젝트 밖으로 이어진 링크·정션을 거칩니다. 링크를 실제 폴더로 바꾼 뒤 다시 실행하세요:')
  linked.forEach((c) => console.error('  - ' + c))
  process.exit(2)
}
if (conflicts.length) {
  console.error('다음 파일은 직접 만든 파일로 보여 덮어쓰지 않습니다. 이름을 바꾸거나 옮긴 뒤 다시 실행하세요:')
  conflicts.forEach((c) => console.error('  - ' + c))
  process.exit(2)
}

// ---------------------------------------------------------------- 쓰기
let written = 0
const updated = []   // 우리가 넣었고 수강생이 손대지 않은 파일 → 새 버전으로 교체
const kept = []      // 우리가 넣었지만 수강생이 고친(또는 알 수 없는) 파일 → 원본은 두고 새 버전을 <이름>.new 로
for (const item of plan) {
  if (!item.out) { if (item.kind === 'kept-same') kept.push(rel(item.dst)); continue }
  const r = rel(item.dst)
  if (item.kind === 'update') updated.push(r)
  if (item.kind === 'kept') kept.push(r)
  if (!dry) { fs.mkdirSync(path.dirname(item.out), { recursive: true }); fs.writeFileSync(item.out, item.data) }
  if (item.out === item.dst && !item.once) { installedSet.add(r); hashes[r] = hash(item.data) }
  if (item.out !== item.dst) hashes[r + '.new'] = hash(item.data)   // 다음 설치에서 "우리가 쓴 .new" 인지 알아보게
  written++
}

// ---------------------------------------------------------------- 훅 등록 (JSON 병합·멱등)
// 등록할 항목의 단일 원본은 hooks/templates/ 의 두 조각 파일이다.
//   claude-settings.hooks.json → .claude/settings.json   ·   codex-hooks.json → .codex/hooks.json
// 조각에 적힌 사건(Stop·PreToolUse·SessionStart)마다 항목을 읽어, 그 훅 파일이 이번에 설치된 것만 넣는다.
// 항목에 넣는 필드는 그 도구의 공식 문서에 있는 것만 쓴다(조각 파일이 이미 그렇게 적혀 있다 — CONVENTIONS "검수 훅 규약").
// Claude Code 의 statusMessage 는 그 도구 문서에 있는 필드라 Claude 조각에만 있다.
//
// 훅 파일은 상대 경로(node .owner/hooks/…)로 부르지 않는다 — 훅은 "그 순간의 작업 폴더"에서 돈다.
// AI 가 `cd src` 같은 명령을 한 세션에서는 "Cannot find module" 이 나고, 그 오류는 막는 신호가 아니라서
// 검수 훅·배포 전 확인이 조용히 빠진다(2026-10-09 리허설: 대화 8개 중 5개, 배포 전 훅 11번·검수 훅 3번).
//   Claude Code — 공식 자리 표시 `${CLAUDE_PROJECT_DIR}`("세션을 시작한 프로젝트 루트")를 큰따옴표 안에 쓴다.
//     https://code.claude.com/docs/en/hooks 「Path placeholders」·「Windows PowerShell tool」(2026-10-09 확인):
//     Git Bash 에서는 환경 변수로 풀리고, Git Bash 가 없어 PowerShell 로 돌 때는 Claude Code 가 이 중괄호 꼴을
//     ${env:CLAUDE_PROJECT_DIR} 로 바꿔 준다. 중괄호 없는 `$CLAUDE_PROJECT_DIR` 은 PowerShell 에서 빈 값이 된다 — 쓰지 않는다.
//   Codex — 공식 문서에 프로젝트 경로 변수가 없다("Commands run with the session cwd as their working directory",
//     https://learn.chatgpt.com/docs/hooks, 2026-10-09 확인). 그래서 조각의 {{PROJECT_DIR}} 자리에 설치할 때의
//     프로젝트 절대 경로(/ 로 맞춘 것)를 써넣는다. 폴더를 옮기거나 다른 컴퓨터로 가져가면 설치기를 다시 실행한다.
const PROJECT_DIR_POSIX = root.split(path.sep).join('/')
const resolveCommand = (cmd) => String(cmd || '').split('{{PROJECT_DIR}}').join(PROJECT_DIR_POSIX)
const registrations = []
const EVENT_KEYS = ['SessionStart', 'SessionEnd', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PermissionRequest',
  'Notification', 'Stop', 'SubagentStart', 'SubagentStop', 'PreCompact', 'PostCompact']
// 명령이 실제로 부르는 번들 훅 — 경로를 / 로 맞춘 뒤 ".owner/hooks/<이름>.mjs" 로 끝나는 실행 경로만 번들 훅으로 본다.
// 부분 글자만 맞는 것(scripts/custom-erp-check.mjs 처럼 수강생이 만든 훅)은 번들 훅이 아니다 — 건드리지 않는다.
const scriptOf = (cmd) => {
  const s = String(cmd || '').replace(/\\/g, '/')
  const m = s.match(/(?:^|[\s"'=])((?:[^\s"']*\/)?\.owner\/hooks\/([\w.-]+\.mjs))(?=$|[\s"'])/)
  return m ? m[2] : null
}
const sameMatcher = (a, b) => String(a ?? '').trim() === String(b ?? '').trim()
const readTemplate = (name) => {
  try { return JSON.parse(fs.readFileSync(path.join(hooksSrc, 'templates', name), 'utf8').replace(/^\uFEFF/, '')) } catch { return null }
}
// 조각 파일에 적힌 훅(=도구에 등록되는 것). 나머지 설치 파일은 도우미 스크립트다.
const registeredScripts = new Set()
for (const name of ['claude-settings.hooks.json', 'codex-hooks.json']) {
  const t = readTemplate(name)
  for (const groups of Object.values((t && t.hooks) || {})) {
    for (const g of Array.isArray(groups) ? groups : []) for (const h of (g && Array.isArray(g.hooks) ? g.hooks : [])) {
      const sc = scriptOf(h.command); if (sc) registeredScripts.add(sc)
    }
  }
}

function registerFromTemplate(file, label, tplName) {
  const abs = path.join(root, file)
  const existed = fs.existsSync(abs)
  const manual = path.join(hooksSrc, 'templates', tplName)
  const skipAll = (why) => registrations.push({ file, label, status: '건너뜀', why, manual })
  const lk = linkInside(abs)
  if (lk) { skipAll(`링크·정션을 거치는 자리입니다(${rel(lk) || lk}) — 프로젝트 밖 파일을 고치지 않습니다`); return }

  const tpl = readTemplate(tplName)
  if (!tpl || !tpl.hooks || typeof tpl.hooks !== 'object') { skipAll(`등록 조각(hooks/templates/${tplName})을 읽지 못했습니다`); return }
  const wanted = []   // { event, matcher, entry, script }
  for (const [event, groups] of Object.entries(tpl.hooks)) {
    for (const g of Array.isArray(groups) ? groups : []) {
      for (const h of (g && Array.isArray(g.hooks) ? g.hooks : [])) {
        const script = scriptOf(h.command)
        if (script && foundHooks.includes(script)) wanted.push({ event, matcher: g.matcher, entry: { ...h, command: resolveCommand(h.command) }, script })
      }
    }
  }
  if (!wanted.length) return

  let json = {}
  if (existed) {
    try { json = JSON.parse(fs.readFileSync(abs, 'utf8').replace(/^\uFEFF/, '')) } catch { skipAll('파일의 JSON 형식을 읽을 수 없습니다'); return }
    if (json === null || typeof json !== 'object' || Array.isArray(json)) { skipAll('파일이 JSON 객체가 아닙니다'); return }
  }
  if (json.hooks !== undefined && (json.hooks === null || typeof json.hooks !== 'object' || Array.isArray(json.hooks))) {
    skipAll('hooks 자리에 다른 값이 들어 있습니다')
    return
  }

  // 훅 목록이 담긴 자리는 설정 파일마다 두 형태가 다 쓰인다.
  //   { "hooks": { "Stop": [ ... ] } }   ← 새로 만들 때 쓰는 형태(양쪽 도구 문서의 파일 구조)
  //   { "Stop": [ ... ] }                ← 이미 이렇게 적어 둔 파일도 있어, 그럴 때는 그 자리에 넣는다
  // **먼저 두 자리를 모두 훑어 같은 훅 파일을 부르는 항목을 찾는다.** 자리를 먼저 고르고 그 안만 보면,
  // 두 형태가 함께 있는 파일에서 반대쪽에 이미 있는 등록을 못 보고 한 번 더 넣어 훅이 두 번 돈다.
  const nested = json.hooks && typeof json.hooks === 'object' ? json.hooks : null
  const flatForm = !nested && Object.keys(json).some((k) => EVENT_KEYS.includes(k) && Array.isArray(json[k]))
  // 같은 등록 = 같은 사건 · 같은 matcher(대상 도구) · 같은 번들 훅 스크립트. matcher 가 다르면 다른 등록으로 본다
  // (수강생이 같은 훅을 "Read" 같은 다른 대상에 걸어 둔 것은 그대로 두고, 우리 대상의 등록을 따로 보장한다).
  const findIn = (holder, event, script, matcher) => {
    if (!holder || !Array.isArray(holder[event])) return null
    for (const grp of holder[event]) {
      if (!grp || typeof grp !== 'object') continue
      if (!Array.isArray(grp) && !sameMatcher(grp.matcher, matcher)) continue
      const list = Array.isArray(grp.hooks) ? grp.hooks : Array.isArray(grp) ? grp : []
      for (const h of list) if (h && typeof h.command === 'string' && scriptOf(h.command) === script) return h
    }
    return null
  }

  let changed = false
  const parts = []
  for (const w of wanted) {
    const found = findIn(json, w.event, w.script, w.matcher) || findIn(nested, w.event, w.script, w.matcher)
    if (found) {
      if (found.command === w.entry.command) { parts.push(`${w.script} 이미 등록됨`); continue }
      found.command = w.entry.command   // 같은 훅인데 부르는 문장만 옛것이면 문장만 고친다
      changed = true
      parts.push(`${w.script} 부르는 문장 갱신`)
      continue
    }
    // 아직 등록이 없을 때만 넣을 자리를 고른다 — 그 사건이 이미 적힌 자리, 없으면 파일의 형태대로.
    let holder
    if (nested && Array.isArray(nested[w.event])) holder = nested
    else if (Array.isArray(json[w.event]) && (!nested || nested[w.event] === undefined)) holder = json
    else if (flatForm) holder = json
    else { if (!json.hooks) json.hooks = {}; holder = json.hooks }
    if (holder[w.event] === undefined) holder[w.event] = []
    if (!Array.isArray(holder[w.event])) { parts.push(`${w.script} 건너뜀(${w.event} 이 목록 형태가 아님)`); continue }
    // 조각 파일의 순서를 지킨다 — 조각에서 이 항목보다 뒤에 오는 번들 훅(예: 명령 보호 → 배포 전 확인)이 이미 등록돼 있으면 그 앞에 넣는다.
    const newGroup = { ...(w.matcher !== undefined ? { matcher: w.matcher } : {}), hooks: [{ ...w.entry }] }
    const later = new Set(wanted.slice(wanted.indexOf(w) + 1).filter((x) => x.event === w.event).map((x) => x.script))
    const at = holder[w.event].findIndex((grp) => grp && typeof grp === 'object'
      && (Array.isArray(grp.hooks) ? grp.hooks : Array.isArray(grp) ? grp : []).some((h) => h && typeof h.command === 'string' && later.has(scriptOf(h.command))))
    if (at >= 0) holder[w.event].splice(at, 0, newGroup)
    else holder[w.event].push(newGroup)
    changed = true
    parts.push(`${w.script} ${existed ? '등록' : '새로 만들고 등록'}`)
  }
  if (changed && !dry) {
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, JSON.stringify(json, null, 2) + '\n', 'utf8')
  }
  registrations.push({ file, label, status: parts.join(' · '), changed })
}
if (wantClaude) registerFromTemplate('.claude/settings.json', 'Claude Code', 'claude-settings.hooks.json')
if (wantCodex) registerFromTemplate('.codex/hooks.json', 'Codex', 'codex-hooks.json')

// ---------------------------------------------------------------- 없어진 스킬 정리 (지난 번들에서 올라온 경우)
const RETIRED = ['indeans-erp-style-calm', 'indeans-erp-style-board', 'indeans-erp-style-warm', 'indeans-erp-clinic']
const retiredRemoved = []
const retiredKept = []
for (const id of RETIRED) {
  for (const t of skillDirs) {                       // 이번에 설치하는 도구 폴더만 정리한다(--target 을 따른다)
    const dir = path.join(root, t, id)
    if (!fs.existsSync(dir)) continue
    if (linkInside(dir)) { retiredKept.push(`${t}/${id}(링크라 건드리지 않음)`); continue }
    let allOurs = true
    for (const f of walk(dir)) {
      const r = rel(f)
      if (!hashes[r] || hashes[r] !== hash(fs.readFileSync(f))) { allOurs = false; break }
    }
    if (allOurs) {
      if (!dry) fs.rmSync(dir, { recursive: true, force: true })
      for (const r of [...installedSet]) if (r.startsWith(`${t}/${id}/`)) { installedSet.delete(r); delete hashes[r] }
      retiredRemoved.push(`${t}/${id}`)
    } else {
      retiredKept.push(`${t}/${id}`)
    }
  }
}

// ---------------------------------------------------------------- 설치 시점 커밋
// 검수 훅이 "설치한 뒤로 무엇이 바뀌었나"를 볼 기준점이다. 이것이 없으면 훅은 아직 커밋하지 않은
// 변경만 보게 되는데, 스킬들은 마지막에 커밋을 하므로 끝낼 때 트리가 깨끗해 검수가 한 번도 돌지 않는다.
// 이미 적혀 있으면 그대로 둔다(기준점은 처음 설치한 자리여야 한다).
function headCommit(dir) {
  const r = spawnSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8', timeout: 15000, windowsHide: true })
  const out = (r.stdout || '').trim()
  return r.status === 0 && /^[0-9a-f]{7,40}$/i.test(out) ? out : null
}
const installedCommit = typeof state.installed_commit === 'string' && state.installed_commit
  ? state.installed_commit
  : headCommit(root)
if (!installedCommit) {
  // 저장소가 없는 것과, 저장소는 있는데 커밋이 아직 0 인 것은 다르다(수업 순서상 설치가 첫 커밋보다 먼저라 뒤쪽이 흔하다).
  // 어느 쪽이든 검수 훅은 첫 커밋을 기준점으로 대신 쓰므로 설치를 다시 할 필요는 없다.
  const isRepo = spawnSync('git', ['-C', root, 'rev-parse', '--is-inside-work-tree'], { encoding: 'utf8', timeout: 15000, windowsHide: true }).status === 0
  notes.push(isRepo
    ? 'git 저장소는 있지만 아직 커밋이 없어 설치 시점을 표시하지 못했습니다. 첫 커밋을 하면 검수 훅이 그 커밋을 기준점으로 씁니다 — 설치를 다시 할 필요는 없습니다.'
    : '이 프로젝트는 아직 git 저장소가 아니어서 설치 시점을 표시하지 못했습니다. `git init` 과 첫 커밋을 하면 검수 훅이 그 커밋을 기준점으로 씁니다 — 설치를 다시 할 필요는 없습니다.')
}

// ---------------------------------------------------------------- 기록 저장
if (!dry && linkInside(statePath)) {
  notes.push('설치 기록 자리(.owner/install-state.json)가 링크·정션을 거쳐 기록을 남기지 않았습니다.')
} else if (!dry) {
  fs.mkdirSync(path.dirname(statePath), { recursive: true })
  fs.writeFileSync(statePath, JSON.stringify({
    version: manifest.version,
    target,
    installed_commit: installedCommit,
    installed: [...installedSet].sort(),
    hashes,
    updated_at: new Date().toISOString(),
  }, null, 2) + '\n', 'utf8')
}

// ---------------------------------------------------------------- 보고
const p = dry ? '[미리보기] ' : ''
console.log('')
console.log(`${p}인디언즈 ERP 클래스 번들 v${manifest.version} 설치`)
console.log(`${p}대상 폴더: ${root}`)
console.log(`${p}파일 ${written}개 기록, ${skips.length}개는 그대로 둠(같은 내용이거나 이미 있는 기록)`)
console.log('')
console.log(`  스킬            ${foundSkills.length}종 → ${skillDirs.join(' + ')}`)
if (foundAgents.length) {
  const where = [wantClaude ? '.claude/agents/*.md' : null, wantCodex ? '.codex/agents/*.toml' : null].filter(Boolean).join(' + ')
  console.log(`  에이전트        ${foundAgents.length}종 → ${where}`)
}
const autoHooks = foundHooks.filter((f) => registeredScripts.has(f))
const helperScripts = foundHooks.filter((f) => !registeredScripts.has(f))
if (autoHooks.length) console.log(`  훅(자동 실행)    ${autoHooks.length}개 → .owner/hooks/ (${autoHooks.map((f) => f.replace(/\.mjs$/, '')).join('·')})`)
if (helperScripts.length) console.log(`  도우미 스크립트  ${helperScripts.length}개 → .owner/hooks/ (${helperScripts.map((f) => f.replace(/\.mjs$/, '')).join('·')})`)
if (imgCount) console.log(`  디자인 선택창    ${imgCount}개 → .owner/design/`)
if (foundCourse.length) console.log(`  수업 자료       ${foundCourse.length}개 → course/`)
console.log(`  상태 문서       .owner/state.md · .owner/progress.json (없을 때만 새로 만듭니다)`)
console.log(`  보고서 폴더     reports/`)
if (guideFiles.length) console.log(`  프로젝트 지침   ${guideFiles.join(' · ')} (없을 때만 네 줄로 만듭니다 — 한국어로 답하기 · 스킬 이름대로 · 끝나면 state.md · 자기가 띄운 서버만 PID 로 끄기)`)
// 이미 있던 지침 파일에 네 줄 중 빠진 것이 있으면 알려만 준다(고치지 않는다)
for (const g of guideFiles) {
  let t = null
  try { t = fs.readFileSync(path.join(root, g), 'utf8') } catch { t = null }
  if (t === null) continue                       // 미리보기라 아직 없다
  const miss = PROJECT_RULES.filter((_, i) => !RULE_KEYS[i].test(t))
  if (!miss.length) continue
  console.log('')
  console.log(`${p}${g} 가 이미 있어 건드리지 않았습니다. 아래 줄이 그 파일에 없으면 직접 넣어 주세요:`)
  miss.forEach((m) => console.log(`  ${m}`))
}

if (registrations.length) {
  console.log('')
  console.log(`${p}훅 등록`)
  for (const r of registrations) {
    const who = r.label ? ` (${r.label})` : ''
    if (r.status === '건너뜀') {
      console.log(`  ${r.file}${who} — 건너뜀: ${r.why}`)
      console.log(`    아래 파일의 "hooks" 안 항목들을 이 파일의 "hooks" 자리에 직접 옮겨 넣어 주세요(이미 있는 다른 훅은 지우지 않습니다):`)
      console.log(`    ${r.manual}`)
      if (/codex/i.test(r.manual)) console.log(`    옮길 때 {{PROJECT_DIR}} 는 이 폴더 경로 ${PROJECT_DIR_POSIX} 로 바꿔 적습니다.`)
    } else {
      console.log(`  ${r.file}${who} — ${r.status}`)
    }
  }
}

if (updated.length) {
  console.log('')
  console.log(`${p}이 중 ${updated.length}개는 전에 설치한 파일을 새 버전으로 갱신했습니다(직접 고친 흔적 없음).`)
}
if (eolOnly.length) {
  console.log('')
  console.log(`${p}내용이 같고 줄 끝(줄바꿈 표시)만 다른 파일 ${eolOnly.length}개는 그대로 뒀습니다 — 갱신이 아닙니다.`)
}
if (kept.length) {
  console.log('')
  console.log(`${p}다음 ${kept.length}개는 직접 고친 흔적(체크·메모)이 있거나 고쳤는지 알 수 없어 원본을 그대로 두고, 새 버전은 같은 자리의 ".new" 에 두었습니다. 비교한 뒤 필요하면 옮겨 적으세요:`)
  kept.forEach((u) => console.log('  - ' + u + '  →  ' + u + '.new'))
  console.log('  비교하는 법(어느 한 줄을 그대로 복사해 실행하세요 — 줄 끝 차이는 무시합니다):')
  console.log(`    diff --strip-trailing-cr "${kept[0]}" "${kept[0]}.new"`)
  console.log('  ".new" 는 비교용입니다. 다음 설치에서 그 자리의 ".new" 는 새 내용으로 교체됩니다(".new" 자체를 고쳐 두었으면 덮어쓰지 않고 설치를 멈춥니다) — 옮겨 적을 것이 있으면 지금 옮기고, 다 옮겼으면 ".new" 를 지우세요.')
  // 같은 스킬 파일이 Claude(.claude/skills) 와 Codex(.agents/skills) 양쪽에 들어간다.
  // 한쪽에만 메모를 적었으면 그쪽만 .new 가 생기고 반대쪽은 조용히 새 버전으로 갱신된다 —
  // 대표가 메모를 적어 둔 자리를 못 찾는 일이 없게 그 경로를 알려 준다.
  const twinOf = (r) => r.startsWith('.claude/skills/') ? r.replace('.claude/skills/', '.agents/skills/')
    : r.startsWith('.agents/skills/') ? r.replace('.agents/skills/', '.claude/skills/') : null
  const keptSet = new Set(kept)
  const twins = kept.map((r) => [r, twinOf(r)])
    .filter(([, t]) => t && !keptSet.has(t) && fs.existsSync(path.join(root, t)))
  if (twins.length) {
    console.log('')
    console.log(`${p}같은 파일이 다른 도구 쪽에도 있습니다 — 그쪽은 메모 없이 새 버전으로 갱신됐습니다. 메모를 옮겨 적을 때 함께 보세요:`)
    twins.forEach(([r, t]) => console.log(`  - ${r}  ↔  ${t}`))
  }
}
if (retiredRemoved.length) {
  console.log('')
  console.log(`${p}지난 번들의 스킬 ${retiredRemoved.length}개를 정리했습니다(지금은 다른 스킬로 합쳐졌습니다): ${retiredRemoved.join(', ')}`)
}
if (retiredKept.length) {
  console.log('')
  console.log(`${p}지난 번들의 스킬 중 직접 고친 흔적이 있어 그대로 남긴 것: ${retiredKept.join(', ')} — 필요 없으면 폴더째 지우세요.`)
}
if (notes.length) {
  console.log('')
  notes.forEach((n) => console.log(`  안내: ${n}`))
}

// Codex 는 프로젝트 훅을 신뢰하기 전까지 조용히 건너뛴다 — 경고도 없이 검수가 돌지 않는다.
// 신뢰 대장은 $CODEX_HOME(기본 ~/.codex)/config.toml 의 hooks.state 자리다.
// 신뢰는 훅 항목마다 기록된다 — 이번에 새로 넣거나 바꾼 항목은 전에 신뢰했어도 다시 승인해야 돈다.
if (wantCodex && autoHooks.length) {
  console.log('')
  console.log('Codex 를 쓰면 처음 한 번은 대화형(codex)으로 열어 훅 신뢰를 승인해야 검수·배포 전 확인·알림이 돕니다.')
  console.log(`  Codex 훅에는 이 폴더의 경로(${PROJECT_DIR_POSIX})가 그대로 들어갑니다 — 폴더를 옮기거나 다른 컴퓨터에서 받으면 설치기를 다시 실행하세요.`)
  if (registrations.some((r) => r.file.includes('codex') && r.changed)) {
    console.log(dry
      ? '  설치하면 Codex 훅 등록이 바뀝니다 — 그 뒤 codex 를 열고 /hooks 에서 새 항목을 신뢰해 주세요(전에 신뢰했어도 다시 한 번).'
      : '  이번에 Codex 훅 등록이 바뀌었습니다 — codex 를 열고 /hooks 에서 새 항목을 신뢰해 주세요(전에 신뢰했어도 다시 한 번).')
  }
  const codexHome = process.env.CODEX_HOME || path.join(os.homedir(), '.codex')
  const cfg = path.join(codexHome, 'config.toml')
  let cfgText = null
  try { if (fs.existsSync(cfg)) cfgText = fs.readFileSync(cfg, 'utf8') } catch { cfgText = null }
  if (cfgText !== null) {
    const hooksJson = path.join(root, '.codex', 'hooks.json')
    const variants = [hooksJson, hooksJson.split(path.sep).join('/'), hooksJson.replaceAll('\\', '\\\\')]
    const hay = cfgText.toLowerCase()
    const trusted = /hooks\.state/i.test(cfgText) && variants.some((v) => hay.includes(v.toLowerCase()))
    if (!trusted) {
      console.log(`  아직 신뢰 승인 전입니다 — 지금 상태로는 Codex 에서 검수가 돌지 않습니다(${cfg} 의 hooks.state 에 이 프로젝트 항목이 없습니다).`)
      console.log('  이 프로젝트 폴더에서 `codex` 를 한 번 실행하고 훅을 신뢰할지 묻는 창에서 허용하세요. 한 번만 하면 됩니다.')
    }
  }
}

console.log('')
console.log('설치기는 네트워크를 쓰지 않습니다. 설치 기록은 .owner/install-state.json 에만 남습니다.')
console.log('화면 캡처를 쓰려면 이 프로젝트에 playwright 가 필요합니다(설치기가 대신 설치하지 않습니다).')
console.log('  npm i -D playwright  →  npx playwright install chromium')
if (foundHooks.includes('design-pick.mjs')) {
  console.log('디자인 선택창은 인터뷰 3차가 끝난 뒤 새 대화에서 「디자인 테마 골라 줘.」라고 하면 열립니다(.owner/hooks/design-pick.mjs — 이 컴퓨터 안에서만 뜨는 화면).')
}
console.log('')
if (progressUnreadable) {
  console.log('진행 문서를 읽지 못했습니다(.owner/progress.json — 깨졌거나 인코딩이 다름). 설치기는 그 파일을 그대로 두고, 기존 앱 감지도 하지 않았습니다.')
  console.log('  새 대화에서 indeans-erp-setup 스킬로 점검하세요(진행 문서부터 바로잡습니다). 다른 도구로 만든 앱이면 그다음 indeans-erp-rebuild 가 다시 판정합니다.')
}
if (importedApp) {
  console.log('다음: 이 폴더에 이미 앱이 있습니다 → 새 대화에서 "indeans-erp-rebuild 스킬을 읽고 시작해 줘" 라고 요청하세요.')
  console.log('  되돌릴 지점과 백업을 먼저 만들고, 앱을 진단해 개선 방향을 제안합니다. 대표님이 고르기 전에는 앱을 고치지 않습니다.')
  console.log('  (수업 순서대로 새 대화에서 「설치 점검해 줘.」로 점검을 먼저 해도 됩니다 — 그 점검(indeans-erp-setup)이 끝에 이 스킬로 넘겨 줍니다.)')
} else if (!progressUnreadable && existingProgress && existingProgress.company
  && typeof existingProgress.company.name === 'string' && existingProgress.company.name.trim()) {
  // 진행 중인 프로젝트(회사 이름이 적힌 진행 문서가 이미 있음)에 다시 설치한 경우 — 처음 점검으로 돌려보내지 않고 다음 행동을 보여 준다.
  const nextAction = typeof existingProgress.next_action === 'string' ? existingProgress.next_action.trim() : ''
  if (nextAction) {
    console.log(`다음: 이 프로젝트는 진행 중입니다 — 다음 행동: "${nextAction}". 새 대화에서 그 스킬 이름을 불러 이어가세요. 처음부터 점검하려면 새 대화에서 「설치 점검해 줘.」.`)
  } else {
    console.log('다음: 이 프로젝트는 진행 중입니다 — 다음 행동은 .owner/state.md 의 "다음 행동" 을 보세요. 새 대화에서 그 스킬 이름을 불러 이어가세요. 처음부터 점검하려면 새 대화에서 「설치 점검해 줘.」.')
  }
} else {
  console.log('다음: 앱을 껐다 켠 뒤 새 대화를 열고 「설치 점검해 줘.」라고 말씀하세요. 점검이 끝나면 새 대화에서 「1차 인터뷰 시작해 줘.」로 이어집니다.')
  console.log(`  (짧은 말이 안 통하면 — 프로젝트 CLAUDE.md 에 짧은 말 사전이 없을 때 — "${manifest.firstSkill || 'indeans-erp-setup'} 스킬을 읽고 시작해 줘" 라고 하셔도 됩니다.)`)
}
if (dry) console.log('')
if (dry) console.log('[미리보기] 실제로는 아무것도 바꾸지 않았습니다. --dry-run 을 빼고 다시 실행하면 설치됩니다.')
