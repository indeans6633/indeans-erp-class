#!/usr/bin/env node
// 돌고 있는 내 앱 화면을 사진으로 찍는다. 휴대폰 폭(375)과 PC 폭(1280) 두 장이 기본이다.
// 네트워크 호출 없음 — 내 컴퓨터에서 돌고 있는 주소만 연다.
//
// 먼저 다른 창에서 `npm run dev` 로 앱을 띄워 두고 실행한다.
// 사용: node .owner/hooks/capture.mjs --url http://localhost:5173 [옵션]
//   --path "/,/orders"      찍을 화면 경로(쉼표로 여러 개, 기본 "/")
//                           윈도우의 Git Bash 에서는 `/` 가 컴퓨터 폴더 경로로 바뀐다 — `--path "//orders"` 처럼
//                           앞에 / 를 하나 더 붙이거나 PowerShell 에서 실행한다(바뀐 값은 알아보고 되돌린다).
//   --widths "375,1280"     찍을 폭(기본 "375,1280")
//   --out reports/shots     저장 폴더(기본 reports/shots/<오늘 날짜>)
//   --name list             파일 이름 앞부분(기본은 경로에서 만든다)
//   --wait 1500             화면이 그려질 때까지 기다리는 밀리초(기본 1500)
//   --full                  화면 전체를 위아래로 다 찍는다(기본은 보이는 만큼)
import fs from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)
const flag = (n, d = null) => { const i = args.indexOf(n); return i >= 0 ? (args[i + 1] ?? d) : d }
const has = (n) => args.includes(n)

const url = flag('--url', 'http://localhost:5173')

// 윈도우의 Git Bash 는 인자로 준 "/" 나 "/orders" 를 윈도우 경로(C:/Program Files/Git/orders)로 바꿔 버린다.
// 그대로 두면 엉뚱한 주소를 찍고도 성공한 것처럼 보이므로, 바뀐 값을 알아보고 되돌린다.
const unmangle = (p) => {
  const m = p.match(/^[A-Za-z]:[\\/](.*)$/)
  if (!m) return p
  let tail = m[1].replace(/\\/g, '/')
  for (let prev = null; tail !== prev;) {            // Git 설치 폴더 이름이 겹겹이 붙으므로 없어질 때까지 벗긴다
    prev = tail
    tail = tail.replace(/^(Program Files \(x86\)|Program Files|Git|usr|mingw64)\/?/i, '')
  }
  const back = '/' + tail.replace(/^\/+/, '')
  console.error(`셸이 화면 경로를 컴퓨터 폴더 경로로 바꿨습니다: "${p}" → "${back}" 로 보고 진행합니다.`)
  console.error('그대로 주려면 --path "//orders" 처럼 앞에 / 를 하나 더 붙이거나, PowerShell 에서 실행하세요.')
  return back
}
const paths = String(flag('--path', '/')).split(',').map((s) => unmangle(s.trim())).filter(Boolean)
const widths = String(flag('--widths', '375,1280')).split(',').map((s) => Number(s.trim())).filter((n) => n > 0)
const wait = Number(flag('--wait', '1500'))
const nameArg = flag('--name')
const today = new Date().toISOString().slice(0, 10)
const outDir = path.resolve(process.cwd(), flag('--out', path.join('reports', 'shots', today)))

if (!/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i.test(url) && !has('--allow-remote')) {
  console.error(`내 컴퓨터에서 돌고 있는 주소만 찍습니다(현재 값: ${url}).`)
  console.error('`npm run dev` 가 알려 준 주소를 --url 로 주세요. 배포된 주소를 찍어야 하면 --allow-remote 를 붙이세요.')
  process.exit(1)
}

let chromium
try {
  ;({ chromium } = await import('playwright'))
} catch {
  console.error('화면을 찍는 도구(playwright)가 이 프로젝트에 아직 없습니다.')
  console.error('내 프로젝트 폴더에서 아래 두 줄을 실행한 뒤 다시 시도하세요. 한 번만 하면 됩니다.')
  console.error('  npm i -D playwright')
  console.error('  npx playwright install chromium')
  process.exit(3)
}

const slugOf = (p) => {
  const s = p.replace(/^\/+|\/+$/g, '').replace(/[^\p{L}\p{N}\-_]+/gu, '-')
  return s || 'home'
}

fs.mkdirSync(outDir, { recursive: true })

const shots = []
const problems = []
let browser
try {
  browser = await chromium.launch()
} catch (e) {
  console.error(`브라우저를 띄우지 못했습니다: ${e.message}`)
  console.error('한 번만 `npx playwright install chromium` 을 실행한 뒤 다시 시도하세요.')
  process.exit(3)
}

for (const p of paths) {
  for (const w of widths) {
    const context = await browser.newContext({
      viewport: { width: w, height: w <= 430 ? 812 : 900 },
      deviceScaleFactor: 1,
      isMobile: w <= 430,
      hasTouch: w <= 430,
    })
    const page = await context.newPage()
    const errors = []
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
    page.on('pageerror', (e) => errors.push(String(e.message || e)))
    const clean = '/' + String(p).replace(/^\/+/, '')   // 앞에 / 를 여럿 붙여 준 경우도 한 개로 맞춘다
    const full = url.replace(/\/+$/, '') + clean
    const name = `${nameArg || slugOf(clean)}-${w}.png`
    const file = path.join(outDir, name)
    try {
      await page.goto(full, { waitUntil: 'domcontentloaded', timeout: 20000 })
      await page.waitForTimeout(wait)
      await page.screenshot({ path: file, fullPage: has('--full') })
      shots.push({ file, url: full, width: w, errors })
    } catch (e) {
      problems.push(`${full} (${w}px) — ${e.message.split('\n')[0]}`)
    }
    await context.close()
  }
}
await browser.close()

if (shots.length) {
  console.log(`사진 ${shots.length}장을 찍었습니다.`)
  for (const s of shots) {
    console.log(`  ${s.width}px  ${s.url}`)
    console.log(`    ${s.file}`)
    if (s.errors.length) {
      console.log(`    화면이 낸 오류 ${s.errors.length}건:`)
      s.errors.slice(0, 5).forEach((t) => console.log(`      - ${t.slice(0, 200)}`))
    }
  }
}
if (problems.length) {
  console.error('아래 화면은 찍지 못했습니다:')
  problems.forEach((t) => console.error('  - ' + t))
  console.error('앱이 돌고 있는지(`npm run dev`), 주소와 경로가 맞는지 확인하세요.')
  process.exit(shots.length ? 4 : 1)
}
if (!shots.length) {
  console.error('찍은 사진이 없습니다.')
  process.exit(1)
}
console.log('보고서에 넣을 때는 위 경로를 그대로 --shot 으로 주세요.')
