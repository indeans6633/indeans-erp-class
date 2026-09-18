#!/usr/bin/env node
// 인디언즈 ERP 클래스 설치기 — 네트워크 호출 없음. 이 저장소에 든 것을 내 ERP 프로젝트에 한 번에 넣는다.
// 스킬 14종 · 감독 에이전트 3종 · 검수 훅 · 디자인 이미지 세트 · 회차 자료 · 진행 상태 문서.
// 회차를 고르는 인자는 없다(통합 번들이다).
//
// 사용: node install.mjs --project "C:\path\to\my-erp" [--target both|claude|codex] [--dry-run]
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
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
if (fs.lstatSync(root).isSymbolicLink()) die('심볼릭 링크 경로에는 설치하지 않습니다.')
// 내려받은 강의 저장소 폴더에서 `--project "."` 로 실행하면 그 폴더에 설치돼 버린다 — 성공 메시지가 떠서
// 수강생은 됐다고 믿지만 정작 자기 프로젝트는 비어 있다(수강생 환경 실측 2026-09-17에서 실제로 재현).
if (path.resolve(root) === path.resolve(HERE)) {
  die('여기는 내려받은 강의 자료 폴더입니다. 내 ERP 프로젝트 폴더를 --project 로 지정하세요.\n'
    + `  예: node "${path.join(HERE, 'install.mjs')}" --project "C:\\work\\my-erp" --target both`)
}
if (['manifest.json', 'install.mjs'].every((f) => fs.existsSync(path.join(root, f))) && fs.existsSync(path.join(root, 'skills'))) {
  die('지정한 폴더가 강의 자료 폴더로 보입니다(설치기와 스킬 폴더가 함께 있습니다). 내 ERP 프로젝트 폴더를 지정하세요.')
}

const manifest = JSON.parse(fs.readFileSync(path.join(HERE, 'manifest.json'), 'utf8'))
const wantClaude = target === 'both' || target === 'claude'
const wantCodex = target === 'both' || target === 'codex'

const hash = (buf) => crypto.createHash('sha256').update(buf).digest('hex')
const rel = (dst) => path.relative(root, dst).split(path.sep).join('/')
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

// ① 스킬
const skillIds = [...manifest.sessions.flatMap((s) => s.skills), ...(manifest.final?.skills || [])]
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

// ③ 검수 훅 — 스크립트는 .owner/hooks/ 로, 등록은 아래 registerHook 에서
const hooksSrc = path.join(HERE, 'hooks')
const foundHooks = []
for (const f of manifest.hooks || []) {
  const src = path.join(hooksSrc, f)
  if (!fs.existsSync(src)) { notes.push(`훅 파일이 없어 건너뜁니다: hooks/${f}`); continue }
  foundHooks.push(f)
  add(path.join(root, '.owner', 'hooks', f), fs.readFileSync(src), '검수 훅')
}

// ④ 디자인 이미지 세트
// 목업 폴더(images/design/src/)에서 **뼈대 CSS 와 목업 HTML 은 함께 설치한다.**
// 고른 목업의 클래스·배치를 초안이 그대로 이어받아야 화면 인상이 비교 이미지와 같아지기 때문이다
// (design 스킬이 base.css·layout-*.css 를 src/styles/ 로 복사하고, draft 스킬이 <조합>.html 을 읽는다).
// 넣는 것만 적은 허용 목록이다 — 여기 없는 파일(제작·빌드 입력 전용)은 넣지 않는다.
const MOCK_KEEP = (name) => name === 'base.css' || /^layout-[\w-]+\.css$/.test(name) || /\.html$/i.test(name)
const imgSrc = path.join(HERE, manifest.images || 'images/design')
let imgCount = 0
const imgSkippedSrc = []
if (fs.existsSync(imgSrc)) {
  const mockDir = path.join(imgSrc, 'src')
  for (const f of walk(imgSrc)) {
    const inMock = f.startsWith(mockDir + path.sep)
    if (inMock && !MOCK_KEEP(path.basename(f))) { imgSkippedSrc.push(path.basename(f)); continue }
    add(path.join(root, '.owner', 'design', path.relative(imgSrc, f)), fs.readFileSync(f), '디자인 이미지')
    imgCount++
  }
  if (imgSkippedSrc.length) notes.push(`목업 폴더의 제작 전용 파일 ${imgSkippedSrc.length}개는 넣지 않았습니다: ${imgSkippedSrc.join(', ')}`)
} else {
  notes.push('디자인 이미지 세트가 이 저장소에 아직 없어 건너뜁니다(.owner/design).')
}

// ⑤ 회차 자료
const courseDirs = [...manifest.sessions.map((s) => `session-${String(s.session).padStart(2, '0')}`), 'final']
const foundCourse = []
for (const d of courseDirs) {
  const src = path.join(HERE, 'course', d)
  if (!fs.existsSync(src)) { notes.push(`회차 자료가 아직 없어 건너뜁니다: course/${d}`); continue }
  foundCourse.push(d)
  for (const f of walk(src)) add(path.join(root, 'course', d, path.relative(src, f)), fs.readFileSync(f), '회차 자료')
}

// ⑥ 진행 상태 문서 — 이미 있으면 절대 건드리지 않는다(수강생의 기록이다)
const tplDir = path.join(HERE, 'templates')
const stateTpl = path.join(tplDir, 'owner-state.md')
const progTpl = path.join(tplDir, 'owner-progress.json')
if (fs.existsSync(stateTpl)) add(path.join(root, '.owner', 'state.md'), fs.readFileSync(stateTpl), '상태 문서', true)
if (fs.existsSync(progTpl)) add(path.join(root, '.owner', 'progress.json'), fs.readFileSync(progTpl), '상태 문서', true)

// ⑦ 보고서 폴더
add(path.join(root, 'reports', '.gitkeep'), '', '보고서 폴더', true)

if (!foundSkills.length && !foundAgents.length && !foundHooks.length) {
  die('이 저장소에 설치할 내용이 없습니다. 저장소를 제대로 내려받았는지 확인하세요.')
}

// ---------------------------------------------------------------- 설치 기록
const statePath = path.join(root, '.owner', 'install-state.json')
let state = { installed: [], hashes: {} }
if (fs.existsSync(statePath)) {
  try { state = JSON.parse(fs.readFileSync(statePath, 'utf8')) } catch {
    notes.push('설치 기록(.owner/install-state.json)을 읽지 못해 새로 시작합니다. 직접 만든 파일은 그대로 보호됩니다.')
    state = { installed: [], hashes: {} }
  }
}
const installedSet = new Set(state.installed || [])
const hashes = { ...(state.hashes || {}) }

// ---------------------------------------------------------------- 충돌 검사
const conflicts = []
const skips = []
for (const item of plan) {
  const r = rel(item.dst)
  if (!fs.existsSync(item.dst)) continue
  if (item.once) { skips.push(r); continue }        // 있으면 그대로 둔다
  if (fs.readFileSync(item.dst).equals(item.data)) { skips.push(r); continue }
  if (installedSet.has(r)) continue                  // 우리가 넣었던 파일의 갱신은 허용
  conflicts.push(r)
}
if (conflicts.length) {
  console.error('다음 파일은 직접 만든 파일로 보여 덮어쓰지 않습니다. 이름을 바꾸거나 옮긴 뒤 다시 실행하세요:')
  conflicts.forEach((c) => console.error('  - ' + c))
  process.exit(2)
}

// ---------------------------------------------------------------- 쓰기
const skipSet = new Set(skips)
let written = 0
const updated = []   // 우리가 넣었고 수강생이 손대지 않은 파일 → 새 버전으로 교체
const kept = []      // 우리가 넣었지만 수강생이 고친 파일 → 원본은 두고 새 버전을 <이름>.new 로
for (const item of plan) {
  const r = rel(item.dst)
  if (skipSet.has(r)) continue
  let out = item.dst
  if (fs.existsSync(item.dst)) {
    const rec = hashes[r]
    const cur = hash(fs.readFileSync(item.dst))
    if (rec && rec !== cur) { out = item.dst + '.new'; kept.push(r) } else updated.push(r)
  }
  if (!dry) { fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, item.data) }
  if (out === item.dst && !item.once) { installedSet.add(r); hashes[r] = hash(item.data) }
  written++
}

// ---------------------------------------------------------------- 훅 등록 (JSON 병합·멱등)
const registrations = []
// extra: 그 도구의 공식 문서에 있는 것만 넣는다(Claude Code 의 statusMessage 처럼).
// Claude Code 문서(2026-09-18 확인)의 훅 항목 공통 필드는 type·if·timeout·statusMessage·once 이고,
// command 는 type:"command" 전용 필드다. statusMessage 는 훅이 도는 동안 표시되는 문구다.
function registerHook(file, cmd, label, manual, extra = {}) {
  const abs = path.join(root, file)
  const existed = fs.existsSync(abs)
  const skip = (why) => registrations.push({ file, label, status: '건너뜀', why, manual })

  let json = {}
  if (existed) {
    try { json = JSON.parse(fs.readFileSync(abs, 'utf8').replace(/^\uFEFF/, '')) } catch {
      skip('파일의 JSON 형식을 읽을 수 없습니다')
      return
    }
    if (json === null || typeof json !== 'object' || Array.isArray(json)) {
      skip('파일이 JSON 객체가 아닙니다')
      return
    }
  }

  // 훅 목록이 담긴 자리는 설정 파일마다 두 형태가 다 쓰인다.
  //   { "hooks": { "Stop": [ ... ] } }   ← 새로 만들 때 쓰는 형태(양쪽 도구 문서의 파일 구조)
  //   { "Stop": [ ... ] }                ← 이미 이렇게 적어 둔 파일도 있어, 그럴 때는 그 자리에 넣는다
  // **먼저 두 자리를 모두 훑어 이미 등록된 항목을 찾는다.** 자리를 먼저 고르고 그 안만 보면,
  // 두 형태가 함께 있는 파일에서 반대쪽에 이미 있는 등록을 못 보고 한 번 더 넣어
  // 작업이 끝날 때마다 훅이 두 번 돈다(같은 요구가 두 줄로 뜬다).
  const findRegistered = (h0) => {
    if (!h0 || typeof h0 !== 'object' || !Array.isArray(h0.Stop)) return null
    for (const grp of h0.Stop) {
      if (!grp || typeof grp !== 'object') continue
      const list = Array.isArray(grp.hooks) ? grp.hooks : Array.isArray(grp) ? grp : []
      for (const h of list) if (h && typeof h.command === 'string' && h.command.includes('erp-check.mjs')) return h
    }
    return null
  }
  const nested = json.hooks && typeof json.hooks === 'object' && !Array.isArray(json.hooks) ? json.hooks : null
  const found = findRegistered(json) || findRegistered(nested)

  const write = () => {
    if (dry) return
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, JSON.stringify(json, null, 2) + '\n', 'utf8')
  }

  if (found) {
    if (found.command === cmd) { registrations.push({ file, label, status: '이미 등록됨' }); return }
    found.command = cmd   // 같은 훅인데 부르는 문장만 옛것이면 문장만 고친다
    write()
    registrations.push({ file, label, status: '부르는 문장 갱신' })
    return
  }

  // 여기까지 왔으면 아직 등록이 없다 — 그때만 넣을 자리를 고른다.
  let holder
  if (Array.isArray(json.Stop) && (!nested || nested.Stop === undefined)) {
    holder = json                                  // 이미 { "Stop": [...] } 로 적어 둔 파일은 그 자리에 넣는다
  } else {
    if (json.hooks !== undefined && !nested) {
      skip('hooks 자리에 다른 값이 들어 있습니다')
      return
    }
    if (!json.hooks) json.hooks = {}
    holder = json.hooks
  }
  if (holder.Stop === undefined) holder.Stop = []
  if (!Array.isArray(holder.Stop)) {
    skip('Stop 이 목록(배열) 형태가 아닙니다')
    return
  }

  holder.Stop.push({ hooks: [{ type: 'command', command: cmd, timeout: 60, ...extra }] })
  write()
  registrations.push({ file, label, status: existed ? '등록' : '새로 만들고 등록' })
}
if (foundHooks.includes('erp-check.mjs')) {
  if (wantClaude) registerHook('.claude/settings.json', 'node .owner/hooks/erp-check.mjs --tool claude', 'Claude Code', 'hooks/templates/claude-settings.hooks.json', { statusMessage: '검수가 필요한 변경인지 확인' })
  // Codex 쪽에는 statusMessage 를 넣지 않는다 — 그 도구 문서에서 확인한 필드가 아니다.
  if (wantCodex) registerHook('.codex/hooks.json', 'node .owner/hooks/erp-check.mjs --tool codex', 'Codex', 'hooks/templates/codex-hooks.json')
}

// ---------------------------------------------------------------- 없어진 스킬 정리 (지난 번들에서 올라온 경우)
const RETIRED = ['indeans-erp-style-calm', 'indeans-erp-style-board', 'indeans-erp-style-warm', 'indeans-erp-clinic']
const retiredRemoved = []
const retiredKept = []
for (const id of RETIRED) {
  for (const t of ['.claude/skills', '.agents/skills']) {
    const dir = path.join(root, t, id)
    if (!fs.existsSync(dir)) continue
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

// ---------------------------------------------------------------- 기록 저장
if (!dry) {
  fs.mkdirSync(path.dirname(statePath), { recursive: true })
  fs.writeFileSync(statePath, JSON.stringify({
    version: manifest.version,
    target,
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
  console.log(`  감독 에이전트    ${foundAgents.length}종 → ${where}`)
}
if (foundHooks.length) console.log(`  검수 훅         ${foundHooks.length}개 → .owner/hooks/`)
if (imgCount) console.log(`  디자인 이미지    ${imgCount}개 → .owner/design/`)
if (foundCourse.length) console.log(`  회차 자료       ${foundCourse.length}개 → course/`)
console.log(`  상태 문서       .owner/state.md · .owner/progress.json (없을 때만 새로 만듭니다)`)
console.log(`  보고서 폴더     reports/`)

if (registrations.length) {
  console.log('')
  console.log(`${p}검수 훅 등록`)
  for (const r of registrations) {
    const who = r.label ? ` (${r.label})` : ''
    if (r.status === '건너뜀') {
      console.log(`  ${r.file}${who} — 건너뜀: ${r.why}`)
      console.log(`    아래 내용을 직접 넣어 주세요(내려받은 폴더의 ${r.manual} 과 같습니다):`)
      console.log(`    "hooks": { "Stop": [ { "hooks": [ { "type": "command", "command": "node .owner/hooks/erp-check.mjs --tool ${r.file.includes('codex') ? 'codex' : 'claude'}" } ] } ] }`)
    } else {
      console.log(`  ${r.file}${who} — ${r.status}`)
    }
  }
}

if (updated.length) {
  console.log('')
  console.log(`${p}이 중 ${updated.length}개는 전에 설치한 파일을 새 버전으로 갱신했습니다(직접 고친 흔적 없음).`)
}
if (kept.length) {
  console.log('')
  console.log(`${p}다음 ${kept.length}개는 직접 고친 흔적(체크·메모)이 있어 원본을 그대로 두고 새 버전을 같은 자리에 ".new" 로 저장했습니다. 비교한 뒤 필요하면 옮겨 적으세요:`)
  kept.forEach((u) => console.log('  - ' + u + '  →  ' + u + '.new'))
  console.log('  ".new" 는 비교용입니다. 다음 설치에서 그 자리의 ".new" 는 새 내용으로 교체됩니다 — 옮겨 적을 것이 있으면 지금 옮기고, 다 옮겼으면 ".new" 를 지우세요.')
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

console.log('')
console.log('설치기는 네트워크를 쓰지 않습니다. 설치 기록은 .owner/install-state.json 에만 남습니다.')
console.log('화면 캡처를 쓰려면 이 프로젝트에 playwright 가 필요합니다(설치기가 대신 설치하지 않습니다).')
console.log('  npm i -D playwright  →  npx playwright install chromium')
console.log('')
console.log(`다음: 새 대화를 열고 "${manifest.firstSkill || 'indeans-erp-setup'} 스킬을 읽고 시작해 줘" 라고 요청하세요(스킬 이름을 직접 불러야 그 절차대로 움직입니다).`)
if (dry) console.log('')
if (dry) console.log('[미리보기] 실제로는 아무것도 바꾸지 않았습니다. --dry-run 을 빼고 다시 실행하면 설치됩니다.')
