#!/usr/bin/env node
// 가져온 앱 전체 백업 — 리빌딩 전에 앱 폴더를 통째로 복사해 둔다. 네트워크 호출 없음. 원본은 건드리지 않는다.
// indeans-erp-rebuild 절차 2·7에서 부른다.
//
// 사용:
//   node <스킬 폴더>/assets/rebuild-backup.mjs [--project "<폴더>"] [--dry-run]
//     → .owner/backup/before-rebuild-<날짜>-<시분>/ (같은 이름이 있으면 -2, -3 …)
//   node <스킬 폴더>/assets/rebuild-backup.mjs --styles "<파일>" ["<파일>" …]
//     → .owner/backup/styles-before-<날짜>-<시분>/ 에 원래 경로 모양 그대로 + manifest.json(원본 경로·해시)
//
// 종료 코드: 0 완료 · 1 사용법·경로 검사 실패(아무것도 복사하지 않음) · 2 일부 파일 복사 실패(manifest 의 failed 에 목록 — 완료 백업이 아니다)
//
// 지키는 것:
//   - 모든 깊이에서 빼는 것: node_modules · .git · .owner/backup · .owner/tmp. 프로젝트 맨 위에서만 빼는 것: dist · build · .next · .vite · .turbo · coverage
//     (src/build/ 처럼 안쪽에 있는 같은 이름 폴더는 사람이 만든 코드일 수 있어 복사한다).
//   - 이름이 .env · .env.* · .envrc 인 파일은 **열지도 복사하지도 않는다**. 그런 이름의 폴더에는 들어가지 않는다. 이름만 안내 파일에 적는다.
//   - 링크(심볼릭 링크·정션·하드 링크)는 따라가지 않고 이름만 적는다. 입력(--styles)과 출력(.owner·.owner/backup) 경로도 링크면 멈춘다.
//   - 이미 있는 파일을 덮어쓰지 않는다(COPYFILE_EXCL). 백업 폴더는 배타적으로 만든다(동시에 두 번 돌려도 섞이지 않는다).
//   - 한계: 실행 중인 앱이 쓰고 있는 파일(SQLite·로그)은 서로 다른 시점으로 복사될 수 있다 — 앱을 끄고 백업한다.
//     원격 데이터베이스(Supabase 등)와 브라우저 안 데이터(localStorage)는 이 백업으로 돌아오지 않는다.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

// ---- 옵션 ----
const opts = { project: null, dry: false, styles: null }
{
  const argv = process.argv.slice(2)
  const usage = '사용: [--project "<폴더>"] [--dry-run] | --styles "<파일>" ["<파일>" …]'
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--dry-run') { opts.dry = true; continue }
    if (a === '--project') {
      const v = argv[i + 1]
      if (v === undefined || v.startsWith('--')) { console.error('--project 뒤에 폴더를 적으세요.'); process.exit(1) }
      if (opts.project !== null) { console.error('--project 를 두 번 적었습니다.'); process.exit(1) }
      opts.project = v; i++; continue
    }
    if (a === '--styles') {
      if (opts.styles !== null) { console.error('--styles 를 두 번 적었습니다.'); process.exit(1) }
      opts.styles = []
      while (i + 1 < argv.length && !argv[i + 1].startsWith('--')) opts.styles.push(argv[++i])
      if (!opts.styles.length) { console.error('--styles 뒤에 백업할 파일 경로를 적으세요(예: src/index.css tailwind.config.js).'); process.exit(1) }
      continue
    }
    console.error(`모르는 옵션입니다: ${a}\n${usage}`); process.exit(1)
  }
}

const root = path.resolve(opts.project || process.cwd())
let realRoot
try { realRoot = fs.realpathSync.native(root) } catch { console.error(`폴더가 없습니다: ${root}`); process.exit(1) }
const fold = (s) => (process.platform === 'win32' ? s.toLowerCase() : s)
const insideRoot = (abs) => { const rp = fold(abs); const rr = fold(realRoot); return rp === rr || rp.startsWith(rr.endsWith(path.sep) ? rr : rr + path.sep) }
const isEnvName = (name) => { const n = name.toLowerCase(); return n === '.env' || n.startsWith('.env.') || n === '.envrc' }
const posix = (p) => p.split(path.sep).join('/')
const stamp = () => {
  const d = new Date(); const l = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString()
  return `${l.slice(0, 10)}-${l.slice(11, 13)}${l.slice(14, 16)}`
}
const sha = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')

// 프로젝트 안 상대 경로 검사 — 각 단계 lstat(링크 거부)·.env 이름 거부·실제 경로가 프로젝트 안
function checkRel(relPath) {
  const parts = relPath.split(/[\\/]+/).filter(Boolean)
  let cur = root; let st = null
  for (const part of parts) {
    if (part === '..' || part === '.') return { ok: false, reason: '프로젝트 밖 또는 이상한 경로' }
    if (isEnvName(part)) return { ok: false, reason: '.env 계열 이름' }
    cur = path.join(cur, part)
    try { st = fs.lstatSync(cur) } catch { return { ok: false, reason: '없음' } }
    if (st.isSymbolicLink()) return { ok: false, reason: `링크·정션(${posix(path.relative(root, cur))}) — 따라가지 않는다` }
  }
  let rp
  try { rp = fs.realpathSync.native(cur) } catch { return { ok: false, reason: '실제 경로 확인 실패' } }
  if (!insideRoot(rp)) return { ok: false, reason: '실제 경로가 프로젝트 밖' }
  return { ok: true, abs: cur, st }
}

// 출력 폴더 .owner/backup 을 링크 없이 확보한다(없으면 만든다)
function ensureBackupRoot() {
  let cur = root
  for (const part of ['.owner', 'backup']) {
    cur = path.join(cur, part)
    let st = null
    try { st = fs.lstatSync(cur) } catch { /* 없음 */ }
    if (st && st.isSymbolicLink()) { console.error(`백업 자리(${posix(path.relative(root, cur))})가 링크·정션입니다 — 프로젝트 밖에 쓰게 되므로 멈춥니다.`); process.exit(1) }
    if (st && !st.isDirectory()) { console.error(`백업 자리(${posix(path.relative(root, cur))})가 폴더가 아닙니다 — 멈춥니다.`); process.exit(1) }
    if (!st && !opts.dry) fs.mkdirSync(cur)
  }
  if (!opts.dry && !insideRoot(fs.realpathSync.native(cur))) { console.error('백업 자리의 실제 경로가 프로젝트 밖입니다 — 멈춥니다.'); process.exit(1) }
  return cur
}
// 이름을 배타적으로 확보한다(이미 있으면 -2, -3 …)
function reserve(base, prefix) {
  for (let i = 1; i < 1000; i++) {
    const name = i === 1 ? prefix : `${prefix}-${i}`
    const p = path.join(base, name)
    if (opts.dry) { if (!fs.existsSync(p)) return { name, p } ; continue }
    try { fs.mkdirSync(p); return { name, p } } catch (e) { if (e.code !== 'EEXIST') throw e }
  }
  console.error('백업 폴더 이름을 정하지 못했습니다.'); process.exit(1)
}

{
  const pj = checkRel('package.json'); const ih = checkRel('index.html')
  if (!(pj.ok && pj.st.isFile()) && !(ih.ok && ih.st.isFile())) {
    console.error(`앱 폴더로 보이지 않습니다(package.json·index.html 없음 또는 링크): ${root}`)
    process.exit(1)
  }
}

// ---- 스타일 파일만 옮겨 둘 때 ----
if (opts.styles) {
  // 먼저 전부 검사한다. 하나라도 안 되면 아무것도 복사하지 않는다.
  const plan = []; const bad = []
  for (const f of opts.styles) {
    const abs = path.resolve(root, f)
    const r = path.relative(root, abs)
    if (!r || r.startsWith('..') || path.isAbsolute(r)) { bad.push(`${f} — 프로젝트 밖`); continue }
    if (posix(r) === 'manifest.json') { bad.push(`${f} — 맨 위 manifest.json 은 백업 기록 이름과 겹친다(스타일 파일이 아니다)`); continue }
    const c = checkRel(r)
    if (!c.ok) { bad.push(`${f} — ${c.reason}`); continue }
    if (!c.st.isFile()) { bad.push(`${f} — 파일이 아님`); continue }
    if (c.st.nlink > 1) { bad.push(`${f} — 하드 링크(다른 이름의 같은 파일 — .env 일 수 있다)`); continue }
    if (plan.some((x) => fold(x.r) === fold(posix(r)))) continue
    plan.push({ abs: c.abs, r: posix(r) })
  }
  if (bad.length) { console.error('스타일 백업을 멈춥니다(아무것도 복사하지 않았습니다):'); bad.forEach((b) => console.error(`  - ${b}`)); process.exit(1) }
  const base = ensureBackupRoot()
  const { name, p: dst } = reserve(base, `styles-before-${stamp()}`)
  const manifest = { kind: 'styles', created_at: new Date().toISOString(), project: root, folder: `.owner/backup/${name}`, files: [], failed: [] }
  for (const { abs, r } of plan) {
    try {
      const hash = sha(abs)
      if (!opts.dry) {
        const to = path.join(dst, ...r.split('/'))
        fs.mkdirSync(path.dirname(to), { recursive: true })
        fs.copyFileSync(abs, to, fs.constants.COPYFILE_EXCL)
      }
      manifest.files.push({ path: r, sha256: hash })
      console.log(`백업: ${r} → .owner/backup/${name}/${r}`)
    } catch (e) { manifest.failed.push({ path: r, error: e.code || e.message }) }
  }
  manifest.complete = manifest.failed.length === 0
  if (!opts.dry) fs.writeFileSync(path.join(dst, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' })
  console.log(`${opts.dry ? '[미리보기] ' : ''}스타일 파일 ${manifest.files.length}개를 .owner/backup/${name}/ 에 남겼습니다(manifest.json 에 원본 경로·해시). 원래 자리 파일은 그대로입니다.`)
  if (manifest.failed.length) { console.error(`복사 실패 ${manifest.failed.length}개 — 완료 백업이 아닙니다: ${manifest.failed.map((x) => x.path).join(', ')}`); process.exit(2) }
  process.exit(0)
}

// ---- 전체 백업 ----
const SKIP_ANY = new Set(['node_modules', '.git'])
const SKIP_REL = new Set(['.owner/backup', '.owner/tmp'])
const SKIP_TOP = new Set(['dist', 'build', '.next', '.vite', '.turbo', 'coverage'])
const base = ensureBackupRoot()
const { name, p: dstRoot } = reserve(base, `before-rebuild-${stamp()}`)

const envSeen = []; const linksSeen = []; const skippedDirs = []; const dataFiles = []
const files = []; const failed = []
let bytes = 0
const topNames = new Set()
function copyDir(src, dst, depth) {
  let entries
  try { entries = fs.readdirSync(src, { withFileTypes: true }) } catch (e) { failed.push({ path: posix(path.relative(root, src)) + '/', error: e.code || e.message }); return }
  for (const e of entries) {
    const s = path.join(src, e.name)
    const r = posix(path.relative(root, s))
    if (depth === 0) topNames.add(e.name.toLowerCase())
    if (e.isSymbolicLink()) { linksSeen.push(r); continue }
    if (isEnvName(e.name)) { envSeen.push(r + (e.isDirectory() ? '/' : '')); continue }   // 열지 않는다 — 이름만
    if (e.isDirectory()) {
      if (SKIP_ANY.has(e.name) || SKIP_REL.has(r) || (depth === 0 && SKIP_TOP.has(e.name))) { skippedDirs.push(r); continue }
      const d = path.join(dst, e.name)
      if (!opts.dry) { try { fs.mkdirSync(d, { recursive: true }) } catch (err) { failed.push({ path: r + '/', error: err.code || err.message }); continue } }
      copyDir(s, d, depth + 1)
      continue
    }
    if (!e.isFile()) continue
    if (/\.(sqlite3?|db)$|-wal$|-journal$/i.test(e.name)) dataFiles.push(r)
    try {
      const st = fs.lstatSync(s)
      if (st.nlink > 1) { linksSeen.push(`${r}(하드 링크)`); continue }
      const hash = sha(s)
      if (!opts.dry) fs.copyFileSync(s, path.join(dst, e.name), fs.constants.COPYFILE_EXCL)
      files.push({ path: r, size: st.size, sha256: hash })
      bytes += st.size
    } catch (err) { failed.push({ path: r, error: err.code || err.message }) }
  }
}
copyDir(root, dstRoot, 0)

// 안내·기록 파일 이름 — 원본 맨 위에 같은 이름이 있으면 .1 을 붙인다
const metaName = (stem, ext) => (topNames.has(`${stem}${ext}`.toLowerCase()) ? `${stem}.1${ext}` : `${stem}${ext}`)
const infoName = metaName('__rebuild-backup-info', '.md')
const manName = metaName('__rebuild-backup-manifest', '.json')
const mb = (bytes / 1024 / 1024).toFixed(1)
const info = [
  `# 리빌딩 전 백업 — ${stamp()}`,
  '',
  `원본 폴더: ${root}`,
  `복사한 파일: ${files.length}개 · ${mb}MB · 복사 실패: ${failed.length}개${failed.length ? ' — **완료 백업이 아니다**' : ''}`,
  `파일별 원본 경로·해시: ${manName}`,
  '',
  '## 복사하지 않은 것',
  '',
  `- 폴더: ${skippedDirs.join(', ') || '(없음)'} — 다시 만들 수 있거나(node_modules·맨 위 dist 등) 따로 기록이 있는 것(.git)·백업 자신(.owner/backup·.owner/tmp)`,
  `- .env 계열(열지 않았다 — 값은 원래 자리에만 있다): ${envSeen.join(', ') || '(없음)'}`,
  `- 링크(따라가지 않았다): ${linksSeen.join(', ') || '(없음)'}`,
  `- 복사 실패: ${failed.map((x) => `${x.path}(${x.error})`).join(', ') || '(없음)'}`,
  '',
  '## 이 백업으로 돌아오지 않는 것',
  '',
  '- 원격 데이터베이스(Supabase 등)의 행과 브라우저 안 데이터(localStorage·IndexedDB). 그쪽은 별도 백업이 필요하다.',
  dataFiles.length ? `- 앱이 쓰는 중이던 데이터 파일은 시점이 어긋났을 수 있다: ${dataFiles.join(', ')} — 앱을 끄고 다시 백업한다.` : '- (프로젝트 안 데이터 파일 없음)',
  '',
  '## 되돌리는 법',
  '',
  '1. 먼저 git 으로 되돌린다(리빌딩 전 커밋 — `git log --oneline` 에서 "리빌딩 전 상태 저장"을 찾는다).',
  '2. git 기록에 없던 파일이 사라졌을 때만 이 폴더에서 그 파일을 원래 자리로 복사한다.',
  '3. 복사한 뒤 `npm install` → `npm run dev` 로 화면이 열리는지 본다.',
  '',
]
const manifest = { kind: 'full', created_at: new Date().toISOString(), project: root, folder: `.owner/backup/${name}`,
  complete: failed.length === 0, files, failed, skipped_dirs: skippedDirs, env_names: envSeen, links: linksSeen, data_files: dataFiles }
if (!opts.dry) {
  try {
    fs.writeFileSync(path.join(dstRoot, infoName), info.join('\n'), { flag: 'wx' })
    fs.writeFileSync(path.join(dstRoot, manName), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' })
  } catch (e) { console.error(`백업 기록 파일을 쓰지 못했습니다(${e.code || e.message}) — 완료 백업이 아닙니다.`); process.exit(2) }
}
console.log(`${opts.dry ? '[미리보기] ' : ''}백업 ${opts.dry ? '예정' : failed.length ? '일부 실패' : '완료'}: .owner/backup/${name}/ — 파일 ${files.length}개 · ${mb}MB · 실패 ${failed.length}개`)
console.log(`  .env 계열(복사·열람 안 함): ${envSeen.join(', ') || '없음'}`)
if (linksSeen.length) console.log(`  링크(따라가지 않음): ${linksSeen.join(', ')}`)
if (dataFiles.length) console.log(`  데이터 파일: ${dataFiles.join(', ')} — 앱이 켜져 있었다면 끄고 다시 백업하세요.`)
console.log('  원격 데이터베이스·브라우저 안 데이터는 이 백업으로 돌아오지 않습니다.')
console.log('  .owner/backup/ 은 .gitignore 에 넣어 커밋하지 않는다(git 기록과 겹치고 저장소가 커진다).')
if (failed.length) { console.error(`  복사 실패: ${failed.map((x) => `${x.path}(${x.error})`).join(', ')} — 완료 백업이 아닙니다. 원인을 없애고 다시 실행하세요.`); process.exit(2) }
