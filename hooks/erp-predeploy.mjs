#!/usr/bin/env node
// 배포 직전 확인 훅 — 배포 명령이 실행되기 바로 전(PreToolUse)에 커밋·빌드·고정 검사를 확인하고, 걸리면 배포를 멈춘다.
// 훅 자체는 네트워크를 쓰지 않는다(빌드·검사는 프로젝트의 npm 스크립트가 돈다 — 아래 "한계").
//
// 사용(도구가 자동으로 부른다 — 작업 폴더와 무관하게 이 파일을 찾도록 등록 문장에 경로를 박아 둔다):
//   Claude Code  node "${CLAUDE_PROJECT_DIR}/.owner/hooks/erp-predeploy.mjs" --tool claude   (공식 자리 표시 — 중괄호 꼴)
//   Codex        node "<설치할 때의 프로젝트 절대 경로>/.owner/hooks/erp-predeploy.mjs" --tool codex   (설치기가 써넣는다)
//   상대 경로(node .owner/hooks/…)로 등록하면 AI 가 cd 한 세션에서 "Cannot find module" 로 조용히 꺼진다 — install.mjs 「훅 등록」.
//   --debug "<명령>" [--shell bash|powershell|cmd]
//                      표준입력 없이 그 명령을 배포로 보는지와 확인 결과를 출력만 한다(막지 않는다). 셸 기본은 bash —
//                      PowerShell 도구의 명령이면 --shell powershell 로 읽는 규칙을 바꾼다.
//                      예: node .owner/hooks/erp-predeploy.mjs --debug "npx vercel --prod"
//
// 무엇을 배포 명령으로 보나
//   1) vercel 배포 — `vercel`, `vercel --prod`, `vercel deploy`, `npx vercel --prod`, `vercel ./폴더` 처럼 폴더를 올리는 명령.
//      `npx.cmd` 처럼 확장자가 붙은 실행기, env · sudo · npx · npm exec 같은 앞붙이(옵션 포함), `cmd /c "…"`(`cmd //c`·`/d /s /c` 포함)·
//      `bash -c '…'`(다음 한 인자만 코드)·`powershell -Command "…"` 로 감싼 명령, `a & b`·`a && b`·`a; b` 로 이은 명령,
//      package.json 스크립트(`npm run deploy` → `npm run release` → `vercel`, `npm run --if-present deploy`, `npm start`,
//      세 단계까지 · 순환은 따라가지 않음 · npm 의 pre/post 스크립트 포함 — --ignore-scripts 면 빼고)도 따라가 찾는다.
//      `vercel env pull`·`vercel login`·`vercel logs`·`vercel rollback` 처럼 올리지 않는 하위 명령과 `--help`·`--version` 이 붙은 명령은 건너뛴다.
//      **되돌리기(rollback)는 막지 않는다** — 복구 길을 훅이 막으면 안 된다.
//   2) git push — 이 프로젝트가 이미 배포돼 있을 때만(.owner/progress.json 의 app.deploy_url 이 있거나
//      .vercel/ 폴더가 있을 때). GitHub 와 Vercel 을 이어 두면 푸시가 곧 배포다.
//   따옴표 안 글자·주석·heredoc(here-string) 본문은 명령으로 보지 않는다(2026-10-11 리허설 D 오탐 — 계정 기록 표의 `| Vercel |` 를 배포로 읽었다).
//   명령은 셸 규칙대로 읽는다 — tool_name 이 PowerShell 이면 PowerShell, 그 밖은 Bash(아래 「명령 읽기」, 명령 보호 훅과 같은 글자).
//
// 무엇을 확인하나 — 위에서부터, 걸리면 그 자리에서 막는다
//   ① 커밋 — vercel 배포일 때만. 앱에 들어가는 파일에 커밋하지 않은 변경이 있으면 막는다(이름 바꾼 파일은
//      옛 경로와 새 경로를 둘 다 본다). 문서(company/·reports/·course/·docs/·.owner/·*.md)와
//      도구 폴더(.claude/·.codex/·.agents/)만 바뀐 것은 막지 않는다. git push 일 때는 알리기만 한다.
//   ② 빌드 — package.json 에 build 가 있으면 `npm run build`. 실패하면 막는다(오류 끝부분을 보여 준다).
//   ③ 고정 검사 — package.json 에 check 가 있으면 `npm run check`. 실패하면 막는다.
//   npm 이 없거나 시간이 넘으면 막지 않고 알린다 — 훅 고장이 배포를 영원히 막지 않게.
//
// 한계 — **이 훅은 수강생 자신의 실수를 막는 안전장치이지 보안 경계가 아니다.** 일부러 우회하면 막지 못한다.
//   - 이 프로젝트 폴더만 본다. `vercel --cwd ../다른폴더` 처럼 다른 폴더를 올리는 명령은 그 폴더를 확인하지 않고 알리기만 한다.
//   - 셸 문법을 끝까지 해석하지 않는다. 변수·함수·명령 치환($(…)·백틱)·세 단계 넘게 감싼 명령 속의 배포는 놓칠 수 있다.
//     명령이 너무 길면(글자 200,000 · 단계 2,000 초과) 읽은 데까지만 본다.
//   - 한 줄에 커밋과 배포를 이어 쓰면(`git commit … && vercel --prod`) 커밋 전의 지금 상태로 판정한다 — 커밋을 먼저 따로 실행한다.
//   - git push 때 빌드하는 것은 지금 폴더다. 커밋하지 않은 변경이 있으면 푸시되는 커밋과 다를 수 있다(그때는 알린다).
//   - 빌드·검사는 프로젝트의 npm 스크립트가 돈다. 그 스크립트(prebuild 등)가 네트워크를 쓰면 막지 못한다.
//
// 도구별 입출력 — 두 공식 문서를 2026-10-08 에 다시 열어 맞췄다(바뀌면 CONVENTIONS.md 와 함께 고친다).
//   Claude Code  https://code.claude.com/docs/en/hooks
//     stdin: { tool_name: "Bash" | "PowerShell", tool_input: { command }, cwd, hook_event_name: "PreToolUse", ... }
//     막기: 종료 코드 2 + stderr(그 내용이 모델에게 간다). 통과: 0. 알릴 말은 표준출력 { "systemMessage": "…" }.
//   Codex        https://developers.openai.com/codex/hooks → https://learn.chatgpt.com/docs/hooks
//     stdin: { tool_name: "Bash", tool_input: { command }, cwd, hook_event_name, turn_id, ... } — command 가 목록으로 올 수도 있다.
//     막기: 표준출력 { "decision": "block", "reason": "…" } + 종료 코드 0 — 막는 신호는 이것 하나다(CONVENTIONS 규약).
//       문서는 이 모양을 "older block shape(아직 받는다)"로, hookSpecificOutput.permissionDecision "deny" 를
//       지금의 모양으로 적는다. 옛 모양을 받지 않게 바뀌면 이 파일과 CONVENTIONS.md 를 함께 고친다.
//       stderr 에는 같은 내용을 사람이 읽는 기록으로만 남긴다(막는 신호가 아니다).
//     통과: 종료 코드 0. 알릴 말은 { "systemMessage": "…" }.
//   command 가 문자열도 문자열 목록도 아니면 조용히 통과한다.
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const argv = process.argv.slice(2)
const flag = (n, d = null) => { const i = argv.indexOf(n); return i >= 0 ? (argv[i + 1] ?? d) : d }
const debugCmd = argv.includes('--debug') ? (flag('--debug') ?? '') : null
const debug = debugCmd !== null
const tool = (flag('--tool', 'claude') || 'claude').toLowerCase() === 'codex' ? 'codex' : 'claude'
const debugShell = ['bash', 'powershell', 'cmd'].includes(String(flag('--shell', 'bash')).toLowerCase()) ? String(flag('--shell', 'bash')).toLowerCase() : 'bash'
const BOM = String.fromCharCode(0xFEFF)

const BUILD_TIMEOUT_MS = 300 * 1000
const CHECK_TIMEOUT_MS = 180 * 1000

// ==== 명령 읽기 — 시작(erp-guard.mjs · erp-predeploy.mjs 에 같은 글자로 들어 있다. 한쪽을 고치면 다른 쪽도 같이 고친다) ====
// 셸마다 인용·이스케이프·주석 규칙이 다르다. tool_name 이 "PowerShell" 이면 PowerShell 규칙, 그 밖은 Bash 규칙으로 읽고,
// `cmd /c "…"` 의 안쪽은 cmd 규칙으로 읽는다.
//   Bash        '…' 그대로 · "…" 안의 \" \\ \$ \` · 밖의 \ 한 글자 · # 주석 · heredoc(<<EOF · <<'END TEXT' · <<-123) 본문 지움 ·
//               ( ) 는 문장 경계 · $(( … )) 는 계산식(글자) · { } if then do 같은 앞머리 낱말은 명령 이름이 아니다
//   PowerShell  '…'(안의 '' 는 ') · "…"(안의 `" 와 "") · 밖의 ` 한 글자(줄 끝이면 줄 이음) · # 와 <# … #> 주석 ·
//               here-string(@' … '@) 본문 지움 · ( ) { } $( ) 는 통째로 한 낱말 — 안은 따로 다시 읽는다 ·
//               & 로 부르지 않은 따옴표 문자열로 시작하는 줄은 문자열 표현식(실행이 아니다)
//   cmd         "…"(이스케이프 없음) · ^ 한 글자 · & && || | ( )
// 공통: 따옴표 밖에서만 &&·||·;·&·줄바꿈으로 문장을, | 로 파이프라인 단계를 나눈다. 파이프 바로 뒤의 줄바꿈은 다음 줄로 이어진다.
//   2>&1 · >&2 · &> 같은 돌리기(리디렉션)의 & 는 자르지 않고, 돌리기 낱말(2>/dev/null · > 파일)은 명령 인자에서 뺀다.
// 상한: 명령 글자 수 200,000 · 단계 수 2,000. 넘으면 읽기를 멈추고 overLimit 를 알린다.
const LEX_LIMITS = { chars: 200000, stages: 2000 }
const SH_LEAD = new Set(['{', '}', '(', ')', '!', 'if', 'then', 'elif', 'else', 'do', 'while', 'until', 'fi', 'done', 'esac'])
const REDIR = /^(\d*|\*|&)?(<<<|<<|>>|>&|<&|&>>|&>|>\||<>|[<>])/

function lexCommand(code, shell, budget) {
  const s = String(code)
  const n = s.length
  const PS = shell === 'powershell'
  const CMD = shell === 'cmd'
  const SH = !PS && !CMD
  const statements = []
  let stmt = []
  let words = []
  let word = null
  let call = false
  let afterPipe = false
  let pending = []
  let overLimit = false
  const startWord = (quoted) => { if (!word) word = { v: '', q: !!quoted, raw: '' }; afterPipe = false }
  const endWord = () => { if (word) { words.push(word); word = null } }
  const endStage = () => {
    endWord()
    if (words.length) { stmt.push({ words, call, raw: words.map((w) => w.raw).join(' ') }); budget.stages++ }
    words = []; call = false
  }
  const endStmt = () => { endStage(); if (stmt.length) statements.push(stmt); stmt = [] }
  // PowerShell 의 ( ) { } $( ) @( ) 를 짝이 맞는 곳까지 읽는다(안의 따옴표는 건너뛴다)
  const balancedEnd = (j) => {
    let depth = 0
    while (j < n) {
      const ch = s[j]
      if (ch === "'") { j++; while (j < n) { if (s[j] === "'") { if (s[j + 1] === "'") { j += 2; continue } break } j++ } j++; continue }
      if (ch === '"') { j++; while (j < n && s[j] !== '"') { if (s[j] === '`') j++; j++ } j++; continue }
      if (ch === '`') { j += 2; continue }
      if (ch === '(' || ch === '{') depth++
      else if (ch === ')' || ch === '}') { depth--; if (depth <= 0) return j + 1 }
      j++
    }
    return n
  }
  // heredoc 종결자 낱말 — 공백·연산자 전까지, 인용은 벗긴다(<<'END TEXT' → END TEXT)
  const heredocWord = (j) => {
    let v = ''
    while (j < n && !/[\s;&|<>()]/.test(s[j])) {
      const ch = s[j]
      if (ch === "'") { const e = s.indexOf("'", j + 1); const end = e < 0 ? n : e; v += s.slice(j + 1, end); j = end + 1; continue }
      if (ch === '"') { j++; while (j < n && s[j] !== '"') { if (s[j] === '\\' && j + 1 < n) j++; v += s[j]; j++ } j++; continue }
      if (ch === '\\' && j + 1 < n) { v += s[j + 1]; j += 2; continue }
      v += ch; j++
    }
    return { v, end: Math.min(j, n) }
  }
  const skipHeredocs = (j) => {
    for (const h of pending) {
      while (j < n) {
        let e = s.indexOf('\n', j); if (e < 0) e = n
        let line = s.slice(j, e).replace(/\r$/, '')
        if (h.dash) line = line.replace(/^\t+/, '')
        j = Math.min(n, e + 1)
        if (line === h.word) break
      }
    }
    pending = []
    return j
  }

  let i = 0
  while (i < n) {
    if (budget.stages > LEX_LIMITS.stages) { overLimit = true; break }
    const c = s[i]
    if (c === '\n' || (c === '\r' && s[i + 1] === '\n')) {
      i += c === '\r' ? 2 : 1
      if (pending.length) { endStmt(); i = skipHeredocs(i); afterPipe = false; continue }
      if (afterPipe && !word && !words.length) continue                       // 파이프 바로 뒤 줄바꿈 — 다음 줄로 이어진다
      endStmt(); continue
    }
    if (c === ' ' || c === '\t' || c === '\r') { endWord(); i++; continue }
    // 주석
    if (!word && c === '#' && !CMD) { const e = s.indexOf('\n', i); i = e < 0 ? n : e; continue }
    if (PS && !word && c === '<' && s[i + 1] === '#') { const e = s.indexOf('#>', i + 2); i = e < 0 ? n : e + 2; continue }
    // 따옴표
    if (c === "'" && !CMD) {
      startWord(true)
      let j = i + 1; let v = ''
      while (j < n) {
        if (s[j] === "'") { if (PS && s[j + 1] === "'") { v += "'"; j += 2; continue } break }
        v += s[j]; j++
      }
      word.v += v; word.raw += s.slice(i, Math.min(n, j + 1)); i = Math.min(n, j + 1); continue
    }
    if (c === '"') {
      startWord(true)
      let j = i + 1; let v = ''
      while (j < n) {
        const ch = s[j]
        if (ch === '"') { if (PS && s[j + 1] === '"') { v += '"'; j += 2; continue } break }
        if (SH && ch === '\\' && j + 1 < n && '"\\$`\n'.includes(s[j + 1])) { if (s[j + 1] !== '\n') v += s[j + 1]; j += 2; continue }
        if (PS && ch === '`' && j + 1 < n) { v += s[j + 1]; j += 2; continue }
        v += ch; j++
      }
      word.v += v; word.raw += s.slice(i, Math.min(n, j + 1)); i = Math.min(n, j + 1); continue
    }
    // 따옴표 밖의 이스케이프 — Bash \ · PowerShell ` · cmd ^ (줄 끝이면 줄 이음)
    const esc = SH ? '\\' : PS ? '`' : '^'
    if (c === esc && i + 1 < n) {
      if (s[i + 1] === '\n') { i += 2; continue }
      if (s[i + 1] === '\r' && s[i + 2] === '\n') { i += 3; continue }
      startWord(false); word.v += s[i + 1]; word.raw += s.slice(i, i + 2); i += 2; continue
    }
    // PowerShell here-string — 줄 끝의 @' 또는 @" 부터 줄머리의 '@ 또는 "@ 까지(글자다)
    if (PS && c === '@' && (s[i + 1] === "'" || s[i + 1] === '"')) {
      const q = s[i + 1]
      const m = /^[ \t]*\r?\n/.exec(s.slice(i + 2, i + 2 + 64))
      if (m) {
        let k = i + 2 + m[0].length; let close = -1
        while (k <= n) {
          if (s.startsWith(q + '@', k)) { close = k; break }
          const e = s.indexOf('\n', k); if (e < 0) break
          k = e + 1
        }
        const end = close < 0 ? n : close + 2
        startWord(true); word.raw += '@' + q + '…' + q + '@'; i = end; continue
      }
    }
    // PowerShell ( ) { } $( ) @( ) @{ } — 통째로 한 낱말
    if (PS && (c === '(' || c === '{' || ((c === '$' || c === '@') && (s[i + 1] === '(' || s[i + 1] === '{')))) {
      const end = balancedEnd(c === '$' || c === '@' ? i + 1 : i)
      startWord(false); word.v += s.slice(i, end); word.raw += s.slice(i, end); i = end; continue
    }
    if (SH) {
      // $(( 계산식 )) · (( 계산식 )) 은 글자로 둔다(그 안의 << 를 heredoc 으로 읽지 않는다)
      if ((c === '$' && s[i + 1] === '(' && s[i + 2] === '(') || (c === '(' && s[i + 1] === '(' && !word)) {
        const e = s.indexOf('))', i); const end = e < 0 ? n : e + 2
        startWord(false); word.v += s.slice(i, end); word.raw += s.slice(i, end); i = end; continue
      }
      if (c === '<' && s[i + 1] === '<' && s[i + 2] !== '<' && s[i - 1] !== '<') {
        let j = i + 2; const dash = s[j] === '-'; if (dash) j++
        while (s[j] === ' ' || s[j] === '\t') j++
        const hw = heredocWord(j)
        if (hw.v) { endWord(); pending.push({ word: hw.v, dash }); i = hw.end; continue }
      }
    }
    if ((SH || CMD) && (c === '(' || c === ')')) { endStmt(); i++; continue }
    if (c === '&' && s[i + 1] === '&') { endStmt(); i += 2; continue }
    if (c === '|' && s[i + 1] === '|') { endStmt(); i += 2; continue }
    if (c === ';') { endStmt(); i++; continue }
    if (c === '|') { endStage(); afterPipe = true; i += s[i + 1] === '&' ? 2 : 1; continue }
    if (c === '&') {
      if (s[i - 1] === '>' || s[i - 1] === '<' || s[i + 1] === '>') { startWord(false); word.v += c; word.raw += c; i++; continue }
      if (PS && !word && !words.length) { call = true; i++; continue }          // PowerShell 호출 연산자 & "…"
      endStmt(); i++; continue
    }
    startWord(false); word.v += c; word.raw += c; i++
  }
  endStmt()
  if (budget.stages > LEX_LIMITS.stages) overLimit = true
  return { statements, overLimit }
}

// 단계의 낱말에서 돌리기와 앞머리 낱말을 뺀다. PowerShell 의 문자열 표현식이면 null.
function cleanWords(stage, shell) {
  const w = stage.words
  const out = []
  for (let k = 0; k < w.length; k++) {
    const t = w[k]
    if (!t.q) { const m = REDIR.exec(t.raw); if (m) { if (m[0] === t.raw) k++; continue } }
    out.push(t)
  }
  if (shell !== 'powershell') while (out.length && !out[0].q && SH_LEAD.has(out[0].v)) out.shift()
  if (!out.length) return []
  if (shell === 'powershell' && out[0].q && !stage.call) return null
  return out.map((t) => t.v)
}

// 실행기·명령 이름 — 경로와 확장자(.cmd·.exe·.ps1·.bat)와 @버전을 떼고 비교한다(npx.cmd · C:\…\vercel.cmd · vercel@latest)
const binName = (tok) => path.basename(String(tok).replace(/\\/g, '/')).toLowerCase().replace(/\.(cmd|exe|ps1|bat|com)$/, '').replace(/@.*$/, '')

// 옵션을 읽어 넘긴다. valueFlags 는 값을 하나 더 받는 옵션, codeFlags 는 다음 값이 명령 글자인 옵션.
function consumeOpts(t, valueFlags, codeFlags = []) {
  while (t.length) {
    const f = t[0]
    if (f === '--') { t.shift(); break }
    if (!f.startsWith('-') || f === '-') break
    if (codeFlags.includes(f)) return { code: t[1] ?? '' }
    t.shift()
    if (!f.includes('=') && valueFlags.includes(f)) t.shift()
  }
  return null
}

// 앞에 붙는 것을 벗긴다: 환경 변수 지정(FOO=bar), env·sudo·nohup·time·command·exec·nice·timeout·call,
// npx·bunx·pnpx·npm exec·pnpm dlx 같은 실행기(옵션과 그 값까지). 결과 { words } 또는 { code }(명령 글자를 받는 옵션).
function stripRunners(words) {
  const t = [...words]
  for (let guard = 0; guard < 16 && t.length; guard++) {
    const a = binName(t[0])
    if (/^[A-Za-z_]\w*=/.test(t[0]) || t[0] === '&') { t.shift(); continue }
    if (/^\$[\w:]+$/.test(t[0]) && /^[-+*/]?=$/.test(t[1] || '')) { t.splice(0, 2); continue }   // PowerShell $x = <명령>
    if (a === 'env') {
      t.shift()
      while (t.length && /^[A-Za-z_]\w*=/.test(t[0])) t.shift()
      const r = consumeOpts(t, ['-u', '--unset', '-C', '--chdir'], ['-S', '--split-string'])
      if (r) return r
      while (t.length && /^[A-Za-z_]\w*=/.test(t[0])) t.shift()
      continue
    }
    if (a === 'sudo' || a === 'doas') {
      t.shift()
      consumeOpts(t, ['-u', '-g', '-h', '-p', '-C', '-D', '-r', '-t', '-U', '-T', '-R', '--user', '--group', '--host', '--prompt',
        '--close-from', '--chdir', '--role', '--type', '--other-user', '--command-timeout'])
      continue
    }
    if (a === 'nohup' || a === 'builtin' || a === 'call') { t.shift(); continue }
    if (a === 'time') { t.shift(); consumeOpts(t, ['-f', '--format', '-o', '--output']); continue }
    if (a === 'command') { t.shift(); if (t[0] === '-v' || t[0] === '-V') return { words: [] }; consumeOpts(t, []); continue }
    if (a === 'exec') { t.shift(); consumeOpts(t, ['-a']); continue }
    if (a === 'nice') { t.shift(); consumeOpts(t, ['-n', '--adjustment']); continue }
    if (a === 'timeout') { t.shift(); consumeOpts(t, ['-s', '--signal', '-k', '--kill-after']); t.shift(); continue }
    if (a === 'npx' || a === 'bunx' || a === 'pnpx') {
      t.shift()
      const r = consumeOpts(t, ['-p', '--package'], ['-c', '--call'])
      if (r) return r
      continue
    }
    if ((a === 'pnpm' || a === 'yarn') && ['dlx', 'exec'].includes((t[1] || '').toLowerCase())) {
      t.splice(0, 2)
      const r = consumeOpts(t, ['-p', '--package', '--filter', '-F', '-C', '--dir'], [])
      if (r) return r
      continue
    }
    if (a === 'npm' && ['exec', 'x'].includes((t[1] || '').toLowerCase())) {
      t.splice(0, 2)
      const r = consumeOpts(t, ['-p', '--package', '-w', '--workspace'], ['-c', '--call'])
      if (r) return r
      continue
    }
    break
  }
  return { words: t }
}

// 셸로 감싼 명령의 안쪽을 꺼낸다 — { code, shell } 또는 null.
//   cmd [/d /s /q …] /c "…"(Git Bash 의 //c 포함) · bash|sh|zsh|dash|ksh [옵션] -c '<코드>' [$0 위치 인자…](다음 한 인자만 코드) ·
//   powershell|pwsh [옵션] -Command …(나머지 전부) · -EncodedCommand <base64>
function unwrapShell(t) {
  const b = binName(t[0] || '')
  if (b === 'cmd') {
    for (let i = 1; i < t.length; i++) {
      if (/^\/\/?[ck]$/i.test(t[i])) return { code: t.slice(i + 1).join(' '), shell: 'cmd' }
      if (!/^\/\/?[a-z]/i.test(t[i])) break
    }
    return null
  }
  if (['bash', 'sh', 'zsh', 'dash', 'ksh'].includes(b)) {
    for (let i = 1; i < t.length; i++) {
      const f = t[i]
      if (/^-[a-zA-Z]*c[a-zA-Z]*$/.test(f)) return { code: t[i + 1] ?? '', shell: 'bash' }
      if (f === '--rcfile' || f === '--init-file' || f === '-o' || f === '+o' || f === '-O' || f === '+O') { i++; continue }
      if (f.startsWith('-') || f.startsWith('+')) continue
      return null                                                                   // 스크립트 파일 — 안을 보지 않는다
    }
    return null
  }
  if (b === 'powershell' || b === 'pwsh') {
    for (let i = 1; i < t.length; i++) {
      const f = t[i]
      if (/^[-/](c|co|com|comm|comma|comman|command)$/i.test(f)) return { code: t.slice(i + 1).join(' '), shell: 'powershell' }
      if (/^[-/](e|ec|en|enc|enco|encod|encode|encoded|encodedc|encodedco|encodedcom|encodedcomm|encodedcomma|encodedcomman|encodedcommand)$/i.test(f)) {
        try { return { code: Buffer.from(String(t[i + 1] || ''), 'base64').toString('utf16le'), shell: 'powershell' } } catch { return null }
      }
      if (/^[-/](f|fi|fil|file)$/i.test(f)) return null
      if (/^[-/](ex|ep|executionpolicy|w|windowstyle|v|version|configurationname|config|wd|workingdirectory|of|outputformat|if|inputformat|psconsolefile|settingsfile)$/i.test(f)) { i++; continue }
      if (/^[-/]/.test(f)) continue
      return b === 'powershell' ? { code: t.slice(i).join(' '), shell: 'powershell' } : null   // powershell.exe 의 기본은 -Command, pwsh 는 -File
    }
    return null
  }
  return null
}

// package.json 스크립트 이름 — npm run [옵션] <이름> · npm start|stop|restart|test · pnpm|yarn|bun [run] <이름>.
// npm 은 pre/post 스크립트도 돈다(--ignore-scripts 면 이름 붙은 스크립트만).
const NPM_VALUE = new Set(['--prefix', '-C', '--workspace', '-w', '--userconfig', '--cache', '--registry', '--loglevel', '--script-shell'])
const PM_BUILTIN = new Set(['install', 'i', 'add', 'remove', 'rm', 'uninstall', 'update', 'up', 'upgrade', 'exec', 'dlx', 'create', 'init',
  'publish', 'list', 'ls', 'why', 'outdated', 'audit', 'link', 'unlink', 'store', 'config', 'help', 'import', 'rebuild', 'prune', 'patch',
  'info', 'view', 'x', 'pack', 'login', 'logout', 'cache', 'global', 'bin', 'dedupe', 'set', 'version'])
function scriptNames(t) {
  const b = binName(t[0] || '')
  if (!['npm', 'pnpm', 'yarn', 'bun'].includes(b)) return []
  let i = 1
  const skipOpts = () => { while (i < t.length && t[i].startsWith('-')) { const f = t[i]; i++; if (!f.includes('=') && NPM_VALUE.has(f)) i++ } }
  skipOpts()
  const sub = (t[i] || '').toLowerCase(); i++
  const ignore = t.some((a) => /^--ignore-scripts(=true)?$/i.test(a))
  if (b === 'npm') {
    let names = []
    if (['run', 'run-script', 'rum', 'urn'].includes(sub)) { skipOpts(); if (t[i]) names = [t[i]] }
    else if (sub === 'restart') names = ['restart', 'stop', 'start']
    else if (['start', 'stop'].includes(sub)) names = [sub]
    else if (['test', 't', 'tst'].includes(sub)) names = ['test']
    return ignore ? names : names.flatMap((nm) => [`pre${nm}`, nm, `post${nm}`])
  }
  if (sub === 'run' || sub === 'run-script') { skipOpts(); return t[i] ? [t[i]] : [] }
  if (sub && !sub.startsWith('-') && !PM_BUILTIN.has(sub)) return [t[i - 1]]
  return []
}

// 도구가 넘긴 명령을 읽는다 — 문자열 또는 문자열 목록만 받는다(그 밖은 null — 훅은 조용히 통과한다).
// 목록이면 셸 감싸기(["bash","-lc","<코드>", "$0", …])의 코드 인자 하나만, 셸이 아니면 그 목록을 그대로 한 명령으로 본다.
function inputCommand(raw, toolName) {
  if (typeof raw === 'string') return { code: raw, shell: String(toolName || '') === 'PowerShell' ? 'powershell' : 'bash' }
  if (Array.isArray(raw) && raw.length && raw.every((x) => typeof x === 'string')) {
    const sh = unwrapShell(raw)
    if (sh) return sh
    if (['bash', 'sh', 'zsh', 'dash', 'ksh', 'cmd', 'powershell', 'pwsh'].includes(binName(raw[0]))) return { code: '', shell: 'bash' }
    return { argv: raw, shell: 'bash' }
  }
  return null
}

// 명령을 훑으며 실제로 실행될 명령마다 visit(words, info) 를 부른다. 셸 감싸기·package.json 스크립트는 세 단계까지 따라간다.
//   info = { shell, state(같은 파이프라인 안에서 앞 단계가 남긴 표시 — 판정 함수가 쌓는다), stage(이 단계 글자), upTo()(여기까지의 파이프라인 글자) }
//   visit 이 { kind, … } 를 돌려주면 걸린 것으로 모은다.
// 결과 { hits: [{ kind, via, … }], overLimit, deep } — deep 은 세 단계를 넘어 더 보지 못한 곳이 있다는 뜻.
const WALK_DEPTH = 3
function walkCommand(cmd, visit, scripts, opt = {}) {
  const depth = opt.depth || 0
  const ctx = opt.ctx || { budget: { stages: 0, chars: 0 }, onPath: new Set(), done: new Map() }
  const res = { hits: [], overLimit: false, deep: false }
  const shell = cmd.shell || 'bash'
  let statements
  if (cmd.argv) {
    statements = [[{ words: cmd.argv.map((v) => ({ v, q: true, raw: v })), call: true, raw: cmd.argv.join(' ') }]]
  } else {
    const code = String(cmd.code ?? '')
    ctx.budget.chars += code.length
    if (ctx.budget.chars > LEX_LIMITS.chars) { res.overLimit = true; return res }
    const lx = lexCommand(code, shell, ctx.budget)
    if (lx.overLimit) { res.overLimit = true; return res }
    statements = lx.statements
  }
  const merge = (sub, prefix) => {
    for (const h of sub.hits) res.hits.push({ ...h, via: `${prefix}${h.via}` })
    if (sub.overLimit) res.overLimit = true
    if (sub.deep) res.deep = true
  }
  const inner = (sub, prefix) => {
    if (depth >= WALK_DEPTH) { res.deep = true; return }
    merge(walkCommand(sub, visit, scripts, { depth: depth + 1, ctx, inherit: sub.inherit }), prefix)
  }
  for (const stages of statements) {
    const state = { ...(opt.inherit || {}) }
    for (let k = 0; k < stages.length; k++) {
      const stage = stages[k]
      const cleaned = cleanWords(stage, shell)
      if (!cleaned || !cleaned.length) continue
      const r = stripRunners(cleaned)
      if (r.code !== undefined) { inner({ code: r.code, shell: 'bash' }, `${stage.raw} → `); continue }
      const words = r.words
      if (!words.length) continue
      const sh = unwrapShell(words)
      if (sh) { inner(sh, `${stage.raw} → `); continue }
      const hit = visit(words, { shell, state, stage: stage.raw, upTo: () => stages.slice(0, k + 1).map((x) => x.raw).join(' | ') })
      if (hit) res.hits.push({ via: stage.raw, ...hit })
      // PowerShell 의 { } ( ) $( ) 안은 같은 파이프라인 표시를 이어받아 다시 읽는다(ForEach-Object { Stop-Process … }).
      // 인용되지 않은 구문만 — 따옴표로 시작한 낱말('(pkill node)')은 글자다. 그래서 인용 여부가 남은 원래 낱말(stage.words)의 raw 를 본다.
      if (shell === 'powershell') {
        for (const t of stage.words.slice(1)) {
          if (t.q) continue
          const m = /^[$@]?[({]([\s\S]*)[)}]$/.exec(t.raw)
          if (m && m[1].trim()) inner({ code: m[1], shell: 'powershell', inherit: { ...state } }, `${stage.raw} → `)
        }
      }
      for (const nm of scriptNames(words)) {
        if (typeof scripts[nm] !== 'string' || ctx.onPath.has(nm)) continue      // 지금 따라가는 길에 이미 있으면 순환
        const prefix = `${stage.raw} → ${nm}: `
        if (ctx.done.has(nm)) { merge(ctx.done.get(nm), prefix); continue }       // 끝까지 본 스크립트는 다시 읽지 않는다
        if (depth >= WALK_DEPTH) { res.deep = true; continue }                    // 더 못 본 것은 "본 것"으로 적지 않는다
        ctx.onPath.add(nm)
        const sub = walkCommand({ code: scripts[nm], shell: 'bash' }, visit, scripts, { depth: depth + 1, ctx })
        ctx.onPath.delete(nm)
        if (!sub.deep && !sub.overLimit) ctx.done.set(nm, sub)
        merge(sub, prefix)
      }
    }
  }
  return res
}
// ==== 명령 읽기 — 끝 ====

// ---- 입력 — 없거나 깨져도 훅이 죽지 않게 한다 ----
let input = {}
if (!debug && !process.stdin.isTTY) {
  try {
    let raw = fs.readFileSync(0, 'utf8')
    if (raw.startsWith(BOM)) raw = raw.slice(1)
    if (raw && raw.trim().startsWith('{')) input = JSON.parse(raw)
  } catch { /* 입력이 없으면 아래에서 그냥 통과한다 */ }
}
if (!input || typeof input !== 'object' || Array.isArray(input)) input = {}
let cmd = null
try {
  cmd = debug ? { code: debugCmd, shell: debugShell } : inputCommand(input.tool_input && input.tool_input.command, input.tool_name)
} catch { cmd = null }
const command = cmd ? (cmd.argv ? cmd.argv.join(' ') : String(cmd.code)) : ''
if (!cmd || !command.trim()) {
  if (debug) console.log('사용: node .owner/hooks/erp-predeploy.mjs --debug "<확인할 명령>" [--shell bash|powershell|cmd]  (예: --debug "npx vercel --prod")')
  process.exit(0)
}
const shownCommand = command.length > 400 ? command.slice(0, 400) + `…(${command.length}자)` : command

// ---- 프로젝트 폴더 — 설치된 자리(<프로젝트>/.owner/hooks/)면 두 단계 위 ----
const fromSelf = path.basename(path.dirname(HERE)) === '.owner' ? path.resolve(HERE, '..', '..') : null
// cwd 는 검증한 문자열 하나만 쓴다(객체·숫자 등은 버린다)
const inputCwd = typeof input.cwd === 'string' && input.cwd ? input.cwd : null
const candidates = [fromSelf, inputCwd, process.cwd()].filter(Boolean)
const root = candidates.find((d) => { try { return fs.statSync(d).isDirectory() } catch { return false } }) || process.cwd()
if (!fs.existsSync(path.join(root, '.owner'))) process.exit(0)   // 설치 안 된 폴더에서는 조용히 통과

const readJson = (p) => { try { let t = fs.readFileSync(p, 'utf8'); if (t.startsWith(BOM)) t = t.slice(1); return JSON.parse(t) } catch { return null } }
const pkg = readJson(path.join(root, 'package.json'))
const scripts = pkg && typeof pkg.scripts === 'object' && pkg.scripts && !Array.isArray(pkg.scripts) ? pkg.scripts : {}

// vercel 하위 명령 중 지금 폴더를 올리지 않는 것 — 여기 없으면 배포(또는 폴더 경로)로 본다.
const VERCEL_SUB = new Set([
  'alias', 'aliases', 'api', 'billing', 'bisect', 'blob', 'build', 'cache', 'cert', 'certs', 'contract', 'curl',
  'dev', 'dns', 'domain', 'domains', 'env', 'git', 'guidance', 'help', 'httpstat', 'i', 'init', 'inspect', 'install',
  'integration', 'integrations', 'link', 'list', 'login', 'logout', 'logs', 'ls', 'mcp', 'microfrontends', 'open',
  'project', 'projects', 'promote', 'pull', 'redeploy', 'redirects', 'remove', 'rm', 'rollback', 'secret', 'secrets',
  'switch', 'target', 'targets', 'team', 'teams', 'telemetry', 'unlink', 'upgrade', 'webhooks', 'whoami',
])
// 값을 하나 더 받는 옵션 — 그 값을 하위 명령으로 잘못 읽지 않게 건너뛴다.
const VERCEL_VALUE_FLAGS = new Set([
  '--token', '-t', '--scope', '-S', '--cwd', '--local-config', '-A', '--global-config', '-Q', '--build-env', '-b',
  '--env', '-e', '--meta', '-m', '--regions', '--target', '--archive', '--project', '--team', '-T',
])

function vercelVerdict(tokens) {
  // tokens[0] 이 vercel 이다. 배포면 { other: <다른 폴더 또는 null> }, 아니면 null
  // 도움말·버전은 어디에 붙어 있든 먼저 본다(`vercel ./dist --help` 는 배포가 아니다)
  if (tokens.slice(1).some((t) => t === '--version' || t === '-v' || t === '--help' || t === '-h')) return null
  let other = null
  for (let i = 1; i < tokens.length; i++) {
    const tok = tokens[i]
    if (tok.startsWith('--cwd=')) { other = tok.slice(6); continue }
    if (tok.startsWith('-')) {
      if (!tok.includes('=') && VERCEL_VALUE_FLAGS.has(tok)) { if (tok === '--cwd') other = tokens[i + 1] || null; i++ }
      continue
    }
    const sub = tok.toLowerCase()
    if (sub === 'deploy') continue
    if (VERCEL_SUB.has(sub)) return null
    if (tok !== '.' && tok !== './') other = other || tok   // 올릴 폴더 경로(`vercel ./dist`)
    return { other }
  }
  return { other }
}

function gitPushVerdict(tokens) {
  let i = 1
  while (i < tokens.length && tokens[i].startsWith('-')) { const f = tokens[i]; i += (f === '-C' || f === '-c') ? 2 : 1 }
  if ((tokens[i] || '').toLowerCase() !== 'push') return null
  if (tokens.slice(i + 1).some((t) => t === '--dry-run' || t === '-n')) return null
  return 'push'
}

// 실행될 명령 하나를 본다 — vercel 배포 · git push
function visitDeploy(words) {
  const b = binName(words[0])
  if (b === 'vercel') { const v = vercelVerdict(words); return v ? { kind: 'vercel', other: v.other } : null }
  if (b === 'git') return gitPushVerdict(words) === 'push' ? { kind: 'push' } : null
  return null
}

let walked
try { walked = walkCommand(cmd, visitDeploy, scripts) } catch { walked = { hits: [], overLimit: false, deep: false } }
const found = walked.hits.find((h) => h.kind === 'vercel') || walked.hits.find((h) => h.kind === 'push') || { kind: null, via: '', other: null }
if (!found.kind) {
  if (debug) {
    const extra = [walked.overLimit ? `(명령이 너무 길어 글자 ${LEX_LIMITS.chars.toLocaleString()} · 단계 ${LEX_LIMITS.stages.toLocaleString()} 상한까지만 읽었습니다.)` : '',
      walked.deep ? '(세 단계보다 깊이 감싼 부분은 보지 않았습니다.)' : ''].filter(Boolean)
    console.log([`판정: 배포 명령이 아님 — 확인하지 않고 통과합니다. (읽은 규칙: ${cmd.shell || 'bash'})`, `명령: ${shownCommand}`, ...extra].join('\n'))
  }
  process.exit(0)
}

// git push 는 이미 배포가 이어진 프로젝트에서만 배포로 본다.
const progress = readJson(path.join(root, '.owner', 'progress.json'))
const deployUrl = progress && progress.app && typeof progress.app.deploy_url === 'string' ? progress.app.deploy_url.trim() : ''
const vercelLinked = fs.existsSync(path.join(root, '.vercel'))
if (found.kind === 'push' && !deployUrl && !vercelLinked) {
  if (debug) console.log('판정: git push 이지만 아직 배포가 이어지지 않은 프로젝트입니다(배포 주소·.vercel 없음) — 확인하지 않고 통과합니다.')
  process.exit(0)
}

// ---- 확인 ----
const notes = []
const passed = []
if (found.other) notes.push(`이 훅은 이 프로젝트 폴더만 확인합니다 — 명령이 올리는 다른 폴더(${found.other})는 확인하지 않았습니다.`)
// 세션이 프로젝트 안쪽 폴더로 cd 한 채 vercel 을 부르면 vercel 은 그 폴더를 올린다(훅은 프로젝트 전체를 확인했다).
if (found.kind === 'vercel' && !found.other && inputCwd) {
  const here = path.resolve(inputCwd)
  if (here.toLowerCase() !== root.toLowerCase() && here.toLowerCase().startsWith(root.toLowerCase() + path.sep)) {
    notes.push(`지금 작업 폴더가 프로젝트 안쪽(${path.relative(root, here).split(path.sep).join('/')})입니다 — vercel 은 그 폴더를 올립니다. 프로젝트 폴더로 돌아가 다시 실행하세요.`)
  }
}
const git = (...a) => {
  const r = spawnSync('git', ['-C', root, '-c', 'core.quotepath=false', ...a], { encoding: 'utf8', timeout: 15000, windowsHide: true, maxBuffer: 16 * 1024 * 1024 })
  return { ok: r.status === 0, out: r.stdout || '' }
}
// 앱이 아닌 것 — 문서·기록, 그리고 도구 폴더(설치된 스킬·에이전트·훅 등록). 검수 훅(erp-check.mjs)의 생략 목록과 같은 기준.
const DOC_PATH = [/^\.owner\//, /^reports\//, /^company\//, /^course\//, /^docs\//, /\.md$/i,
  /(^|\/)\.claude\//, /(^|\/)\.codex\//, /(^|\/)\.agents\//]
const stripAnsi = (s) => String(s).replace(/\u001b\[[0-9;]*[A-Za-z]/g, '')
const tail = (s, n = 25) => stripAnsi(s).split(/\r?\n/).filter((l) => l.trim()).slice(-n).map((l) => '  ' + l).join('\n')

function block(title, detail) {
  const msg = [
    `배포를 멈췄습니다 — 배포 전 확인(.owner/hooks/erp-predeploy.mjs)에서 걸렸습니다. (${found.kind === 'push' ? 'git push = 배포' : 'vercel 배포'})`,
    '',
    `[${title}]`,
    detail,
    '',
    '고친 뒤 같은 배포 명령을 다시 실행하세요. 이 훅을 끄거나 우회하지 않습니다.',
    '미리 돌려 보기: node .owner/hooks/erp-predeploy.mjs --debug "vercel --prod"',
  ].join('\n')
  if (debug) { console.log(`판정: 막음\n명령: ${shownCommand}\n\n${msg}`); process.exit(0) }
  if (tool === 'codex') {
    process.stdout.write(JSON.stringify({ decision: 'block', reason: msg }) + '\n')
    process.stderr.write(msg + '\n')
    process.exit(0)
  }
  process.stderr.write(msg + '\n')
  process.exit(2)
}

// ① 커밋 — `git status -z` 로 읽어 이름 바꾼 파일의 옛 경로·새 경로를 둘 다 본다
let dirtyApp = 0
if (!git('rev-parse', '--is-inside-work-tree').ok) {
  notes.push('git 저장소가 아니어서 커밋 여부를 확인하지 못했습니다(되돌아갈 자리가 없습니다 — git init 과 첫 커밋을 먼저 하세요).')
} else {
  const st = git('status', '--porcelain', '-z', '--untracked-files=all')
  const paths = []
  if (!st.ok) notes.push('git status 가 실패해 커밋 여부를 확인하지 못했습니다 — 직접 git status 로 확인하세요.')
  if (st.ok) {
    const parts = st.out.split('\0')
    for (let i = 0; i < parts.length; i++) {
      const e = parts[i]
      if (!e || e.length < 4) continue
      const xy = e.slice(0, 2)
      paths.push(e.slice(3))
      if (/[RC]/.test(xy) && parts[i + 1]) { paths.push(parts[i + 1]); i++ }   // 이름 바꾼 파일: 새 경로 다음에 옛 경로가 온다
    }
  }
  const appFiles = [...new Set(paths.map((p) => p.replace(/\\/g, '/')).filter((p) => p && !DOC_PATH.some((re) => re.test(p))))]
  dirtyApp = appFiles.length
  if (appFiles.length && found.kind === 'vercel') {
    const list = appFiles.slice(0, 8).map((p) => `  - ${p}`).join('\n') + (appFiles.length > 8 ? `\n  - (그 외 ${appFiles.length - 8}개)` : '')
    block('커밋 안 한 변경', `앱에 들어가는 파일 ${appFiles.length}개가 커밋되지 않았습니다:\n${list}\n`
      + 'vercel 명령은 커밋이 아니라 지금 폴더를 그대로 올립니다. 커밋 없이 올라간 배포본은 되돌아갈 자리가 없습니다.\n'
      + '먼저 커밋하세요: git add -A  →  git commit -m "<무엇을 바꿨나>"\n'
      + '한 줄에 커밋과 배포를 이어 쓰면 현재 상태로 판정한다 — 커밋을 먼저 따로 실행한 뒤 배포 명령을 다시 실행하세요.')
  }
  if (appFiles.length) notes.push(`커밋하지 않은 앱 파일 ${appFiles.length}개는 이번 배포에 들어가지 않습니다(푸시는 커밋만 보냅니다).`)
  else if (st.ok) passed.push('커밋')
}

// ②·③ 빌드와 고정 검사 — npm 이 있는지 먼저 본다(없으면 막지 않고 알린다)
function runScript(name, timeout) {
  const r = spawnSync(`npm run ${name}`, {
    cwd: root, shell: true, encoding: 'utf8', timeout, maxBuffer: 32 * 1024 * 1024, windowsHide: true,
    env: { ...process.env, CI: '1', FORCE_COLOR: '0', NO_COLOR: '1' },
  })
  if (r.error) return { state: r.error.code === 'ETIMEDOUT' ? 'timeout' : 'error', why: r.error.message, out: '' }
  return { state: r.status === 0 ? 'ok' : 'fail', out: `${r.stdout || ''}\n${r.stderr || ''}` }
}

if (!pkg) {
  notes.push('package.json 이 없어 빌드·고정 검사를 확인하지 못했습니다.')
} else if (spawnSync('npm --version', { shell: true, encoding: 'utf8', timeout: 20000, windowsHide: true }).status !== 0) {
  notes.push('npm 을 찾지 못해 빌드·고정 검사를 확인하지 못했습니다(배포는 막지 않습니다) — Node.js 설치를 확인하세요.')
} else {
  if (typeof scripts.build === 'string') {
    const b = runScript('build', BUILD_TIMEOUT_MS)
    if (b.state === 'fail') block('빌드 실패', `npm run build 가 실패했습니다. 오류 끝부분:\n${tail(b.out)}\n배포는 빌드가 성공한 커밋에서만 합니다.`)
    else if (b.state === 'timeout') notes.push(`빌드가 ${BUILD_TIMEOUT_MS / 1000}초 안에 끝나지 않아 확인하지 못했습니다 — 직접 npm run build 로 확인하세요.`)
    else if (b.state === 'error') notes.push(`빌드를 실행하지 못했습니다(${b.why}).`)
    else passed.push(found.kind === 'push' && dirtyApp ? '빌드(지금 폴더 기준 — 커밋 안 한 변경 포함)' : '빌드')
  } else {
    notes.push('package.json 에 build 스크립트가 없어 빌드를 확인하지 않았습니다.')
  }
  if (typeof scripts.check === 'string') {
    const c = runScript('check', CHECK_TIMEOUT_MS)
    if (c.state === 'fail') block('고정 검사 실패', `npm run check 가 실패했습니다. 끝부분:\n${tail(c.out)}\n막힘으로 나온 항목을 고친 뒤 배포합니다(오탐이면 그 파일에 사유와 함께 허용 주석을 적습니다).`)
    else if (c.state === 'timeout') notes.push(`고정 검사가 ${CHECK_TIMEOUT_MS / 1000}초 안에 끝나지 않아 확인하지 못했습니다.`)
    else if (c.state === 'error') notes.push(`고정 검사를 실행하지 못했습니다(${c.why}).`)
    else passed.push('고정 검사')
  } else {
    notes.push('고정 검사(package.json 의 check)가 아직 없습니다 — indeans-erp-data 의 마이그레이션 게이트를 붙이면 생깁니다.')
  }
}

// ---- 통과 ----
const text = [`배포 전 확인 통과${passed.length ? ` — ${passed.join(' · ')}` : ''}.`, ...notes].join(' ')
if (debug) { console.log(`판정: 통과\n명령: ${shownCommand}\n배포로 본 부분: ${found.via}\n${text}`); process.exit(0) }
process.stdout.write(JSON.stringify({ systemMessage: text }) + '\n')
process.exit(0)
