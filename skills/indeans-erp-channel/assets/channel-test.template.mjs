#!/usr/bin/env node
// 알림 창구에 시험 문장 한 줄을 보내 본다. 이 파일을 scripts/channel-test.mjs 로 복사해 쓴다.
// 사용: node scripts/channel-test.mjs ["보낼 문장"]
//
// 값은 프로젝트 맨 위 .env.local 에서 읽는다. 이 파일에 값을 직접 적지 않는다.
//   DIGEST_DISCORD_URL=...
//   DIGEST_TELEGRAM_TOKEN=...
//   DIGEST_TELEGRAM_CHAT_ID=...
// 필요한 것: Node 18 이상(그 아래면 fetch 가 없어 안내하고 멈춘다). 다른 준비물은 없다.
import fs from 'node:fs'
import path from 'node:path'

if (typeof fetch !== 'function') {
  console.error('이 컴퓨터의 Node 가 오래된 버전입니다(18 이상이 필요합니다).')
  console.error('`node -v` 로 확인하고, 낮으면 최신 LTS 로 올린 뒤 다시 실행하세요.')
  process.exit(3)
}

// .env.local 읽기 — 값에 =, #, : 가 들어 있어도 첫 = 까지만 이름으로 본다.
const envPath = path.resolve(process.cwd(), '.env.local')
if (!fs.existsSync(envPath)) {
  console.error(`.env.local 이 없습니다: ${envPath}`)
  console.error('indeans-erp-channel 스킬 5단계의 세 줄을 먼저 넣으세요.')
  process.exit(1)
}
const env = {}
for (const raw of fs.readFileSync(envPath, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)) {
  const line = raw.trim()
  if (!line || line.startsWith('#')) continue
  const eq = line.indexOf('=')
  if (eq < 1) continue
  let value = line.slice(eq + 1).trim()
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1)
  }
  env[line.slice(0, eq).trim()] = value
}

const message = process.argv.slice(2).join(' ') || '시험 발송입니다. 이 문장이 보이면 창구가 열렸습니다.'
const results = []

async function send(name, run) {
  try {
    const res = await run()
    const ok = res.status >= 200 && res.status < 300
    let detail = ''
    if (!ok) detail = (await res.text().catch(() => '')).slice(0, 200)
    results.push({ name, status: res.status, ok, detail })
  } catch (e) {
    results.push({ name, status: 0, ok: false, detail: e.message })
  }
}

if (env.DIGEST_DISCORD_URL) {
  await send('디스코드', () => fetch(env.DIGEST_DISCORD_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: message }),
  }))
} else {
  results.push({ name: '디스코드', status: null, ok: false, detail: '.env.local 에 DIGEST_DISCORD_URL 이 없습니다' })
}

// 텔레그램 주소 — 평소에는 그대로 둔다. 연습용 수신 서버로 바꿔 볼 때만 DIGEST_TELEGRAM_API_BASE 를 준다.
const telegramBase = String(
  process.env.DIGEST_TELEGRAM_API_BASE ?? env.DIGEST_TELEGRAM_API_BASE ?? 'https://api.telegram.org',
).replace(/\/+$/, '')

if (env.DIGEST_TELEGRAM_TOKEN && env.DIGEST_TELEGRAM_CHAT_ID) {
  await send('텔레그램', () => fetch(`${telegramBase}/bot${env.DIGEST_TELEGRAM_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: env.DIGEST_TELEGRAM_CHAT_ID, text: message }),
  }))
} else {
  results.push({ name: '텔레그램', status: null, ok: false, detail: '.env.local 에 DIGEST_TELEGRAM_TOKEN·DIGEST_TELEGRAM_CHAT_ID 가 없습니다' })
}

console.log('')
console.log('보낸 문장: ' + message)
for (const r of results) {
  const head = r.ok ? '보냄' : '실패'
  const code = r.status === null ? '설정 없음' : `응답 ${r.status}`
  console.log(`- ${r.name}: ${head} (${code})${r.detail ? ' — ' + r.detail.replace(/\s+/g, ' ') : ''}`)
}
console.log('')
console.log('응답이 200대여도 도착의 증거는 아닙니다. 폰에서 실제로 문장이 보이는지 눈으로 확인하세요.')
console.log('안 오면 스킬의 references/discord.md · references/telegram.md 의 "안 올 때" 절을 순서대로 봅니다.')

// 하나라도 실패하면 1 로 끝낸다(사람이 놓치지 않게).
// process.exit() 로 즉시 끊지 않는다 — 실제 인터넷 발송이 섞이면 윈도우에서 끝나는 도중에 멈춰
// 엉뚱한 종료 코드(127)가 나온다. 아래처럼 적어 두면 할 일을 마친 뒤 이 값으로 끝난다.
process.exitCode = results.some((r) => !r.ok) ? 1 : 0
