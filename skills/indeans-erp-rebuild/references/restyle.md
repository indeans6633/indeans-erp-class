# 가져온 앱 디자인 통일과 화면 재배치

`indeans-erp-rebuild` 절차 7·8이 읽는다. 목표는 **기능·데이터는 그대로, 겉모습과 화면 묶음만** 인디언즈 기준으로 바꾸는 것이다. 새로 짜는 것이 아니다. 절차 7은 `plan_chosen` 에 ②축이, 절차 8은 ①축이 있을 때만 한다.

화면 규칙의 원본은 `indeans-erp-draft` 의 `references/screen-rules.md`(공통 — 모바일 폭·색과 글꼴·목업 부품)와 `indeans-erp-design` 의 `references/structures.md`·`families.md` 다. 이 문서는 **가져온 앱이라서 달라지는 것**만 적는다.

**번들 토큰이 내는 변수 이름**(선택창의 `tokens.css` — 이 이름만 쓴다): 색 `--bg` `--surface` `--surface-2` `--text` `--text-2` `--text-3` `--border` `--border-strong` `--border-input` `--primary` `--primary-hover` `--primary-soft` `--primary-text` `--primary-on` `--ok` `--warn` `--danger` · 글꼴 `--font-sans` `--font-title` `--font-num` · 크기 `--fs-body` `--fs-label` `--fs-meta` `--fs-input` `--fs-title` · 모서리 `--radius` `--radius-sm` `--radius-lg` `--radius-btn` · 간격 `--sp-1`~`--sp-6` · 높이 `--tap` `--row-h` · 그림자 `--shadow` `--shadow-md` `--shadow-lg`. 색 값은 `#RRGGBB` 이고 **RGB 채널 변수(`--primary-rgb` 같은 것)는 없다.** 밝기 자동은 `@media (prefers-color-scheme: dark)` 와 `<html data-theme="dark">` 로 바뀐다(Tailwind 의 `.dark` 클래스와 다르다).

---

## 1. 지키는 것 (먼저 읽는다)

1. **저장 자리 이름을 바꾸지 않는다.** 브라우저 저장 키(`localStorage` 의 키 이름)·데이터베이스 표·칸 이름·저장 함수의 모양을 그대로 둔다. 진단 문서 3번의 "브라우저 저장 키"가 그 목록이다(못 찾음이면 저장 코드를 직접 보고 적은 목록). 키 이름을 바꾸면 대표가 넣어 둔 데이터가 화면에서 사라진다.
2. **기능을 지우지 않는다.** 화면을 셋으로 묶을 때 남는 화면(설정·도움말·만들다 만 화면)은 지우지 않고 메뉴 끝이나 '더보기'로 옮긴다. 버튼·입력 칸·계산은 자리만 옮긴다.
3. **한 번에 한 화면.** 목록 → 상세·입력 → 오늘 현황 순서로 하나씩 바꾸고, 바꿀 때마다 띄워서 기능을 눌러 본다. 깨지면 그 화면만 되돌린다.
4. **운영 데이터를 지우지 않는다.** 기능 확인은 **추가 → 수정 → 자기가 방금 추가한 시험 행만 삭제**. 이미 있던 건은 수정·삭제하지 않는다. 진단에서 "운영 데이터 연결 가능성: 살아 있을 수 있음"이고 대표가 "실제 업무 데이터가 있다"고 했으면: 읽기 확인(목록이 보이는지) + 시험 행 1개로만 쓰기, 삭제는 그 행만. 시험 행은 누가 봐도 시험인 이름(`시험-리빌딩-<시각>`)으로 넣고, 끝나면 남지 않았는지 목록에서 확인한다. 폴더 백업은 원격 데이터베이스와 브라우저 안 데이터를 되살리지 못한다.

## 2. 기존 스타일 파일 처리

### 2-1. 전역 스타일 진입점 — 프레임워크별

토큰 세 줄(`tokens.css`·`base.css`·`layout.css`)을 부르는 자리는 프레임워크마다 다르다. 진단 6번 "전역 스타일 진입점 후보"를 이 표에 대 본다. **표에 없는 구조면 멈추고 대표에게 "이 앱은 구조가 달라 디자인 연결 자리를 먼저 확인하겠습니다"라고 말한 뒤 묻는다.** 짐작해서 넣지 않는다.

| 구조 | 알아보는 법 | 토큰을 부르는 자리 |
|---|---|---|
| Vite·CRA(React·Vue·Svelte·Solid) | `src/main.*` 또는 `src/index.*` 가 화면을 붙인다 | 그 파일의 CSS import 자리에서 아래 순서대로 `import './styles/…css'` |
| Next.js App Router | `app/layout.*`(또는 `src/app/layout.*`) + `globals.css` | `layout` 의 CSS import 자리에서 아래 순서대로(`globals.css` 가 Tailwind 진입 CSS 다) |
| Next.js Pages Router | `pages/_app.*` | `_app` 의 CSS import 자리에서 아래 순서대로 |
| SvelteKit | `src/routes/+layout.svelte` + `src/app.css` | `+layout.svelte` 의 `<script>` import 자리에서 아래 순서대로 |
| Nuxt | `nuxt.config.*` 의 `css: [...]` | 배열에 아래 순서대로 더한다(기존 항목은 지우지 않는다) |
| 단일 HTML(빌드 도구 없음) | `index.html` 이 CSS 를 `<link>` 로 부른다 | `<link>` 를 아래 순서대로 |

**순서**: tokens.css → (Tailwind 진입 CSS) → base.css → layout.css → 앱의 나머지 CSS. 토큰이 먼저 정의되고, 앱의 CSS 가 그 변수를 쓴다.

- Tailwind 없음: `tokens` → `base` → `layout` → 앱 CSS.
- Tailwind 3: `base.css` 가 **기본 초기화(Preflight) 뒤·유틸리티 앞**에 오게 진입 CSS(`index.css`·`globals.css` 등) 하나에서 부른다(Tailwind 3 공식 `postcss-import` 방식 — main 에서는 세 파일을 부르지 않는다):

  ```css
  @import "./styles/tokens.css";
  @import "tailwindcss/base";
  @import "./styles/base.css";
  @import "tailwindcss/components";
  @import "./styles/layout.css";
  @import "tailwindcss/utilities";
  ```

  기존 진입 CSS 가 `@tailwind base; @tailwind components; @tailwind utilities;` 지시문이면 같은 순서의 위 `@import` 줄로 바꾼다(지시문을 지우는 것이 아니라 같은 것을 부르는 모양만 바꾼다 — 다른 줄은 그대로 아래에). **의존성을 새로 넣지 않는다** — Vite 와 Next.js 는 CSS `@import` 를 자체 처리하므로 `postcss-import` 설치 없이 그대로 된다(먼저 `npm run build` 로 확인). 빌드가 `@import` 를 해석하지 못하는 구조에서만 설치하되, 그때는 `node -v` 와 `npm view postcss-import@<판> engines` 를 비교해 **지금 Node 에서 도는 판**을 고르고(최신 판은 Node 요구가 높을 수 있다 — 2026-10-11 리허설 D 에서 `@17` 이 Node 22 요구), `postcss.config` 의 plugins 맨 앞에 두고, 배포하는 곳의 Node 판 확인을 보류 항목에 적는다. 바꾼 뒤 `npm run build` 와 375 캡처로 클래스가 살아 있는지 본다.
- Tailwind 4: `tokens` → 진입 CSS 안에서 `@import "tailwindcss";` 바로 아래 `@import "./styles/base.css" layer(base);`(2-5 — main 에서는 base 를 부르지 않는다) → `layout` → 앱 CSS. **경로는 진입 CSS 파일 기준**이다(`src/index.css` 면 `./styles/base.css`, `src/app/globals.css` 면 `../styles/base.css`).

### 2-2. 먼저 백업하고, 같은 이름 파일의 참조 목록을 만든다

진단 6번의 "전역 스타일·설정 파일" 목록 전부를 백업한다(작업마다 새 폴더 `styles-before-<날짜>-<시분>/` + `manifest.json`):

```
node "<스킬 폴더>/assets/rebuild-backup.mjs" --styles "src/index.css" "src/App.css" "tailwind.config.js"
```

종료 코드가 0 이 아니면 다음으로 가지 않는다(링크를 거친 파일·`.env` 이름은 거부된다 — 그 파일은 대표와 확인). 만들어진 폴더 이름을 제안서 실행 기록에 적는다 — 되돌릴 때 **이번 작업의 폴더**만 쓴다.

선택창(`design-pick.mjs`)은 `src/styles/` 에 `tokens.css`·`base.css`·`layout.css`·`fonts/` 를 쓴다. 가져온 앱에 **같은 이름의 파일이 이미 있으면**:

1. 선택창을 열기 전에 위 명령에 그 파일도 넣는다.
2. 그 파일이 정의하던 **옛 변수·클래스 목록**을 만들고(`--brand-500`, `.container` 같은 것), 앱 전체에서 grep 해 쓰는 곳을 센다.
3. 선택창이 파일을 바꾼 뒤, 쓰이던 옛 이름은 **호환 별칭**으로 남긴다 — 앱 쪽 CSS(번들 파일 말고)에 `:root { --brand-500: var(--primary); }`, 옛 클래스는 앱 CSS 에 그대로 옮겨 둔다. 쓰는 곳이 0 인 이름만 버린다. 무엇을 별칭으로 남겼는지 `company/design.md` "값을 바꾼 곳"에 적는다.

### 2-3. 옮길 것과 자리를 지킬 것

"옮긴다"는 **원본을 백업에 남기고, 앱에서는 토큰을 쓰게 바꾼다**는 뜻이다. 파일을 무조건 지우지 않는다 — 앱이 빌드에 필요로 하는 파일을 지우면 화면 전체가 깨진다.

| 파일 | 처리 |
|---|---|
| 색·글자만 정하던 전역 CSS(`index.css`·`App.css`·`globals.css`·`app.css` 의 색·크기 줄) | 값을 토큰 변수로(`#222` → `var(--text)`, 강조색 → `var(--primary)`/`var(--primary-text)`, `font-family` → `var(--font-sans)`, `border-radius: 8px` → `var(--radius)`). 토큰과 겹쳐 쓸모가 없어진 줄(바탕색·기본 글자색·기본 글꼴)은 지운다. 파일 자체는 남긴다 |
| **Tailwind 진입 CSS**(`@tailwind base; …` 또는 `@import "tailwindcss";`) | **지시문 줄은 절대 지우지 않는다** — 지우면 모든 클래스가 사라진다. 바꿀 수 있는 것은 Tailwind 3 에서 같은 것을 부르는 `@import "tailwindcss/base"` 꼴로 옮기는 것뿐(2-1) |
| Tailwind 3 설정(`tailwind.config.*`) | 아래 2-4 — **병합**한다. 설정 전체를 예시로 바꿔 끼우지 않는다 |
| Tailwind 4(`@theme { … }` 가 CSS 에 있음) | 아래 2-5 |
| 테마 파일(`theme.js`·`theme.ts` — 색 객체를 내보내는 것) | 값만 `'var(--primary)'` 같은 문자열로 바꾼다. 가져다 쓰는 곳이 있으니 파일과 이름은 둔다 |
| CSS-in-JS(styled-components·Emotion) | 그 안의 색·크기 값만 `var(--…)` 로. 컴포넌트 구조는 그대로 |
| UI 부품 묶음(MUI·Ant Design·Chakra 등) | 그 묶음의 테마 설정 한 곳에서 기본 색·글꼴·모서리를 토큰 변수로 연결한다. 부품을 다른 것으로 바꾸지 않는다. 연결이 어려우면 진단에 적고 강조색 한 곳만 맞춘다 |

### 2-4. Tailwind 3 설정 — 병합, 구조 보존

```js
// tailwind.config.js — 있던 설정에 "더한다". 클래스 이름(bg-brand 등)은 그대로 쓴다.
theme: {
  extend: {
    colors: {
      // 기존 brand 가 문자열이었으면 → 'var(--primary)'
      // 기존 brand 가 단계 객체({ 50: …, 500: …, 700: … })였으면 → 구조를 그대로 두고 DEFAULT 만 더한다:
      brand: { ...기존단계, DEFAULT: 'var(--primary)' },   // 화면에서 쓰는 단계(bg-brand-500 등)는 값 그대로 남긴다
      'brand-text': 'var(--primary-text)',
      ink: 'var(--text)',
      line: 'var(--border)',
    },
    fontFamily: { sans: ['var(--font-sans)'] },
    borderRadius: { DEFAULT: 'var(--radius)', lg: 'var(--radius-lg)' },
  },
},
```

- **병합한다.** `theme.extend` 안의 해당 키만 고친다. 기존 `plugins`·`content`·`darkMode`·다른 `extend` 값은 한 글자도 건드리지 않는다. 예시 블록을 통째로 붙여 넣지 않는다.
- **단계 객체는 구조를 지킨다.** `bg-brand-500` 처럼 단계로 쓰는 곳이 있으면 그 단계 값은 그대로 둔다(토큰에 단계가 없다). `DEFAULT` 만 토큰으로 — `bg-brand` 가 토큰 색이 된다. 쓰는 단계도 토큰 색으로 맞추고 싶으면 대표에게 보여 주고 그 단계만 하나씩.
- **불투명도 클래스를 먼저 grep 한다**(`bg-brand/50`·`border-line/20` — 진단 6번 "불투명도 색 클래스" 수). Tailwind 3 은 `var(--primary)` 처럼 완성된 색 변수에 `/50` 을 적용하지 못한다(클래스가 조용히 사라진다). 번들 토큰은 RGB 채널 변수를 내지 않으므로, **불투명도 클래스가 쓰는 색 이름은 토큰으로 바꾸지 않고 그대로 두고** 보고서 "바꾸지 않은 것"에 적는다. (토큰이 채널 변수를 내는 경우에만 `rgb(var(--…-rgb) / <alpha-value>)` 꼴로 연결한다.)
- **클래스를 전부 바꾸지 않는다.** 설정에서 이름이 가리키는 값만 토큰으로 바꾼다. 예외로 고치는 클래스: 색을 직접 적은 임의 값(`bg-[#E4572E]` → `bg-[var(--primary)]`), 바탕 위 글자에 버튼 면 색을 쓴 곳(`text-brand` → `text-brand-text`), 375 에서 밀리는 고정 폭(`w-[720px]` → 3절).

### 2-5. Tailwind 4 — `@theme inline`, 자기 참조 금지

```css
/* 진입 CSS — @import "tailwindcss"; 아래, 기존 @theme 블록은 그대로 둔다 */
@theme inline {
  --color-brand: var(--primary);
  --color-ink: var(--text);
  --color-line: var(--border);
}
```

- 다른 변수를 가리키는 별칭은 **`@theme inline`** 으로 쓴다(일반 `@theme` 는 그 자리의 값을 굳혀서, 다크 모드처럼 아래에서 `--primary` 가 바뀌어도 따라가지 않는다).
- **같은 이름으로 자기 자신을 가리키지 않는다.** `--font-sans: var(--font-sans)`·`--radius-lg: var(--radius-lg)` 는 순환이라 값이 사라진다. Tailwind 쪽 이름과 번들 토큰 이름이 **같으면 재정의하지 않는다**(번들 토큰이 이미 그 이름이다). 다른 이름만 연결한다.
- Tailwind 4 는 `bg-brand/50` 을 `color-mix()` 로 처리하므로 불투명도 클래스는 그대로 둬도 된다(캡처로 확인).
- `base.css` 는 번들 파일이라 고치지 않는다. Tailwind 4 의 유틸리티는 `@layer utilities` 안에 있어서 **층 밖의 `base.css` 규칙이 유틸리티를 이긴다** — 진입 CSS 에서 `@import "./styles/base.css" layer(base);` 처럼 **base 층으로 불러** 유틸리티가 이기게 한다(파일 내용은 그대로).

### 2-6. 다크 모드 클래스(`dark:`)

토큰은 기기 설정·`data-theme` 으로 밝기를 바꾸고, Tailwind 의 `dark:` 는 대개 `.dark` 클래스나 기기 설정으로 바꾼다 — **켜지는 조건이 다를 수 있다.** 그래서 `dark:` 색 클래스는 기본으로 **그대로 둔다.** 지우는 것은 아래가 모두 확인된 화면에서만, 화면 하나씩:

1. 앱의 다크 전환 방식(설정의 `darkMode`·토글 버튼)이 토큰의 밝기 자동과 같은 조건으로 켜진다.
2. 그 `dark:` 클래스가 가리키던 색에 대응하는 토큰이 있다(바탕·글자·선).
3. 상태색(경고·위험·완료)과 부품별 대비 조정이 어두운 화면에서도 구분된다 — 375 캡처를 밝게·어둡게 한 장씩.

## 3. 화면 3개로 재배치

제안서 ①축의 "지금 화면 → 새 화면 대응표"대로 한다.

- **목록** — 기존 목록·표 화면. 휴대폰(375)에서는 표를 **한 건 = 카드 한 장**으로 접는다(`screen-rules.md` 「표를 쓸 때」). 열이 많아 접기 어려운 표만 `.table-scroll` 상자 안에서 밀리게 한다. 정렬이 없으면 건다(최근 순). **건수가 많아 한 번에 다 그리기 무거우면 나눠 보이되, 기존 데이터에 모두 닿게 한다**: "더 보기" 또는 페이지 이동 + **전체 건수 표시**("전체 132건 중 20건") + 검색·걸러보기는 **전체** 건을 대상으로. 앞의 몇 건만 그리고 끝내지 않는다(`slice`·쿼리 제한만 걸면 옛 건이 사라진 것처럼 보인다).
- **상세·입력** — 기존 추가 화면과 고치기 화면이 따로면 하나로 합치지 않아도 된다(기능 보존이 먼저). 다만 입력 칸 글자 `var(--fs-input)`·높이 `var(--tap)`·오류는 그 칸 아래로 맞춘다.
- **오늘 현황** — 없으면 **새로 만든다.** 이미 저장된 데이터를 읽기만 하는 화면이다 — 새 저장 자리·새 칸을 만들지 않는다. 오늘 해야 할 것(날짜가 오늘이거나 지난 것, 기준 이하로 떨어진 것 등 — 회사가 말한 "오늘"의 뜻)과 단계별 개수, 숫자를 누르면 걸러진 목록. "큰 숫자 칸 세 개" 틀로 시작하지 않는다. 기존 '대시보드'가 숫자 칸뿐이면 그 화면을 오늘 현황으로 바꾼다(숫자는 아래에 남긴다).
- **남는 화면** — 메뉴 끝 또는 '더보기'. 이름만 회사 말로.
- **메뉴** — 화면 셋이 앞, 남는 화면이 뒤. 고른 구조(목록·표형 / 진행 보드형 / 카드·상세형)의 목업 `.owner/design/src/<구조>.html` 의 상단바·메뉴 클래스를 쓴다. 화면 이동 방식(라우터·상태값)은 그대로 둔다 — 라우터를 새로 넣거나 빼지 않는다.
- **회사 말** — 화면에 보이는 글자만 바꾼다(코드 이름은 그대로). 상태 값을 한글로 저장하고 있으면 저장 값은 그대로 두고 화면 글자 표만 둔다(값을 바꾸면 옛 건이 목록에서 사라진다).

## 4. 고친 뒤 확인

- 화면마다: 375·1280 에서 좌우 밀림 없음 · 그 화면의 기존 기능(1절 4번의 시험 행 규칙으로) · 새로고침해도 전에 넣어 둔 데이터가 보임 — **기존 앱을 쓰던 것과 같은 브라우저·같은 주소(포트까지)에서** 본다. 캡처 도구의 새 브라우저나 다른 포트에서는 브라우저 저장 데이터가 원래 안 보인다.
- 다 끝나면 `indeans-erp-draft` 의 `references/self-review.md` 1~6절로 본다. **고르신 범위 안에서 걸린 것만 지금 고친다.** 범위 밖(저장 구조·로그인 등)이 걸리면 고치지 않고 제안서 「보류 항목」에 적는다.
- `npm run build` 결과를 진단 문서 「변경 전 빌드」와 비교한다. 전에도 실패했으면 같은 오류인지 보고 "원래 있던 문제"로 보고서 "남은 문제"에 적는다(오늘 고치지 않는다). 전에는 됐는데 지금 실패하면 이번 변경이 만든 회귀다 — 고친다.
