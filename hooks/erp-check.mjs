#!/usr/bin/env node
// 검수 훅 — 작업이 끝날 때(Stop) 무엇이 바뀌었는지 보고, 영향이 있는 변경이면 검수를 받고 끝내라고 요구한다.
// 네트워크 호출 없음. 빌드·캡처처럼 오래 걸리는 일은 여기서 하지 않는다(요구만 하고 실제 검수는 스킬이 한다).
//
// 사용(도구가 자동으로 부른다 — 작업 폴더와 무관하게 이 파일을 찾도록 등록 문장에 경로를 박아 둔다):
//   Claude Code  node "${CLAUDE_PROJECT_DIR}/.owner/hooks/erp-check.mjs" --tool claude   (공식 자리 표시 — 중괄호 꼴)
//   Codex        node "<설치할 때의 프로젝트 절대 경로>/.owner/hooks/erp-check.mjs" --tool codex   (설치기가 써넣는다)
//   상대 경로(node .owner/hooks/…)로 등록하면 AI 가 cd 한 세션에서 "Cannot find module" 로 조용히 꺼진다 — install.mjs 「훅 등록」.
//   --debug   표준입력 없이 판정만 출력해 본다(사람이 확인할 때)
//
// 판정 기준은 "영향"이다. 줄 수로 판단하지 않는다.
//   검수 필요 — 화면·데이터 구조·권한 조건·배포 설정·삭제 조건이 바뀐 변경
//   생략      — 문서·보고서·회사 문서·수업 자료·진행 기록만 바뀐 경우,
//               그리고 문구·주석·색값만 바뀐 표현 수정
//   이 훅은 "검수가 필요한가"만 가른다. 누가 볼지(감독 필수·디자인 감독·감독 생략)는
//   indeans-erp-check 스킬의 위험 등급표가 정한다 — 두 기준은 같은 영향 기준을 쓴다.
//
// 어디서부터의 변경을 보나(기준점) — 위에서부터 있는 것을 쓴다.
//   1) .owner/last-check.json 의 commit — 마지막으로 검수를 마친 자리
//   2) .owner/install-state.json 의 installed_commit — 번들을 설치한 자리(설치기가 적는다)
//   3) 첫 커밋
//   스킬들은 마지막 절차로 커밋을 하므로, 기준점 없이 작업 트리(git status)만 보면
//   끝낼 때는 언제나 깨끗해서 검수가 한 번도 돌지 않는다(2026-09-18 리허설 실측).
//
// .owner/last-check.json 규약 — `indeans-erp-check` 스킬이 검수를 마치거나 생략을 판단했을 때 적는다.
//   {
//     "commit": "<그때의 HEAD — git rev-parse HEAD>",   // 다음 판정의 기준점이 된다. 빠뜨리면 같은 변경을 또 요구한다.
//     "at": "<시각>",
//     "tool": "claude | codex",
//     "result": "승인 | 승인(조건 반영) | 생략 — 문구만",
//     "skipped_files": ["src/screens/ListScreen.tsx"]   // 표현 수정이라 검수를 생략한 파일
//   }
//   훅이 읽는 것은 commit 과 skipped_files 두 칸뿐이다(나머지는 사람이 읽는 기록).
//   skipped_files 에 든 파일은 그 commit 이후 **다시 바뀌지 않았으면** 판정에서 건너뛴다.
//   그 뒤 한 번이라도 커밋으로 바뀌면 다시 검수 대상이 된다(생략은 그때 한 번만 유효하다).
//
// 도구별 입출력 규약 — 두 도구의 공식 문서를 2026-09-18에 직접 열어 맞춘 것이다.
//   Claude Code  https://code.claude.com/docs/en/hooks
//     stdin: { session_id, prompt_id, transcript_path, cwd, scratchpad_dir, permission_mode,
//              hook_event_name: "Stop", last_assistant_message, stop_reason }
//     종료 코드 0 = 통과(표준출력에 JSON 이 있으면 해석한다) · 2 = 멈추기를 막고 stderr 내용을 모델에게 보여 준다
//              · 그 밖의 값 = 막지 않는 오류. JSON 출력은 { hookSpecificOutput: { hookEventName: "Stop",
//              continue, stopReason, systemMessage, suppressOutput, additionalContext } } 형태다.
//     → 막을 때는 종료 코드 2 + stderr 를 쓴다(가장 단순하고 판 차이에 덜 흔들린다).
//   Codex        https://developers.openai.com/codex/hooks → https://learn.chatgpt.com/docs/hooks
//     stdin: { session_id, cwd, hook_event_name, turn_id, stop_hook_active, last_assistant_message }
//     → **막는 신호는 하나로 고정한다: 표준출력의 { "decision": "block", "reason": "..." } + 종료 코드 0.**
//       종료 코드 2 로도 막을 수 있다고 적혀 있지만 둘을 함께 내면 어느 쪽이 먹었는지 알 수 없고
//       판에 따라 두 번 막힌 것처럼 보인다. stderr 에는 같은 내용을 **사람이 읽는 기록**으로만 남긴다
//       (막는 신호가 아니다 — 종료 코드가 0 이므로 stderr 는 판정에 쓰이지 않는다).
//     통과: 종료 코드 0. 할 말이 있으면 공통 출력 필드 { systemMessage } 로 알린다(UI 경고로 보인다).
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const argv = process.argv.slice(2)
const flag = (n, d = null) => { const i = argv.indexOf(n); return i >= 0 ? (argv[i + 1] ?? d) : d }
const debug = argv.includes('--debug')
const tool = (flag('--tool', 'claude') || 'claude').toLowerCase() === 'codex' ? 'codex' : 'claude'

// ---- 입력(표준입력 JSON) — 없거나 깨져도 훅이 죽지 않게 한다 ----
let input = {}
if (!debug && !process.stdin.isTTY) {
  try {
    const raw = fs.readFileSync(0, 'utf8')
    if (raw && raw.trim().startsWith('{')) input = JSON.parse(raw)
  } catch { /* 입력이 없어도 계속 진행한다 */ }
}

// 훅이 자기를 다시 부르는 상황(도구가 알려 주면)에서는 그대로 통과한다.
if (input.stop_hook_active === true) process.exit(0)

// ---- 프로젝트 폴더 찾기 ----
// 설치된 자리는 <프로젝트>/.owner/hooks/erp-check.mjs 다. 그 구조면 두 단계 위가 프로젝트다.
const fromSelf = path.basename(path.dirname(HERE)) === '.owner' ? path.resolve(HERE, '..', '..') : null
const candidates = [fromSelf, input.cwd, process.cwd()].filter(Boolean)
const root = candidates.find((d) => { try { return fs.statSync(d).isDirectory() } catch { return false } }) || process.cwd()

const ownerDir = path.join(root, '.owner')
// 설치가 안 된 폴더(또는 미리보기)에서는 아무 말 없이 통과한다.
if (!fs.existsSync(ownerDir)) process.exit(0)

const git = (...a) => {
  const r = spawnSync('git', ['-C', root, '-c', 'core.quotepath=false', ...a], {
    encoding: 'utf8', timeout: 15000, maxBuffer: 16 * 1024 * 1024, windowsHide: true,
  })
  return { ok: r.status === 0, out: (r.stdout || '').replace(/\r\n/g, '\n'), err: r.stderr || '' }
}

// git 이 없거나 저장소가 아니면 검수를 강제하지 않는다(되돌릴 지점이 없다는 안내만 남긴다).
if (!git('rev-parse', '--is-inside-work-tree').ok) {
  finish({ need: false, note: '이 폴더는 아직 git 저장소가 아니라 변경 범위를 볼 수 없습니다. 되돌릴 지점을 만들려면 git init 부터 하세요.' })
}

const headRes = git('rev-parse', 'HEAD')
const head = headRes.ok ? headRes.out.trim() : null

// ---- 검수 표식 ----
const lastPath = path.join(ownerDir, 'last-check.json')
let last = {}
try { if (fs.existsSync(lastPath)) last = JSON.parse(fs.readFileSync(lastPath, 'utf8')) } catch { last = {} }
const isCommit = (c) => !!c && git('cat-file', '-e', `${c}^{commit}`).ok

// 설치 시점 커밋 — 설치기가 .owner/install-state.json 에 적어 둔다(저장소가 아니었으면 null).
let installedCommit = null
try {
  const st = JSON.parse(fs.readFileSync(path.join(ownerDir, 'install-state.json'), 'utf8'))
  if (typeof st.installed_commit === 'string') installedCommit = st.installed_commit
} catch { /* 설치 기록이 없거나 깨졌으면 없는 것으로 본다 */ }

// 첫 커밋 — 위의 둘이 모두 없을 때의 마지막 기준점
const firstCommit = (() => {
  const r = git('rev-list', '--max-parents=0', 'HEAD')
  return r.ok ? r.out.trim().split('\n').filter(Boolean).pop() || null : null
})()

const checkedBase = isCommit(last.commit) ? last.commit : null       // 마지막으로 검수를 마친 자리
const baseValid = checkedBase
  || (isCommit(installedCommit) ? installedCommit : null)
  || (firstCommit && firstCommit !== head ? firstCommit : null)

// 생략 표식 — 검수를 생략한 파일 목록. 기준점이 "마지막 검수 자리"일 때만 쓴다.
const skippedMark = checkedBase && Array.isArray(last.skipped_files)
  ? new Set(last.skipped_files.map((p) => String(p).replace(/\\/g, '/')))
  : new Set()

// ---- 바뀐 파일 모으기 ----
const changed = new Set()
// --untracked-files=all 이 없으면 새로 만든 폴더가 "src/" 한 줄로 뭉쳐 나와 파일별 판정을 못 한다.
const status = git('status', '--porcelain', '--untracked-files=all')
if (status.ok) {
  for (const line of status.out.split('\n')) {
    if (!line.trim()) continue
    let p = line.slice(3).trim()
    if (p.includes(' -> ')) p = p.split(' -> ').pop().trim()          // 이름 바뀐 파일은 새 이름으로
    p = p.replace(/^"|"$/g, '')
    if (p) changed.add(p.replace(/\\/g, '/'))
  }
}
// 기준점 이후의 커밋에서 바뀐 파일 — 스킬이 마지막에 커밋해도 이 줄 덕분에 훅이 본다.
const committedSince = new Set()
if (baseValid && head && baseValid !== head) {
  const r = git('diff', '--name-only', `${baseValid}..HEAD`)
  if (r.ok) {
    r.out.split('\n').map((s) => s.trim()).filter(Boolean).forEach((p) => {
      const q = p.replace(/\\/g, '/')
      committedSince.add(q)
      changed.add(q)
    })
  }
}

// 생략하기로 한 파일은 그 뒤 커밋으로 다시 바뀌지 않았으면 판정에서 뺀다.
const markSkipped = []
for (const p of skippedMark) {
  if (changed.has(p) && !committedSince.has(p)) { changed.delete(p); markSkipped.push({ p, why: '전에 표현 수정으로 판단해 생략한 파일' }) }
}

// 검수 표식 자체가 HEAD 이고 작업 트리에 바뀐 것이 없으면 새 변경이 없다.
if (!changed.size) finish({ need: false, skipped: markSkipped })

// ---- 분류 ----
const SKIP_PATH = [
  /^\.owner\//, /^reports\//, /^company\//, /^course\//, /^docs\//,
  /(^|\/)README/i, /(^|\/)LICENSE/i, /(^|\/)\.gitignore$/, /(^|\/)\.gitattributes$/,
  /(^|\/)\.claude\//, /(^|\/)\.codex\//, /(^|\/)\.agents\//,
  /\.md$/i, /\.txt$/i, /\.png$/i, /\.jpe?g$/i, /\.webp$/i, /\.svg$/i, /\.pdf$/i, /\.ico$/i,
  /(^|\/)package-lock\.json$/, /(^|\/)node_modules\//, /(^|\/)dist\//, /(^|\/)build\//,
]
// 경로만으로 검수 대상이 확정되는 것들
const HARD_PATH = [
  { re: /^supabase\//, why: '데이터 구조·정책 변경' },
  { re: /\.sql$/i, why: '데이터 구조·정책 변경' },
  { re: /^vercel\.json$/, why: '배포 설정 변경' },
  { re: /(^|\/)\.env/, why: '접속 정보·비밀값 변경' },
]
// src 안에서 화면·저장·권한 쪽임이 경로로 드러나는 것들(plan §3 의 키워드)
const SRC_STRUCT = /(screens?|pages?|routes?|router|auth|store|storage|db|supabase)/i
// 권한·삭제 쪽 변경 가리기 — 낱말 단위로, 그리고 "무엇을 하는 줄인가"(문맥)까지 본다.
// 예전에는 글자 조각만 찾아서(경계 없음) `.owner`(owner)·`backdrop`(drop)·`role="table"`(role)·거래처 키 `client` 가
// 전부 "권한·삭제 어휘"로 걸렸다 — 선택창이 만든 CSS 가 매번 걸려 1회차 디자인 직후 모든 수강생이 요구를 받았다(2026-10-09 리허설).
// 그렇다고 \b 만 걸면 `isStaff`·`canDelete`·`permissions.ts` 처럼 붙여 쓴 진짜 권한 이름이 빠진다(권한 배열에 역할 한 줄을
// 더한 변경이 "문구만 바뀜"으로 통과한 실측 사례). 그래서 이름을 낱말로 쪼갠 뒤(isStaff → is staff · can_delete → can delete)
// 아래 경우만 권한·삭제 변경으로 본다.
//   ① 권한·인증 낱말 — permission(s)·policy·rls·grant·revoke·role(s)·auth·admin·anon·allowed·privilege …, 로그인·로그아웃(sign in/up/out · log in/out)
//   ② 삭제·구조 동작 — .delete( · delete from · .remove( · drop table/column/policy… · .drop( · truncate table · 이름 속 delete(canDelete·onDelete·deleted_at)
//   ③ 역할 분기 — is+역할(isOwner·isStaff·isAdmin·isManager) · can+동작(canEdit·canDelete…) · has+access/role/permission
//      · 역할 값('owner'·'staff'·'admin'·'manager')을 비교(=== 'owner')·목록(['owner','staff'])·in(…)·includes(…) 로 쓰는 줄
// 보지 않는 것: 주석 줄 · 스타일 파일(css·scss·sass·less) · HTML/JSX 속성 값(role="table"·aria-*·class/className·data-*·id)
//   · CSS 속성 선택자([role="row"]) · .owner/… 경로. 업무 이름으로 흔한 owner·staff·client 는 낱말 하나만으로는 걸지 않는다.
// 방향은 여전히 과검출 쪽이다 — 아니면 검수에서 한 줄로 넘기면 된다.
const RISK_WORDS = new Set(['permission', 'permissions', 'policy', 'policies', 'rls', 'acl', 'grant', 'grants', 'granted', 'revoke', 'revokes', 'revoked',
  'role', 'roles', 'auth', 'oauth', 'authorize', 'authorized', 'authorization', 'admin', 'admins', 'anon', 'allowed', 'allowlist', 'denylist',
  'privilege', 'privileges', 'impersonate', 'superuser', 'signin', 'signup', 'signout', 'logout', 'login',
  'delete', 'deleted', 'deletes', 'deleting', 'deletion'])
const RISK_PATH_WORDS = new Set(['permission', 'permissions', 'policy', 'policies', 'rls', 'acl', 'role', 'roles', 'auth', 'oauth', 'admin', 'anon',
  'guard', 'guards', 'privilege', 'privileges', 'signin', 'signup', 'signout', 'logout', 'delete'])
const ROLE_NAMES = new Set(['owner', 'staff', 'admin', 'manager'])
const CAN_VERBS = new Set(['delete', 'edit', 'view', 'read', 'write', 'create', 'update', 'manage', 'see', 'access', 'approve', 'cancel', 'remove', 'change', 'modify', 'assign'])
const ROLE_LIT = `['"\`](?:owner|staff|admin|manager)['"\`]`
const ROLE_CMP = new RegExp(`(?:[!=]==?|\\bin\\s*\\(|\\.includes\\s*\\()\\s*\\[?\\s*${ROLE_LIT}|${ROLE_LIT}\\s*[!=]==?`, 'i')
const ROLE_ARR = new RegExp(`\\[[^\\]]*${ROLE_LIT}[^\\]]*\\]`, 'i')
const DELETE_ACT = /\.delete\s*\(|\bdelete\s+from\b|\.remove\s*\(|\bdrop\s+(?:table|column|policy|function|trigger|view|index|schema|constraint|type|role|owned)\b|\.drop\s*\(|\btruncate\s+(?:table\s+)?[\w."]+/i
const STYLE_FILE = /\.(css|scss|sass|less)$/i
// isStaff → is staff · SIGN_IN → sign in · deleted_at → deleted at (한글은 나눔표로 본다)
const wordsOf = (s) => String(s).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
  .toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
const isCommentLine = (l) => /^\s*(\/\/|\/\*|\*|#|<!--|--)/.test(l)
const scrubLine = (l) => String(l)
  .replace(/\/\*.*?\*\//g, ' ')                                                  // 한 줄 안의 /* … */
  .replace(/(^|\s)\/\/.*$/, '$1')                                                 // 줄 끝 // 주석(주소의 // 는 앞에 빈칸이 없어 남는다)
  .replace(/\b(?:role|aria-[\w-]+|class|className|data-[\w-]+|id|htmlFor|tabIndex)\s*=\s*(?:"[^"]*"|'[^']*'|\{[^{}]*\})/g, ' ')   // HTML/JSX 속성 값
  .replace(/\[\s*(?:role|aria-[\w-]+|data-[\w-]+)\s*[~|^$*]?=\s*(?:"[^"]*"|'[^']*'|[^\]]*)\]/g, ' ')                          // CSS 속성 선택자
  .replace(/(?:\.\.?\/)?\.owner\/[\w./-]*/g, ' ')                                 // .owner/… 경로
  .replace(/https?:\/\/[^\s'"`)]+/g, ' ')                                         // 주소(…/privacy-policy 같은 글자는 권한이 아니다)
function riskyLine(raw) {
  if (isCommentLine(raw)) return false
  const l = scrubLine(raw)
  if (!l.trim()) return false
  if (DELETE_ACT.test(l) || ROLE_CMP.test(l) || ROLE_ARR.test(l)) return true
  const w = wordsOf(l)
  for (let i = 0; i < w.length; i++) {
    if (RISK_WORDS.has(w[i])) return true
    const n = w[i + 1]
    if (!n) continue
    if (w[i] === 'sign' && (n === 'in' || n === 'up' || n === 'out')) return true
    if (w[i] === 'log' && (n === 'in' || n === 'out')) return true
    if (w[i] === 'is' && ROLE_NAMES.has(n)) return true
    if (w[i] === 'can' && CAN_VERBS.has(n)) return true
    if (w[i] === 'has' && (n === 'access' || n === 'role' || n === 'permission')) return true
    if (w[i] === 'access' && n === 'token') return true
  }
  return false
}
// 바뀐 줄 중 하나라도 권한·삭제 쪽이면 참. 스타일 파일은 권한을 바꿀 수 없으니 보지 않는다.
const riskyBody = (p, text) => !STYLE_FILE.test(p) && String(text).split('\n').some(riskyLine)
// 경로 — 권한·인증·삭제 파일임이 이름에 드러나는 것만(src/lib/auth.ts · permissions.ts · useRole.ts). 거래처(client) 화면은 아니다.
const riskyPath = (p) => wordsOf(p).some((w) => RISK_PATH_WORDS.has(w))

const isSkipPath = (p) => SKIP_PATH.some((re) => re.test(p))
const diffOf = (p) => {
  const base = baseValid || (head ? 'HEAD' : null)
  const r = base ? git('diff', '-U0', base, '--', p) : { ok: false, out: '' }
  if (r.ok && r.out.trim()) return r.out
  // 아직 커밋되지 않은 새 파일은 diff 가 비어 있다 — 파일 내용을 그대로 본다.
  try {
    const abs = path.join(root, p)
    if (fs.statSync(abs).size <= 512 * 1024) return fs.readFileSync(abs, 'utf8')
  } catch { /* 지워진 파일 */ }
  return ''
}
const changedLines = (diff) => diff.split('\n')
  .filter((l) => (l.startsWith('+') || l.startsWith('-')) && !/^(\+\+\+|---)/.test(l))
  .map((l) => l.slice(1))

// 표현만 바뀐 줄인가(주석·문구·색값·공백)
const cosmeticLine = (l) => {
  const t = l.trim()
  if (!t) return true
  if (/^(\/\/|\/\*|\*|#|<!--)/.test(t)) return true                 // 주석
  if (/^['"`].*['"`],?$/.test(t)) return true                        // 문자열 한 줄
  if (/^[-\w]+\s*:\s*(#[0-9a-f]{3,8}|rgba?\(|hsla?\(|var\(--[\w-]+\))[^;]*;?$/i.test(t)) return true  // CSS 색값
  if (/^--[\w-]+\s*:/.test(t)) return true                           // CSS 변수 선언
  // 태그 사이의 글자만 바뀐 줄 — <h1>주문 관리</h1> 처럼 여는·닫는 태그가 같고 중괄호(코드)가 없을 때만.
  // 중괄호가 있으면({items.length} 등) 값이 달라지는 것이므로 표현 수정으로 보지 않는다.
  if (/^<([A-Za-z][\w.-]*)\b[^<>{}]*>[^<>{}]*<\/\1>,?$/.test(t)) return true
  // 객체 속성 문자열 한 줄 — label: '출고 완료', 처럼 이름은 그대로고 보이는 글자만 바뀐 줄.
  // 이름을 따옴표로 감싼 줄("react": "^18.0.0")은 일부러 뺀다 — package.json 의 부품 목록이 걸린다.
  if (/^[A-Za-z_$][\w$]*\s*:\s*(['"`])[^'"`{}<>]*\1,?$/.test(t)) return true
  return false
}

// 색 설정 파일은 `:root{ --primary: #1f3a5f; }` 처럼 규칙 하나가 한 줄에 들어오는 일이 많다.
// 앞의 선택자와 중괄호만 벗겨 낸 뒤 같은 기준으로 본다(중괄호를 벗겨도 선언이 두 개 이상이면 표현 수정으로 보지 않는다).
const cssUnwrap = (l) => l.replace(/^[^{}]*\{\s*/, '').replace(/\s*\}\s*$/, '').trim()
const cosmeticIn = (p, l) => cosmeticLine(/.(css|scss|less)$/i.test(p) ? cssUnwrap(l) : l)

// 앱이 아직 없나(11-17 r2 반영) — 루트에 index.html·package.json 이 없고, src/ 안에 styles/ 밖 파일이 하나도 없으면 「앱 없음」.
// 이때 src/styles/ (디자인 선택창이 만든 토큰·뼈대 CSS·글꼴)만 바뀐 것은 실제로 달라지는 화면이 없으므로 검수를 요구하지 않는다.
// 앱이 생긴 뒤의 스타일 변경은 전과 같이 판정한다.
const appExists = (() => {
  if (['index.html', 'package.json'].some((f) => fs.existsSync(path.join(root, f)))) return true
  const walkSrc = (d) => { let ents = []; try { ents = fs.readdirSync(d, { withFileTypes: true }) } catch { return false }
    return ents.some((e) => { const a = path.join(d, e.name); if (e.isDirectory()) return path.relative(root, a).split(path.sep).join('/') !== 'src/styles' && walkSrc(a); return true }) }
  return walkSrc(path.join(root, 'src'))
})()
const impactful = []
const skipped = [...markSkipped]
for (const p of [...changed].sort()) {
  if (isSkipPath(p)) { skipped.push({ p, why: '문서·자료' }); continue }
  if (!appExists && /^src\/styles\//.test(p)) { skipped.push({ p, why: '디자인 설정 파일만(앱 화면 아직 없음)' }); continue }
  const hard = HARD_PATH.find((h) => h.re.test(p))
  if (hard) { impactful.push({ p, why: hard.why }); continue }

  const diff = diffOf(p)
  const lines = changedLines(diff)
  const body = lines.length ? lines.join('\n') : diff
  // 표현만 바뀐 줄인가(주석·문구·색값·공백)를 먼저 가려 둔다.
  const cosmetic = lines.length > 0 && lines.every((l) => cosmeticIn(p, l))

  // 권한·삭제 어휘 검사는 **표현 수정 판정보다 먼저, 그리고 그 판정과 무관하게** 한다.
  // 권한 목록에 역할 이름 한 줄을 더하는 것은 겉보기에 "문자열 한 줄"이지만
  // 누가 무엇을 지울 수 있는지가 바뀐다 — 그래서 cosmetic 이어도 검수로 올린다.
  // 아래 분류의 어느 갈래도 이 검사를 건너뛸 수 없게 여기 한 번만 두었다.
  if (riskyBody(p, body)) { impactful.push({ p, why: '바뀐 줄에 권한·삭제 어휘가 있음' }); continue }
  if (riskyPath(p)) { impactful.push({ p, why: cosmetic ? '권한·삭제 관련 파일 — 문구·색만 바뀐 듯하나 확인 필요' : '권한·삭제 관련 파일 변경' }); continue }

  if (/^package\.json$/.test(p)) {
    if (/"(dependencies|devDependencies)"/.test(body) || /^\s*"[@\w./-]+"\s*:\s*"[~^>=<*\d]/m.test(body)) {
      impactful.push({ p, why: '쓰는 부품(의존성) 변경' })
    } else skipped.push({ p, why: '설정 문구만' })
    continue
  }

  // 표현 판정을 경로 매칭보다 **먼저** 본다.
  // 경로부터 보면 src/screens/ 아래 파일은 내용과 무관하게 언제나 검수 대상이 되어
  // 화면 글자 한 줄 고치는 첫 실습에서도 종료가 막힌다(2026-09-18 리허설 실측).
  // 권한·삭제 어휘 검사는 위에 그대로 있어 안전망 역할을 한다.
  if (cosmetic) { skipped.push({ p, why: '문구·색만' }); continue }

  if (/^src\//.test(p)) {
    if (SRC_STRUCT.test(p)) { impactful.push({ p, why: '화면·저장 파일 변경' }); continue }
    impactful.push({ p, why: '화면·동작 변경' })
    continue
  }

  if (/^(index\.html|src|api|server|scripts)\b/.test(p) || /\.(tsx?|jsx?|mjs|cjs)$/.test(p)) {
    impactful.push({ p, why: '동작 변경' })
    continue
  }

  skipped.push({ p, why: '영향 없음' })
}

if (!impactful.length) finish({ need: false, skipped })

// ---- 반복 방지: 같은 작업에서 두 번 요구했는데도 검수가 없으면 세 번째부터는 경고만 ----
// 도구가 작업 번호를 안 알려 주면 'unknown' 으로 묶인다 — 그러면 세 번째부터 영구히 경고만 남아
// 며칠 뒤 새 작업에서도 검수를 요구하지 않는다. 마지막 요구가 6시간 넘게 지났으면 새 작업으로 보고 센 수를 지운다.
const NAG_FRESH_MS = 6 * 60 * 60 * 1000
const sessionId = String(input.session_id || input.turn_id || 'unknown')
const nagAt = last.nag_at ? Date.parse(last.nag_at) : NaN
const nagFresh = Number.isFinite(nagAt) && (Date.now() - nagAt) < NAG_FRESH_MS
const nag = last.nag && last.nag.session === sessionId && nagFresh ? { ...last.nag } : { session: sessionId, count: 0 }
nag.count += 1
// --debug 는 사람이 확인해 보는 용도라 요구 횟수를 늘리지 않는다.
if (!debug) {
  try {
    fs.mkdirSync(ownerDir, { recursive: true })
    fs.writeFileSync(lastPath, JSON.stringify({ ...last, nag, nag_at: new Date().toISOString() }, null, 2) + '\n', 'utf8')
  } catch { /* 기록을 못 남겨도 판정은 그대로 진행한다 */ }
}

finish({ need: nag.count <= 2, impactful, skipped, nagCount: nag.count })

// ---- 출력 ----
function listLines(items, max = 8) {
  const out = items.slice(0, max).map((i) => `  - ${i.p} — ${i.why}`)
  if (items.length > max) out.push(`  - (그 외 ${items.length - max}개)`)
  return out.join('\n')
}

function finish({ need, impactful = [], skipped = [], note = '', nagCount = 0 }) {
  if (debug) {
    console.log(`판정: ${need ? '검수 필요' : '통과'}${nagCount ? ` (요구 ${nagCount}번째)` : ''}`)
    if (note) console.log(note)
    if (impactful.length) console.log('영향 있는 변경:\n' + listLines(impactful, 50))
    if (skipped.length) console.log('생략:\n' + listLines(skipped, 50))
    process.exit(0)
  }

  if (need) {
    const msg = [
      '검수가 필요한 변경이 있습니다. 끝내기 전에 검수를 마치세요.',
      '',
      `영향 있는 변경 ${impactful.length}건:`,
      listLines(impactful),
      '',
      '`indeans-erp-check` 스킬을 읽고 위험 등급표에 따라 감독 판정(등급이 요구할 때) → 검증 실측 → 작업 보고서까지 마친 뒤 종료하세요.',
      '검수를 마치면 .owner/last-check.json 을 갱신해 같은 변경에 다시 요구하지 않게 합니다.',
      '표현만 고친 것이어서 검수가 필요 없다고 판단되면, 대표에게는 아무 말도 하지 마세요(검수·확인 알림·건너뜀 이야기를 꺼내지 않습니다 — 대표가 시킨 일이 아닙니다). 같은 파일을 갱신한 뒤 바로 커밋해 작업 폴더에 남기지 말고(기록 파일은 검수 대상이 아닙니다), 원래 하던 작업의 다음 말·끝맺음을 그대로 이어 가세요.',
      '이때 commit 에 지금 HEAD 를, skipped_files 에 생략한 파일 목록을 적습니다 — 비워 두면 다음에 같은 파일을 또 요구합니다.',
    ].join('\n')
    if (tool === 'codex') {
      // 막는 신호는 이 JSON 하나다(종료 코드는 0). stderr 는 사람이 나중에 읽는 기록일 뿐이다.
      process.stdout.write(JSON.stringify({ decision: 'block', reason: msg }) + '\n')
      process.stderr.write(msg + '\n')
      process.exit(0)
    }
    process.stderr.write(msg + '\n')
    process.exit(2)   // Claude: 멈추기를 막고 이 내용을 그대로 모델에게 보여 준다
  }

  // 통과 — 할 말이 없으면 조용히 끝낸다
  const notes = []
  if (nagCount > 2) {
    notes.push(`검수 요구를 이미 ${nagCount - 1}번 했지만 진행을 막지 않습니다. 영향 있는 변경 ${impactful.length}건이 검수 없이 남아 있습니다: ${impactful.slice(0, 5).map((i) => i.p).join(', ')}`)
    notes.push('다음 작업 전에 `indeans-erp-check` 로 한 번 정리하세요.')
  }
  if (note) notes.push(note)

  if (!notes.length) process.exit(0)
  const text = notes.join(' ')
  if (tool === 'codex') {
    process.stdout.write(JSON.stringify({ systemMessage: text }) + '\n')
  } else {
    process.stdout.write(text + '\n')
  }
  process.exit(0)
}
