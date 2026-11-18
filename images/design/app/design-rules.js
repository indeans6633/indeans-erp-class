/* 인디언즈 ERP 클래스 — 디자인 선택기 생성 규칙 (단일 원본)
 *
 * 색은 같은 폴더의 color-engine.js(window.ERP_COLOR)가 계산한다 — 이 파일보다 먼저 읽혀야 한다.
 * 이 파일 하나를 세 곳이 같이 읽는다.
 *   - 선택창 .owner/design/index.html·목업 src/*.html ... 브라우저 · <script src>
 *   - 선택창 서버 .owner/hooks/design-pick.mjs ........ Node · vm 으로 읽어 src/styles/tokens.css 를 만든다
 *   - 제작 점검 scripts/build-design-tokens.mjs ......... Node · 모든 조합을 만들어 대비·크기를 점검한다
 * 파일을 두 번 눌러 여는 file:// 에서도 돌아야 해서 import/export(모듈) 문법을 쓰지 않는다.
 *
 * 고르는 축 — id 는 바꾸지 않는다(조합 코드·company/design.md·choice.json 이 이 id 를 쓴다)
 *   structure 3 · family 7 · palette 10 + custom(내 색) · scheme 3(auto·light·dark)
 *   세부 조절: radius 3(sharp·base·round) · density 3(compact·base·roomy) — 값만 바꾸는 토큰
 *   조합 코드: <structure>-<family>-<palette | custom-rrggbb>-<scheme>[-<radius>][-<density>]
 *     예) board-soft-teal-auto · board-indeans-custom-2a6f9e-auto · list-calm-navy-light-round-compact
 *     모서리·밀도는 기본(base)이 아닐 때만 끝에 붙는다.
 *
 * 2026-11-17 개정(리허설 반영): 2단계 선택창(테마 4 → 세부 설정)의 새 조합 코드도 읽고 만든다.
 *   새 조합 코드: theme-<테마>-<RRGGBB>-<밝기>-<메뉴>-<본문>
 *     테마 shop(따뜻한 매장)·large(큰 글씨)·list(촘촘한 목록)·brand(우리 회사 색) · 색 여섯 자리 · 밝기 light·dark(auto 도 읽음)
 *     메뉴 side(왼쪽)·top(위쪽)·bottom(아래 탭) · 본문 cards(카드)·table(목록)·board(보드)
 *     예) theme-large-CA8A04-light-bottom-cards · theme-list-0F766E-light-side-table
 *   본문 모양이 화면 구조를 정한다(cards→card · table→list · board→board). 메뉴 위치는 layout-nav-<메뉴>.css 가 맡는다.
 *   테마의 모양 값(글자 크기·모서리·누르는 곳·그림자·제목 글꼴)은 선택창(app/selector.js 의 THEMES)과 같게 둔다 —
 *   제작 점검(tools/check-consistency.mjs [15])이 두 파일의 테마 id·기본 색·기본 배치·업종 추천이 같은지 본다.
 *   옛 코드(<structure>-<family>-…)도 그대로 읽는다(이미 고른 수강생 · --code 로 옛 코드를 넣은 경우).
 *
 * 점검 기준(제작 점검이 막는다): 글자색이 바탕 4종 위에서 4.5:1 이상 · 입력 칸·구역 선이 바탕 3종 대비 3:1 이상 ·
 * 글자 크기 4종(+입력 칸) · 굵기 3종 · 본문 14px 이상 · 누르는 곳 40px(손가락 기기 44px) 이상 · 간격은 4의 배수.
 */
(function (root) {
  'use strict';
  var E = root.ERP_COLOR;
  if (!E) throw new Error('색 엔진(color-engine.js)이 먼저 읽혀야 합니다');

  /* ── 글꼴 — 앱 폴더 안의 파일만 쓴다(인터넷에서 받지 않는다) ─────────────
     산세리프 1종(Pretendard)과 명조 1종(고운바탕)을 모든 스타일이 같이 쓰고, 차이는 굵기·크기·모서리로 낸다.
     목록 끝의 시스템 글꼴은 서브셋(KS X 1001 2,350자)에 없는 글자를 대신 그린다. */
  var SANS = '"Pretendard", -apple-system, BlinkMacSystemFont, system-ui, "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", "Segoe UI", sans-serif';
  var SERIF = '"Gowun Batang", "Noto Serif KR", "Nanum Myeongjo", AppleMyungjo, Batang, "바탕", serif';
  var MONO = 'ui-monospace, "SF Mono", Consolas, "Pretendard", "Malgun Gothic", monospace';
  var FONT_SETS = {
    pretendard: {
      license: 'LICENSE-Pretendard.txt',
      note: 'Pretendard — Copyright (c) 2021 Kil Hyung-jin, with Reserved Font Name Pretendard · SIL OFL 1.1 · 제작자 배포 서브셋 그대로',
      faces: [
        { family: 'Pretendard', weight: 400, local: 'Pretendard Regular', file: 'Pretendard-Regular.subset.woff2' },
        { family: 'Pretendard', weight: 700, local: 'Pretendard Bold', file: 'Pretendard-Bold.subset.woff2' }
      ]
    },
    gowun: {
      license: 'LICENSE-GowunBatang.txt',
      note: 'Gowun Batang — Copyright 2021 The Gowun Batang Project Authors · SIL OFL 1.1 · KS X 1001 글자만 남긴 서브셋',
      faces: [
        { family: 'Gowun Batang', weight: 700, local: 'Gowun Batang Bold', file: 'GowunBatang-Bold.subset.woff2' }
      ]
    }
  };

  /* ── 화면 구조 3 ─────────────────────────────────────────── */
  var STRUCTURES = [
    { id: 'list', ko: '목록·표형', say: '여러 건을 줄로 늘어놓고 비교하는 모양', fit: '건이 많고 날짜·담당·수량을 나란히 훑는 일' },
    { id: 'board', ko: '진행 보드형', say: '단계별 칸에 건을 카드로 놓는 모양', fit: '지금 어느 단계인지, 누구 차례인지가 중요한 일' },
    { id: 'card', ko: '카드·상세형', say: '한 건을 크게 보여 주는 모양', fit: '고객이 직접 보거나 휴대폰으로 주로 보는 일' }
  ];

  /* ── 색 10 — 시드(밝게의 버튼 색) 하나씩. 바탕·글자·어둡게는 엔진이 만든다 ── */
  var PALETTES = [
    { id: 'navy', ko: '남색', seed: '#1F3A68' },
    { id: 'charcoal', ko: '차콜(진회색)', seed: '#33363B' },
    { id: 'green', ko: '녹색', seed: '#1F5B3E' },
    { id: 'brown', ko: '갈색', seed: '#6B4A2E' },
    { id: 'teal', ko: '청록', seed: '#005C60' },
    { id: 'wine', ko: '와인', seed: '#6E2538' },
    { id: 'terracotta', ko: '테라코타', seed: '#A54A24' },
    { id: 'slate', ko: '슬레이트(청회색)', seed: '#3D5265' },
    { id: 'olive', ko: '올리브', seed: '#595C27' },
    { id: 'plum', ko: '자두', seed: '#5E335A' }
  ];
  var CUSTOM = { id: 'custom', ko: '내 색' };
  /* 이름이 붙은 시드(화면 표시용) */
  var SEED_NAMES = { '#84745C': '브론즈' };

  var SCHEMES = [
    { id: 'auto', ko: '자동(기기 설정)' },
    { id: 'light', ko: '밝게' },
    { id: 'dark', ko: '어둡게' }
  ];
  var RADII = [
    { id: 'sharp', ko: '각지게' },
    { id: 'base', ko: '기본' },
    { id: 'round', ko: '둥글게' }
  ];
  var DENSITIES = [
    { id: 'compact', ko: '촘촘' },
    { id: 'base', ko: '기본' },
    { id: 'roomy', ko: '넉넉' }
  ];
  var SCREENS = [
    { id: 'list', ko: '목록' },
    { id: 'detail', ko: '상세·입력' },
    { id: 'today', ko: '오늘 현황' }
  ];

  /* ── 스타일 패밀리 7 ─────────────────────────────────────────
     패밀리 = 서체·글자 크기 4종 값·굵기·간격·모서리·그림자·선 굵기·누르는 곳 + 바탕·면·선의 성격(neutral).
     neutral 은 색 엔진에 넘기는 출발점이다 — '#RRGGBB' 는 그 색에서 출발(통과하면 그대로), 숫자는 OKLCH 명도.
     pick = 추천 조합으로 골랐을 때의 기본 색. 글자 크기 4종(+입력 칸)·굵기 3종 규칙은 모두 같다. */
  var FAMILIES = [
    { id: 'calm', ko: '차분한 기본', say: '회색 바탕에 흰 상자, 살짝 둥근 모서리. 가장 무난한 기본형',
      pick: { palette: 'navy' }, fonts: ['pretendard'],
      font: { title: SANS, num: MONO },
      size: { title: 19, body: 14, label: 13, meta: 12, input: 16 },
      weight: { normal: 400, medium: 600, bold: 700 },
      leading: { tight: 1.35, body: 1.55 }, tracking: '-0.01em',
      space: [4, 8, 12, 16, 24, 32],
      radius: { box: 6, small: 4, button: 4, large: 8 }, line: 1,
      tap: { base: 40, touch: 44, row: 40 },
      shadow: null,
      neutral: { light: {}, dark: {} } },

    { id: 'editorial', ko: '에디토리얼 미니멀', say: '흰 바탕에 큰 명조 제목과 가는 줄, 넓은 여백. 잡지처럼 정돈된 인상',
      pick: { palette: 'charcoal' }, fonts: ['pretendard', 'gowun'],
      font: { title: SERIF, num: SANS },
      size: { title: 28, body: 15, label: 13, meta: 12, input: 16 },
      weight: { normal: 400, medium: 500, bold: 600 },
      leading: { tight: 1.25, body: 1.6 }, tracking: '-0.02em',
      space: [4, 8, 16, 24, 40, 56],
      radius: { box: 0, small: 2, button: 2, large: 0 }, line: 1,
      tap: { base: 40, touch: 44, row: 48 },
      shadow: null,
      neutral: {
        light: { bg: 1, surface: 1, surface2: 0.965, border: 0.9, strong: 0.45, strongRatio: 7 },
        dark: { bg: 0.17, surface: 0.17, surface2: 0.21, border: 0.32, strong: 0.8, strongRatio: 7 }
      } },

    { id: 'soft', ko: '소프트', say: '둥근 모서리와 옅은 그림자, 알약 모양 버튼. 부드럽고 친근한 인상',
      pick: { palette: 'teal' }, fonts: ['pretendard'],
      font: { title: SANS, num: SANS },
      size: { title: 20, body: 15, label: 13, meta: 12, input: 16 },
      weight: { normal: 400, medium: 600, bold: 700 },
      leading: { tight: 1.35, body: 1.55 }, tracking: '-0.01em',
      space: [4, 8, 12, 16, 24, 32],
      radius: { box: 16, small: 10, button: 999, large: 24 }, line: 1,
      tap: { base: 44, touch: 48, row: 48 },
      shadow: function (c, scheme) {
        if (scheme === 'dark') return ['0 4px 16px rgba(0, 0, 0, 0.40)', '0 8px 24px rgba(0, 0, 0, 0.45)', '0 16px 40px rgba(0, 0, 0, 0.55)'];
        return ['0 4px 16px ' + E.rgba(c.text, 0.08), '0 8px 24px ' + E.rgba(c.text, 0.10), '0 16px 40px ' + E.rgba(c.text, 0.16)];
      },
      neutral: {
        light: { bg: 0.965, surface: 1, surface2: 0.975, border: 0.93 },
        dark: { bg: 0.17, surface: 0.245, surface2: 0.275, border: 0.31 }
      } },

    { id: 'bold', ko: '선명한 대비', say: '굵은 줄과 진한 글자, 모서리 없음. 촘촘하고 또렷한 인상',
      pick: { palette: 'green' }, fonts: ['pretendard'],
      font: { title: SANS, num: MONO },
      size: { title: 22, body: 14, label: 13, meta: 12, input: 16 },
      weight: { normal: 400, medium: 700, bold: 800 },
      leading: { tight: 1.2, body: 1.45 }, tracking: '-0.02em',
      space: [4, 8, 12, 16, 20, 24],
      radius: { box: 0, small: 0, button: 0, large: 0 }, line: 2,
      tap: { base: 40, touch: 44, row: 40 },
      shadow: null,
      neutral: {
        light: { bg: 1, surface: 1, surface2: 0.95, border: 0.62, text2: 0.38, text3: 0.48, input: 'text', strong: 'text' },
        dark: { bg: 0.17, surface: 0.17, surface2: 0.205, border: 0.55, text2: 0.84, text3: 0.74, input: 'text', strong: 'text' }
      } },

    { id: 'paper', ko: '따뜻한 종이', say: '크림색 바탕과 얇은 줄, 제목은 명조. 서류처럼 따뜻한 인상',
      pick: { palette: 'olive' }, fonts: ['pretendard', 'gowun'],
      font: { title: SERIF, num: SANS },
      size: { title: 23, body: 15, label: 13, meta: 12, input: 16 },
      weight: { normal: 400, medium: 600, bold: 700 },
      leading: { tight: 1.3, body: 1.65 }, tracking: '0em',
      space: [4, 8, 12, 20, 28, 40],
      radius: { box: 4, small: 2, button: 2, large: 6 }, line: 1,
      tap: { base: 40, touch: 44, row: 44 },
      shadow: null,
      neutral: {
        light: { bg: '#F4EFE5', surface: '#FBF8F2', surface2: '#F0E9DC', border: '#E1D7C5', input: '#C9BBA2',
          text: '#221D16', text2: '#584E41', text3: '#665B4C', softMix: ['#F0E9DC', 0.4] },
        dark: { bg: '#1C1915', surface: '#23201B', surface2: '#2B2722', border: '#3B352D', input: '#544C40',
          text: '#EEE7DB', text2: '#C9BFAE', text3: '#B0A694', softMix: ['#2B2722', 0.4] }
      } },

    /* 인디언즈 스타일 — 운영 앱 토큰의 모양 값(2026-10-08 확인: 모서리 16/10/22 · 그림자 3단 · 누르는 곳 48 ·
       바탕 #FAFAF8 · 면 #FFFFFF · 선 #EBE8E2/#DDD8CF · 글자 #1A1A18 · 보조 #8A857B · 선택 바탕 #F1EFE9 · Pretendard).
       색은 브론즈 시드 #84745C(운영 앱 #8A7A62 의 명도만 0.02 낮춤 — 흰 글자 4.5:1, 대표 결정 2026-10-08)를 엔진에 넣어 만든다.
       보조 글자·뜻 색·입력 칸 선은 엔진이 대비 기준까지 보정하고, 어둡게는 엔진이 새로 만든다. 로고·이름·문구는 넣지 않는다. */
    { id: 'indeans', ko: '인디언즈 스타일', say: '따뜻한 흰 바탕에 크게 둥근 상자와 옅은 그림자, 브론즈 강조. 누르는 곳이 넉넉하다',
      pick: { palette: 'custom', seed: '#84745C' }, fonts: ['pretendard'],
      font: { title: SANS, num: SANS },
      size: { title: 22, body: 15, label: 13, meta: 12, input: 16 },
      weight: { normal: 400, medium: 600, bold: 800 },
      leading: { tight: 1.22, body: 1.5 }, tracking: '-0.025em',
      space: [4, 8, 12, 16, 24, 32],
      radius: { box: 16, small: 10, button: 10, large: 22 }, line: 1,
      tap: { base: 48, touch: 48, row: 48 },
      shadow: function (c, scheme) {
        if (scheme === 'dark') {
          return ['0 1px 2px rgba(0, 0, 0, 0.30), 0 2px 6px rgba(0, 0, 0, 0.24)',
            '0 6px 18px -8px rgba(0, 0, 0, 0.50), 0 12px 30px -16px rgba(0, 0, 0, 0.40)',
            '0 12px 28px -10px rgba(0, 0, 0, 0.60), 0 22px 50px -22px rgba(0, 0, 0, 0.50)'];
        }
        return ['0 1px 2px rgba(26, 26, 24, 0.04), 0 2px 6px rgba(26, 26, 24, 0.04)',
          '0 6px 18px -8px rgba(26, 26, 24, 0.12), 0 12px 30px -16px rgba(26, 26, 24, 0.10)',
          '0 12px 28px -10px rgba(26, 26, 24, 0.16), 0 22px 50px -22px rgba(26, 26, 24, 0.14)'];
      },
      neutral: {
        semSeed: { ok: '#5F8A50', warn: '#9C7D3A', danger: '#BE5A51' },
        light: { bg: '#FAFAF8', surface: '#FFFFFF', surface2: '#F6F4EF', border: '#EBE8E2', input: '#DDD8CF',
          text: '#1A1A18', text2: '#8A857B', text3: '#8A857B', soft: '#F1EFE9', softFixed: { seed: '#84745C', hex: '#F1EFE9' } },
        dark: { tintHue: 95, tintChroma: 0.006 }
      } },

    /* 단단한 기업형 — 흰 바탕 + 뚜렷한 회색 3단(명도 100/93/86%) · 모서리 4 통일 · 그림자 없음.
       값은 DaisyUI corporate·Flowbite enterprise 테마(둘 다 MIT)를 참고해 다시 정했다(코드 복사 없음) — THIRD-PARTY-NOTICES.md */
    { id: 'corporate', ko: '단단한 기업형', say: '흰 바탕에 또렷한 회색 띠와 선, 작은 모서리. 표가 많은 업무 화면에 맞는 단정한 인상',
      pick: { palette: 'slate' }, fonts: ['pretendard'],
      font: { title: SANS, num: SANS },
      size: { title: 20, body: 14, label: 13, meta: 12, input: 16 },
      weight: { normal: 400, medium: 600, bold: 700 },
      leading: { tight: 1.3, body: 1.5 }, tracking: '-0.01em',
      space: [4, 8, 12, 16, 24, 32],
      radius: { box: 4, small: 4, button: 4, large: 6 }, line: 1,
      tap: { base: 40, touch: 44, row: 40 },
      shadow: null,
      neutral: {
        light: { bg: 1, surface: 1, surface2: 0.93, border: 0.86, tintChroma: 0.005 },
        dark: { bg: 0.16, surface: 0.19, surface2: 0.25, border: 0.34, tintChroma: 0.005 }
      } }
  ];


  /* ── 2단계 선택창의 테마 4 (2026-11-17) ───────────────────────
     선택창(app/selector.js)의 THEMES 와 id·기본 색·기본 밝기·기본 배치가 같아야 한다.
     모양 값은 선택창 미리 보기와 같은 인상을 내되 이 파일의 점검 기준(본문 14px·누르는 곳 40/44px·간격 4의 배수)을 지킨다.
     색은 선택창과 같은 방식(바탕 성격 없이 시드 하나에서 계산 — E.derive(seed, scheme))으로 만든다. */
  var THEMES = [
    { id: 'shop', ko: '따뜻한 매장', seed: '#C45C26', scheme: 'light', nav: 'top', body: 'cards',
      say: '밝은 크림 바탕, 사진이 크고 모서리가 둥글다', fonts: ['pretendard', 'gowun'],
      font: { title: SERIF, num: SANS },
      size: { title: 22, body: 15, label: 13, meta: 12, input: 16 },
      weight: { normal: 400, medium: 600, bold: 700 },
      leading: { tight: 1.3, body: 1.6 }, tracking: '0em',
      space: [4, 8, 12, 16, 24, 32],
      radius: { box: 22, small: 14, button: 999, large: 28 }, line: 1,
      tap: { base: 46, touch: 48, row: 48 },
      shadow: function (c, scheme) { return scheme === 'dark' ? ['none', 'none', 'none'] : ['0 8px 24px rgba(80, 40, 16, 0.10)', '0 10px 28px rgba(80, 40, 16, 0.12)', '0 16px 40px rgba(80, 40, 16, 0.16)']; },
      neutral: undefined },
    { id: 'large', ko: '큰 글씨', seed: '#CA8A04', scheme: 'light', nav: 'bottom', body: 'cards',
      say: '글씨와 단추가 크고 줄은 두껍고 모서리는 거의 없다', fonts: ['pretendard'],
      font: { title: SANS, num: MONO },
      size: { title: 26, body: 18, label: 16, meta: 15, input: 18 },
      weight: { normal: 400, medium: 700, bold: 800 },
      leading: { tight: 1.25, body: 1.5 }, tracking: '-0.03em',
      space: [4, 8, 12, 16, 20, 28],
      radius: { box: 4, small: 2, button: 4, large: 6 }, line: 2.5,
      tap: { base: 56, touch: 56, row: 56 },
      shadow: null, neutral: undefined },
    { id: 'list', ko: '촘촘한 목록', seed: '#0F766E', scheme: 'light', nav: 'side', body: 'table',
      say: '한 화면에 많이, 줄이 반듯하고 글씨는 작다', fonts: ['pretendard'],
      font: { title: SANS, num: MONO },
      size: { title: 18, body: 14, label: 13, meta: 12, input: 16 },
      weight: { normal: 400, medium: 600, bold: 700 },
      leading: { tight: 1.3, body: 1.45 }, tracking: '-0.02em',
      space: [4, 8, 12, 16, 20, 24],
      radius: { box: 2, small: 2, button: 2, large: 4 }, line: 1,
      tap: { base: 40, touch: 44, row: 40 },
      shadow: null, neutral: undefined },
    { id: 'brand', ko: '우리 회사 색', seed: null, scheme: 'dark', nav: 'top', body: 'board',
      say: '기본이 어두운 화면이고 색 면이 넓게 들어간다', fonts: ['pretendard'],
      font: { title: SANS, num: MONO },
      size: { title: 22, body: 16, label: 14, meta: 13, input: 16 },
      weight: { normal: 400, medium: 600, bold: 700 },
      leading: { tight: 1.3, body: 1.55 }, tracking: '0.04em',
      space: [4, 8, 12, 20, 24, 32],
      radius: { box: 28, small: 18, button: 18, large: 32 }, line: 1,
      tap: { base: 48, touch: 48, row: 48 },
      shadow: function (c, scheme) { var v = scheme === 'dark' ? '0 0 0 1px rgba(255, 255, 255, 0.10)' : '0 0 0 1px rgba(0, 0, 0, 0.08)'; return [v, v, v]; },
      neutral: undefined }
  ];
  var BRAND_DEFAULT_SEED = '#6D28D9';
  var NAVS = [
    { id: 'side', ko: '왼쪽' },
    { id: 'top', ko: '위쪽 탭' },
    { id: 'bottom', ko: '아래 탭' }
  ];
  var BODIES = [
    { id: 'cards', ko: '카드', structure: 'card' },
    { id: 'table', ko: '목록', structure: 'list' },
    { id: 'board', ko: '보드', structure: 'board' }
  ];
  /* 인터뷰 업종 가지 → 추천 테마(선택창 BRANCH_THEME 과 같다) */
  var BRANCH_THEME = { B1: 'large', B2: 'shop', B3: 'shop', B4: 'large', B5: 'list', B6: 'shop', B7: 'list', B8: 'brand' };
  var BRANCH_NAME = {
    B1: '집 공사·수리·설치', B2: '가게·쇼핑몰', B3: '식당·카페·음식', B4: '예약·방문 서비스',
    B5: '공장·제작·도매·유통', B6: '학원·교습·강의', B7: '사무 서비스', B8: '그 밖'
  };
  function themeOf(id) { return byId(THEMES, id); }
  function bodyOf(id) { return byId(BODIES, id); }
  function famOf(sel) { return sel && sel.theme ? themeOf(sel.theme) : byId(FAMILIES, sel && sel.family); }
  /* 'B1'·'b1'·'1'·'branch-B1'·'가지 1' → 'B1' */
  function parseBranch(raw) {
    var u = String(raw == null ? '' : raw).trim().toUpperCase().replace(/^(BRANCH|가지)[\s_-]*/, '');
    if (/^[1-8]$/.test(u)) return 'B' + u;
    if (/^B[1-8]$/.test(u)) return u;
    return '';
  }
  function themeSeed(t, seed) { return E.normHex(seed) || t.seed || BRAND_DEFAULT_SEED; }

  var DEFAULTS = { structure: 'list', family: 'calm', palette: 'navy', seed: null, scheme: 'auto', radius: 'base', density: 'base' };

  /* ── 도우미 ─────────────────────────────────────────────── */
  function byId(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function low(v) { return v == null ? '' : String(v).trim().toLowerCase(); }

  function paletteSeed(id) { var p = byId(PALETTES, id); return p ? p.seed : null; }
  /* 고른 것을 고르게 다듬는다(빈 칸은 기본값, 이름 있는 색이면 시드를 그 색으로). 틀린 값은 그대로 두고 isValid 가 막는다 */
  function normalize(sel) {
    sel = sel || {};
    if (sel.theme != null && sel.theme !== '') {
      var tid = low(sel.theme), t = themeOf(tid);
      var tout = {
        theme: tid,
        seed: t ? themeSeed(t, sel.seed) : E.normHex(sel.seed),
        scheme: low(sel.scheme) || (t ? t.scheme : 'light'),
        nav: low(sel.nav) || (t ? t.nav : ''),
        body: low(sel.body) || (t ? t.body : ''),
        palette: 'custom', radius: 'base', density: 'base'
      };
      var b = bodyOf(tout.body);
      tout.structure = b ? b.structure : undefined;
      tout.family = 'theme-' + tid;
      return tout;
    }
    var out = {
      structure: sel.structure == null ? undefined : low(sel.structure),
      family: low(sel.family) || DEFAULTS.family,
      palette: low(sel.palette) || DEFAULTS.palette,
      seed: null,
      scheme: low(sel.scheme) || DEFAULTS.scheme,
      radius: low(sel.radius) || 'base',
      density: low(sel.density) || 'base'
    };
    if (out.structure === undefined) delete out.structure;
    out.seed = out.palette === 'custom' ? E.normHex(sel.seed) : paletteSeed(out.palette);
    return out;
  }
  function isValid(sel, needStructure) {
    if (!sel) return false;
    if (sel.theme) {
      return !!themeOf(sel.theme) && !!E.normHex(sel.seed) && !!byId(SCHEMES, sel.scheme) && !!byId(NAVS, sel.nav) && !!bodyOf(sel.body);
    }
    if ((needStructure || sel.structure != null) && !byId(STRUCTURES, sel.structure)) return false;
    if (!byId(FAMILIES, sel.family) || !byId(SCHEMES, sel.scheme) || !byId(RADII, sel.radius) || !byId(DENSITIES, sel.density)) return false;
    if (sel.palette === 'custom') return !!E.normHex(sel.seed);
    return !!byId(PALETTES, sel.palette);
  }
  function seedOf(sel) { return sel.palette === 'custom' ? E.normHex(sel.seed) : paletteSeed(sel.palette); }
  /* 추천 조합으로 골랐을 때의 색 */
  function comboColor(familyId) {
    var f = byId(FAMILIES, familyId);
    return f ? { palette: f.pick.palette, seed: f.pick.palette === 'custom' ? f.pick.seed : paletteSeed(f.pick.palette) } : null;
  }

  /* ── 조합 코드 ────────────────────────────────────────────── */
  function makeCode(selIn) {
    var sel = normalize(selIn);
    if (sel.theme) return ['theme', sel.theme, String(sel.seed).slice(1).toUpperCase(), sel.scheme, sel.nav, sel.body].join('-');
    var parts = [sel.structure, sel.family];
    if (sel.palette === 'custom') parts.push('custom', String(sel.seed).slice(1).toLowerCase());
    else parts.push(sel.palette);
    parts.push(sel.scheme);
    if (sel.radius !== 'base') parts.push(sel.radius);
    if (sel.density !== 'base') parts.push(sel.density);
    return parts.join('-');
  }
  /* 조합 코드 읽기 — 위 형식이 기본. 밝기를 빼면 자동(auto)으로 읽는다.
     옛 코드도 읽는다: 4단(list-calm-navy-light) 그대로 · 2단(list-navy — 첫 세트)은 차분한 기본·밝게로. 못 읽으면 null */
  /* 새 코드: theme-<테마>-<RRGGBB>-<밝기>-<메뉴>-<본문>. 대표가 옮겨 적다 생기는 앞뒤 따옴표·마침표·「로 할게요」는 떼고 읽는다.
     밝기·메뉴·본문이 빠졌으면 그 테마의 기본값으로 채운다(색이 빠지면 테마 기본 색). 못 읽으면 null */
  function parseThemeCode(code) {
    var s = low(code).replace(/^[\s"'`「『(]+|[\s"'`」』).]+$/g, '').replace(/\s*(로|으로)\s*할게요.*$/, '');
    var m = s.match(/theme-[a-z0-9-]+/);
    if (!m) return null;
    var p = m[0].split('-').filter(Boolean), i = 1;
    var t = themeOf(p[i++]);
    if (!t) return null;
    var sel = { theme: t.id };
    if (i < p.length && /^#?[0-9a-f]{6}$/.test(p[i])) sel.seed = '#' + p[i++].replace('#', '').toUpperCase();
    for (; i < p.length; i++) {
      if (!sel.scheme && byId(SCHEMES, p[i])) sel.scheme = p[i];
      else if (!sel.nav && byId(NAVS, p[i])) sel.nav = p[i];
      else if (!sel.body && bodyOf(p[i])) sel.body = p[i];
      else return null;
    }
    var out = normalize(sel);
    return isValid(out, true) ? out : null;
  }
  function parseCode(code) {
    if (/theme-/i.test(String(code || ''))) return parseThemeCode(code);
    var p = low(code).replace(/^#/, '').split('-');
    if (p.length < 2 || !byId(STRUCTURES, p[0])) return null;
    var sel = { structure: p[0] }, i = 1;
    if (byId(FAMILIES, p[i])) sel.family = p[i++];
    else if (p.length === 2 && byId(PALETTES, p[1])) { sel.family = 'calm'; sel.scheme = 'light'; }
    else return null;
    if (p[i] === 'custom') {
      if (!/^[0-9a-f]{6}$/.test(p[i + 1] || '')) return null;
      sel.palette = 'custom'; sel.seed = '#' + p[i + 1].toUpperCase(); i += 2;
    } else if (byId(PALETTES, p[i])) sel.palette = p[i++];
    else return null;
    if (i < p.length && byId(SCHEMES, p[i])) sel.scheme = p[i++];
    for (; i < p.length; i++) {
      if (!sel.radius && (p[i] === 'sharp' || p[i] === 'round')) sel.radius = p[i];
      else if (!sel.density && (p[i] === 'compact' || p[i] === 'roomy')) sel.density = p[i];
      else return null;
    }
    var out = normalize(sel);
    return isValid(out, true) ? out : null;
  }
  /* 추천 읽기 — 앞에서부터 있는 만큼만(구조 · 구조-스타일 · 구조-스타일-색 · …). 없는 칸은 비워 둔다 */
  /* 새 추천: 업종 가지(B1~B8) 또는 theme-<테마>[-색…]. { theme, branch?, seed?, scheme?, nav?, body? } — 없는 칸은 비워 둔다 */
  function parseRecommend(code) {
    var raw = String(code == null ? '' : code).trim();
    var br = parseBranch(raw);
    if (br) return { theme: BRANCH_THEME[br], branch: br };
    if (/^theme-/i.test(raw) || themeOf(low(raw))) {
      var p = low(raw).replace(/^theme-/, '').split('-').filter(Boolean);
      var t = themeOf(p[0]);
      if (!t) return null;
      var rec = { theme: t.id }, i = 1;
      if (i < p.length && /^[0-9a-f]{6}$/.test(p[i])) rec.seed = '#' + p[i++].toUpperCase();
      for (; i < p.length; i++) {
        if (!rec.scheme && byId(SCHEMES, p[i])) rec.scheme = p[i];
        else if (!rec.nav && byId(NAVS, p[i])) rec.nav = p[i];
        else if (!rec.body && bodyOf(p[i])) rec.body = p[i];
        else return null;
      }
      return rec;
    }
    return parseOldRecommend(code);
  }
  function parseOldRecommend(code) {
    var p = low(code).replace(/^#/, '').split('-').filter(Boolean);
    if (!p.length || !byId(STRUCTURES, p[0])) return null;
    var rec = { structure: p[0] }, i = 1;
    if (byId(FAMILIES, p[i])) rec.family = p[i++];
    if (p[i] === 'custom') {
      if (!/^[0-9a-f]{6}$/.test(p[i + 1] || '')) return null;
      rec.palette = 'custom'; rec.seed = '#' + p[i + 1].toUpperCase(); i += 2;
    } else if (byId(PALETTES, p[i])) { rec.palette = p[i++]; rec.seed = paletteSeed(rec.palette); }
    if (i < p.length && byId(SCHEMES, p[i])) rec.scheme = p[i++];
    return i === p.length ? rec : null;
  }

  function paletteLabel(sel) {
    if (sel.palette !== 'custom') return byId(PALETTES, sel.palette).ko;
    var seed = E.normHex(sel.seed);
    return (SEED_NAMES[seed] || CUSTOM.ko) + ' ' + seed;
  }
  function label(selIn) {
    var sel = normalize(selIn), parts = [];
    if (sel.theme) {
      var t = themeOf(sel.theme);
      return [t ? t.ko : sel.theme, (sel.theme === 'brand' ? '회사 색 ' : '색 ') + sel.seed, byId(SCHEMES, sel.scheme).ko,
        '메뉴 ' + byId(NAVS, sel.nav).ko, '본문 ' + bodyOf(sel.body).ko].join(' · ');
    }
    if (sel.structure) parts.push(byId(STRUCTURES, sel.structure).ko);
    parts.push(byId(FAMILIES, sel.family).ko, paletteLabel(sel), byId(SCHEMES, sel.scheme).ko);
    if (sel.radius !== 'base') parts.push('모서리 ' + byId(RADII, sel.radius).ko);
    if (sel.density !== 'base') parts.push('밀도 ' + byId(DENSITIES, sel.density).ko);
    return parts.join(' · ');
  }

  /* ── 색 · 모양 계산 ──────────────────────────────────────── */
  var colorCache = {};
  function colors(selIn, scheme) {
    var sel = normalize(selIn);
    var seed = sel.theme ? sel.seed : seedOf(sel);
    var key = sel.family + '|' + seed + '|' + scheme;
    if (!colorCache[key]) colorCache[key] = sel.theme ? E.derive(seed, scheme) : E.derive(seed, scheme, byId(FAMILIES, sel.family).neutral);
    return colorCache[key];
  }

  function round4(n) { return Math.max(4, Math.round(n / 4) * 4); }
  /* 밀도 — 간격(셋째부터)·목록 줄·누르는 곳만 바꾼다. 누르는 곳 40(손가락 44)·목록 줄 40 아래로는 내리지 않는다 */
  function shapeOf(f, sel) {
    var k = sel.density === 'compact' ? 0.75 : sel.density === 'roomy' ? 1.25 : 1;
    var sp = f.space.slice();
    if (k !== 1) {
      for (var i = 2; i < sp.length; i++) sp[i] = round4(f.space[i] * k);
      for (var j = 1; j < sp.length; j++) if (sp[j] <= sp[j - 1]) sp[j] = sp[j - 1] + 4;
    }
    var d = sel.density === 'compact' ? -1 : sel.density === 'roomy' ? 1 : 0;
    var tap = {
      base: Math.max(40, f.tap.base + d * 4),
      touch: Math.max(44, f.tap.touch + d * 4),
      row: Math.max(40, f.tap.row + d * 8)
    };
    var r = {}, MIN = { box: 12, small: 8, button: 8, large: 16 };
    ['box', 'small', 'button', 'large'].forEach(function (key) {
      var v = f.radius[key];
      if (sel.radius === 'sharp') r[key] = Math.min(v, 2);
      else if (sel.radius === 'round') r[key] = v >= 999 ? 999 : Math.max(Math.round(v * 1.5 / 2) * 2, MIN[key]);
      else r[key] = v;
    });
    return { space: sp, tap: tap, radius: r };
  }
  function shadowsOf(f, c, scheme) {
    return f.shadow ? f.shadow(c, scheme) : ['none', 'none', 'none'];
  }

  /* 토큰 한 벌(밝게 또는 어둡게) — [묶음 제목, 이름, 값, 설명, 밝기마다 다른가]. 순서가 곧 파일의 줄 순서다 */
  function tokens(selIn, scheme) {
    var sel = normalize(selIn);
    var f = famOf(sel);
    if (!f || !isValid(sel)) throw new Error('알 수 없는 조합입니다: ' + JSON.stringify(selIn));
    var sch = scheme === 'dark' ? 'dark' : 'light';
    var c = colors(sel, sch).c;
    var s = shapeOf(f, sel);
    var sh = shadowsOf(f, c, sch);
    var px = function (n) { return n + 'px'; };
    var G = {
      face: '면', line: '선', text: '글자', accent: '강조 — 하나만(버튼 면 · 그 위 글자 · 바탕 위 강조 글자)',
      sem: '뜻이 있는 색 — 면이 아니라 글자로만', font: '서체 — 앱 폴더 안의 글꼴 파일(fonts/)만 쓴다. 인터넷에서 받지 않는다',
      size: '글자 크기 — 화면에 쓰는 것은 4종(제목·본문·라벨·보조). 입력 칸(--fs-input)은 셈에서 뺀다',
      weight: '굵기 — 3종', lead: '줄 간격·자간', space: '간격 — 이 여섯 값만 쓴다', radius: '모서리', shadow: '그림자', tap: '누르는 곳'
    };
    return [
      [G.face, '--bg', c.bg, '화면 바탕', 1],
      [G.face, '--surface', c.surface, '표·카드 바탕', 1],
      [G.face, '--surface-2', c['surface-2'], '표 머리줄·열 바탕·비활성', 1],
      [G.line, '--border', c.border, '줄 사이 가는 선(장식)', 1],
      [G.line, '--border-strong', c['border-strong'], '구역 구분·머리줄 아래 — 바탕 대비 3:1 이상', 1],
      [G.line, '--border-input', c['border-input'], '입력 칸·보조 버튼 테두리 — 바탕 대비 3:1 이상', 1],
      [G.line, '--line-w', px(f.line), '상자·버튼·입력 칸 테두리 굵기', 0],
      [G.text, '--text', c.text, '본문·숫자', 1],
      [G.text, '--text-2', c['text-2'], '라벨·보조', 1],
      [G.text, '--text-3', c['text-3'], '날짜·빈 값', 1],
      [G.accent, '--primary', c.primary, '버튼 면·선택 막대(고른 색을 되도록 그대로)', 1],
      [G.accent, '--primary-on', c['primary-on'], '강조 버튼 위 글자', 1],
      [G.accent, '--primary-hover', c['primary-hover'], '버튼에 마우스를 올렸을 때', 1],
      [G.accent, '--primary-soft', c['primary-soft'], '선택된 줄·카드 바탕', 1],
      [G.accent, '--primary-text', c['primary-text'], '바탕 위 강조 글자·선택 표시선·포커스 테두리 — 4.5:1 이상', 1],
      [G.sem, '--ok', c.ok, '끝남·정상', 1],
      [G.sem, '--warn', c.warn, '지남·주의', 1],
      [G.sem, '--danger', c.danger, '지우기처럼 되돌릴 수 없는 행동에만', 1],
      [G.font, '--font-sans', SANS, '본문·라벨·버튼', 0],
      [G.font, '--font-title', f.font.title, '화면 제목·회사 이름', 0],
      [G.font, '--font-num', f.font.num, '번호·날짜·수량(자릿수를 맞춘다)', 0],
      [G.size, '--fs-title', px(f.size.title), '화면 제목', 0],
      [G.size, '--fs-body', px(f.size.body), '본문·표 내용(기준)', 0],
      [G.size, '--fs-label', px(f.size.label), '라벨·머리줄·버튼', 0],
      [G.size, '--fs-meta', px(f.size.meta), '날짜·보조', 0],
      [G.size, '--fs-input', px(f.size.input), '입력 칸 — 이보다 작으면 휴대폰에서 입력할 때 화면이 확대된다', 0],
      [G.weight, '--fw-normal', String(f.weight.normal), '', 0],
      [G.weight, '--fw-medium', String(f.weight.medium), '', 0],
      [G.weight, '--fw-bold', String(f.weight.bold), '', 0],
      [G.lead, '--lh-tight', String(f.leading.tight), '제목', 0],
      [G.lead, '--lh-body', String(f.leading.body), '본문', 0],
      [G.lead, '--ls-title', f.tracking, '제목 자간', 0],
      [G.space, '--sp-1', px(s.space[0]), '', 0],
      [G.space, '--sp-2', px(s.space[1]), '', 0],
      [G.space, '--sp-3', px(s.space[2]), '', 0],
      [G.space, '--sp-4', px(s.space[3]), '', 0],
      [G.space, '--sp-5', px(s.space[4]), '', 0],
      [G.space, '--sp-6', px(s.space[5]), '', 0],
      [G.radius, '--radius', px(s.radius.box), '표·카드·상자', 0],
      [G.radius, '--radius-sm', px(s.radius.small), '작은 것(입력 칸·단계 표시)', 0],
      [G.radius, '--radius-btn', px(s.radius.button), '버튼', 0],
      [G.radius, '--radius-lg', px(s.radius.large), '큰 상자(아래에서 올라오는 시트·창)', 0],
      [G.shadow, '--shadow', sh[0], f.shadow ? '상자에만 한 겹' : '쓰지 않는다', 1],
      [G.shadow, '--shadow-md', sh[1], f.shadow ? '떠 있는 카드' : '쓰지 않는다', 1],
      [G.shadow, '--shadow-lg', sh[2], f.shadow ? '시트·창' : '쓰지 않는다', 1],
      [G.tap, '--tap', px(s.tap.base), '버튼·메뉴의 최소 높이', 0],
      [G.tap, '--tap-touch', px(s.tap.touch), '손가락으로 누르는 기기에서의 최소 높이(base.css 가 바꿔 끼운다)', 0],
      [G.tap, '--row-h', px(s.tap.row), '목록 한 줄의 최소 높이', 0]
    ];
  }

  /* 고른 조합이 쓰는 글꼴 파일과 라이선스 파일 */
  function fontsOf(selIn) {
    var f = famOf(normalize(selIn)), files = [], licenses = [], faces = [], notes = [];
    f.fonts.forEach(function (k) {
      var set = FONT_SETS[k];
      set.faces.forEach(function (face) { faces.push(face); files.push(face.file); });
      licenses.push(set.license);
      notes.push(set.note);
    });
    return { faces: faces, files: files, licenses: licenses, notes: notes };
  }
  function fontFaceCss(selIn, base) {
    var info = fontsOf(selIn);
    var out = ['/* 글꼴 — 앱 폴더 안의 글꼴 파일만 쓴다(인터넷에서 받지 않는다). 라이선스 전문은 글꼴 폴더의 LICENSE-*.txt'];
    info.notes.forEach(function (n) { out.push('   ' + n); });
    out[out.length - 1] += ' */';
    info.faces.forEach(function (face) {
      out.push('@font-face { font-family: "' + face.family + '"; font-style: normal; font-weight: ' + face.weight +
        '; font-display: swap; src: local("' + face.local + '"), url("' + base + face.file + '") format("woff2"); }');
    });
    return out;
  }

  function block(list, indent) {
    var out = [], group = null, pad = indent;
    for (var i = 0; i < list.length; i++) {
      var t = list[i];
      if (t[0] !== group) { group = t[0]; out.push('', pad + '/* ' + group + ' */'); }
      var decl = pad + t[1] + ': ' + t[2] + ';';
      if (t[3]) { while (decl.length < 34 + pad.length - 2) decl += ' '; decl += '  /* ' + t[3] + ' */'; }
      out.push(decl);
    }
    return out;
  }

  /* 토큰 파일 본문 — 첫 줄 주석에 조합 코드. opts.fontBase = 글꼴 폴더(앱: './fonts/', 목업 미리 보기: '../fonts/')
     밝기 자동(auto) = 밝게 :root + @media (prefers-color-scheme: dark) 어둡게 + [data-theme="dark"] 강제 */
  function tokenCss(selIn, opts) {
    opts = opts || {};
    var sel = normalize(selIn);
    if (!isValid(sel, true)) throw new Error('알 수 없는 조합입니다: ' + JSON.stringify(selIn));
    var base = opts.fontBase == null ? './fonts/' : opts.fontBase;
    var head = [
      '/* ' + makeCode(sel) + ' — 우리 앱 디자인 토큰 · 인디언즈 ERP 클래스',
      '   ' + label(sel),
      '   선택창(.owner/design/index.html)에서 고른 조합으로 만든 파일이다. 값은 회사에 맞게 바꿔도 되지만',
      '   강조색(--primary)은 하나만 두고, 바꾼 줄은 company/design.md 의 "값을 바꾼 곳"에 적는다.',
      '   --primary 는 버튼 면에만(그 위 글자는 --primary-on), 바탕 위 강조 글자·선택 표시선·포커스 테두리는 --primary-text.'
    ];
    if (sel.theme) head.push('   화면 배치: 메뉴 ' + byId(NAVS, sel.nav).ko + '(layout.css 의 nav-' + sel.nav + ' 절) · 본문 ' + bodyOf(sel.body).ko + '(구조 ' + sel.structure + ' — 목업 .owner/design/src/' + sel.structure + '.html)');
    if (sel.scheme === 'auto') head.push('   밝기 자동: 아래 :root 가 밝게, @media 블록이 어둡게(기기 설정을 따른다). <html data-theme="light|dark"> 로 한쪽을 강제할 수 있다.');
    head[head.length - 1] += ' */';
    var first = sel.scheme === 'dark' ? 'dark' : 'light';
    var out = head.concat([''], fontFaceCss(sel, base), ['', ':root {', '  color-scheme: ' + first + ';'], block(tokens(sel, first), '  '), ['}', '']);
    if (sel.scheme === 'auto') {
      var darkList = tokens(sel, 'dark').filter(function (t) { return t[4]; });
      out = out.concat(['/* 어둡게 — 기기 설정이 어두운 화면일 때(위 :root 의 같은 이름을 덮는다) */', '@media (prefers-color-scheme: dark) {', '  :root:not([data-theme="light"]) {', '    color-scheme: dark;'],
        block(darkList, '    '), ['  }', '}', '', '/* 어둡게 강제 — <html data-theme="dark"> */', ':root[data-theme="dark"] {', '  color-scheme: dark;'], block(darkList, '  '), ['}', '']);
    }
    return out.join('\n');
  }

  /* ── 대비 자가 검사 — 쓸 밝기(자동이면 둘 다) 모두 ───────────── */
  var TEXT_FG = ['text', 'text-2', 'text-3', 'ok', 'warn', 'danger', 'primary-text'];
  var TEXT_BG = ['bg', 'surface', 'surface-2', 'primary-soft'];
  var LABEL_PAIRS = [['primary-on', 'primary'], ['primary-on', 'primary-hover']];
  var LINE_FG = ['border-input', 'border-strong'];
  var LINE_BG = ['bg', 'surface', 'surface-2'];
  function selfCheck(selIn) {
    var sel = normalize(selIn);
    var res = { ok: true, text: 0, line: 0, fails: [], worstText: Infinity, worstLine: Infinity };
    if (!isValid(sel)) { res.ok = false; res.fails.push('알 수 없는 조합'); return res; }
    var schemes = sel.scheme === 'auto' ? ['light', 'dark'] : [sel.scheme];
    schemes.forEach(function (sch) {
      var c = colors(sel, sch).c, r, i, j;
      var name = sch === 'dark' ? '어둡게' : '밝게';
      for (i = 0; i < TEXT_FG.length; i++) for (j = 0; j < TEXT_BG.length; j++) {
        r = E.ratio(c[TEXT_FG[i]], c[TEXT_BG[j]]); res.text++; res.worstText = Math.min(res.worstText, r);
        if (r < 4.5) res.fails.push(name + ' --' + TEXT_FG[i] + ' / --' + TEXT_BG[j] + ' ' + r.toFixed(2));
      }
      for (i = 0; i < LABEL_PAIRS.length; i++) {
        r = E.ratio(c[LABEL_PAIRS[i][0]], c[LABEL_PAIRS[i][1]]); res.text++; res.worstText = Math.min(res.worstText, r);
        if (r < 4.5) res.fails.push(name + ' --' + LABEL_PAIRS[i][0] + ' / --' + LABEL_PAIRS[i][1] + ' ' + r.toFixed(2));
      }
      for (i = 0; i < LINE_FG.length; i++) for (j = 0; j < LINE_BG.length; j++) {
        r = E.ratio(c[LINE_FG[i]], c[LINE_BG[j]]); res.line++; res.worstLine = Math.min(res.worstLine, r);
        if (r < 3) res.fails.push(name + ' --' + LINE_FG[i] + ' / --' + LINE_BG[j] + ' ' + r.toFixed(2) + '(선 3:1)');
      }
    });
    res.ok = res.fails.length === 0;
    return res;
  }

  root.ERP_DESIGN = {
    version: 3,
    themes: THEMES,
    navs: NAVS,
    bodies: BODIES,
    branchTheme: BRANCH_THEME,
    branchName: BRANCH_NAME,
    parseBranch: parseBranch,
    parseThemeCode: parseThemeCode,
    structures: STRUCTURES,
    families: FAMILIES,
    palettes: PALETTES,
    custom: CUSTOM,
    schemes: SCHEMES,
    radii: RADII,
    densities: DENSITIES,
    screens: SCREENS,
    defaults: DEFAULTS,
    fontSets: FONT_SETS,
    pairs: { textFg: TEXT_FG, textBg: TEXT_BG, label: LABEL_PAIRS, lineFg: LINE_FG, lineBg: LINE_BG },
    byId: byId,
    normalize: normalize,
    isValid: isValid,
    seedOf: seedOf,
    comboColor: comboColor,
    parseCode: parseCode,
    parseRecommend: parseRecommend,
    makeCode: makeCode,
    label: label,
    paletteLabel: paletteLabel,
    colors: colors,
    tokens: tokens,
    tokenCss: tokenCss,
    fontsOf: fontsOf,
    selfCheck: selfCheck,
    engine: E
  };
}(typeof window !== 'undefined' ? window : globalThis));
