# 윈도우 설치 절차

> **1일 차 라이브 판(11-17 리허설 반영)** — 공개 번들 v3.2 원본에서 수업 단위 말만 바꿨다. 비교용 원본: `proposed-skills/_원본/`.

이 파일은 `indeans-erp-setup` 스킬이 읽는다. 위에서부터 순서대로 하고, 각 단계가 끝나면 확인 명령의 결과를 대표에게 보여 준다.

기준일 2026-09. 명령이 바뀌어 안 되면 각 항목의 공식 주소를 다시 열어 확인한다.

## 0. 터미널 여는 법

- 시작 버튼 옆 검색창에 `PowerShell` 입력 → **Windows PowerShell** 실행.
- 관리자 권한은 **필요 없다.** "관리자 권한으로 실행"을 하라는 안내가 나오면 그 설치 방법은 건너뛴다.
- 프롬프트가 `PS C:\Users\...>` 모양이면 PowerShell이 맞다. `PS` 없이 `C:\Users\...>`면 CMD다 — 명령이 다르므로 PowerShell로 다시 연다.

## 1. Node.js (LTS)

앱을 만들고 실행하는 데 쓰는 기본 도구다. 브라우저에서:

1. https://nodejs.org 접속
2. 첫 화면의 **LTS** 표시가 붙은 버튼을 내려받는다(2026-09 기준 24번대).
3. 설치 마법사는 기본값 그대로 "다음"만 누른다. "Automatically install the necessary tools" 체크는 **해제**해도 된다(빌드 도구까지 받느라 오래 걸린다).
4. 설치가 끝나면 **PowerShell 창을 닫고 새로 연다.**

확인:

```
node -v
npm -v
```

`v24.x.x`(또는 `v22.x.x` 이상)와 npm 버전이 나오면 된다.

## 2. Git

앱을 되돌리고 보관하는 도구다.

1. https://git-scm.com/downloads/win 에서 64-bit 설치본을 받는다.
2. 설치 중 선택지가 많지만 **전부 기본값**으로 둔다.
3. 설치 후 PowerShell을 새로 연다.

확인:

```
git --version
```

처음 쓰는 경우 이름·메일을 한 번 등록한다(커밋 기록에 남는 이름이다).

```
git config --global user.name "이름"
git config --global user.email "가입에쓴메일주소"
```

## 3. Claude Code

공식 설치(PowerShell):

```
irm https://claude.ai/install.ps1 | iex
```

- `'irm' is not recognized...` 오류가 나면 지금 창이 CMD다. PowerShell을 다시 연다.
- 설치 후 **창을 닫고 새로 연다.**
- Git for Windows가 깔려 있으면 Claude Code가 그걸 함께 쓴다(2번을 먼저 한 이유).

확인:

```
claude --version
claude doctor
```

로그인: 프로젝트 폴더에서 `claude`를 실행하면 대화가 열린다. 처음이면 브라우저가 뜨고 로그인을 요구한다. **Claude Pro 이상 유료 구독이 필요하다.**

대안(위 명령이 막힐 때):

```
winget install Anthropic.ClaudeCode
```

winget으로 깐 것은 자동 갱신이 안 된다. 가끔 `winget upgrade Anthropic.ClaudeCode`를 돌린다.

## 4. Codex

공식 설치(PowerShell):

```
irm https://chatgpt.com/codex/install.ps1 | iex
```

스크립트 실행이 막힌다는 오류가 나오면 공식 문서에 적힌 이 형태로 한 번 더 해 본다:

```
powershell -ExecutionPolicy ByPass -c "irm https://chatgpt.com/codex/install.ps1 | iex"
```

Node.js가 이미 있으면 이 방법도 된다:

```
npm install -g @openai/codex
```

확인·로그인:

```
codex --version
codex login
codex login status
```

`codex login`은 브라우저를 열어 ChatGPT 로그인을 요구한다. **ChatGPT Plus 이상 구독이 필요하다.**

- 윈도우 지원은 아직 "실험적"으로 표시된다. 잘 안 되면 붙잡지 말고 `미설치`로 적고 Claude Code만으로 진행한다. 수업은 진행된다.
- 리눅스 도구에 익숙한 경우에만 WSL(Windows Subsystem for Linux) 안에서 설치하는 방법도 있다. 초보 대표에게는 권하지 않는다.

## 5. 프로젝트 폴더 만들기

```
New-Item -ItemType Directory -Force "$env:USERPROFILE\Documents\my-erp"
cd "$env:USERPROFILE\Documents\my-erp"
```

- 폴더 이름은 영문 소문자와 하이픈만(`my-erp`, `hana-works`). 한글·공백·괄호 금지.
- OneDrive로 동기화되는 문서 폴더라면, 동기화 밖의 경로(예: `C:\work\my-erp`)를 권한다. 동기화 중 파일 잠김으로 오류가 난다.

폴더가 준비되면 그 폴더에서 `claude` 또는 `codex`를 실행한다.

## 6. 확인 한 번에 하기

```
node -v; git --version; claude --version; codex --version
```

네 줄이 다 숫자로 나오면 설치는 끝이다.

## 7. 번들 설치 — 스킬·감독 에이전트·검수 훅·디자인 선택창을 한 번에

저장소를 내려받은 폴더에서(압축을 풀었으면 그 폴더에서) 아래 한 줄을 실행한다.

```
node install.mjs --project "$env:USERPROFILE\Documents\my-erp" --target both
```

- `--project` 뒤는 **내 프로젝트 폴더 경로**다. 위에서 만든 폴더 경로를 그대로 쓴다.
- `--target both` 는 Claude Code·Codex 양쪽에 넣으라는 뜻이다. 한 도구만 쓰면 `claude` 또는 `codex` 로 준다.
- 여러 번 돌려도 안전하다. 대표가 고친 파일은 덮지 않고 `<이름>.new` 로 옆에 저장된다.
- 마지막에 "새 대화를 열고 `indeans-erp-setup` 스킬을 읽고 시작해 줘" 안내가 나온다. 그대로 하면 된다.

설치가 끝나면 프로젝트 폴더에 `.claude/skills`·`.agents/skills`·`.owner/hooks`·`.owner/design`·`course/` 가 생긴다.

## 8. 화면 캡처 도구(playwright) — 앱을 만든 뒤에

작업 보고서에 넣을 화면 사진을 찍는 도구다. **초안 앱을 만든 뒤**(프로젝트에 `package.json` 이 생긴 뒤) 프로젝트 폴더에서 한 번만 설치한다.

```
npm i -D playwright
npx playwright install chromium
```

두 번째 줄은 브라우저를 내려받아 2~4분 걸린다. 회사 네트워크가 막으면 붙잡지 않는다 — 사진 없이도 수업은 진행된다.

## 9. 수업 전날까지 해 둘 것 (사전 안내)

- [ ] Node.js LTS 설치 (`node -v` 로 숫자 확인)
- [ ] Git 설치 (`git --version`)
- [ ] Claude Code 또는 Codex 중 **최소 하나** 설치·로그인(유료 구독 필요)
- [ ] GitHub 가입 + 비공개(Private) 빈 저장소 1개
- [ ] Supabase 가입(GitHub로 로그인) — 조직까지. 프로젝트는 다음 단계에 만든다
- [ ] Vercel 가입(GitHub로 로그인, 무료 Hobby)
- [ ] (선택) 디스코드·텔레그램 가입 — 운영 보고 단계에서 쓴다
- [ ] 프로젝트 폴더 만들기(영문 이름, 동기화 폴더 밖)
- [ ] 번들 설치(위 7번)

계정 가입 순서·만들 것·적어 둘 것은 `accounts.md`에 있다. GitHub·Supabase·Vercel 세 계정은 **다음 단계 시작 전까지 필수**다.

하나도 못 했어도 1일 차에 따라잡는 순서가 있다(`indeans-erp-setup` 스킬 절차 12, 60분). 다만 **AI 이용료와 계정은 대표 본인 것**이라 결제·로그인·가입은 미리 해 두는 쪽이 수업 시간을 아낀다.
