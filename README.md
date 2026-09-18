# 인디언즈 ERP 클래스 (indeans-erp-class)

회사를 운영하는 대표가 **자기 회사 운영 앱(ERP)** 을 AI(Claude Code·Codex)로 직접 만들 수 있도록 인디언즈가 제작한 교육용 번들입니다. 외부 오픈 스킬 모음이 아니라, 인디언즈가 자체 앱을 만들고 운영하면서 정리한 방식을 교육용으로 새로 쓴 것입니다. 인테리어 회사가 만들었지만 업종을 가리지 않습니다 — 첫 질문은 "회사(사업자) 이름과 대표님을 어떻게 부르면 될까요?"입니다.

이 저장소 하나에 **스킬 14종 · 감독 에이전트 3종 · 검수 훅 · 디자인 선택 이미지 12장 · 회차 자료**가 모두 들어 있습니다. 1회차에 한 번 설치하면 끝이고, 회차마다 새 저장소를 받지 않습니다.

수업은 **주 2회 × 3시간, 본 4회 + 최종 회 1회**입니다. 최종 회는 본 과정이 끝나고 2주 뒤, 2주 동안 실제로 써 본 결과를 시연하는 자리입니다.

## 설치 — 가장 쉬운 방법: AI에게 이 문장을 붙여 넣기

Claude Code 또는 Codex에서 **내 ERP 프로젝트 폴더**를 연 상태에서 아래를 그대로 붙여 넣습니다.

```text
https://github.com/indeans6633/indeans-erp-class 를 내 프로젝트 바로 위 폴더에 git clone --depth 1 로 받고,
받은 폴더의 install.mjs 를 node 로 실행해서 지금 이 프로젝트 폴더(--project ".")에 --target both 로 설치해 줘.
설치가 끝나면 설치기가 마지막에 알려 주는 다음 단계를 그대로 보여 줘.
```

`{ }` 로 바꿀 것도 없습니다. 저장소 주소는 문장 안에 이미 들어 있습니다.

## 설치 — 직접 실행

Git과 Node.js 18 이상이 필요합니다. 내 ERP 프로젝트 폴더에서:

```powershell
# 반드시 내 ERP 프로젝트 폴더에서 실행합니다 — 지금 어디인지 pwd 로 먼저 확인하세요.
pwd
git clone --depth 1 https://github.com/indeans6633/indeans-erp-class.git "../indeans-erp-class"
node "../indeans-erp-class/install.mjs" --project "." --target both
```

- `--project "."` 은 **지금 있는 폴더**에 설치한다는 뜻입니다. 내려받은 강의 자료 폴더 안에서 실행하면 설치기가 멈추고 알려 줍니다(그 폴더에 설치되는 일은 없습니다).
- 이미 받아 둔 `../indeans-erp-class` 폴더가 있으면 clone 이 영어 오류(`destination path ... already exists`)로 멈춥니다. 그 폴더에서 `git pull` 하거나, 폴더를 지우고 다시 받으세요.
- `--target claude` → Claude Code 자리에만, `--target codex` → Codex 자리에만, `both` → 둘 다(같은 내용). 두 도구를 같이 켜야 한다는 뜻은 아닙니다.
- `--dry-run` 을 붙이면 **아무것도 바꾸지 않고** 무엇이 설치될지만 보여 줍니다.
- 회차를 고르는 인자는 없습니다. 이 저장소에 든 것이 전부 설치됩니다.

## 설치되는 것

| 자리 | 내용 |
|---|---|
| `.claude/skills/` · `.agents/skills/` | 스킬 14종(아래 표) |
| `.claude/agents/` · `.codex/agents/` | 감독 에이전트 3종 |
| `.owner/hooks/` + `.claude/settings.json` · `.codex/hooks.json` | 검수 훅과 그 등록 |
| `.owner/design/` | 디자인 선택 이미지 12장과 비교 갤러리 |
| `course/session-01` ~ `session-04`, `course/final` | 회차 자료(오늘 할 것·워크시트·말할 문장·과제) |
| `.owner/state.md` · `.owner/progress.json` | 진행 상태 문서(없을 때만 새로 만듭니다) |
| `reports/` | 작업 보고서가 쌓이는 폴더 |

내용이 같은 파일은 건너뛰고, 직접 만든 파일은 덮어쓰지 않습니다(충돌이 나면 파일 이름을 알려 주고 멈춥니다). 설치기가 넣었던 파일에 새 버전이 있으면 손대지 않은 파일만 갱신하고, **워크시트처럼 체크·메모를 적어 둔 파일은 그대로 두고 새 버전을 같은 자리에 `.new` 로 저장**해 알려 줍니다.

**설치기는 네트워크 호출·원격 추적·수강생 코드 수집 기능이 없습니다.** 설치 기록은 내 프로젝트의 `.owner/install-state.json` 에만 남습니다.

## 설치한 뒤

설치가 끝나면 설치기가 다음에 부를 스킬 이름을 알려 줍니다. 새 대화를 열고 그 문장을 그대로 넣으세요.

```text
indeans-erp-setup 스킬을 읽고 시작해 줘
```

**스킬 이름을 직접 불러야 그 절차대로 움직입니다.** 회차마다 말할 문장 원문은 설치된 `course/session-0N/prompts.md` 에 전부 있습니다. 오늘 확인할 것은 `outcomes.md`, 적어 가며 할 것은 `worksheet.md`, 다음 회차까지 해 올 것은 `homework.md` 입니다.

## 스킬 14종

`1~`·`2~` 는 그 회차부터 계속 쓴다는 뜻입니다. 전부 1회차에 설치되고, 회차 열은 주로 쓰는 시점입니다.

| 회차 | 스킬 이름 | 무엇을 하나 |
|---|---|---|
| 1 | `indeans-erp-setup` | 도구·계정·설치 상태를 점검하고 진행 상태 문서를 만든다 |
| 1 | `indeans-erp-interview` | 대표 정보부터 30분 상세 인터뷰 — 회사·일·원하는 것·구조안·이번에 만들지 않을 것 |
| 1 | `indeans-erp-design` | 동봉 이미지로 화면 구조 3종 → 컬러 4종을 고르고 앱에 적용 |
| 1 | `indeans-erp-draft` | 구조안과 디자인으로 눌러 볼 수 있는 초안 만들기 |
| 1~ | `indeans-erp-report` | 작업이 끝날 때 어느 화면이 어떻게 바뀌었는지 보고서로 만들어 열기 |
| 1~ | `indeans-erp-check` | 감독 판정 → 검증 실측 → 보고까지 한 번에(검수 훅이 자동으로 부른다) |
| 2~ | `indeans-erp-review` | 써 보고 온 앱의 막힌 지점을 진단해 1~2건 개선 |
| 2 | `indeans-erp-data` | 백업 먼저, 그 다음 Supabase 저장과 Vercel 배포 |
| 2 | `indeans-erp-people` | 대표·직원 계정과 역할별 화면·로그인 |
| 3 | `indeans-erp-channel` | 디스코드·텔레그램을 직접 만들어 연결하고 테스트 발송 |
| 3 | `indeans-erp-digest` | 앱 데이터 요약을 정해진 시각에 채널로 — PC와 AI를 꺼도 서버에서 실행 |
| 4 | `indeans-erp-workflow` | 첫 흐름이 안정된 뒤 상태·다음 행동·두 번째 흐름 |
| 4 | `indeans-erp-routine` | 주간 루틴, 백업에서 되돌리는 복구 실습, 30일 계획 |
| 최종 | `indeans-erp-showcase` | 2주 사용 결과와 다음 개선 순서로 시연 준비 |

모든 스킬은 시작할 때 프로젝트 상태를 읽고 이미 된 것은 건너뜁니다. 예습해 온 분에게는 더 깊은 과제로 분기합니다.

## 감독 에이전트 3종

인디언즈가 자체 앱에 쓰는 감독 구조를 업종과 무관한 원칙만 남겨 옮긴 것입니다. 수강생이 직접 부를 일은 거의 없고, `indeans-erp-check` 가 순서대로 부릅니다.

| 이름 | 역할 |
|---|---|
| `erp-supervisor` | 설계·데이터·권한을 보고 승인 / 조건부 승인 / 반려로 판정 |
| `erp-design-supervisor` | 고른 디자인 방향을 지키는지, 모바일과 PC 양쪽이 괜찮은지 판정 |
| `erp-verifier` | 판정하지 않고 실측만 — 화면 캡처(375·1280), 빌드, 저장·재접속, 역할별 접근 차단 확인 |

들어왔는지 확인하는 법은 두 가지입니다(목록을 내주는 명령은 따로 없습니다).

1. `.claude/agents/` (Codex 는 `.codex/agents/`)에 파일 3개가 있는지 봅니다.
2. AI에게 `erp-supervisor 에이전트로 이 변경을 검토해 줘.` 라고 시켜 실제로 떠지는지 봅니다.

## 검수 훅

작업이 끝날 때(Stop) 무엇이 바뀌었는지 보고, **영향이 있는 변경**이면 검수를 받고 끝내라고 요구합니다.

- 검수를 요구하는 변경: 화면·데이터 구조·권한 조건·배포 설정·삭제 조건.
- 생략하는 변경: 문서, 보고서, 문구·주석·색만 바뀐 수정. **줄 수로 판단하지 않습니다.**
- 검수를 마치면 표식(`.owner/last-check.json`)이 남아 같은 변경에 다시 요구하지 않습니다. 같은 작업에서 두 번 요구해도 검수가 없으면 세 번째부터는 경고만 내고 통과합니다.
- 훅도 네트워크를 쓰지 않습니다. `.owner/hooks/erp-check.mjs` 를 열어 보면 무엇을 보는지 그대로 읽을 수 있습니다.

훅 등록을 원치 않으면 `.claude/settings.json` 의 `hooks.Stop`(또는 `.codex/hooks.json`)에서 그 한 줄을 지우면 됩니다. 스킬은 그대로 씁니다 — "검수해 줘" 라고 말하면 같은 절차가 돕니다.

## 디자인 선택 이미지

`.owner/design/index.html` 을 열면 화면 구조 3종 × 컬러 4종, 12장이 **같은 예시 데이터**로 나란히 있습니다. 구조를 먼저 고르고, 그 구조의 컬러 4장만 비교합니다. 고른 조합의 색 설정은 `src/styles/tokens.css` 로 복사되고, 이후 모든 화면이 그 방향을 따릅니다.

```powershell
node .owner/hooks/open.mjs .owner/design/index.html
```

## 필요한 것

- Node.js 18 이상, Git, GitHub 계정
- Claude Code 또는 Codex 중 하나(둘 다 있어도 됩니다)
- 2회차부터 Supabase 계정, Vercel 계정
- 화면 캡처를 쓰려면 프로젝트에 playwright 설치(`npm i -D playwright` 뒤 `npx playwright install chromium`). 설치기가 대신 설치하지 않고, `indeans-erp-setup` 이 확인해 안내합니다.
- AI 이용료·서비스 운영비·필요 계정은 모집·사전 준비 단계에서 따로 안내합니다.

## 범위와 라이선스

이 저장소는 교육용 신규 저작물입니다. 인디언즈 운영 앱 소스, 고객 정보, 내부 접속 정보, 외부 스킬 원문을 포함하지 않습니다. 수강생 본인과 본인 회사의 사용을 허용하며, 재배포·재판매·다른 강의 목적 사용은 허용하지 않습니다. 전체 조건은 [LICENSE.md](LICENSE.md)에 있습니다(대표 확정 전 임시 문구).
