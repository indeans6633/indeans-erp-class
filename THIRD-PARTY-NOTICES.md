# 가져온 자료와 라이선스 (THIRD-PARTY-NOTICES)

이 저장소의 스킬·훅·선택창 코드는 우리가 직접 썼고 이용 조건은 `LICENSE.md` 를 따른다. 이 문서는 **바깥에서 가져온 것**을 모두 적는다 — 파일째 넣은 것, 값이나 방식만 가져온 것, 생김새만 참고한 것을 나눠 적는다.

- **파일째 넣은 것**은 그 라이선스의 조건(저작권 줄·라이선스 전문 함께 두기)을 지킨다. 글꼴 파일 옆에 라이선스 전문이 있고, 수강생 프로젝트로 복사될 때도 함께 간다.
- **값·방식만 가져온 것**은 코드를 복사하지 않았다. 숫자·설계만 옮긴 경우도 보수적으로 출처를 적는다.
- 이 문서는 일반적인 해석으로 쓴 것이며 법률 검토가 아니다.

## 1. 파일째 넣은 것 — 글꼴 2종

### Pretendard (본문 글꼴)

| 항목 | 내용 |
|---|---|
| 버전 | 1.3.9 — 제작자 공식 릴리스 `Pretendard-1.3.9.zip`(2023-11-05, github.com/orioncactus/pretendard 의 Releases) |
| 저작권 | Copyright (c) 2021, Kil Hyung-jin, with Reserved Font Name Pretendard. |
| 라이선스 | SIL Open Font License, Version 1.1 — 전문 `images/design/fonts/LICENSE-Pretendard.txt`(릴리스의 `LICENSE.txt` 그대로) |
| 넣은 파일 | `images/design/fonts/Pretendard-Regular.subset.woff2`(267,096바이트, SHA-256 `01dd73155fdfab7ce9b25224523e85a96927e21aef97f21957d41f1bfa7e3878`) · `images/design/fonts/Pretendard-Bold.subset.woff2`(270,784바이트, SHA-256 `78eb71c33101ee7d4f8d1b777d193a12d00f8a296e712a8c417cf27abe946397`) |
| 손댄 것 | 없음. 제작자가 배포한 서브셋(`web/static/woff2-subset/`, 한글 2,780자 — KS X 1001 2,350자 포함)을 한 바이트도 바꾸지 않았다. 예약 글꼴 이름(Reserved Font Name)이 있어 직접 서브셋하지 않는다(서브셋은 수정본으로 본다 — OFL-FAQ 2.6). npm 배포본 `pretendard@1.3.9` 의 같은 파일과 해시가 같다 |

### Gowun Batang · 고운바탕 (명조 제목 글꼴 — 에디토리얼·따뜻한 종이)

| 항목 | 내용 |
|---|---|
| 버전 | 2.000 — Google Fonts 저장소 `ofl/gowunbatang/GowunBatang-Bold.ttf`(원 저장소 github.com/yangheeryu/Gowun-Batang, 커밋 4e73f5a) |
| 저작권 | Copyright 2021 The Gowun Batang Project Authors (https://github.com/yangheeryu/Gowun-Batang) |
| 라이선스 | SIL Open Font License, Version 1.1 (예약 글꼴 이름 없음) — 전문 `images/design/fonts/LICENSE-GowunBatang.txt`(원본 `OFL.txt` 그대로) |
| 넣은 파일 | `images/design/fonts/GowunBatang-Bold.subset.woff2`(200,504바이트, SHA-256 `3a98cfc1fdcdd28313401b021b1c25040cb01a57526247fe0b851decfafc1012`) |
| 손댄 것 | **수정본(서브셋)이다.** 원본 굵게(Bold) 한 벌에서 KS X 1001 한글 2,350자 + KS X 1001 기호 + 기본 라틴·문장부호만 남기고(글자 3,234개) woff2 로 바꿨다 — fontTools 4.66.1, 힌팅 제거, 이름 표(저작권·라이선스 설명·주소)는 그대로 두었다. OFL 에 따라 같은 라이선스로 배포하며 글꼴만 따로 팔지 않는다 |

글꼴은 이 컴퓨터 안의 파일로만 쓴다(인터넷에서 받지 않는다). 수강생 프로젝트에서는 선택창(`hooks/design-pick.mjs`)이 고른 스타일이 쓰는 글꼴과 라이선스 전문을 `src/styles/fonts/` 로 함께 복사하고, `src/styles/tokens.css` 의 `@font-face` 위 주석에 저작권 줄을 적는다. 서브셋에 없는 드문 글자는 글꼴 목록 끝의 시스템 글꼴이 그린다.

## 2. 값·방식을 가져온 것 — 코드는 직접 썼다

| 출처 | 라이선스 | 가져온 것 | 쓰인 곳 |
|---|---|---|---|
| WCAG 2.2(W3C) | W3C 공개 규격 | 상대 휘도·대비비 공식(임계 0.04045), 글자 4.5:1 · 비텍스트 3:1 기준 | `images/design/app/color-engine.js`(직접 구현) · `scripts/build-design-tokens.mjs` |
| OKLab 색 공간 — Björn Ottosson, "A perceptual color space for image processing"(2020) | 공개 도메인(대안으로 MIT) | sRGB ↔ OKLab 변환 행렬 값 | `images/design/app/color-engine.js` |
| Adobe Leonardo · Radix Colors 생성기 · Material Color Utilities | Apache-2.0 · MIT · Apache-2.0 | 방식만: 목표 대비에서 명도를 거꾸로 찾기, 브랜드 색을 버튼 면에 그대로 두고 그 위 글자를 흰색·진한 색 중 고르기, 흰색·검정에 가까운 색만 예외로 옮기기, 어둡게에서 강조색을 밝히고 그 위 글자를 뒤집기 | `images/design/app/color-engine.js`(코드는 직접 작성 — 세 라이브러리의 코드를 옮기지 않았다) |
| DaisyUI corporate 테마 · Flowbite enterprise 테마 | MIT · MIT | 단단한 기업형의 수치: 모서리 4px 통일, 흰 바탕 + 회색 3단(명도 100/93/86%), 그림자 없음 | `images/design/app/design-rules.js` 의 `corporate` |
| Web Awesome(무료 테마) · Radix Themes | MIT · MIT | 설계만: 모서리·밀도를 스타일에서 떼어 배율로 바꾸는 구조 | `images/design/app/design-rules.js` 의 모서리·밀도(`shapeOf`) |
| 인디언즈 운영 앱 토큰 | 자사 | 인디언즈 스타일의 모양 값: 모서리 16/10/22 · 그림자 3단 · 누르는 곳 48 · 바탕 #FAFAF8 · 면 #FFFFFF · 선 #EBE8E2/#DDD8CF · 글자 #1A1A18 · 보조 #8A857B · 선택 바탕 #F1EFE9 · 뜻 색 3가지(엔진이 대비 보정) · 브론즈 #8A7A62 → #84745C | `images/design/app/design-rules.js` 의 `indeans` |

## 3. 생김새·패턴만 참고한 것 — 코드·문장·값을 쓰지 않았다

| 출처 | 라이선스 | 참고한 것 | 우리 쪽 |
|---|---|---|---|
| Tabler(`.table-mobile`·`.empty`·`.offcanvas-bottom`·`.form-selectgroup`) | MIT | 표를 좁은 화면에서 접는 생김새, 빈 화면, 아래에서 올라오는 시트, 버튼형 선택 칩 | `images/design/src/base.css`·`layout-list.css` — CSS 를 직접 썼다(복사 없음) |
| daisyUI(`modal-bottom`·`<dialog>` 패턴) | MIT | `<dialog>` 하나로 폰에서는 아래 시트, 넓은 화면에서는 가운데 창 | `images/design/src/base.css` 의 `.sheet` — 직접 작성 |
| Adrian Roselli, "A Responsive Accessible Table"(글) | 글 | 접힌 표에 표 역할(ARIA role)을 붙여 화면 읽기 프로그램이 표로 읽게 하는 방법 | `images/design/src/list.html`·`layout-list.css` |
| shadcn/ui 스타일(Vega·Sera·Maia) · tweakcn 프리셋 | MIT · Apache-2.0 | 추천 조합 원형의 구분(기본·편집형·부드러운형·대비형·회사풍 프리셋을 같은 틀로 두는 방식) | 스타일 값은 1차 선택기 값과 운영 앱 값 — 두 프로젝트의 값을 옮기지 않았다 |
| 폰 칸반 "한 화면에 한 열 + 다음 열 살짝 + 열 탭" | 라이선스 미확인 | 아이디어만 | `images/design/src/layout-board.css`·`board.html` — 직접 작성 |

## 4. 쓰지 않은 것

- **APCA 대비 공식(apca-w3)·apcach·Harmonizer·Leonardo 의 코드** — 라이선스 문제(제한 조건·AGPL 하위 의존·라이선스 없음)로 코드·문장을 옮기지 않았다. 대비는 WCAG 2.2 공식만 쓴다.
- **GPL·AGPL·BSL 계열 ERP**(ERPNext·Odoo·Dolibarr·Plane·Akaunting·Twenty 본체) — 코드·CSS·아이콘을 쓰지 않았다.
- **유료·혼합 라이선스 UI**(Web Awesome Pro·Preline) — 쓰지 않았다.
