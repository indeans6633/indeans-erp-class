#!/usr/bin/env node
// 파일·폴더·주소를 이 컴퓨터의 기본 프로그램으로 연다. 네트워크 호출 없음.
// Windows·macOS·리눅스에서 같은 명령으로 동작하게 하려고 둔 스크립트다.
// 사용: node .owner/hooks/open.mjs <파일 경로 또는 주소>
//   예: node .owner/hooks/open.mjs .owner/design/index.html
//       node .owner/hooks/open.mjs http://localhost:5173
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const target = process.argv.slice(2).filter((a) => !a.startsWith('--'))[0]
if (!target) {
  console.error('열 대상을 지정하세요. 예: node .owner/hooks/open.mjs .owner/design/index.html')
  process.exit(1)
}

const isUrl = /^(https?|file):\/\//i.test(target)
let what = target
if (isUrl) {
  // 이 스크립트는 수업 중 "내 컴퓨터에서 도는 앱"이나 프로젝트 안 파일을 여는 용도다.
  // 그 밖의 주소(바깥 사이트)는 막지 않되, 무엇을 여는지 한 줄 알린 뒤 연다 —
  // 스킬 문서나 붙여넣은 명령에 섞여 든 주소가 조용히 브라우저에서 열리는 일을 막는다.
  const local = /^(https?):\/\/(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)(:\d+)?(\/|$)/i.test(target)
  if (!/^file:\/\//i.test(target) && !local) {
    console.log('알림: 이 컴퓨터에서 도는 주소나 프로젝트 안 파일이 아니라 바깥 주소입니다. 그대로 엽니다.')
    console.log(`  ${target}`)
    console.log('  주소가 낯설면 지금 창을 닫고 대표에게 어떤 주소인지 먼저 확인하세요.')
  }
} else {
  const abs = path.resolve(process.cwd(), target)
  if (!fs.existsSync(abs)) {
    console.error(`그 자리에 파일이나 폴더가 없습니다: ${abs}`)
    console.error('경로를 프로젝트 폴더 기준으로 다시 확인하세요.')
    process.exit(1)
  }
  what = abs
}

let child
try {
  if (process.platform === 'win32') {
    // cmd 의 start 는 첫 인자를 창 제목으로 먹으므로 빈 제목("")을 하나 넣는다.
    // 따옴표 안에서는 & 같은 글자가 그대로 전달된다. 따옴표 자체는 미리 지운다.
    const safe = String(what).replaceAll('"', '')
    child = spawn(process.env.COMSPEC || 'cmd.exe', ['/d', '/s', '/c', `start "" "${safe}"`], {
      stdio: 'ignore',
      detached: true,
      windowsHide: true,
      windowsVerbatimArguments: true,
    })
  } else if (process.platform === 'darwin') {
    child = spawn('open', [what], { stdio: 'ignore', detached: true })
  } else {
    child = spawn('xdg-open', [what], { stdio: 'ignore', detached: true })
  }
} catch (e) {
  console.error(`여는 데 실패했습니다: ${e.message}`)
  console.error(`직접 열어 보세요: ${what}`)
  process.exit(1)
}

child.on('error', (e) => {
  console.error(`여는 데 실패했습니다: ${e.message}`)
  console.error(`직접 열어 보세요: ${what}`)
  process.exit(1)
})
child.unref()
console.log(`열었습니다: ${what}`)
console.log('창이 뜨지 않으면 위 경로를 직접 열어 보세요.')
