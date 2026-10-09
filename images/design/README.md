# 디자인 선택창

앱을 만들기 전에 **화면 구조 → 스타일(추천 조합) → 필요하면 세부 조절(색·내 색·모서리·밀도·밝기)** 순서로, 눈으로 보며 고르는 선택창이다.
고르는 즉시 같은 가상 회사(○○상사)·같은 예시 데이터로 그린 화면 3개(목록 · 상세·입력 · 오늘 현황)가 그 조합으로 다시 그려진다. 휴대폰 폭(375)과 PC 폭(1280)을 바꿔 가며 볼 수 있다. 달라지는 것은 모양과 색뿐이다 — 그래야 디자인만 비교된다.

색은 미리 만든 파일이 아니라 **색 엔진**(`app/color-engine.js`)이 그 자리에서 계산한다. 그래서 '내 색'에 아무 색을 넣어도 밝게·어둡게 두 벌이 생기고, 글자 대비(4.5:1)와 입력 칸 테두리 대비(3:1)를 어길 수 없다.
인터넷 연결·외부 라이브러리 없이 돈다. 글꼴(Pretendard·고운바탕)은 `fonts/` 에 들어 있다. 이 컴퓨터 밖으로 아무것도 보내지 않는다.

## 고르는 방법 (수강생·대표)

보통은 AI 가 연다. 1차 인터뷰가 끝나면(또는 대표가 부르면) `indeans-erp-design` 스킬이 아래 명령을 실행하고, 브라우저에 선택창이 뜬다.

```
node .owner/hooks/design-pick.mjs
```

1. **① 화면 구조** 셋 중 하나 — 회사 일이 어떤 모양으로 보여야 편한지로 고른다.
2. **② 스타일** — 이름 붙은 추천 조합 일곱 중 하나. 칸마다 작은 견본(그 조합의 바탕·상자·모서리·그림자·제목 글꼴·버튼)이 있다.
3. **③ 세부 조절**(접혀 있다 — 원할 때만 연다): 색 10가지 + **내 색**(색 칩을 움직이거나 색 코드 `#RRGGBB` 를 적는다), 모서리(각지게·기본·둥글게), 밀도(촘촘·기본·넉넉), 밝기(자동·밝게·어둡게 — 기본 자동).
4. 오른쪽(휴대폰에서는 아래) 미리 보기에서 화면 3개와 폭 2개를 바꿔 본다. 밝기 자동이면 '밝게로 보기·어둡게로 보기'로 두 벌을 다 본다. 미리 보기 안의 메뉴·건 이름·'건 등록'을 눌러도 화면이 바뀐다.
5. 맨 아래 **'이걸로 하기'** 를 누른다 → "저장됐습니다 — 이제 AI 에게 '골랐어요'라고 말하세요".

- 내 색의 색 코드가 덜 적혔거나 대비 검사를 통과하지 못하면 '이걸로 하기'가 막히고 아래 줄에 이유가 나온다. 엔진이 색을 옮겼으면 내 색 칸 아래에 "보정됨"과 바뀐 값이 나온다.
- 브라우저가 저절로 안 열리면 터미널에 크게 찍힌 주소(`http://127.0.0.1:포트/`)를 브라우저 주소창에 붙여 넣는다.
- 그래도 안 되면 `.owner/design/index.html` 을 직접 두 번 눌러 연다. 이 판은 저장 기능이 없어서 '이걸로 하기'를 누르면 **조합 코드**가 크게 나온다 → 그 코드를 AI 에게 말한다.
- 선택창은 30분 동안 아무 반응이 없으면 스스로 닫힌다. 다시 열려면 같은 명령을 실행한다.

| 화면 구조 | 모양 | 이런 일에 맞음 |
|---|---|---|
| 목록·표형 `list` | 좌측 메뉴 + 표(폰에서는 두 칸으로 접힌다) | 건이 많고 날짜·담당·수량을 나란히 훑는 일 |
| 진행 보드형 `board` | 상단 탭 + 단계 열(폰에서는 한 화면에 한 열, 옆으로 넘김) | 지금 어느 단계인지, 누구 차례인지가 중요한 일 |
| 카드·상세형 `card` | 카드 목록 + 상세 | 고객이 직접 보거나 휴대폰으로 주로 보는 일 |

| 추천 조합(스타일) | 기본 색 | 인상 |
|---|---|---|
| 차분한 기본 `calm` | 남색 | 회색 바탕에 흰 상자, 살짝 둥근 모서리. 가장 무난한 기본형 |
| 에디토리얼 미니멀 `editorial` | 차콜 | 흰 바탕에 큰 명조 제목과 가는 줄, 넓은 여백 |
| 소프트 `soft` | 청록 | 둥근 모서리와 옅은 그림자, 알약 모양 버튼 |
| 선명한 대비 `bold` | 녹색 | 굵은 줄과 진한 글자, 모서리 없음. 촘촘하다 |
| 따뜻한 종이 `paper` | 올리브 | 크림색 바탕과 얇은 줄, 제목만 명조 |
| 인디언즈 스타일 `indeans` | 브론즈 `#84745C` | 따뜻한 흰 바탕에 크게 둥근 상자와 옅은 그림자. 누르는 곳이 넉넉하다 |
| 단단한 기업형 `corporate` | 슬레이트 | 흰 바탕에 또렷한 회색 띠와 선, 작은 모서리 |

색 10가지: 남색 `navy` · 차콜 `charcoal` · 녹색 `green` · 갈색 `brown` · 청록 `teal` · 와인 `wine` · 테라코타 `terracotta` · 슬레이트 `slate` · 올리브 `olive` · 자두 `plum` — 각각 시드(밝게의 버튼 색) 하나이고, 바탕·글자·어둡게는 엔진이 만든다. 대표가 색을 직접 고르면 스타일을 바꿔도 그 색이 유지되고, '이 스타일의 기본색으로'를 누르면 조합의 기본 색으로 돌아간다. 인디언즈 스타일에서 다른 색을 고르면 모양은 그대로 두고 색만 바뀐다.

## 고르면 생기는 것

조합 코드는 `<구조>-<스타일>-<색 또는 custom-RRGGBB>-<밝기>[-<모서리>][-<밀도>]` 이다. 모서리·밀도는 기본이면 생략한다.
예: `board-soft-teal-auto` · `board-indeans-custom-2a6f9e-auto`(내 색 #2A6F9E) · `list-calm-navy-light-round-compact`.
옛 코드(`list-calm-navy-light` 같은 4단, 맨 처음 판의 `list-navy`)도 그대로 읽는다.

| 파일(프로젝트 폴더 기준) | 내용 |
|---|---|
| `.owner/design/choice.json` | `{ structure, family, palette, seed, scheme, radius, density, code, chosen_at }` |
| `src/styles/tokens.css` | 고른 조합의 토큰(CSS 변수)과 글꼴 `@font-face`. **첫 줄 주석에 조합 코드**. 밝기 자동이면 밝게 `:root` + `@media (prefers-color-scheme: dark)` 어둡게 + `[data-theme="dark"]` 강제 블록 |
| `src/styles/base.css` | 화면 공통 뼈대 — `.owner/design/src/base.css` 사본 |
| `src/styles/layout.css` | 고른 구조의 뼈대 — `.owner/design/src/layout-<구조>.css` 사본 |
| `src/styles/fonts/` | 고른 스타일이 쓰는 글꼴(Pretendard, 명조 스타일이면 고운바탕)과 라이선스 전문 `LICENSE-*.txt` |

이미 있던 세 CSS 가 새것과 다르면 덮기 전에 `.owner/tmp/design-backup/<시각>/` 에 남긴다. 파일은 프로젝트 폴더 안에만 쓴다 — 쓰는 경로에 링크(바로 가기·정션, 끊어진 것 포함)가 끼어 있으면 쓰지 않고, 기존 파일은 그 자리에서 고치지 않고 새 파일로 바꿔 끼운다(하드 링크로 밖과 이어진 파일도 밖은 그대로).

토큰 값은 회사에 맞게 바꿀 수 있지만 **강조색(`--primary`)은 하나만** 유지하고, 바꾼 줄은 `company/design.md` 의 "값을 바꾼 곳"에 적는다. 색을 바꾸려면 손으로 고치기보다 '내 색'으로 다시 만든다(대비 보정·어둡게까지 함께 바뀐다).

### 토큰 이름 (초안이 쓰는 것)

| 묶음 | 이름 |
|---|---|
| 면 | `--bg` 화면 바탕 · `--surface` 표·카드 · `--surface-2` 머리줄·열 바탕·비활성 |
| 선 | `--border` 줄 사이 가는 선(장식) · `--border-strong` 구역 구분(바탕 대비 3:1) · **`--border-input`** 입력 칸·보조 버튼·칩 테두리(바탕 대비 3:1) · `--line-w` 굵기 |
| 글자 | `--text` · `--text-2` 라벨 · `--text-3` 날짜·빈 값 |
| 강조 | `--primary` 버튼 면(고른 색을 되도록 그대로) · `--primary-on` 그 위 글자 · `--primary-hover` · `--primary-soft` 선택된 줄 바탕 · **`--primary-text`** 바탕 위 강조 글자·선택 표시선·포커스 테두리(바탕 대비 4.5:1) |
| 뜻 색 | `--ok` · `--warn` · `--danger` — 글자로만 |
| 서체·크기·굵기 | `--font-sans`·`--font-title`·`--font-num` · `--fs-title`·`--fs-body`·`--fs-label`·`--fs-meta`(+`--fs-input`) · `--fw-normal`·`--fw-medium`·`--fw-bold` · `--lh-tight`·`--lh-body`·`--ls-title` |
| 간격·모서리·그림자 | `--sp-1`~`--sp-6` · `--radius`·`--radius-sm`·`--radius-btn`·**`--radius-lg`**(시트·큰 상자) · `--shadow`·**`--shadow-md`**·**`--shadow-lg`**(그림자 쓰는 스타일만, 나머지는 `none`) |
| 누르는 곳 | `--tap` · `--tap-touch`(손가락 기기에서 `base.css` 가 바꿔 끼운다) · `--row-h` |

### 서버 없이 코드로 만들기 · 점검

```
node .owner/hooks/design-pick.mjs --code board-indeans-custom-2a6f9e-auto   고른 코드로 위 파일들을 바로 만든다
node .owner/hooks/design-pick.mjs --check                                  파일·글꼴·대비·빈 포트만 점검(브라우저를 열지 않는다)
node .owner/hooks/design-pick.mjs --recommend board-soft-teal              선택창에 '추천' 표시를 붙여 연다(구조[-스타일[-색[-밝기]]])
```

## 초안이 이어받는 것 (indeans-erp-draft)

- 화면 뼈대는 **`.owner/design/src/<구조>.html`** 하나에서 가져온다(`list.html`·`board.html`·`card.html`). 한 파일에 화면 3개가 `data-screen="list|detail|today"` 로 나뉘어 들어 있다 — 목록 · 상세·입력 · 오늘 현황.
- 클래스 이름과 배치를 그대로 쓰고, 새 클래스를 만들기 전에 `src/styles/base.css`·`layout.css` 에 있는지 먼저 본다.
- 목업 머리의 세 스크립트(`../app/color-engine.js`·`design-rules.js`·`mock.js` — 미리 보기 전용)는 가져가지 않는다. 앱은 `src/main.tsx` 에서 `tokens.css`·`base.css`·`layout.css` 를 불러온다.
- 선택된 줄·카드는 `aria-current="true"`, 건 이름은 링크(`a.name`), 마감이 지난 건은 `.late`("지남"), 끝낸 건은 `.is-done` 으로 흐리게 — 이 표시 방식도 그대로 이어받는다.
- 화면 부품: 폰의 새 창은 **아래에서 올라오는 시트**(`dialog.sheet` · `.sheet-grip`·`.sheet-head`·`.sheet-body`·`.sheet-acts` — 목업의 '건 등록'), 몇 개 중 하나를 고르는 칸은 **상태 칩**(`.chips` > `label.chip` > 라디오 + `span`), 비어 있는 목록은 **빈 화면**(`.empty`·`.empty-t`·`.empty-d`), 목록·표형의 표는 **표 역할**(`role="table"`·`"row"`·`"columnheader"`·`"cell"` — 폰에서 접혀도 표로 읽힌다), 진행 보드형의 폰 화면은 **스냅 스크롤 + 열 탭**(`.col-tabs`). 여닫기·열 이동 동작은 앱 코드로 만든다.

## 글꼴과 라이선스

- `fonts/Pretendard-Regular.subset.woff2`·`Pretendard-Bold.subset.woff2` — Pretendard 1.3.9 제작자 배포 서브셋(한글 2,780자) 그대로. SIL OFL 1.1, 전문 `fonts/LICENSE-Pretendard.txt`.
- `fonts/GowunBatang-Bold.subset.woff2` — 고운바탕 2.000 굵게를 KS X 1001(한글 2,350자 + 기호)로 줄인 서브셋. SIL OFL 1.1, 전문 `fonts/LICENSE-GowunBatang.txt`. 명조 제목(에디토리얼·따뜻한 종이)에만 쓴다.
- 서브셋에 없는 드문 글자는 글꼴 목록 끝의 시스템 글꼴(Apple SD Gothic Neo·맑은 고딕 등)이 그린다.
- `@font-face` 는 상대 경로다 — 선택창은 `fonts/`(picker.css 기준 `../fonts/`), 목업 미리 보기는 `../fonts/`, 수강생 앱은 `./fonts/`(tokens.css 기준). 글꼴 폴더를 선택창(`index.html`)보다 아래에 두는 것은 "파일로 연 페이지는 같은 폴더나 그 아래 파일만 같은 출처로 본다"는 브라우저 규칙(옛 파이어폭스)을 지키려는 것이다. 2026-10-08 확인: 파일로 연(file://) 선택창과 목업 모두 크롬(Chromium)·사파리 엔진(WebKit)·파이어폭스(엄격한 file:// 출처 설정을 켠 상태)에서 글꼴이 읽혔다. 어떤 브라우저 설정 때문에 못 읽으면 미리 보기가 시스템 글꼴로 보일 뿐 저장 결과(앱의 글꼴)와는 관계없다.
- 출처·버전·해시·가져온 범위는 강의 자료 저장소의 `THIRD-PARTY-NOTICES.md` 에 있다.

## 파일

```
images/design/                       설치되면 수강생 프로젝트의 .owner/design/
  index.html                         선택창
  app/color-engine.js                색 엔진 — 시드 하나 → 밝게·어둡게 색, WCAG 2.2 대비 계산(선택창·서버·점검이 같은 함수를 쓴다)
  app/design-rules.js                생성 규칙(단일 원본) — 축 이름·스타일 값·토큰 합성·조합 코드·자가 검사
  app/picker.js · app/picker.css     선택창 동작·겉모습(고르는 화면 자체는 무채색)
  app/mock.js                        목업 미리 보기 도우미 — 주소 끝(#c=…&s=…&p=…)으로 토큰을 계산해 넣고 화면을 바꾼다
  src/base.css                       화면 공통 뼈대(일곱 스타일 공통 — 값은 전부 토큰)
  src/layout-list.css · layout-board.css · layout-card.css   구조별 뼈대(좁은 화면 접기·보드 스냅 포함)
  src/list.html · board.html · card.html                     구조별 목업 — 화면 3개씩 + 시트
  fonts/                             글꼴 3개(woff2) + 라이선스 전문 2개
  README.md                          이 문서
  choice.json                        (수강생 프로젝트에만 생긴다) 마지막으로 고른 조합
```

선택창은 `<script src>` 일반 스크립트만 쓴다(모듈 스크립트 없음) — 파일을 두 번 눌러 여는 `file://` 에서도 돌게 하려는 것이다. 서버(`design-pick.mjs`)는 Node 내장 기능만 쓰고, `127.0.0.1` 의 빈 포트에서 `.owner/design/` 안의 파일만 내준다.

---

## 다시 만들기·점검 (제작 쪽)

강의 자료 저장소에서 실행한다. 미리 만들어 둘 토큰 파일은 없다 — 점검기가 엔진으로 모든 조합을 만들어 보고 막는다. playwright 는 이 저장소의 개발 의존성이다(`npm install` → 없으면 `npx playwright install chromium`). 없으면 화면 점검만 건너뛰고 나머지는 한다.

```
npm run tokens:check                       전체 점검(= node scripts/build-design-tokens.mjs --check)
npm run tokens:engine                      색 엔진 시험만 — 시드 19개 × 밝게·어둡게
node scripts/build-design-tokens.mjs --print board-indeans-custom-2a6f9e-auto   그 조합의 tokens.css 를 찍어 본다
node scripts/build-design-tokens.mjs --no-browser --no-server --no-links         화면·서버·링크 시험 건너뛰기
```

점검하는 것(하나라도 걸리면 목록을 내고 exit 1):

- 축 id 가 계약과 같은지 — 구조 3 · 스타일 7 · 색 10(+custom) · 밝기 3 · 모서리 3 · 밀도 3
- **색 엔진 시험** — 시드 19개(브론즈 3·노랑 2·시안·라임·주황·빨강·분홍·보라·남색·파랑·틸·초록 2·검정·흰색·회색) × 밝게·어둡게, 글자 30짝 + 선 6짝
- **색 대비** — 스타일 7 × (색 10 + 내 색 시드 19 + 추천 조합 기본색) × 밝게·어둡게: 글자 7종(`--text`·`--text-2`·`--text-3`·`--ok`·`--warn`·`--danger`·`--primary-text`)이 바탕 4종(`--bg`·`--surface`·`--surface-2`·`--primary-soft`) 위에서, 버튼 글자(`--primary-on`)가 `--primary`·`--primary-hover` 위에서 4.5:1 이상 · **테두리**(`--border-input`·`--border-strong`)가 바탕 3종 대비 3:1 이상. 이름 있는 색 10가지는 밝게에서 버튼 색이 시드 그대로
- **모양** — 스타일 7 × 모서리 3 × 밀도 3: 글자 크기 4종(입력 칸 `--fs-input` 제외)·본문 14px·입력 칸 16px · 굵기 3종 · 간격이 4의 배수로 커짐 · 누르는 곳 40px(손가락 기기 44px) · 목록 줄 40px · 선 1~2px · 그림자는 소프트·인디언즈 스타일에만
- **tokens.css** — 첫 줄 주석의 코드 · 자동이면 밝게 + 두 어둡게 블록(값이 같은지) · `@font-face` 파일이 있는지·`font-display: swap` · 외부 주소 없음 · 조합 코드 읽기/쓰기 왕복
- **인디언즈 스타일** — 운영 앱 모양 값(바탕·면·선·글자·선택 바탕·모서리·그림자 3단·누르는 곳)과 같은지, 브론즈 `#84745C`
- **글꼴** — woff2 머리·라이선스 전문(OFL 1.1, Pretendard 예약 이름 줄)·picker.css 경로 · `fonts/` 에 쓰지 않는 파일 없음
- **파일** — `tokens/` 가 없어야 함 · `src/` 에는 base.css·layout-*.css·*.html 만 · `<script type="module">`·import/export·외부 주소·네트워크 호출 없음 · UTF-8(BOM 없음)·LF·보이지 않는 BOM 문자 없음 · 장식 이모지 없음 · SKILL.md 300줄 이하 · families.md 7절과 값 · 감독 파일 · THIRD-PARTY-NOTICES.md
- **목업** — 화면 3개가 순서대로 · **같은 화면이면 구조가 달라도 같은 예시 데이터** · 시트·빈 화면·표 역할·열 탭
- playwright 가 있으면: 구조 3 × (스타일 7 + 밀도 촘촘·넉넉 4) × 화면 3 을 375·1280 에서 **가로 밀림**·말줄임 없이 잘린 글자·누르는 곳·본문 크기 · 토큰 갈아 끼우기(모든 색·내 색) · **글꼴이 file:// 에서 실제로 읽히는지** · 시트(폰은 아래, PC 는 가운데)·표 접기·보드 스냅 · 선택창 375·1280(인디언즈 스타일 → 내 색 2번 → 틀린 색 코드 차단 → 코드 표시) · **임시 프로젝트 서버 모드**(추천 → 내 색 → 이걸로 하기 → 파일 확인 → `--code`) · **design-pick 링크 시험**(끊어진 링크·폴더 정션·하드 링크)

## 고칠 때 지키는 것

- **모양 값은 `app/design-rules.js`, 색 계산은 `app/color-engine.js` 한 곳에서만 고친다.** 고친 뒤 `npm run tokens:check` 로 확인한다.
- **id 를 바꾸지 않는다.** 조합 코드·`choice.json`·수강생의 `company/design.md` 가 id 를 쓴다. 새 값은 더하기만 한다.
- **색을 더하려면**: `PALETTES` 에 시드 하나(`{ id, ko, seed }`) → `scripts/build-design-tokens.mjs` 의 `CONTRACT` → `indeans-erp-design` 스킬의 표와 이 문서의 목록. 밝게에서 시드가 그대로 버튼 색이 되는지 점검이 본다(흰 글자·진한 글자 중 하나가 4.5:1 이 돼야 한다).
- **스타일을 더하려면**: `FAMILIES`(글자 크기 4종·굵기 3종·간격 6개 규칙 유지, `neutral` 출발점, `pick` 기본 색) → `CONTRACT` → `skills/indeans-erp-design/references/families.md` 에 그 스타일의 절(값 표·허용·금지·AI 티 패턴·지킬 것).
- **목업 문구·데이터는 세 파일을 같이 고친다.** 같은 화면의 정보량이 구조마다 다르면 교차 점검이 막는다(점검 목록은 스크립트의 `SCREEN_MUST`). 시트는 `<main>` 밖에 두어 화면 비교에 섞이지 않게 한다.
- 목업 HTML 에 `style=""` 로 값을 적지 않는다. 색·크기·모서리·그림자는 토큰, 배치는 `base.css`·`layout-*.css` 클래스로만. 기존 클래스 이름은 바꾸지 않는다(초안이 이어받는다 — 더하기만).
- **강조색 자리를 섞지 않는다** — 바탕 위 글자·얇은 선·포커스는 `--primary-text`, 버튼 면만 `--primary`. 입력 칸·보조 버튼·칩 테두리는 `--border-input`.
- **좁은 화면 뼈대를 지우지 않는다** — `layout-*.css` 의 `@media (max-width: 680px)`(구조 접힘·보드 스냅)·`(max-width: 900px)`(카드 상세를 아래로)와 `base.css` 의 `@media (pointer: coarse)`(누르는 곳을 `--tap-touch` 로). 목록형 날짜 칸의 `.d-in`·`.d-due` 를 지우면 폰에서 날짜 라벨이 사라진다.
- **설치 규칙**: `src/` 안에서는 `base.css`·`layout-*.css`·`*.html` 만 수강생 프로젝트에 설치된다(설치기 `install.mjs` 의 `MOCK_KEEP`). 선택창이 쓰는 스크립트·CSS·글꼴은 `src/` 밖(`app/`·`fonts/`)에 둔다.
- **글꼴을 바꾸거나 더하려면** 라이선스부터 확인한다. 예약 글꼴 이름이 있는 글꼴은 직접 서브셋하지 않고(제작자 서브셋을 쓴다), 라이선스 전문을 `fonts/` 에 함께 넣고 `THIRD-PARTY-NOTICES.md` 에 적는다. 인터넷 글꼴 주소(CDN)는 넣지 않는다.
- 예시 데이터는 전부 가상이다. 운영 데이터·고객 정보·실제 회사명·금액을 넣지 않는다. 업종을 특정하는 말을 쓰지 않는다(○○상사·건·단계 4개처럼 어느 업종에나 읽히는 말만). 인디언즈 스타일도 모양·색 값만 옮기고 로고·이름·문구는 넣지 않는다.
- 장식 이모지·그라데이션·외부 라이브러리·인터넷 호출을 넣지 않는다.
