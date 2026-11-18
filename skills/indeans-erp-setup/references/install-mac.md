# 맥 설치 절차

> **1일 차 라이브 판(11-17 리허설 반영)** — 공개 번들 v3.2 원본에서 수업 단위 말만 바꿨다. 비교용 원본: `proposed-skills/_원본/`.

이 파일은 `indeans-erp-setup` 스킬이 읽는다. 위에서부터 순서대로 하고, 각 단계가 끝나면 확인 명령의 결과를 대표에게 보여 준다.

기준일 2026-09. 명령이 바뀌어 안 되면 각 항목의 공식 주소를 다시 열어 확인한다.

## 0. 터미널 여는 법

- `command + space` → `터미널` 입력 → 실행.
- 맥OS 13 이상이어야 한다. 애플 메뉴 → "이 Mac에 관하여"에서 확인.
- 명령을 붙여 넣고 `enter`를 친다. 비밀번호를 물으면 맥 로그인 비밀번호다(화면에 아무것도 안 보이는 게 정상이다).

## 1. Node.js (LTS)

앱을 만들고 실행하는 데 쓰는 기본 도구다.

1. https://nodejs.org 접속
2. **LTS** 표시가 붙은 버튼을 내려받는다(2026-09 기준 24번대). `.pkg` 파일이 받아진다.
3. 설치 마법사는 기본값 그대로 진행.
4. 터미널을 닫고 새로 연다.

확인:

```
node -v
npm -v
```

Homebrew를 이미 쓰는 경우엔 이것도 된다:

```
brew install node
```

## 2. Git

맥에는 대개 이미 있다. 먼저 확인부터 한다.

```
git --version
```

- 버전이 나오면 그대로 쓴다.
- "개발자 도구를 설치하시겠습니까" 창이 뜨면 **설치**를 누른다(몇 분 걸린다).

처음 쓰는 경우 이름·메일을 한 번 등록한다.

```
git config --global user.name "이름"
git config --global user.email "가입에쓴메일주소"
```

## 3. Claude Code

공식 설치:

```
curl -fsSL https://claude.ai/install.sh | bash
```

설치 후 터미널을 닫고 새로 연다. 확인:

```
claude --version
claude doctor
```

로그인: 프로젝트 폴더에서 `claude`를 실행하면 대화가 열린다. 처음이면 브라우저가 뜨고 로그인을 요구한다. **Claude Pro 이상 유료 구독이 필요하다.**

Homebrew를 쓰는 경우 대안:

```
brew install --cask claude-code
```

Homebrew로 깐 것은 자동 갱신이 안 된다. 가끔 `brew upgrade claude-code`를 돌린다.

## 4. Codex

공식 설치:

```
curl -fsSL https://chatgpt.com/codex/install.sh | sh
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

둘 중 하나만 돼도 수업은 진행된다. 5분 안에 안 되면 `미설치`로 적고 넘어간다.

## 5. 프로젝트 폴더 만들기

```
mkdir -p ~/Documents/my-erp
cd ~/Documents/my-erp
```

- 폴더 이름은 영문 소문자와 하이픈만(`my-erp`, `hana-works`). 한글·공백·괄호 금지.
- iCloud 드라이브가 켜진 **데스크탑/서류 폴더**는 피한다. 파일이 "내려받기 대기" 상태가 되면 명령이 실패한다. 홈 폴더 바로 아래(`~/work/my-erp`)를 권한다.

폴더가 준비되면 그 폴더에서 `claude` 또는 `codex`를 실행한다.

## 6. 확인 한 번에 하기

```
node -v; git --version; claude --version; codex --version
```

네 줄이 다 숫자로 나오면 설치는 끝이다.

## 7. 애플 실리콘·인텔 구분

- 최근 맥(M1 이후)과 인텔 맥 모두 위 명령이 그대로 된다.
- 설치 중 "이 아키텍처에서는 지원하지 않습니다"가 나오면 맥OS 버전이 13 미만일 가능성이 크다. 업데이트하거나 다른 노트북으로 진행한다.

## 8. 번들 설치 — 스킬·감독 에이전트·검수 훅·디자인 선택창을 한 번에

저장소를 내려받은 폴더에서(압축을 풀었으면 그 폴더에서) 아래 한 줄을 실행한다.

```
node install.mjs --project ~/Documents/my-erp --target both
```

- `--project` 뒤는 **내 프로젝트 폴더 경로**다. 위에서 만든 폴더 경로를 그대로 쓴다.
- `--target both` 는 Claude Code·Codex 양쪽에 넣으라는 뜻이다. 한 도구만 쓰면 `claude` 또는 `codex` 로 준다.
- 여러 번 돌려도 안전하다. 대표가 고친 파일은 덮지 않고 `<이름>.new` 로 옆에 저장된다.
- 마지막에 "새 대화를 열고 `indeans-erp-setup` 스킬을 읽고 시작해 줘" 안내가 나온다. 그대로 하면 된다.

설치가 끝나면 프로젝트 폴더에 `.claude/skills`·`.agents/skills`·`.owner/hooks`·`.owner/design`·`course/` 가 생긴다.

## 9. 화면 캡처 도구(playwright) — 앱을 만든 뒤에

작업 보고서에 넣을 화면 사진을 찍는 도구다. **초안 앱을 만든 뒤**(프로젝트에 `package.json` 이 생긴 뒤) 프로젝트 폴더에서 한 번만 설치한다.

```
npm i -D playwright
npx playwright install chromium
```

두 번째 줄은 브라우저를 내려받아 2~4분 걸린다. 회사 네트워크가 막으면 붙잡지 않는다 — 사진 없이도 수업은 진행된다.

## 10. 수업 전날까지 해 둘 것 (사전 안내)

- [ ] Node.js LTS 설치 (`node -v` 로 숫자 확인)
- [ ] Git 설치 (`git --version`)
- [ ] Claude Code 또는 Codex 중 **최소 하나** 설치·로그인(유료 구독 필요)
- [ ] GitHub 가입 + 비공개(Private) 빈 저장소 1개
- [ ] Supabase 가입(GitHub로 로그인) — 조직까지. 프로젝트는 다음 단계에 만든다
- [ ] Vercel 가입(GitHub로 로그인, 무료 Hobby)
- [ ] (선택) 디스코드·텔레그램 가입 — 운영 보고 단계에서 쓴다
- [ ] 프로젝트 폴더 만들기(영문 이름, 동기화 폴더 밖)
- [ ] 번들 설치(위 8번)

계정 가입 순서·만들 것·적어 둘 것은 `accounts.md`에 있다. GitHub·Supabase·Vercel 세 계정은 **다음 단계 시작 전까지 필수**다.

하나도 못 했어도 1일 차에 따라잡는 순서가 있다(`indeans-erp-setup` 스킬 절차 12, 60분). 다만 **AI 이용료와 계정은 대표 본인 것**이라 결제·로그인·가입은 미리 해 두는 쪽이 수업 시간을 아낀다.
