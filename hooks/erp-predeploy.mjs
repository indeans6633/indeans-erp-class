#!/usr/bin/env node
// 배포 직전 확인 훅 — 배포 명령이 실행되기 바로 전(PreToolUse)에 커밋·빌드·고정 검사를 확인하고, 걸리면 배포를 멈춘다.
// 훅 자체는 네트워크를 쓰지 않는다(빌드·검사는 프로젝트의 npm 스크립트가 돈다 — 아래 "한계").
//
// 사용(도구가 자동으로 부른다 — 작업 폴더와 무관하게 이 파일을 찾도록 등록 문장에 경로를 박아 둔다):
//   Claude Code  node "${CLAUDE_PROJECT_DIR}/.owner/hooks/erp-predeploy.mjs" --tool claude   (공식 자리 표시 — 중괄호 꼴)
//   Codex        node "<설치할 때의 프로젝트 절대 경로>/.owner/hooks/erp-predeploy.mjs" --tool codex   (설치기가 써넣는다)
//   상대 경로(node .owner/hooks/…)로 등록하면 AI 가 cd 한 세션에서 "Cannot find module" 로 조용히 꺼진다 — install.mjs 「훅 등록」.
//   --debug "<명령>"   표준입력 없이 그 명령을 배포로 보는지와 확인 결과를 출력만 한다(막지 않는다).
//                      예: node .owner/hooks/erp-predeploy.mjs --debug "npx vercel --prod"
//
// 무엇을 배포 명령으로 보나
//   1) vercel 배포 — `vercel`, `vercel --prod`, `vercel deploy`, `npx vercel --prod`, `vercel ./폴더` 처럼 폴더를 올리는 명령.
//      `npx.cmd` 처럼 확장자가 붙은 실행기, `cmd /c "…"`·`bash -c "…"`·`powershell -Command "…"` 로 감싼 명령,
//      `a & b`·`a && b`·`a; b` 로 이은 명령, package.json 스크립트(`npm run deploy` → `npm run release` → `vercel`,
//      세 단계까지 · 같은 스크립트를 두 번 따라가지 않음 · npm 의 pre/post 스크립트 포함)도 따라가 찾는다.
//      `vercel env pull`·`vercel login`·`vercel logs`·`vercel rollback` 처럼 올리지 않는 하위 명령은 건너뛴다.
//      **되돌리기(rollback)는 막지 않는다** — 복구 길을 훅이 막으면 안 된다.
//   2) git push — 이 프로젝트가 이미 배포돼 있을 때만(.owner/progress.json 의 app.deploy_url 이 있거나
//      .vercel/ 폴더가 있을 때). GitHub 와 Vercel 을 이어 두면 푸시가 곧 배포다.
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
//   - 셸 문법을 끝까지 해석하지 않는다. 변수·함수·여러 겹으로 감싼 명령 속의 배포는 놓칠 수 있다.
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

const BUILD_TIMEOUT_MS = 300 * 1000
const CHECK_TIMEOUT_MS = 180 * 1000
const MAX_DEPTH = 3

// ---- 입력 — 없거나 깨져도 훅이 죽지 않게 한다 ----
let input = {}
if (!debug && !process.stdin.isTTY) {
  try {
    const raw = fs.readFileSync(0, 'utf8').replace(/^\uFEFF/, '')
    if (raw && raw.trim().startsWith('{')) input = JSON.parse(raw)
  } catch { /* 입력이 없으면 아래에서 그냥 통과한다 */ }
}
// 명령은 글자 한 줄로 오지만, 도구에 따라 ["bash", "-lc", "<명령>"] 같은 목록으로 올 수도 있다 — 그때는 실제 명령만 꺼낸다.
function commandText(c) {
  if (Array.isArray(c)) {
    const parts = c.map((x) => String(x))
    const shell = path.basename(parts[0] || '').toLowerCase().replace(/\.exe$/, '')
    const runFlag = parts.findIndex((x) => /^(-l?c|-command|\/c)$/i.test(x))
    if (['bash', 'sh', 'zsh', 'pwsh', 'powershell', 'cmd'].includes(shell) && runFlag > 0) return parts.slice(runFlag + 1).join(' ')
    return parts.join(' ')
  }
  return String(c ?? '')
}
const command = debug ? debugCmd : commandText(input?.tool_input?.command)
if (!command.trim()) {
  if (debug) console.log('사용: node .owner/hooks/erp-predeploy.mjs --debug "<확인할 명령>"  (예: --debug "npx vercel --prod")')
  process.exit(0)
}

// ---- 프로젝트 폴더 — 설치된 자리(<프로젝트>/.owner/hooks/)면 두 단계 위 ----
const fromSelf = path.basename(path.dirname(HERE)) === '.owner' ? path.resolve(HERE, '..', '..') : null
const candidates = [fromSelf, input.cwd, process.cwd()].filter(Boolean)
const root = candidates.find((d) => { try { return fs.statSync(d).isDirectory() } catch { return false } }) || process.cwd()
if (!fs.existsSync(path.join(root, '.owner'))) process.exit(0)   // 설치 안 된 폴더에서는 조용히 통과

const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, '')) } catch { return null } }
const pkg = readJson(path.join(root, 'package.json'))
const scripts = pkg && typeof pkg.scripts === 'object' && pkg.scripts ? pkg.scripts : {}

// ---- 명령 읽기 ----
// 한 줄에 여러 명령이 이어질 수 있다(`a && b`, `a || b`, `a; b`, `a | b`, cmd 의 `a & b`). 나눠서 하나씩 본다.
const segmentsOf = (cmd) => String(cmd).split(/&&|\|\||[;|\n&]/).map((s) => s.trim()).filter(Boolean)
const tokensOf = (seg) => (seg.match(/"[^"]*"|'[^']*'|\S+/g) || []).map((t) => t.replace(/^["']|["']$/g, ''))
// 실행기·명령 이름 — 경로와 확장자(.cmd·.exe·.ps1·.bat)와 @버전을 떼고 비교한다(npx.cmd · C:\…\vercel.cmd · vercel@latest)
const binName = (tok) => path.basename(String(tok)).toLowerCase().replace(/\.(cmd|exe|ps1|bat)$/, '').replace(/@.*$/, '')

// 셸로 감싼 명령의 안쪽 글자를 꺼낸다 — cmd /c "…" · bash -c "…" · sh -c · powershell -Command "…" · pwsh -c
function unwrapShell(tokens) {
  const b = binName(tokens[0] || '')
  if (b === 'cmd' && /^\/[ck]$/i.test(tokens[1] || '')) return tokens.slice(2).join(' ')
  if (['bash', 'sh', 'zsh', 'dash'].includes(b)) {
    const i = tokens.findIndex((t, k) => k > 0 && /^-[a-z]*c$/i.test(t))
    if (i > 0) return tokens.slice(i + 1).join(' ')
  }
  if (['powershell', 'pwsh'].includes(b)) {
    const i = tokens.findIndex((t, k) => k > 0 && /^-(c|command)$/i.test(t))
    if (i > 0) return tokens.slice(i + 1).join(' ')
  }
  return null
}

// 앞에 붙는 것을 벗긴다: 환경 변수 지정(FOO=bar), PowerShell 의 &, call·env·time, npx·pnpm dlx 같은 실행기
function stripRunners(tokens) {
  const t = [...tokens]
  for (let guard = 0; guard < 8 && t.length; guard++) {
    const a = binName(t[0])
    if (/^[A-Za-z_][\w]*=/.test(t[0]) || t[0] === '&' || ['call', 'time', 'env'].includes(a)) { t.shift(); continue }
    if (a === 'npx' || a === 'bunx') {
      t.shift()
      while (t.length && t[0].startsWith('-')) { const f = t.shift(); if ((f === '-p' || f === '--package') && t.length) t.shift() }
      continue
    }
    if ((a === 'pnpm' || a === 'yarn') && ['dlx', 'exec'].includes((t[1] || '').toLowerCase())) { t.splice(0, 2); continue }
    if (a === 'npm' && (t[1] || '').toLowerCase() === 'exec') { t.splice(0, 2); if (t[0] === '--') t.shift(); continue }
    break
  }
  return t
}

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
  let other = null
  for (let i = 1; i < tokens.length; i++) {
    const tok = tokens[i]
    if (tok === '--version' || tok === '-v' || tok === '--help' || tok === '-h') return null
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

function detect(cmd, depth = 0, visited = new Set()) {
  const out = { kind: null, via: '', other: null }
  if (depth > MAX_DEPTH) return out
  for (const seg of segmentsOf(cmd)) {
    const raw = tokensOf(seg)
    const inner = unwrapShell(raw)
    if (inner !== null) {
      const r = detect(inner, depth + 1, visited)
      if (r.kind === 'vercel') return { ...r, via: `${seg} → ${r.via}` }
      if (r.kind && !out.kind) Object.assign(out, r, { via: `${seg} → ${r.via}` })
      continue
    }
    const t = stripRunners(raw)
    if (!t.length) continue
    const b = binName(t[0])
    if (b === 'vercel') { const v = vercelVerdict(t); if (v) return { kind: 'vercel', via: seg, other: v.other }; continue }
    if (b === 'git') { if (gitPushVerdict(t) === 'push' && !out.kind) Object.assign(out, { kind: 'push', via: seg }); continue }
    // package.json 스크립트로 감싼 배포 — `npm run deploy`, `pnpm deploy`, `yarn deploy` (npm 은 pre/post 스크립트도 돈다)
    if (['npm', 'pnpm', 'yarn', 'bun'].includes(b)) {
      let name = null
      if (b === 'npm' && ['run', 'run-script'].includes((t[1] || '').toLowerCase())) name = t[2]
      else if (b !== 'npm' && (t[1] || '').toLowerCase() === 'run') name = t[2]
      else if (b !== 'npm' && t[1] && !t[1].startsWith('-')) name = t[1]
      const names = name ? (b === 'npm' ? [`pre${name}`, name, `post${name}`] : [name]) : []
      for (const n of names) {
        if (typeof scripts[n] !== 'string' || visited.has(n)) continue
        visited.add(n)
        const r = detect(scripts[n], depth + 1, visited)
        if (r.kind === 'vercel') return { ...r, via: `${seg} → ${n}: ${r.via}` }
        if (r.kind && !out.kind) Object.assign(out, r, { via: `${seg} → ${n}: ${r.via}` })
      }
    }
  }
  return out
}

const found = detect(command)
if (!found.kind) {
  if (debug) console.log(`판정: 배포 명령이 아님 — 확인하지 않고 통과합니다.\n명령: ${command}`)
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
if (found.kind === 'vercel' && !found.other && input.cwd) {
  const here = path.resolve(String(input.cwd))
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
  if (debug) { console.log(`판정: 막음\n명령: ${command}\n\n${msg}`); process.exit(0) }
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
      + '먼저 커밋하세요: git add -A  →  git commit -m "<무엇을 바꿨나>"')
  }
  if (appFiles.length) notes.push(`커밋하지 않은 앱 파일 ${appFiles.length}개는 이번 배포에 들어가지 않습니다(푸시는 커밋만 보냅니다).`)
  else passed.push('커밋')
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
if (debug) { console.log(`판정: 통과\n명령: ${command}\n배포로 본 부분: ${found.via}\n${text}`); process.exit(0) }
process.stdout.write(JSON.stringify({ systemMessage: text }) + '\n')
process.exit(0)
