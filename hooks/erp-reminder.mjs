#!/usr/bin/env node
// 알림 훅(erp-reminder) — 새 대화를 열 때(SessionStart) 주간 점검이 7일 넘게 밀렸으면 알린다. 막지 않는다.
// 네트워크 호출 없음. 파일을 쓰지 않는다(읽기만 한다).
//
// 사용(도구가 자동으로 부른다 — 작업 폴더와 무관하게 이 파일을 찾도록 등록 문장에 경로를 박아 둔다):
//   Claude Code  node "${CLAUDE_PROJECT_DIR}/.owner/hooks/erp-reminder.mjs" --tool claude   (공식 자리 표시 — 중괄호 꼴)
//   Codex        node "<설치할 때의 프로젝트 절대 경로>/.owner/hooks/erp-reminder.mjs" --tool codex   (설치기가 써넣는다)
//   상대 경로(node .owner/hooks/…)로 등록하면 AI 가 cd 한 세션에서 "Cannot find module" 로 조용히 꺼진다 — install.mjs 「훅 등록」.
//   --debug   표준입력 없이 판정만 출력해 본다
//
// 판정
//   - company/routine.md 가 없으면(주간 루틴을 아직 정하지 않았으면) 아무 말도 하지 않는다.
//     루틴은 실사용 준비 단계에서 indeans-erp-routine 이 정한다. 그 전에는 알릴 것이 없다.
//   - .owner/last-review.json 의 at 이 7일 넘게 지났으면 알린다. 파일이 없거나 at 을 읽지 못하면 "기록 없음"으로 알린다.
//   - 알릴 때 .owner/precedents.md(판례 노트)에 승격을 기다리는 줄(승격 칸이 '대기')이 있으면 그 수도 함께 알린다.
//
// .owner/last-review.json 규약 — indeans-erp-routine 이 주간 점검을 마칠 때 적는다.
//   {
//     "at": "2026-10-08T10:30:00+09:00",      // 훅이 읽는 것은 이 한 칸뿐이다
//     "period": "2026-41",                     // 연-주 번호
//     "record": "company/checkups/2026-41.md",
//     "audit": "이상 없음 | 발견 N건 | 못 함 — 이유",
//     "by": "indeans-erp-routine"
//   }
//
// 도구별 출력 — 그 도구의 규약대로 나눈다(두 공식 문서 2026-10-08 확인). 종료 코드는 언제나 0.
//   Claude Code  https://code.claude.com/docs/en/hooks
//     SessionStart 는 hookSpecificOutput.additionalContext 를 모델이 읽는 맥락으로 넣는다.
//     → { "hookSpecificOutput": { "hookEventName": "SessionStart", "additionalContext": "…" } }
//       (모델이 첫 답 끝에 한 줄로 대표에게 알리게 하는 문장)
//   Codex        https://developers.openai.com/codex/hooks → https://learn.chatgpt.com/docs/hooks
//     공통 출력 필드 systemMessage 는 "UI 또는 이벤트 흐름에 경고로 보인다".
//     → { "systemMessage": "…" }  (대표가 화면에서 바로 읽는 문장)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const argv = process.argv.slice(2)
const flag = (n, d = null) => { const i = argv.indexOf(n); return i >= 0 ? (argv[i + 1] ?? d) : d }
const debug = argv.includes('--debug')
const tool = (flag('--tool', 'claude') || 'claude').toLowerCase() === 'codex' ? 'codex' : 'claude'
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000
// 날짜는 이 컴퓨터의 시간대로 적는다(한국 PC 면 한국 날짜). toISOString 은 세계 표준시라 밤 시간이면 하루가 어긋난다.
const ymd = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)

try {
  let input = {}
  if (!debug && !process.stdin.isTTY) {
    try {
      const raw = fs.readFileSync(0, 'utf8').replace(/^\uFEFF/, '')
      if (raw && raw.trim().startsWith('{')) input = JSON.parse(raw)
    } catch { /* 입력이 없어도 판정은 할 수 있다 */ }
  }

  const fromSelf = path.basename(path.dirname(HERE)) === '.owner' ? path.resolve(HERE, '..', '..') : null
  const candidates = [fromSelf, input.cwd, process.cwd()].filter(Boolean)
  const root = candidates.find((d) => { try { return fs.statSync(d).isDirectory() } catch { return false } }) || process.cwd()

  const say = (msg) => { if (debug) console.log(msg); process.exit(0) }
  if (!fs.existsSync(path.join(root, '.owner'))) say('판정: 설치되지 않은 폴더 — 조용히 통과')
  if (!fs.existsSync(path.join(root, 'company', 'routine.md'))) say('판정: 주간 루틴을 아직 정하지 않음(company/routine.md 없음) — 조용히 통과')

  let last = null
  try {
    const j = JSON.parse(fs.readFileSync(path.join(root, '.owner', 'last-review.json'), 'utf8').replace(/^\uFEFF/, ''))
    const d = new Date(j && j.at)
    if (!Number.isNaN(d.getTime())) last = d
  } catch { /* 기록이 없거나 깨졌으면 없는 것으로 본다 */ }

  const elapsed = last ? Date.now() - last.getTime() : Infinity
  if (elapsed < SEVEN_DAYS_MS) say(`판정: 마지막 주간 점검 ${ymd(last)} — 7일이 안 지남, 조용히 통과`)

  let waiting = 0
  try {
    const notes = fs.readFileSync(path.join(root, '.owner', 'precedents.md'), 'utf8')
    waiting = notes.split(/\r?\n/).filter((l) => /\|\s*대기\s*\|\s*$/.test(l)).length
  } catch { /* 판례 노트가 아직 없다 */ }

  const since = last
    ? `마지막 주간 점검 ${ymd(last)} (${Math.floor(elapsed / 86400000)}일 지남)`
    : '주간 점검 기록 없음(.owner/last-review.json)'
  // Claude — 모델이 읽는 맥락
  const forModel = [
    `[주간 점검 알림 — ${since}]`,
    '지금 받은 일을 멈추지 말고, 첫 답의 끝에 한 줄로만 대표에게 알린다: "주간 점검이 밀렸습니다 — 오늘 indeans-erp-routine 으로 할까요?"',
    '대표가 하자고 하면 indeans-erp-routine 실행 모드(일곱 단계 — 1단계에서 erp-auditor 감사 포함)를 돈다. 미루면 그대로 진행한다(다음 새 대화에서 다시 알린다).',
    waiting ? `판례 노트(.owner/precedents.md)에 규칙으로 승격을 기다리는 줄이 ${waiting}개 있다 — 주간 점검 때 함께 처리한다.` : '',
  ].filter(Boolean).join(' ')
  // Codex — 대표가 화면에서 바로 읽는 문장
  const forOwner = [
    last ? `주간 점검이 밀렸습니다 — 마지막 점검 ${ymd(last)}, ${Math.floor(elapsed / 86400000)}일 지남.` : '주간 점검 기록이 아직 없습니다(.owner/last-review.json).',
    '"indeans-erp-routine 스킬로 이번 주 점검을 하자"라고 말하면 시작합니다. 미뤄도 작업은 그대로 됩니다.',
    waiting ? `판례 노트에 규칙으로 올릴 줄이 ${waiting}개 기다리고 있습니다.` : '',
  ].filter(Boolean).join(' ')

  if (debug) say(`판정: 알림\n[claude] ${forModel}\n[codex] ${forOwner}`)
  if (tool === 'codex') process.stdout.write(JSON.stringify({ systemMessage: forOwner }) + '\n')
  else process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: forModel } }) + '\n')
} catch { /* 알림 훅은 어떤 경우에도 대화를 막지 않는다 */ }
process.exit(0)
