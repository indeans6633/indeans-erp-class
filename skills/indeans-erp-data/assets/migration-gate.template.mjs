#!/usr/bin/env node
// 마이그레이션 게이트 — 표·정책·함수 파일(supabase/migrations/*.sql)과 앱 코드에서
// "되돌리기 어려운 실수"를 글자로 찾아낸다. 네트워크 호출 없음. 데이터베이스에 접속하지 않는다.
// indeans-erp-data 스킬이 이 파일을 scripts/migration-gate.mjs 로 복사하고 package.json 의 "check" 에 잇는다.
// 배포 직전 훅(.owner/hooks/erp-predeploy.mjs)이 `npm run check` 로 이것을 돌린다.
//
// **정적 휴리스틱이다.** 파일의 글자만 읽어 흔한 실수 모양을 찾는다 — 실제로 데이터베이스에 무엇이 걸려 있는지는 모른다.
// 롤백 시뮬(indeans-erp-check 의 references/rollback-sim.md)·역할별 실측(erp-verifier)·감사(erp-auditor)와 함께 써야 한다.
// 이 검사를 통과했다고 "잠겼다"고 말하지 않는다.
//
// 사용: node scripts/migration-gate.mjs          막힘이 하나라도 있으면 종료 코드 1
//       node scripts/migration-gate.mjs --list   점검 항목만 본다
//
// 모든 파일을 번호 순서대로 읽은 뒤의 "마지막 상태"로 판정한다 — 뒤에서 고치거나(alter) 지웠다 다시 만든 것도 반영한다.
// 막힘(종료 코드 1)
//   G1  표 잠금        새 표에 행 수준 보안을 켜지(ENABLE) 않았거나 껐다. FORCE 만으로는 켜진 것이 아니다
//   G2  정책 동반      잠근 표에 남아 있는 정책이 하나도 없다 — 아무도 못 본다
//   G3  함수 안전장치  권한 높은 함수(security definer — 뒤에서 alter function 으로 바꾼 것 포함)의 search_path 가
//                      비었거나 pg_temp 가 맨 끝이 아니다, 또는 public·anon 의 실행 권한을 회수하지 않았다(트리거 함수는 제외)
//   G4  정책 함수 권한 정책 안에서 부르는 함수를 로그인 사용자(authenticated)가 못 부른다 — 그 표 조회가 통째로 죽는다
//   G5  비밀값        웹후크 주소·봇 열쇠·비밀 키·비밀번호 든 접속 문자열이 파일에 적혀 있다
//   G6  뷰 잠금        뷰의 security_invoker 가 마지막에 켜져 있지 않다, 또는 구체화된 뷰를 앱 사용자(anon·authenticated)가
//                      마지막 권한으로 읽을 수 있다(회수한 뒤 다시 준 것 포함)
//   G12 정책 대상      정책(alter policy 로 바꾼 것 포함)에 대상이 없거나(=모두) 로그인 안 한 사람(anon·public)이 대상이다
//   G13 비로그인 권한  표·뷰·함수의 권한을 anon·public 에게 준다(grant … to anon / public)
//   G14 넓은 읽기 정책 읽기 정책(alter policy 로 바꾼 것 포함)의 조건이 "로그인만 하면 전부"(true · auth.uid() is not null 등)다
//   G15 돈 표 규칙     돈 표(money_in·money_out·…_plan)의 필수 제약(금액·상한·취소)이나 검사 트리거가 마지막에 없거나 꺼져 있다,
//                      또는 검사 함수가 권한 높은 함수가 아니거나 본문에 핵심(합계·비교·멈춤·차례 지키기)이 없다
//   G16 DO 블록       DO 블록 안에서 정책·잠금·권한·함수 보안·트리거·제약을 바꾼다 — 실행될지 글자로는 알 수 없어 막는다
// 주의(종료 코드 0 — 알리기만)
//   G0  허용 주석      사유 없는 허용 주석 — 무시하고 알린다
//   G7  파괴적 변경    표·칸 지우기·비우기·형식 바꾸기(지금 손대는 파일만 본다) — 백업과 롤백 시뮬 먼저
//   G8  고친 파일      이미 커밋한 마이그레이션 파일을 고치고 있다 — 실행한 파일이면 다음 번호로
//   G9  번호          파일 이름이 NNNN_무엇.sql 이 아니거나 번호가 겹친다
//   G10 목록 상한      앱 코드의 .select( 뒤에 limit/range 가 안 보인다
//   G11 인덱스        소속·연결 칸(…_id)이 있는 표에 인덱스가 하나도 없다
//
// 오탐이면 허용 주석을 적는다(사유는 반드시 괄호 안에 — 사유가 없으면 무시한다).
//   SQL 파일:  -- gate-allow: G2 app_secret (서버 함수만 읽는 비밀값 표 — 정책을 일부러 두지 않는다)
//   코드 파일: // gate-allow: G10 (한 건만 읽는 조회)
//   표·함수 이름을 적으면 그 대상만, 안 적으면 그 파일에서 그 항목 전체를 건너뛴다.
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const ROOT = process.cwd()
const MIG = path.join(ROOT, 'supabase', 'migrations')
const ITEMS = {
  G0: '허용 주석', G1: '표 잠금', G2: '정책 동반', G3: '함수 안전장치', G4: '정책 함수 권한', G5: '비밀값', G6: '뷰 잠금',
  G7: '파괴적 변경', G8: '고친 파일', G9: '번호', G10: '목록 상한', G11: '인덱스',
  G12: '정책 대상', G13: '비로그인 권한', G14: '넓은 읽기 정책', G15: '돈 표 규칙', G16: 'DO 블록',
}
const BLOCKING = new Set(['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G12', 'G13', 'G14', 'G15', 'G16'])
if (process.argv.includes('--list')) {
  for (const [id, name] of Object.entries(ITEMS)) console.log(`${id.padEnd(4)} ${name}${BLOCKING.has(id) ? ' (막힘)' : ' (주의)'}`)
  process.exit(0)
}

const findings = []   // { id, where, msg }
const add = (id, where, msg) => findings.push({ id, where, msg })
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/')
const read = (p) => fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, '')
function walk(dir, exts, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist', 'build', '.git', '.vercel'].includes(e.name)) continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, exts, out)
    else if (exts.some((x) => e.name.toLowerCase().endsWith(x))) out.push(p)
  }
  return out
}

// 허용 주석 — { G2: Set(['app_secret']) | '*' }
function allowsOf(text, marker) {
  const out = {}
  const re = new RegExp(`${marker}\\s*gate-allow:\\s*(G\\d+)\\s*([\\w."]*)\\s*(\\(([^)]*)\\))?`, 'gi')
  for (const m of text.matchAll(re)) {
    const id = m[1].toUpperCase()
    if (!m[4] || !m[4].trim()) { add('G0', '(허용 주석)', `"${m[0].trim()}" 에 사유가 없어 무시했습니다 — 괄호 안에 사유를 적어야 합니다`); continue }
    const target = (m[2] || '').replace(/"/g, '').replace(/^public\./i, '').toLowerCase()
    if (!target) out[id] = '*'
    else if (out[id] !== '*') (out[id] ||= new Set()).add(target)
  }
  return out
}
const allowed = (allows, id, target) => allows[id] === '*' || (target && allows[id] instanceof Set && allows[id].has(target))

// SQL 글자 다듬기 — 주석을 지우고, 함수 본문($$…$$)과 문자열('…')의 속은 공백으로 가린다(줄 위치는 그대로).
const blank = (s) => s.replace(/[^\n]/g, ' ')
const stripComments = (sql) => sql.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/--[^\n]*/g, blank)
const maskBodies = (sql) => sql
  .replace(/\$([A-Za-z_]\w*)?\$([\s\S]*?)\$\1\$/g, (m, tag = '', body) => `$${tag}$${blank(body)}$${tag}$`)
  .replace(/'(?:[^']|'')*'/g, (m) => `'${blank(m.slice(1, -1))}'`)
const dropBodies = (sql) => sql.replace(/\$([A-Za-z_]\w*)?\$[\s\S]*?\$\1\$/g, ' $$body$$ ')
const norm = (name) => String(name || '').replace(/"/g, '').toLowerCase()
const splitName = (name) => { const n = norm(name); const i = n.lastIndexOf('.'); return i < 0 ? { schema: 'public', name: n } : { schema: n.slice(0, i), name: n.slice(i + 1) } }
const lineAt = (text, idx) => text.slice(0, idx).split('\n').length
const rolesOf = (s) => s.toLowerCase().split(',').map((x) => x.replace(/"/g, '').trim()).filter(Boolean)
// 문자열('…', '' 는 따옴표 하나)을 건너뛰며 괄호 짝을 찾는다 — s[open] 이 '(' 일 때 짝 ')' 의 위치
function closeParen(s, open) {
  let depth = 0
  for (let i = open; i < s.length; i++) {
    const ch = s[i]
    if (ch === "'") { i++; while (i < s.length) { if (s[i] === "'") { if (s[i + 1] === "'") { i += 2; continue } break } i++ } continue }
    if (ch === '(') depth++
    else if (ch === ')') { depth--; if (depth === 0) return i }
  }
  return -1
}
// 괄호·문자열 밖의 쉼표로 나눈다 — create table ( … ) 의 칸·제약, alter table 의 하위 명령
function splitTop(s) {
  const out = []
  let depth = 0
  let last = 0
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (ch === "'") { i++; while (i < s.length) { if (s[i] === "'") { if (s[i + 1] === "'") { i += 2; continue } break } i++ } continue }
    if (ch === '(') depth++
    else if (ch === ')') depth--
    else if (ch === ',' && depth === 0) { out.push(s.slice(last, i).trim()); last = i + 1 }
  }
  out.push(s.slice(last).trim())
  return out.filter(Boolean)
}
// 괄호 짝을 맞춰 "using ( … )" 같은 덩어리의 속을 꺼낸다
function clauseBody(s, keyword) {
  const m = new RegExp(`\\b${keyword}\\s*\\(`, 'i').exec(s)
  if (!m) return null
  const open = m.index + m[0].length - 1
  const close = closeParen(s, open)
  return close < 0 ? null : s.slice(open + 1, close)
}
// 제약 이름 — 데이터베이스와 같은 규칙으로 짓는다(이름을 안 적었을 때).
//   check: 식에 칸 하나만 나오면 <표>_<칸>_check, 아니면 <표>_check / unique: <표>_<칸들>_key / 겹치면 뒤에 1·2…
const uniqName = (base, taken) => { if (!taken.has(base)) return base; for (let k = 1; ; k++) if (!taken.has(`${base}${k}`)) return `${base}${k}` }
const colsIn = (expr, cols) => cols.filter((c) => new RegExp(`(^|[^\\w."])${c}(?![\\w(])`, 'i').test(expr))
const checkName = (t, expr, cols, taken) => { const used = colsIn(expr, cols); return uniqName(used.length === 1 ? `${t}_${used[0]}_check` : `${t}_check`, taken) }
const tableCon = (kind, text) => /^check$/i.test(kind)
  ? { kind: 'check', def: clauseBody(text, 'check') || '' }
  : { kind: 'unique', cols: (clauseBody(text, 'unique') || '').split(',').map((x) => norm(x.trim())).filter(Boolean) }
// create table 의 괄호 속 → 칸 목록과 이름 붙은 check·unique 제약
function parseTable(tname, sText) {
  const cols = []
  const cons = new Map()
  const open = sText.indexOf('(')
  if (open < 0) return { cols, cons }
  const close = closeParen(sText, open)
  const pending = []
  for (const p of splitTop(sText.slice(open + 1, close < 0 ? undefined : close))) {
    let m
    if ((m = p.match(/^constraint ("[^"]+"|\w+) (check|unique)\b/i))) pending.push({ name: norm(m[1]), ...tableCon(m[2], p.slice(m[0].length - m[2].length)) })
    else if ((m = p.match(/^(check|unique)\b/i))) pending.push({ name: null, ...tableCon(m[1], p) })
    else if (/^(primary key|foreign key|exclude|like)\b/i.test(p)) continue
    else if ((m = p.match(/^("[^"]+"|\w+)\s/))) {
      const col = norm(m[1])
      cols.push(col)
      const re = /(?:constraint ("[^"]+"|\w+) )?\bcheck\s*\(/gi
      let cm
      while ((cm = re.exec(p))) {
        const o = cm.index + cm[0].length - 1
        const c = closeParen(p, o)
        pending.push({ name: cm[1] ? norm(cm[1]) : null, kind: 'check', def: p.slice(o + 1, c < 0 ? undefined : c) })
        if (c > 0) re.lastIndex = c
      }
      const um = p.match(/(?:constraint ("[^"]+"|\w+) )?\bunique\b/i)
      if (um) pending.push({ name: um[1] ? norm(um[1]) : null, kind: 'unique', cols: [col] })
    }
  }
  // 이름은 칸을 다 읽은 뒤에 붙인다(데이터베이스도 표 전체를 본 뒤 짓는다)
  for (const c of pending) {
    const nm = c.name || (c.kind === 'check' ? checkName(tname, c.def, cols, cons) : uniqName(`${tname}_${c.cols.join('_')}_key`, cons))
    cons.set(nm, c)
  }
  return { cols, cons }
}
// DO 블록 안에서 보안 상태를 바꾸는 문장
const DO_SECURITY = /\b(?:create|alter|drop)\s+policy\b|\b(?:enable|disable|force)\s+row\s+level\s+security\b|\bgrant\b|\brevoke\b|\bsecurity\s+(?:definer|invoker)\b|\b(?:alter|drop)\s+function\b|\b(?:enable|disable)\s+(?:replica\s+|always\s+)?trigger\b|\bdrop\s+trigger\b|\bdrop\s+constraint\b|\bsecurity_invoker\b/i

// ---------------------------------------------------------------- 1. 마이그레이션 파일
const migFiles = fs.existsSync(MIG) ? fs.readdirSync(MIG).filter((f) => f.toLowerCase().endsWith('.sql')).sort() : []
const tables = new Map()      // name → { file, line, rls: bool|null, hasRef, hasIndex, cols, cons: Map(name → { kind, def|cols }), dropped }
const policies = new Map()    // table → Map(policyName → { cmd, restrictive, roles(null = 대상 없음), using, check, file, where })
const funcs = new Map()       // name → { file, line, secdef, trigger, searchPath, body, revokedPublic, revokedAnon, revokedAuth, authGranted, reopened }
const views = new Map()       // name → { file, line, invoker, materialized, readers: Set }
const triggers = new Map()    // table → Map(triggerName → { fn, timing, where, enabled, disabledAt })
const indexes = new Map()     // index → { table, unique, cols }
const allowByFile = new Map()

// 지금 손대는 파일(아직 커밋 안 됐거나 마지막 커밋에서 바뀐 것) — G7·G8 은 이 파일들만 본다
const git = (...a) => { const r = spawnSync('git', ['-C', ROOT, '-c', 'core.quotepath=false', ...a], { encoding: 'utf8', windowsHide: true }); return r.status === 0 ? (r.stdout || '') : null }
const gitAvailable = git('rev-parse', '--is-inside-work-tree') !== null
const statusOut = git('status', '--porcelain', '--untracked-files=all', '--', 'supabase/migrations') || ''   // 폴더째 새것이어도 파일 이름으로 나오게
const modifiedTracked = new Set()
const fresh = new Set()
for (const line of statusOut.split(/\r?\n/)) {
  if (!line.trim()) continue
  const base = path.basename(line.slice(3).trim().replace(/^"|"$/g, ''))
  fresh.add(base)
  if (/M/.test(line.slice(0, 2))) modifiedTracked.add(base)
}
for (const p of (git('diff', '--name-only', 'HEAD~1', 'HEAD', '--', 'supabase/migrations') || '').split(/\r?\n/)) if (p.trim()) fresh.add(path.basename(p.trim()))

const seenNumbers = new Map()
for (const f of migFiles) {
  const where = `supabase/migrations/${f}`
  const raw = read(path.join(MIG, f))
  const allows = allowsOf(raw, '--')
  allowByFile.set(f, allows)

  const m = f.match(/^(\d{4})_[a-z0-9_]+\.sql$/)
  if (!m) add('G9', where, '파일 이름이 NNNN_무엇.sql(네 자리 번호 + 영문 소문자·밑줄)이 아닙니다')
  else if (seenNumbers.has(m[1])) add('G9', where, `번호 ${m[1]} 이(가) ${seenNumbers.get(m[1])} 와 겹칩니다 — 실행 순서가 흔들립니다`)
  else seenNumbers.set(m[1], f)
  if (modifiedTracked.has(f) && !allowed(allows, 'G8')) add('G8', where, '이미 커밋한 파일을 고치고 있습니다 — 데이터베이스에서 이미 실행한 파일이면 되돌리고 다음 번호 파일로 만드세요')

  const text = stripComments(raw)
  const masked = maskBodies(text)

  let start = 0
  for (let i = 0; i <= masked.length; i++) {
    if (i < masked.length && masked[i] !== ';') continue
    const stMasked = masked.slice(start, i)
    const stText = text.slice(start, i)
    const at = lineAt(text, start + (stMasked.length - stMasked.trimStart().length))
    start = i + 1
    const s = stMasked.replace(/\s+/g, ' ').trim()
    if (!s) continue
    const sText = dropBodies(stText).replace(/\s+/g, ' ').trim()   // 문자열은 살리고 함수 본문만 뺀 글자
    const here = `${where}:${at}`
    let mm

    // DO 블록 — 안의 문장은 증거로 세지 않는다(실행될지 글자로는 모른다). 보안 상태를 바꾸는 문장이 있으면 막는다.
    if (/^do\b/i.test(s)) {
      if (DO_SECURITY.test(stText) && !allowed(allows, 'G16')) {
        add('G16', here, 'DO 블록 안에서 정책·잠금·권한·함수 보안·트리거·제약을 바꿉니다 — 실행될지 글자로는 알 수 없어 막습니다. 블록 밖 최상위 SQL 로 쓰세요(롤백 시뮬 덩어리는 마이그레이션 파일에 넣지 않습니다)')
      }
      continue
    }
    if ((mm = s.match(/^create (?:unlogged )?table (if not exists )?([\w."]+)/i))) {
      const { schema, name } = splitName(mm[2])
      if (schema !== 'public') continue
      if (mm[1] && tables.has(name)) continue   // 이미 있는 표 — 데이터베이스에서도 아무 일도 안 일어난다(잠금·제약 그대로)
      const { cols, cons } = parseTable(name, sText)
      tables.set(name, { file: f, line: at, rls: null, hasRef: /\b\w+_id\b[^,]*\breferences\b|\bcompany_id\b|foreign key/i.test(s), hasIndex: false, cols, cons, dropped: [] })
      continue
    }
    if ((mm = s.match(/^drop table (?:if exists )?([\w.",\s]+?)(?: cascade| restrict)?$/i))) {
      for (const n of mm[1].split(',')) { const { name } = splitName(n.trim()); tables.delete(name); policies.delete(name); triggers.delete(name) }
      if (fresh.has(f) && !allowed(allows, 'G7')) add('G7', here, `표를 지웁니다(${mm[1].trim()}) — 백업을 먼저 받고, 되돌리는 방법을 파일 맨 위 주석에 적으세요`)
      continue
    }
    // alter table — 쉼표로 이은 하위 명령을 하나씩 본다
    if ((mm = sText.match(/^alter table (?:if exists )?(?:only )?([\w."]+)\s+([\s\S]*)$/i))) {
      let tname = splitName(mm[1]).name
      for (const sub of splitTop(mm[2])) {
        const t = tables.get(tname)
        let m2
        if ((m2 = sub.match(/^(enable|disable|force|no force) row level security$/i))) {
          if (t && /^enable$/i.test(m2[1])) t.rls = true
          if (t && /^disable$/i.test(m2[1])) t.rls = false   // FORCE 는 켜진 잠금을 소유자에게도 걸 뿐 — 잠금을 켜지는 않는다
          continue
        }
        if ((m2 = sub.match(/^drop constraint (?:if exists )?("[^"]+"|\w+)/i))) {
          const cn = norm(m2[1])
          if (t && t.cons.has(cn)) { t.cons.delete(cn); t.dropped.push({ name: cn, where: here }) }
          continue
        }
        if ((m2 = sub.match(/^add (?:constraint ("[^"]+"|\w+) )?(check|unique)\b/i))) {
          if (t) {
            const c = tableCon(m2[2], sub.slice(m2[0].length - m2[2].length))
            const nm = m2[1] ? norm(m2[1]) : c.kind === 'check' ? checkName(tname, c.def, t.cols, t.cons) : uniqName(`${tname}_${c.cols.join('_')}_key`, t.cons)
            t.cons.set(nm, c)
          }
          continue
        }
        if ((m2 = sub.match(/^(enable|disable)(?: replica| always)? trigger ("[^"]+"|\w+)$/i))) {
          const which = norm(m2[2])
          for (const [tn, tg] of triggers.get(tname) || new Map()) {
            if (which !== 'all' && which !== 'user' && tn !== which) continue
            tg.enabled = /^enable$/i.test(m2[1])
            tg.disabledAt = tg.enabled ? null : here
          }
          continue
        }
        if ((m2 = sub.match(/^add column (?:if not exists )?("[^"]+"|\w+)/i))) { if (t) t.cols.push(norm(m2[1])); continue }
        if ((m2 = sub.match(/^rename constraint ("[^"]+"|\w+) to ("[^"]+"|\w+)/i))) {
          if (t && t.cons.has(norm(m2[1]))) { t.cons.set(norm(m2[2]), t.cons.get(norm(m2[1]))); t.cons.delete(norm(m2[1])) }
        } else if ((m2 = sub.match(/^rename to ("[^"]+"|\w+)$/i))) {
          const nn = norm(m2[1])
          for (const map of [tables, policies, triggers]) if (map.has(tname)) { map.set(nn, map.get(tname)); map.delete(tname) }
          tname = nn
        }
        if (fresh.has(f) && !allowed(allows, 'G7')) {
          if (/^drop column /i.test(sub)) add('G7', here, '칸을 지웁니다 — 그 칸의 값은 백업 없이는 돌아오지 않습니다')
          else if (/^alter column \S+ (set data )?type /i.test(sub)) add('G7', here, '칸의 형식을 바꿉니다 — 바뀌지 않는 값이 있으면 실행이 멈추거나 값이 잘립니다. 롤백 시뮬 먼저')
          else if (/^rename /i.test(sub)) add('G7', here, '이름을 바꿉니다 — 앱·운영 보고 함수·내려받기가 옛 이름을 읽고 있지 않은지 함께 고치세요')
        }
      }
      continue
    }
    if ((mm = s.match(/^create policy ("[^"]+"|[\w]+) on ([\w."]+)/i))) {
      const { name: tbl } = splitName(mm[2])
      if (!policies.has(tbl)) policies.set(tbl, new Map())
      const head = sText.split(/ using ?\(| with check ?\(/i)[0]
      const to = head.match(/ to ([\w", ]+)$/i) || head.match(/ to ([\w", ]+?)(?: as | for |$)/i)
      policies.get(tbl).set(norm(mm[1]), {
        cmd: (head.match(/ for (all|select|insert|update|delete)\b/i) || [])[1]?.toLowerCase() || 'all',
        restrictive: /\bas restrictive\b/i.test(head),
        roles: to ? rolesOf(to[1]) : null,
        using: clauseBody(sText, 'using'),
        check: clauseBody(sText, 'with check'),
        file: f, where: here,
      })
      continue
    }
    // alter policy — 대상(to)·조건(using·with check)·이름을 바꾼다. 바꾼 뒤의 모양으로 G12·G14 를 본다
    if ((mm = sText.match(/^alter policy ("[^"]+"|\w+) on ([\w."]+)\s*([\s\S]*)$/i))) {
      const tbl = splitName(mm[2]).name
      const pname = norm(mm[1])
      if (!policies.has(tbl)) policies.set(tbl, new Map())
      const map = policies.get(tbl)
      const rest = mm[3]
      const rn = rest.match(/^rename to ("[^"]+"|\w+)/i)
      if (rn) { if (map.has(pname)) { map.set(norm(rn[1]), map.get(pname)); map.delete(pname) } continue }
      let p = map.get(pname)
      if (!p) { p = { cmd: 'all', restrictive: false, roles: [], using: null, check: null }; map.set(pname, p) }   // 마이그레이션 밖에서 만든 정책
      const to = rest.split(/\busing ?\(|\bwith check ?\(/i)[0].match(/^to ([\w", ]+?)\s*$/i)
      if (to) p.roles = rolesOf(to[1])
      const u = clauseBody(rest, 'using')
      if (u !== null) p.using = u
      const c = clauseBody(rest, 'with check')
      if (c !== null) p.check = c
      p.file = f
      p.where = here
      continue
    }
    if ((mm = s.match(/^drop policy (?:if exists )?("[^"]+"|[\w]+) on ([\w."]+)/i))) {
      policies.get(splitName(mm[2]).name)?.delete(norm(mm[1]))
      continue
    }
    if ((mm = s.match(/^create (?:or replace )?function ([\w."]+)\s*\(/i))) {
      const { name } = splitName(mm[1])
      const prev = funcs.get(name)
      const sp = sText.match(/\bset search_path\s*(?:=|to)\s*((?:'[^']*'|"[^"]*"|[\w$]+)(?:\s*,\s*(?:'[^']*'|"[^"]*"|[\w$]+))*)/i)
      const bm = stText.match(/\$([A-Za-z_]\w*)?\$([\s\S]*?)\$\1\$/)
      funcs.set(name, {
        file: f, line: at,
        secdef: /\bsecurity definer\b/i.test(s),
        trigger: /\breturns\s+trigger\b/i.test(s),
        searchPath: sp ? sp[1].split(',').map((x) => x.trim().replace(/^['"]|['"]$/g, '').toLowerCase()) : null,
        body: bm ? bm[2] : '',
        // 바꿔 써도(create or replace) 권한은 그대로 남는다
        revokedPublic: prev ? prev.revokedPublic : false,
        revokedAnon: prev ? prev.revokedAnon : false,
        revokedAuth: prev ? prev.revokedAuth : false,
        authGranted: prev ? prev.authGranted : false,
        reopened: prev ? prev.reopened : null,
      })
      continue
    }
    // alter function — security definer/invoker · search_path 를 바꾸면 함수 상태에 반영한다
    if ((mm = sText.match(/^alter function ([\w."]+)\s*(?:\([^)]*\))?\s*([\s\S]*)$/i))) {
      const { name } = splitName(mm[1])
      const rest = mm[2]
      const rn = rest.match(/^rename to ("[^"]+"|\w+)/i)
      if (rn) { if (funcs.has(name)) { funcs.set(norm(rn[1]), funcs.get(name)); funcs.delete(name) } continue }
      let fn = funcs.get(name)
      if (!fn) {   // 마이그레이션 밖에서 만든 함수 — 아는 것이 없으니 권한 회수도 안 된 것으로 본다
        fn = { file: f, line: at, secdef: false, trigger: false, searchPath: null, body: '', revokedPublic: false, revokedAnon: false, revokedAuth: false, authGranted: false, reopened: null }
        funcs.set(name, fn)
      }
      if (/\b(?:external )?security definer\b/i.test(rest)) { fn.secdef = true; fn.file = f; fn.line = at }
      if (/\b(?:external )?security invoker\b/i.test(rest)) fn.secdef = false
      const sp = rest.match(/\bset search_path\s*(?:=|to)\s*((?:'[^']*'|"[^"]*"|[\w$]+)(?:\s*,\s*(?:'[^']*'|"[^"]*"|[\w$]+))*)/i)
      if (sp) fn.searchPath = sp[1].split(',').map((x) => x.trim().replace(/^['"]|['"]$/g, '').toLowerCase())
      if (/\bset search_path from current\b/i.test(rest)) fn.searchPath = ['"$user"', 'public']
      if (/\breset (?:search_path|all)\b/i.test(rest)) fn.searchPath = null
      continue
    }
    if ((mm = s.match(/^drop function (?:if exists )?([\w."]+)/i))) { funcs.delete(splitName(mm[1]).name); continue }
    if ((mm = s.match(/^(revoke|grant) (?:all|execute)(?: privileges)? on function ([\w."]+)\s*\([^)]*\) (from|to) (.+)$/i))) {
      const fn = funcs.get(splitName(mm[2]).name)
      const roles = rolesOf(mm[4])
      const isRevoke = mm[1].toLowerCase() === 'revoke'
      if (fn) {
        if (roles.includes('public')) { fn.revokedPublic = isRevoke; if (!isRevoke) fn.reopened = here }
        if (roles.includes('anon')) { fn.revokedAnon = isRevoke; if (!isRevoke) fn.reopened = here }
        if (roles.includes('authenticated')) { fn.revokedAuth = isRevoke; fn.authGranted = !isRevoke; fn.revokedAt = isRevoke ? here : null }
      }
      if (!isRevoke && roles.some((r) => r === 'anon' || r === 'public') && !allowed(allows, 'G13', splitName(mm[2]).name)) {
        add('G13', here, `함수 ${splitName(mm[2]).name}() 의 실행 권한을 로그인 안 한 사람(${roles.join(', ')})에게 줍니다`)
      }
      continue
    }
    // 표·뷰 권한 — G13(anon·public 에게 주기)과 구체화된 뷰의 마지막 읽기 권한(G6)
    if ((mm = sText.match(/^(grant|revoke) (?:grant option for )?(.+?) on (.+?) (to|from) ([\w", ]+?)(?: with grant option| granted by [\w"]+| cascade| restrict)*$/i))) {
      const isGrant = /^grant$/i.test(mm[1])
      const target = mm[3].trim()
      const roles = rolesOf(mm[5])
      if (isGrant && roles.some((r) => r === 'anon' || r === 'public') && !allowed(allows, 'G13')) {
        add('G13', here, `"${target}" 의 권한을 로그인 안 한 사람(${roles.join(', ')})에게 줍니다 — 공개용 키만 있으면 누구나 그 권한을 씁니다`)
      }
      if (/\b(all|select)\b/i.test(mm[2])) {
        const names = /^all tables in schema public$/i.test(target) ? [...views.keys()]
          : /^(schema|sequence|all sequences|all functions|function|procedure|routine)\b/i.test(target) ? []
          : target.replace(/^table /i, '').split(',').map((n) => splitName(n.trim()).name)
        for (const n of names) {
          const v = views.get(n)
          if (!v || !v.materialized) continue
          for (const r of roles) {
            if (r === 'public') { if (isGrant) { v.readers.add('anon'); v.readers.add('authenticated') } continue }   // public 회수는 따로 준 권한을 못 거둔다
            if (isGrant) v.readers.add(r)
            else v.readers.delete(r)
          }
        }
      }
      continue
    }
    if ((mm = s.match(/^create (?:or replace )?(materialized )?view (?:if not exists )?([\w."]+)/i))) {
      const { schema, name } = splitName(mm[2])
      // Supabase 는 새 표·뷰를 anon·authenticated 가 읽을 수 있게 기본 권한을 준다 — 구체화된 뷰는 회수해야 닫힌다
      if (schema === 'public') views.set(name, { file: f, line: at, materialized: !!mm[1], invoker: /security_invoker\s*=\s*(on|true|1)\b/i.test(s), readers: new Set(mm[1] ? ['anon', 'authenticated'] : []) })
      continue
    }
    if ((mm = s.match(/^drop (?:materialized )?view (?:if exists )?([\w.",\s]+?)(?: cascade| restrict)?$/i))) {
      for (const n of mm[1].split(',')) views.delete(splitName(n.trim()).name)
      continue
    }
    if ((mm = s.match(/^alter view (?:if exists )?([\w."]+) (set|reset) \((.*)\)/i))) {
      const v = views.get(splitName(mm[1]).name)
      if (v && /security_invoker/i.test(mm[3])) {
        if (mm[2].toLowerCase() === 'reset') v.invoker = false
        else v.invoker = /security_invoker\s*=\s*(on|true|1)\b/i.test(mm[3]) ? true : /security_invoker\s*=\s*(off|false|0)\b/i.test(mm[3]) ? false : v.invoker
      }
      continue
    }
    if ((mm = s.match(/^create (unique )?index (?:concurrently )?(?:if not exists )?(?:("[^"]+"|\w+) )?on (?:only )?([\w."]+)/i))) {
      const tname = splitName(mm[3]).name
      const t = tables.get(tname)
      if (t) t.hasIndex = true
      const afterOn = sText.slice(sText.search(/ on (?:only )?[\w."]+/i))
      const o = afterOn.indexOf('(')
      const c = o < 0 ? -1 : closeParen(afterOn, o)
      const cols = o < 0 || c < 0 ? [] : splitTop(afterOn.slice(o + 1, c)).map((x) => norm(x.split(' ')[0]))
      const iname = mm[2] ? norm(mm[2]) : `${tname}_${cols.join('_')}_idx`
      if (!indexes.has(iname)) indexes.set(iname, { table: tname, unique: !!mm[1], cols })
      continue
    }
    if ((mm = s.match(/^drop index (?:concurrently )?(?:if exists )?([\w.",\s]+?)(?: cascade| restrict)?$/i))) {
      for (const n of mm[1].split(',')) indexes.delete(splitName(n.trim()).name)
      continue
    }
    if ((mm = s.match(/^create (?:or replace )?(?:constraint )?trigger ([\w"]+) (before|after|instead of) (.+?) on ([\w."]+) .*execute (?:function|procedure) ([\w."]+)/i))) {
      const tbl = splitName(mm[4]).name
      if (!triggers.has(tbl)) triggers.set(tbl, new Map())
      triggers.get(tbl).set(norm(mm[1]), { fn: splitName(mm[5]).name, timing: `${mm[2]} ${mm[3]}`.toLowerCase(), where: here, enabled: true, disabledAt: null })
      continue
    }
    if ((mm = s.match(/^drop trigger (?:if exists )?([\w"]+) on ([\w."]+)/i))) {
      triggers.get(splitName(mm[2]).name)?.delete(norm(mm[1]))
      continue
    }
    if (fresh.has(f) && !allowed(allows, 'G7')) {
      if (/^truncate /i.test(s)) add('G7', here, '표를 통째로 비웁니다 — 백업 먼저')
      else if (/^delete from /i.test(s)) add('G7', here, '데이터를 지웁니다 — 마이그레이션에서 데이터를 지우는 일은 드물어야 합니다. 백업 먼저')
    }
  }
}

// 표·정책·함수 판정 — 모든 파일을 순서대로 읽은 뒤의 "마지막 상태"로 본다
const fileAllows = (f) => allowByFile.get(f) || {}
for (const [name, t] of tables) {
  const where = `supabase/migrations/${t.file}:${t.line}`
  const allows = fileAllows(t.file)
  if (t.rls !== true && !allowed(allows, 'G1', name)) {
    add('G1', where, t.rls === false
      ? `표 ${name} 의 행 수준 보안을 껐습니다(disable) — 공개용 키를 가진 누구나 읽을 수 있게 됩니다`
      : `표 ${name} 에 행 수준 보안이 켜져 있지 않습니다 — "alter table ${name} enable row level security;" 를 최상위 SQL 로 넣으세요(FORCE 만으로는 켜지지 않습니다)`)
  }
  const left = policies.get(name)
  if (t.rls === true && (!left || left.size === 0) && !allowed(allows, 'G2', name)) {
    add('G2', where, `표 ${name} 에 남아 있는 정책이 없습니다 — 아무도 못 봅니다. 일부러면(서버 함수만 읽는 표) 허용 주석에 사유를 적으세요`)
  }
  if (t.hasRef && !t.hasIndex && !allowed(allows, 'G11', name)) add('G11', where, `표 ${name} 에 소속·연결 칸이 있는데 인덱스가 없습니다 — 건수가 늘면 목록이 느려집니다`)
}
// G12·G14 — 남아 있는 정책의 마지막 모양(만든 뒤 alter policy 로 바꾼 것 포함)
const bare = (x) => {
  let v = String(x || '').replace(/\s+/g, ' ').trim().toLowerCase()
  while (v.startsWith('(') && closeParen(v, 0) === v.length - 1) v = v.slice(1, -1).trim()
  return v
}
const WIDE = new Set(['true', '1 = 1', '1=1', 'auth.uid() is not null', "auth.role() = 'authenticated'", 'auth.jwt() is not null', 'auth.uid() is not null and true'])
for (const [tbl, map] of policies) {
  for (const [pname, p] of map) {
    const allows = fileAllows(p.file)
    if (!allowed(allows, 'G12', tbl)) {
      if (p.roles === null) add('G12', p.where, `정책 ${pname} 에 대상이 없습니다 — 비워 두면 로그인 안 한 사람까지 모두가 대상입니다. "to authenticated" 를 적으세요`)
      else if (p.roles.some((r) => r === 'anon' || r === 'public')) add('G12', p.where, `정책 ${pname} 의 대상에 로그인 안 한 사람(${p.roles.join(', ')})이 있습니다`)
    }
    if (!p.restrictive && (p.cmd === 'select' || p.cmd === 'all')) {
      const u = bare(p.using)
      if (u && WIDE.has(u) && !allowed(allows, 'G14', tbl)) {
        add('G14', p.where, `정책 ${pname} 의 읽기 조건이 "${u}" 입니다 — 로그인만 하면 그 표가 전부 보입니다. 소속·역할 조건을 쓰세요`)
      }
    }
  }
}
for (const [name, fn] of funcs) {
  if (!fn.secdef || allowed(fileAllows(fn.file), 'G3', name)) continue
  const where = `supabase/migrations/${fn.file}:${fn.line}`
  const sp = fn.searchPath
  if (!sp) add('G3', where, `권한 높은 함수 ${name}() 에 search_path 고정이 없습니다 — "set search_path = public, pg_temp" 를 넣고 표 이름 앞에 public. 을 붙이세요`)
  else if (!(sp.length === 1 && sp[0] === '') && sp[sp.length - 1] !== 'pg_temp') {
    add('G3', where, `권한 높은 함수 ${name}() 의 search_path(${sp.join(', ')})에서 pg_temp 가 맨 끝이 아닙니다 — 적지 않거나 앞에 두면 임시 표가 먼저 읽혀 함수를 속일 수 있습니다. "public, pg_temp" 순서로`)
  }
  if (!fn.trigger && (!fn.revokedPublic || !fn.revokedAnon)) {
    add('G3', fn.reopened || where, `권한 높은 함수 ${name}() 의 실행 권한이 public·anon 에게 남아 있습니다 — "revoke all on function ${name}(…) from public, anon;" 를 넣고, 앱이 부를 함수면 authenticated 에게만 주세요`)
  }
}
// G4 — 남아 있는 정책 안에서 부르는 함수의 실행 권한(함수마다 한 줄)
const usedBy = new Map()
for (const [tbl, map] of policies) {
  for (const [pname, p] of map) {
    for (const m of `${p.using || ''} ${p.check || ''}`.matchAll(/(?:\b[\w"]+\.)?\b([a-z_][\w]*)\s*\(/gi)) {
      const fname = m[1].toLowerCase()
      if (!funcs.has(fname)) continue
      if (!usedBy.has(fname)) usedBy.set(fname, new Set())
      usedBy.get(fname).add(`${tbl}.${pname}`)
    }
  }
}
for (const [fname, users] of usedBy) {
  const fn = funcs.get(fname)
  if (allowed(fileAllows(fn.file), 'G4', fname)) continue
  const list = [...users]
  const who = `이 함수를 부르는 규칙 ${list.length}개(${list.slice(0, 3).join(', ')}${list.length > 3 ? ' 외' : ''})가 걸린 표의 조회가 통째로 실패합니다`
  if (fn.revokedAuth) add('G4', fn.revokedAt || `supabase/migrations/${fn.file}:${fn.line}`, `${fname}() 의 실행 권한을 authenticated 에게서 회수했습니다 — ${who}. "grant execute on function ${fname}() to authenticated;"`)
  else if (fn.revokedPublic && !fn.authGranted) add('G4', `supabase/migrations/${fn.file}:${fn.line}`, `${fname}() 를 public 에게서 회수했는데 authenticated 에게 따로 준 줄이 없습니다 — 환경에 따라 ${who}. "grant execute on function ${fname}() to authenticated;" 를 같이 쓰세요`)
}
for (const [name, v] of views) {
  if (allowed(fileAllows(v.file), 'G6', name)) continue
  const open = [...v.readers].filter((r) => r === 'anon' || r === 'authenticated')
  if (v.materialized && open.length) add('G6', `supabase/migrations/${v.file}:${v.line}`, `구체화된 뷰 ${name} 에는 행 수준 잠금이 걸리지 않는데, 마지막 권한으로 ${open.join('·')} 가 읽을 수 있습니다 — "revoke all on ${name} from anon, authenticated;" 뒤에 다시 주지 마세요(앱에는 security_invoker 뷰나 함수로 내보냅니다)`)
  if (!v.materialized && !v.invoker) add('G6', `supabase/migrations/${v.file}:${v.line}`, `뷰 ${name} 의 security_invoker 가 마지막에 켜져 있지 않습니다 — "create view ${name} with (security_invoker = on) as …"(뒤에서 끄거나 reset 하지 않는다)`)
}
// G15 — 돈 표의 필수 제약·검사 트리거(마지막 상태). 검사 함수는 권한 높은 함수이고 본문에 핵심 네 가지가 있어야 한다.
const GUARD_PHRASES = [
  [/\bsum\s*\(/i, '합계(sum)'],
  [/[<>]/, '비교(> 또는 <)'],
  [/\braise\s+exception\b/i, '멈춤(raise exception)'],
  [/\bmoney_version\b/i, '차례 지키기(그 건의 money_version 고치기)'],
]
for (const [name, t] of tables) {
  const mt = name.match(/^money_(in|out)(_plan)?$/)
  if (!mt || allowed(fileAllows(t.file), 'G15', name)) continue
  const where = `supabase/migrations/${t.file}:${t.line}`
  const checks = [...t.cons.values()].filter((c) => c.kind === 'check').map((c) => c.def.replace(/\s+/g, ' ').toLowerCase())
  const has = (re) => checks.some((d) => re.test(d))
  const need = []
  if (!has(/\bsupply_amount\s*(?:>\s*0|>=\s*1)\b/)) need.push('check (supply_amount > 0)')
  if (!has(/\bvat_amount\s*>=\s*0\b/)) need.push('check (vat_amount >= 0)')
  if (!has(/\bsupply_amount\s*<=?\s*[\d.e+]+/) || !has(/\bvat_amount\s*<=?\s*[\d.e+]+/)) need.push('금액 상한 check (supply_amount < 1e13 and vat_amount < 1e13)')
  const isRecord = !mt[2]
  if (isRecord) {
    const uniqCon = [...t.cons.values()].some((c) => c.kind === 'unique' && c.cols.length === 1 && c.cols[0] === 'reverses_id')
    const uniqIdx = [...indexes.values()].some((x) => x.table === name && x.unique && x.cols.length === 1 && x.cols[0] === 'reverses_id')
    if (!uniqCon && !uniqIdx) need.push('reverses_id … unique(한 줄은 한 번만 취소)')
    if (!has(/reverses_id is null or\b[\s\S]*\breason is not null\b/)) need.push("취소 사유 check (reverses_id is null or (reason is not null and reason ~ '\\S'))")
  }
  const want = isRecord
    ? { re: /\bbefore\b.*\binsert\b/, label: `넣기 전 검사 트리거(before insert on ${name} — 초과 수납·취소 규칙)` }
    : { re: /\bupdate\b/, label: `고치기 검사 트리거(update on ${name} — 받은 것보다 일정 줄이기 금지)` }
  const cands = [...(triggers.get(name) || new Map()).values()].filter((x) => want.re.test(x.timing) && x.fn !== 'touch_updated_at')
  if (!cands.length) need.push(want.label)
  else {
    const live = cands.filter((x) => x.enabled)
    if (!live.length) need.push(`${want.label}가 꺼져 있습니다(${cands.map((x) => x.disabledAt).filter(Boolean).join(', ')} 의 disable trigger) — enable 로 다시 켜세요`)
    else {
      const problems = []
      const good = live.some((x) => {
        const fn = funcs.get(x.fn)
        if (!fn) { problems.push(`${x.fn}() 를 마이그레이션에서 찾지 못했습니다`); return false }
        const miss = GUARD_PHRASES.filter(([re]) => !re.test(fn.body || '')).map(([, w]) => w)
        if (!fn.secdef) miss.unshift('권한 높은 함수(security definer)')
        if (miss.length) { problems.push(`${x.fn}() 에 ${miss.join('·')} 이(가) 없습니다`); return false }
        return true
      })
      if (!good) need.push(`검사 함수가 비었거나 핵심이 빠졌습니다 — ${problems.join(' / ')}`)
    }
  }
  if (need.length) {
    const dropped = t.dropped.filter((d) => !t.cons.has(d.name)).map((d) => `${d.name}(${d.where})`)
    add('G15', where, `돈 표 ${name} 에 필수 규칙이 없습니다: ${need.join(' · ')}${dropped.length ? ` — 지운 제약: ${dropped.join(', ')}` : ''} — indeans-erp-money 의 assets/money-tables.template.sql 을 보세요`)
  }
}

// ---------------------------------------------------------------- 2. 비밀값(G5) — 문서·코드 전체
const SECRET_FILES = [
  ...walk(path.join(ROOT, 'supabase'), ['.sql']),
  ...walk(path.join(ROOT, 'src'), ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.html', '.css']),
  ...walk(path.join(ROOT, 'public'), ['.js', '.json', '.html', '.txt', '.webmanifest']),
  ...walk(path.join(ROOT, 'company'), ['.md']),
  ...walk(path.join(ROOT, '.owner'), ['.md', '.json']),
  ...walk(path.join(ROOT, 'scripts'), ['.mjs', '.js', '.cjs', '.sql']),
  ...['index.html', 'vercel.json', 'README.md'].map((f) => path.join(ROOT, f)).filter((p) => fs.existsSync(p)),
]
const jwtRole = (tok) => { try { return JSON.parse(Buffer.from(tok.split('.')[1], 'base64url').toString('utf8')).role || '' } catch { return '' } }
const SECRET_RULES = [
  { re: /https:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]{20,}/g, what: '디스코드 웹후크 주소' },
  { re: /\b\d{6,12}:[A-Za-z0-9_-]{30,}\b/g, what: '텔레그램 봇 열쇠로 보이는 값' },
  { re: /\bsb_secret_[A-Za-z0-9_-]{10,}/g, what: 'Supabase 비밀 키(sb_secret_)' },
  { re: /postgres(?:ql)?:\/\/[^\s:/@]+:[^\s@]{6,}@/g, what: '비밀번호가 든 데이터베이스 접속 문자열' },
]
for (const file of SECRET_FILES) {
  let text
  try { if (fs.statSync(file).size > 1024 * 1024) continue; text = read(file) } catch { continue }
  const allows = allowsOf(text, file.endsWith('.sql') ? '--' : file.endsWith('.md') ? '(?:<!--|--|//)' : '//')
  if (allowed(allows, 'G5')) continue
  for (const r of SECRET_RULES) for (const m of text.matchAll(r.re)) add('G5', `${rel(file)}:${lineAt(text, m.index)}`, `파일에 적힌 비밀값: ${r.what} — 지우고 값을 새로 발급하세요(.env.local 과 서비스의 비밀 저장에만 둡니다)`)
  for (const m of text.matchAll(/\beyJ[\w-]{10,}\.eyJ[\w-]{10,}\.[\w-]{10,}/g)) {
    if (jwtRole(m[0]) === 'service_role') add('G5', `${rel(file)}:${lineAt(text, m.index)}`, '비밀 키(service_role)가 적혀 있습니다 — 모든 잠금을 지나가는 열쇠입니다. 지우고 새로 발급하세요')
  }
}

// ---------------------------------------------------------------- 3. 앱 코드 — 목록 상한(G10)
for (const file of walk(path.join(ROOT, 'src'), ['.ts', '.tsx', '.js', '.jsx'])) {
  let text
  try { text = read(file) } catch { continue }
  if (allowed(allowsOf(text, '//'), 'G10')) continue
  for (const m of text.matchAll(/\.select\(/g)) {
    const before = text.slice(Math.max(0, m.index - 300), m.index)
    const head = before.slice(Math.max(before.lastIndexOf(';'), before.lastIndexOf('\n\n')) + 1)
    if (/\.(insert|update|upsert|delete)\(/.test(head)) continue           // 넣고 돌려받기 — 목록이 아니다
    const after = text.slice(m.index, m.index + 600)
    const cut = after.search(/;|\n\s*\n/)
    const chain = cut >= 0 ? after.slice(0, cut) : after
    if (/\.(limit|range|single|maybeSingle|csv)\(|head:\s*true/.test(chain)) continue
    add('G10', `${rel(file)}:${lineAt(text, m.index)}`, '목록 조회에 개수 제한(.limit / .range)이 안 보입니다 — 한 건만 읽는 조회면 .single() 을 붙이거나 허용 주석을 적으세요')
  }
}

// ---------------------------------------------------------------- 보고
const seen = new Set()
for (let i = findings.length - 1; i >= 0; i--) { const k = `${findings[i].id}|${findings[i].where}|${findings[i].msg}`; if (seen.has(k)) findings.splice(i, 1); else seen.add(k) }
const blocking = findings.filter((x) => BLOCKING.has(x.id))
const warnings = findings.filter((x) => !BLOCKING.has(x.id))
console.log(`마이그레이션 게이트(정적 휴리스틱) — supabase/migrations ${migFiles.length}개 파일 · 표 ${tables.size}개 · 정책이 남은 표 ${[...policies.values()].filter((m) => m.size).length}개`)
if (!migFiles.length) console.log('  (마이그레이션 파일이 아직 없습니다 — 비밀값·목록 상한만 봤습니다)')
if (!gitAvailable) console.log('  (git 을 쓰지 못해 G7·G8 은 건너뛰었습니다)')
const show = (list) => list.forEach((x) => console.log(`  [${x.id} ${ITEMS[x.id]}] ${x.where} — ${x.msg}`))
if (blocking.length) { console.log(`\n막힘 ${blocking.length}건 — 고치기 전에는 실행·배포하지 않습니다:`); show(blocking) }
if (warnings.length) { console.log(`\n주의 ${warnings.length}건 — 막지는 않지만 확인합니다:`); show(warnings) }
const clean = [...BLOCKING].filter((id) => !blocking.some((x) => x.id === id))
console.log(`\n막힘 없음: ${clean.length ? clean.join(' ') : '(없음)'}`)
console.log('이 검사는 글자만 봅니다 — 정책·제약을 바꾸면 롤백 시뮬로, 적용한 뒤에는 역할별 실측과 감사로 확인합니다.')
if (findings.length) console.log('오탐이면 그 파일에 사유와 함께 허용 주석을 적습니다: -- gate-allow: G2 표이름 (사유)  /  // gate-allow: G10 (사유)')
process.exitCode = blocking.length ? 1 : 0
