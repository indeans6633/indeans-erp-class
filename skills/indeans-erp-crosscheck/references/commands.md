# 교차 검수 명령 — 두 방향

`indeans-erp-crosscheck` 가 읽는 명령 모음이다. **AI 가 대표 대신 실행하고, 대표는 승인만 누른다.** 모든 명령은 **프로젝트 폴더에서** 시작한다. 날짜 자리 `2026-10-09` 는 그날 날짜로 바꾼다.

AI 가 지금 쓰는 셸에 맞는 덩어리 하나만 쓴다 — Git Bash·macOS 터미널이면 위, PowerShell(명령 줄 앞이 `PS`)이면 아래.

옵션은 2026-10-09 에 `codex exec --help`(codex-cli 0.154.0)·`claude -p --help`(Claude Code 2.1.295)로 맞췄다. 도구가 바뀌어 `unknown option` 같은 오류가 나면 같은 `--help` 를 열어 맞춘다.

## 0. 왜 이런 모양인가

- **검수자는 빈 폴더(임시 폴더 아래 `erp-crosscheck`)에서 돈다.** 프로젝트 폴더에서 돌리면 검수자가 `reports/`·`.owner/`(우리 쪽 결론)와 `.env.local` 을 읽을 수 있고, 프로젝트의 지침 파일과 검수 훅이 검수자 쪽에서도 돈다. 검수 훅이 끝내기를 막으면 검수자의 마지막 답이 검수가 아니라 "검수 스킬을 부르겠다"는 말이 된다. `codex exec` 에서도 훅이 돌고, 빈 폴더에서는 프로젝트 지침 파일이 읽히지 않는 것을 확인했다(2026-10-09 실측).
- **코드는 프롬프트에 붙여 넣는다(1절).** 검수자는 파일을 읽을 필요가 없다. 검수 도구의 읽기 전용 상자(샌드박스)는 파일을 못 읽는 일이 있다.
- **PowerShell 에서는 `cmd /c` 로 감싼다.** Windows PowerShell 5.1 은 파이프(`|`)로 넘기는 글자를 영어 전용(ASCII)으로 바꿔 한글이 `?` 가 되고, `>` 로 받은 답은 다른 인코딩(UTF-16)으로 저장된다(2026-10-09 실측, 새 창의 기본값). `cmd` 의 `<`·`>` 는 글자를 바이트 그대로 넘긴다.
- **명령의 제한 시간을 10분으로 잡는다.** 실측 한 번은 코드 25줄에 28초(약 9천 토큰)였다. 파일이 5개면 몇 분 걸린다.

## 1. 코드 붙이기 — 줄 번호 포함 (두 방향 공통)

프롬프트 파일에 「보낼 글」을 「코드 —」 줄까지 쓴 뒤 실행한다. 첫 인자는 프롬프트 파일, 그 뒤는 붙일 파일(5개 이하). PowerShell·Git Bash·macOS 모두 같은 줄이다.

```
node -e "const fs=require('fs'),path=require('path');const [out,...files]=process.argv.slice(1);let s='',n=0;for(const f of files){if(path.basename(f).startsWith('.env')){console.log('SKIP '+f);continue}let t=fs.readFileSync(f,'utf8');if(t.charCodeAt(0)===65279)t=t.slice(1);const L=t.split(/\r?\n/);if(L[L.length-1]==='')L.pop();s+='===== FILE: '+f.split(path.sep).join('/')+' =====\n';L.forEach((l,i)=>{s+=String(i+1).padStart(4)+'| '+l+'\n'});n++}fs.appendFileSync(out,s+'===== END =====\n한국어로 답한다.\n');console.log('OK '+n)" .owner/tmp/crosscheck-2026-10-09.txt src/lib/cancel.ts supabase/migrations/0004_roles.sql
```

- `OK 2` 는 붙인 파일 수다. 이름이 `.env` 로 시작하는 파일은 붙이지 않고 `SKIP` 으로 알린다.
- 파일마다 `===== FILE: 경로 =====` 와 줄 번호(`  12| …`)가 붙고, 끝에 `===== END =====` 와 "한국어로 답한다."가 붙는다. 줄 번호가 있어야 검수자가 `파일:줄` 을 맞게 적는다.
- **400줄이 넘는 파일은 바뀐 부분만** 붙인다. 바뀐 부분(앞뒤 30줄)을 파일로 저장해 그 파일을 대신 넘긴다.
  - Git Bash·macOS: `git diff -U30 {기준 커밋} -- {파일} > .owner/tmp/diff-{이름}.txt`
  - PowerShell: `cmd /c "git diff -U30 {기준 커밋} -- {파일} > .owner\tmp\diff-{이름}.txt"`

## 2. 비공개 정보 점검 (두 방향 공통)

보내기 직전에 프롬프트 파일을 훑는다. 모든 셸에서 같은 줄이다.

```
node -e "const t=require('fs').readFileSync(process.argv[1],'utf8');const R=[['phone',/01[016789][-. ]?[0-9]{3,4}[-. ]?[0-9]{4}/g],['email',/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+[.][A-Za-z.]{2,}/g],['key',/eyJ[A-Za-z0-9_-]{10,}[.][A-Za-z0-9_-]{10,}|sb_secret_[A-Za-z0-9_-]{8,}|sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|xox[abpr]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|BEGIN [A-Z ]*PRIVATE KEY|[0-9]{8,10}:[A-Za-z0-9_-]{30,}/g],['webhook',/discord(app)?[.]com[/]api[/]webhooks|hooks[.]slack[.]com[/]services/g],['env-line',/^ *[0-9]+[|] *[A-Z][A-Z0-9_]*=[^ ]+/gm],['money',/[0-9]{1,3}(,[0-9]{3})+ *원|[0-9]{5,} *원/g]];let n=0;for(const [k,re] of R)for(const m of t.match(re)||[]){n++;console.log(k+': '+m.slice(0,40))}console.log(n?'STOP '+n:'CLEAN')" .owner/tmp/crosscheck-2026-10-09.txt
```

- `CLEAN` → 기계가 찾는 것(전화·이메일·키 모양·웹훅 주소·`이름=값` 꼴의 비밀값 줄·"원"이 붙은 금액)은 없다. **사람 이름과 실제 금액은 기계가 못 찾는다** — 점검표 1·3번은 눈으로 본다.
- `STOP 3` 처럼 나오면 **보내지 않는다.** 찍힌 것을 지우거나 가짜 값으로 바꾸고 다시 돌린다.

## 3. Claude Code 에서 Codex 로 (검수자 = Codex)

Git Bash · macOS:

```bash
mkdir -p /tmp/erp-crosscheck
codex exec - -C /tmp/erp-crosscheck --skip-git-repo-check -s read-only -o .owner/tmp/crosscheck-out-2026-10-09.md < .owner/tmp/crosscheck-2026-10-09.txt
```

PowerShell:

```powershell
New-Item -ItemType Directory -Force "$env:TEMP\erp-crosscheck" | Out-Null
cmd /c 'codex exec - -C "%TEMP%\erp-crosscheck" --skip-git-repo-check -s read-only -o .owner\tmp\crosscheck-out-2026-10-09.md < .owner\tmp\crosscheck-2026-10-09.txt'
```

| 옵션 | 뜻 |
|---|---|
| `-` | 프롬프트를 표준 입력(`<` 로 넘긴 파일)에서 읽는다. 파일이 비면 `No prompt provided via stdin.` |
| `-C <폴더>` | 검수자의 작업 폴더 — 빈 폴더. 폴더가 없으면 "지정된 파일을 찾을 수 없습니다"류 오류 → `mkdir`·`New-Item` 줄부터 |
| `--skip-git-repo-check` | 빈 폴더는 git 저장소가 아니라서 필요하다. 빠뜨리면 `Not inside a trusted directory and --skip-git-repo-check was not specified.` |
| `-s read-only` | 검수자가 아무것도 고치지 못하게 한다 |
| `-o <파일>` | 마지막 답만 파일로 저장한다. 상대 경로는 명령을 실행한 폴더(프로젝트) 기준이다(실측) |

## 4. Codex 에서 Claude 로 (검수자 = Claude Code)

Git Bash · macOS:

```bash
p="$PWD"; mkdir -p /tmp/erp-crosscheck
(cd /tmp/erp-crosscheck && claude -p --tools Read --output-format text < "$p/.owner/tmp/crosscheck-2026-10-09.txt" > "$p/.owner/tmp/crosscheck-out-2026-10-09.md")
```

PowerShell:

```powershell
New-Item -ItemType Directory -Force "$env:TEMP\erp-crosscheck" | Out-Null
cmd /c 'cd /d "%TEMP%\erp-crosscheck" && claude -p --tools Read --output-format text < "%CD%\.owner\tmp\crosscheck-2026-10-09.txt" > "%CD%\.owner\tmp\crosscheck-out-2026-10-09.md"'
```

| 옵션 | 뜻 |
|---|---|
| `-p` | 대화창을 열지 않고 한 번 답하고 끝낸다. 프롬프트는 표준 입력으로 받는다. 입력이 비면 `Error: Input must be provided either through stdin or as a prompt argument when using --print` |
| `--tools Read` | 쓸 수 있는 도구를 '읽기' 하나로 줄인다 — 고치기·명령 실행이 없다 |
| `--output-format text` | 답을 글자로만 낸다 |
| `cd …` · `%CD%` | 빈 폴더로 옮겨 실행하고, 입력·답 파일은 프로젝트 쪽 경로를 쓴다. `%CD%` 는 cmd 가 줄을 읽는 순간에 바뀌므로 옮기기 전의 프로젝트 폴더가 들어간다(실측) |

- **Codex 안에서 이 명령을 돌리면** Codex 의 상자(샌드박스)가 인터넷과 임시 폴더 쓰기를 막아 연결 오류로 끝날 수 있다. Codex 가 상자 밖에서 실행해도 되느냐고 물으면 승인한다. 묻지 않고 실패하면 대표가 직접 실행한다(5절).

## 5. 대표가 직접 실행했을 때 — 결과를 AI 에게 읽히는 문장

AI 의 제한 시간에 걸리거나 상자가 막으면, 대표가 새 터미널 창을 프로젝트 폴더에서 열고 3절 또는 4절 명령을 직접 붙여 넣는다. 끝나면 원래 대화에 이렇게 넣는다.

```text
교차 검수 답이 .owner/tmp/crosscheck-out-2026-10-09.md 에 저장됐어.
indeans-erp-crosscheck 스킬 절차 4부터 이어서 해 줘. 답은 고치거나 요약하지 말고 원문 그대로 붙여 줘.
```

- 답 파일이 비어 있으면 실패한 것이다. 터미널에 찍힌 오류 문장을 그대로 AI 에게 붙여 넣는다(「막혔을 때」 형식).

## 6. 도구가 하나뿐일 때 — 차선책

같은 도구를 **새 대화**로 부른다. 위 명령으로 부르는 것 자체가 새 대화다 — 지금 대화의 내용을 모르는 채로 붙여 넣은 글만 본다. Claude Code 만 있으면 4절 명령을, Codex 만 있으면 3절 명령을 그대로 쓴다.

- **같은 회사의 같은 AI 라 같은 곳을 같이 놓칠 수 있다 — 독립성이 약하다.** 보고서 머리에 "차선책 — 같은 도구 새 대화"라고 적는다.
- 명령이 어려우면 대화창을 새로 열어(이전 대화를 이어받지 않는 창) 프롬프트 파일 내용을 통째로 붙여 넣어도 된다. 프로젝트 폴더가 아닌 곳에서 연 창이 낫다 — 프로젝트 폴더에서 열면 보고서와 상태 문서를 읽을 수 있다.
