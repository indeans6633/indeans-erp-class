#!/usr/bin/env node
// 명령 보호 훅 — 이 프로젝트 폴더 밖까지 영향을 주는 명령을, 실행되기 바로 전(PreToolUse)에 멈춘다.
// 이번 판의 범위는 **이름으로 프로세스를 통째로 끄는 명령**이다. 네트워크·파일 쓰기 없음, 빠르게 끝난다(등록 timeout 10초).
// 배경(2026-10-11 리허설 D): 미리보기 서버를 끄려던 `taskkill //F //IM node.exe` 가 이 컴퓨터의 node 프로그램 전부
// (다른 프로젝트 서버 · AI 도구 자신)를 껐다.
//
// 사용(도구가 자동으로 부른다 — 작업 폴더와 무관하게 이 파일을 찾도록 등록 문장에 경로를 박아 둔다):
//   Claude Code  node "${CLAUDE_PROJECT_DIR}/.owner/hooks/erp-guard.mjs" --tool claude   (공식 자리 표시 — 중괄호 꼴)
//   Codex        node "<설치할 때의 프로젝트 절대 경로>/.owner/hooks/erp-guard.mjs" --tool codex   (설치기가 써넣는다)
//   --debug "<명령>" [--shell bash|powershell|cmd]
//                      표준입력 없이 그 명령을 막을지 출력만 한다(막지 않는다). 셸 기본은 bash —
//                      PowerShell 도구의 명령이면 --shell powershell 로 읽는 규칙을 바꾼다.
//                      예: node .owner/hooks/erp-guard.mjs --debug "taskkill /F /IM node.exe"
//
// 무엇을 막나 — 명령을 실제로 실행될 명령 하나하나로 읽은 뒤(아래 「명령 읽기」) 본다
//   - taskkill 에 /IM · //IM · -IM(이름) 또는 /FI(조건)가 있는 것. `/PID <번호>` 만 있는 것과 인자 없는 taskkill 은 통과.
//   - pkill · killall 전부(인자와 무관).
//   - (Bash 의) kill 대상에 -1(전체)이 있는 것. `kill 1234` · `kill -9 1234` · `kill -n 9 1234` 는 통과.
//   - PowerShell Stop-Process(별칭 spps · kill)에 -Name · -ProcessName 이 있는 것, `-InputObject (Get-Process …)`,
//     같은 파이프라인 앞 단계가 Get-Process(gps · ps)이고 -Id 가 없는 것(`Get-Process node | Stop-Process -Force`,
//     `Get-Process node | ForEach-Object { Stop-Process -Id $_.Id }`), `(Get-Process node).Kill()`.
//     `Stop-Process -Id 1234` 와 `Get-Process node`(읽기만)는 통과.
//   - wmic process … delete(또는 call terminate), Invoke-CimMethod · Invoke-WmiMethod … Terminate — 대상을
//     ProcessId=<번호> 로만 고른 것은 통과. fkill <이름>(숫자·`:포트` 가 아닌 인자).
//   - 이름으로 찾은 번호를 넘겨 끄는 것: `pgrep vite | xargs kill` · `ps aux | grep node | xargs kill`(xargs 가 실제로 실행하는
//     명령 하나만 본다). 포트로 찾은 번호(`lsof -ti :5173 | xargs kill`)는 통과.
//   - `cmd /c "…"`(Git Bash 의 `cmd //c`, `/d /s /c` 포함) · `bash -c '…'`(다음 한 인자만 코드) · `powershell -Command "…"` 로 감싼
//     명령, env · sudo · npx · npm exec 같은 앞붙이(옵션 포함)를 벗긴 뒤의 명령, package.json 스크립트(`npm run stop`,
//     `npm run --if-present stop`, `npm stop` → scripts.stop 가 `pkill node`, npm 의 pre/post 포함 — --ignore-scripts 면 빼고)는
//     세 단계까지 따라간다.
//
// 무엇을 통과시키나(오탐 금지)
//   따옴표 안의 글자(`echo "pkill node"` · `git commit -m "taskkill /IM node.exe 막기"`), 주석(# …), heredoc · here-string 본문,
//   PowerShell 의 문자열 표현식("pkill"), 읽기만 하는 명령(pgrep · tasklist · Get-Process), 포트를 지정해 끄는 명령(`npx kill-port 5173`).
//
// 한계 — **이 훅은 수강생 AI 의 실수를 막는 안전장치이지 보안 경계가 아니다.** 일부러 우회하면 막지 못한다.
//   - 스크립트 파일 안의 명령(`bash cleanup.sh`) · 변수로 만든 명령($p = Get-Process node; Stop-Process $p) · heredoc 안의 명령은 보지 못한다.
//   - 명령 치환(`$(…)` · 백틱 `…`) 안은 따로 읽지 않는다(`kill $(pgrep node)` 는 통과한다). 따옴표 밖의 `$(` `)` 는 Bash 에서
//     문장 경계로 읽혀 우연히 잡힐 때가 있지만 보장하지 않는다.
//   - 포트 지정 종료(`kill-port` · `lsof -ti :포트 | xargs kill`)는 막지 않는다 — 다른 프로젝트가 그 포트를 쓰고 있으면
//     그것이 꺼질 수 있다. 그래서 스킬은 "자기가 띄운 PID" 로 끄는 것을 먼저 적는다.
//   - 셸 문법을 끝까지 해석하지 않는다. 세 단계 넘게 감싼 명령은 보지 못한다. Codex 가 명령을 글자 한 줄로 넘기면 Bash 규칙으로 읽는다.
//   - 명령이 너무 길면(글자 200,000 · 단계 2,000 초과) 읽지 않고 통과한다(--debug 가 그 사실을 적는다).
//
// 도구별 입출력 — 배포 전 확인 훅(erp-predeploy.mjs)과 같다(2026-10-08 확인 — 바뀌면 CONVENTIONS.md 와 함께 고친다).
//   Claude Code  https://code.claude.com/docs/en/hooks
//     stdin: { tool_name: "Bash" | "PowerShell", tool_input: { command }, cwd, hook_event_name: "PreToolUse", ... }
//     막기: 종료 코드 2 + stderr(그 내용이 모델에게 간다). 통과: 0 — 아무것도 출력하지 않는다(매 명령마다 돌기 때문).
//   Codex        https://developers.openai.com/codex/hooks → https://learn.chatgpt.com/docs/hooks
//     stdin: { tool_name: "Bash", tool_input: { command }, cwd, ... } — command 가 목록으로 올 수도 있다.
//     막기: 표준출력 { "decision": "block", "reason": "…" } + 종료 코드 0 — 막는 신호는 이것 하나다(CONVENTIONS 규약).
//       stderr 에는 같은 내용을 사람이 읽는 기록으로만 남긴다(막는 신호가 아니다). 통과: 종료 코드 0, 출력 없음.
//   command 가 문자열도 문자열 목록도 아니면 조용히 통과한다.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const argv = process.argv.slice(2)
const flag = (n, d = null) => { const i = argv.indexOf(n); return i >= 0 ? (argv[i + 1] ?? d) : d }
const debugCmd = argv.includes('--debug') ? (flag('--debug') ?? '') : null
const debug = debugCmd !== null
const tool = (flag('--tool', 'claude') || 'claude').toLowerCase() === 'codex' ? 'codex' : 'claude'
const debugShell = ['bash', 'powershell', 'cmd'].includes(String(flag('--shell', 'bash')).toLowerCase()) ? String(flag('--shell', 'bash')).toLowerCase() : 'bash'
const BOM = String.fromCharCode(0xFEFF)

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
const shown0 = cmd ? (cmd.argv ? cmd.argv.join(' ') : String(cmd.code)) : ''
if (!cmd || !shown0.trim()) {
  if (debug) console.log('사용: node .owner/hooks/erp-guard.mjs --debug "<확인할 명령>" [--shell bash|powershell|cmd]  (예: --debug "taskkill /F /IM node.exe")')
  process.exit(0)
}

// ---- 프로젝트 폴더 — 설치된 자리(<프로젝트>/.owner/hooks/)면 두 단계 위 ----
const fromSelf = path.basename(path.dirname(HERE)) === '.owner' ? path.resolve(HERE, '..', '..') : null
const inputCwd = typeof input.cwd === 'string' && input.cwd ? input.cwd : null   // cwd 는 검증한 문자열 하나만 쓴다
const candidates = [fromSelf, inputCwd, process.cwd()].filter(Boolean)
const root = candidates.find((d) => { try { return fs.statSync(d).isDirectory() } catch { return false } }) || process.cwd()
const installed = fs.existsSync(path.join(root, '.owner'))
if (!installed && !debug) process.exit(0)   // 설치 안 된 폴더에서는 조용히 통과(미리 돌려 보기는 판정만 보여 준다)

const readJson = (p) => { try { let t = fs.readFileSync(p, 'utf8'); if (t.startsWith(BOM)) t = t.slice(1); return JSON.parse(t) } catch { return null } }
const pkg = readJson(path.join(root, 'package.json'))
const scripts = pkg && typeof pkg.scripts === 'object' && pkg.scripts && !Array.isArray(pkg.scripts) ? pkg.scripts : {}

// ---- 판정 ----
const NAME_LOOKUP = new Set(['pgrep', 'pidof', 'ps', 'tasklist', 'get-process', 'gps'])
const ID_FLAG = /^-id(:.*)?$/i
const NAME_FLAG = /^-(n|na|nam|name|processname)(:.*)?$/i
const GET_PROC_WORD = /^[$@]?\(\s*(get-process|gps|ps)\b/i
const KILL_METHOD = /^\(\s*(get-process|gps|ps)\b[\s\S]*\)\s*\.\s*kill\s*\(/i
const XARGS_VALUE = ['-I', '-L', '-n', '-P', '-s', '-E', '-d', '-a', '--arg-file', '--max-args', '--max-procs', '--max-chars', '--delimiter', '--eof', '--max-lines', '--replace']
// ProcessId=<번호> 처럼 번호로만 고른 WMI·CIM 대상
const pidOnly = (text) => /(processid|handle)\s*=\s*['"]?\d+/i.test(text) && !/\bname\b|caption|commandline|executablepath|\blike\b/i.test(text)

// kill(Bash) — 앞의 신호 지정(-9 · -KILL · -s 신호 · -n 번호)을 건너뛴 뒤 남은 대상에 -1 이 있는지
function killTargetsAll(args) {
  let i = 0
  if (args[0] === '-s' || args[0] === '-n') i = 2
  else if (args[0] && args[0].startsWith('-') && args[0] !== '--' && args[0] !== '-1') i = 1
  else if (args[0] === '-1' && args.length > 1) i = 1                             // `kill -1 1234` 의 -1 은 신호(HUP)다
  if (args[i] === '--') i++
  return args.slice(i).includes('-1')
}
// Stop-Process(별칭 spps · PowerShell 의 kill)
function psStopByName(args, state) {
  if (args.some((a) => NAME_FLAG.test(a))) return true
  if (args.some((a) => GET_PROC_WORD.test(a) && !/\s-id\b/i.test(a))) return true    // -InputObject (Get-Process node)
  return !!state.procList                                                       // Get-Process node | Stop-Process
}

// 실행될 명령 하나를 본다 — { kind: 'name'(같은 이름 전부) | 'all'(전체) } 또는 null. 파이프라인 표시(state)를 쌓는다.
function judge(words, info) {
  const st = info.state
  const b = binName(words[0])
  const args = words.slice(1)
  const pipelineVia = () => (info.upTo().includes(' | ') ? info.upTo() : info.stage)
  let kind = null
  let via = null
  if (b === 'taskkill') { if (args.some((a) => /^(\/\/?|-)(im|fi)$/i.test(a))) kind = 'name' }
  else if (b === 'pkill' || b === 'killall') kind = 'name'
  else if (b === 'kill') {
    if (info.shell === 'powershell') { if (psStopByName(args, st)) { kind = 'name'; via = pipelineVia() } }
    else if (st.procList) { kind = 'name'; via = pipelineVia() }                  // gps node | kill
    else if (killTargetsAll(args)) kind = 'all'
  } else if (b === 'stop-process' || b === 'spps') {
    if (psStopByName(args, st)) { kind = 'name'; via = pipelineVia() }
  } else if (b === 'xargs') {
    const t = [...args]
    while (t.length && t[0].startsWith('-')) {
      const f = t.shift()
      if (f === '--') break
      if (!f.includes('=') && XARGS_VALUE.includes(f)) t.shift()
    }
    const r = stripRunners(t)
    const cb = binName((r.words || [])[0] || '')
    if (cb === 'pkill' || cb === 'killall') kind = 'name'
    else if (['kill', 'taskkill', 'stop-process'].includes(cb) && st.nameLookup) { kind = 'name'; via = pipelineVia() }
  } else if (b === 'wmic') {
    const joined = args.join(' ')
    const low = args.map((a) => a.toLowerCase())
    if (low.includes('process') && (low.includes('delete') || low.includes('terminate')) && !pidOnly(joined)) kind = 'name'
  } else if (b === 'invoke-cimmethod' || b === 'invoke-wmimethod') {
    if (args.some((a) => /^terminate$/i.test(a) || /:terminate$/i.test(a)) && !pidOnly(info.upTo())) { kind = 'name'; via = pipelineVia() }
  } else if (b === 'fkill' || b === 'fkill-cli') {
    if (args.filter((a) => !a.startsWith('-')).some((a) => !/^\d+$/.test(a) && !/^:\d+$/.test(a))) kind = 'name'
  } else if (KILL_METHOD.test(words[0]) && !/\s-id\b/i.test(words[0])) kind = 'name'   // (Get-Process node).Kill()
  // 이 단계가 남기는 표시 — 다음 단계가 읽는다(앞 단계를 다시 훑지 않는다)
  if ((b === 'get-process' || b === 'gps' || (b === 'ps' && info.shell === 'powershell')) && !args.some((a) => ID_FLAG.test(a))) st.procList = true
  if (NAME_LOOKUP.has(b)) st.nameLookup = true
  return kind ? (via ? { kind, via } : { kind }) : null
}

let result
try { result = walkCommand(cmd, judge, scripts) } catch { result = { hits: [], overLimit: false, deep: false } }
const shownCmd = shown0.length > 400 ? shown0.slice(0, 400) + `…(${shown0.length}자)` : shown0
if (result.overLimit) {
  if (debug) console.log(`판정: 통과 — 명령이 너무 길어(글자 ${LEX_LIMITS.chars.toLocaleString()} · 단계 ${LEX_LIMITS.stages.toLocaleString()} 상한) 읽지 않았습니다.\n명령: ${shownCmd}`)
  process.exit(0)
}
const hits = result.hits
if (!hits.length) {
  if (debug) {
    const notes = []
    if (result.deep) notes.push(`(세 단계보다 깊이 감싼 부분은 보지 않았습니다.)`)
    if (!installed) notes.push('(이 폴더에는 설치돼 있지 않습니다 — 실제로는 .owner 가 있는 프로젝트에서만 돕니다.)')
    console.log([`판정: 통과 — 다른 프로그램까지 끄는 명령이 아닙니다. (읽은 규칙: ${cmd.shell || 'bash'})`, `명령: ${shownCmd}`, ...notes].join('\n'))
  }
  process.exit(0)
}

const shown = hits.slice(0, 5)
const kinds = new Set(shown.map((h) => h.kind))
const msg = [
  '명령을 멈췄습니다 — 이 컴퓨터의 다른 프로그램까지 끄는 명령입니다(.owner/hooks/erp-guard.mjs).',
  '',
  '[걸린 부분]',
  ...shown.map((h) => `  ${h.via}`),
  ...(hits.length > shown.length ? [`  (그 외 ${hits.length - shown.length}곳)`] : []),
  ...(kinds.has('name') ? ['  이 명령은 이 프로젝트가 띄운 서버 하나가 아니라 같은 이름의 프로그램 전부(다른 프로젝트의 서버 · 편집기 · AI 도구 자신)를 끕니다.'] : []),
  ...(kinds.has('all') ? ['  kill 의 대상 -1 은 이 컴퓨터에서 끌 수 있는 프로그램 전부(다른 프로젝트의 서버 · 편집기 · AI 도구 자신)를 끕니다.'] : []),
  '',
  '대신 — 자기가 띄운 프로세스만 번호(PID)로 끕니다.',
  '  띄울 때 받은 PID 가 있으면 그 번호로. 모르면 포트로 찾습니다:',
  '  Windows      netstat -ano | findstr :5173   → 줄 끝 숫자가 PID →  taskkill /PID <번호>',
  '  macOS·Linux  lsof -ti :5173                 → 나온 숫자가 PID →  kill <번호>',
  '이 훅을 끄거나 우회하지 않습니다. 미리 돌려 보기: node .owner/hooks/erp-guard.mjs --debug "<명령>"',
].join('\n')

if (debug) { console.log(`판정: 막음 (읽은 규칙: ${cmd.shell || 'bash'})\n명령: ${shownCmd}\n\n${msg}`); process.exit(0) }
if (tool === 'codex') {
  process.stdout.write(JSON.stringify({ decision: 'block', reason: msg }) + '\n')
  process.stderr.write(msg + '\n')
  process.exit(0)
}
process.stderr.write(msg + '\n')
process.exit(2)
