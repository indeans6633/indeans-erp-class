# 앱 뼈대 만들기 (Vite 프로젝트 · 화면 사진 도구 · 파일 구조)

> **1일 차 라이브 판(11-17 리허설 반영)** — 공개 번들 v3.2 원본에서 수업 단위 말만 바꿨다. 비교용 원본: `proposed-skills/_원본/`.

`indeans-erp-draft` 절차 3~5가 읽는다. 명령 원문은 여기에 있고, SKILL.md는 순서만 관리한다. 위에서부터 그대로 한다.

---

## 1. Vite 프로젝트 만들기

프로젝트 폴더에는 이미 `company/`·`course/`·`.owner/`(1일 차 산출물과 설치본)가 있다. **빈 폴더가 아니면 생성기가 기존 파일을 지울지 물어 온다.** 그 질문을 피하려고 임시 폴더에 만든 뒤 옮긴다.

```
npm create vite@latest .vite-init -- --template react-ts
```

윈도우 PowerShell:

```
Copy-Item -Path ".vite-init\*" -Destination "." -Recurse -Force
Remove-Item -Recurse -Force ".vite-init"
```

맥·리눅스:

```
cp -R .vite-init/. .
rm -rf .vite-init
```

- **생성기가 "기존 파일을 지울까요"라고 물으면 절대 고르지 않는다.** `company/` 문서가 날아간다. 이 질문이 나왔다면 임시 폴더(`.vite-init`)가 아니라 프로젝트 폴더에 만들려 한 것이다 — 취소하고 위 명령을 다시 본다.
- 옮긴 뒤 `package.json`의 `name`이 임시 폴더 이름(`vite-init`)으로 들어가 있다. **프로젝트 폴더 이름으로 바꾼다** — 다음 단계 배포 때 이 이름이 주소에 쓰인다.
- 숨은 파일(`.gitignore`)도 함께 와야 한다. 안 왔으면 따로 복사한다. `.gitignore`에 `node_modules`·`.env.local`·`.owner/tmp/` 세 줄이 있는지 확인하고 빠진 줄은 넣는다(`.owner/tmp/`는 스킬이 쓰고 버리는 임시 자리라 커밋하지 않는다). 생성기의 `.gitignore`가 원래 있던 것을 덮었으면 덮이기 전 줄(`git diff .gitignore`)을 되살린다.
- 프로젝트에 이미 `README.md`가 있으면 덮이지 않게 주의한다(절차 15에서 우리 것으로 다시 쓴다).
- **`src/styles/`(`tokens.css`·`base.css`·`layout.css`)를 지우지 않는다.** 1일 차에 디자인 스킬이 넣어 둔 파일이다. 생성기가 덮었으면 `git restore src/styles`로 되살린다.

그다음:

```
npm install
```

2~5분 걸린다. 도중에 끊지 않는다.

## 2. 화면 사진 찍는 도구 넣기

작업 보고서에 넣을 사진을 찍는 도구다. `package.json`이 생긴 지금 한 번만 설치한다.

```
npm i -D playwright
npx playwright install chromium
```

두 번째 줄은 브라우저를 내려받아 2~4분 걸린다. 네트워크가 막으면 붙잡지 않는다 — 사진 없이도 보고서는 만들어진다. `.owner/state.md`의 "미해결 문제"에서 `화면 사진 도구 — 앱 만든 뒤 설치` 줄을 지운다(설치했을 때만).

## 3. 파일 구조

아래 구조로 만든다. **라우터 같은 추가 라이브러리를 설치하지 않는다** — 화면 전환은 `useState`로 한다.

```
src/
  main.tsx          ← tokens.css·base.css·layout.css 를 여기서 불러온다
  App.tsx           ← 화면 3개 전환 + 아래 탭(또는 상단 탭)
  types.ts          ← 한 건의 모양과 상태 값
  data/sample.ts    ← 예시 데이터 8~12건
  lib/storage.ts    ← 브라우저에 저장하고 읽어오기
  screens/ListScreen.tsx
  screens/DetailScreen.tsx
  screens/TodayScreen.tsx
  styles/tokens.css ← 디자인 스킬이 넣은 토큰(고른 디자인 코드가 첫 줄 주석에)
  styles/base.css   ← 디자인 스킬이 넣은 공통 바탕
  styles/layout.css ← 디자인 스킬이 넣은 고른 구조의 뼈대
company/
  screens.md        ← 화면별 설계 선언(이 스킬이 만든다 — assets/screens.template.md)
```

- 파일 이름·폴더 이름은 위와 똑같이 쓴다. 다음 스킬과 감독 에이전트가 이 경로를 찾는다.
- `src/App.css`·`src/index.css`·`src/assets/`를 지운다. **위 목록에 없는 것은 `src/`에서 전부 지운다**(생성기 판에 따라 들어 있는 파일이 다르다). 단 `styles/` 폴더는 남긴다.
- 지운 뒤 `src/main.tsx`가 아직 `./index.css`를 부르고 있으면 그 줄을 세 줄(`import './styles/tokens.css'`·`import './styles/base.css'`·`import './styles/layout.css'`)로 바꾼다 — **이걸 빠뜨리면 고른 디자인이 화면에 안 먹는다.**
- `index.html`의 `<html lang="en">`을 `lang="ko"`로, `<title>`을 회사 앱 이름으로 바꾼다. 화면 읽기 프로그램과 브라우저 탭에 그대로 보인다.
- 화면 확대를 막는 설정(`user-scalable=no`·`maximum-scale=1`)을 넣지 않는다. 입력 칸 확대는 `var(--fs-input)`로 막는다.

## 4. 막혔을 때

- **`npm create`가 버전을 묻거나 멈춘다** → 화면의 질문을 그대로 대표에게 읽어 주고, 기본값(Enter)으로 넘긴다. 템플릿은 명령에 이미 `react-ts`로 들어 있다.
- **`npm install`이 5분 넘게 멈춘다** → 네트워크를 바꿔(휴대폰 테더링) 다시 한다. 프로젝트가 OneDrive·iCloud 동기화 폴더 안이면 밖으로 옮긴다.
- **`Copy-Item`에서 "액세스 거부"** → 에디터·탐색기에서 그 폴더를 열어 둔 것이다. 닫고 다시 한다.
