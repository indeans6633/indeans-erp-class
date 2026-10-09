# 역할과 권한 — 기본 원리와 최소 구현

스킬이 읽는 참고 자료. 대표에게는 앞의 「원리 네 가지」만 말로 전하고, 뒤의 코드는 AI가 쓴다.

---

## 1. 원리 네 가지

**① 역할은 직함이 아니라 "무엇을 볼 수 있는가"로 나눈다.**
부장·과장·팀장은 직함이다. 앱에서 보는 범위가 같으면 하나로 합친다. 반대로 같은 직함이라도 보는 게 다르면 나눈다. 역할이 늘어날수록 확인할 조합이 곱으로 늘어난다.

**② 화면에서 숨긴 것은 숨긴 게 아니다.**
버튼을 감추고 칸을 지워도 데이터는 그대로 나간다. 브라우저 도구나 주소 한 줄이면 보인다. 규칙은 **데이터를 내보내는 쪽**에 있어야 한다. 화면 분기는 편의고, 데이터 규칙이 방어선이다.

**③ "누구에게는 절대 안 보여야 하나"부터 적는다.**
"누구에게 무엇을 보여 줄까"로 시작하면 빠뜨린 것이 열린 채로 남는다. 금지 목록부터 적으면 확인할 체크리스트가 저절로 생긴다.

**④ 전부 잠그고 시작해 하나씩 연다.**
새 표를 만들면 먼저 잠근다. 필요한 화면이 안 열리면 그때 규칙을 하나 붙인다. 반대로 하면 "열어 둔 걸 깜빡한" 표가 남고, 그건 사고가 나야 알게 된다.

---

## 2. 기본 역할 — 둘로 시작하고, 고객은 필요할 때만

기본은 `owner`·`staff` 두 개다. `client` 는 고객이 직접 로그인하는 사업일 때만 더한다(SKILL.md 3-4).

| 역할 값 | 기본 이름 | 보통 보는 것 | 보통 못 보는 것 |
|---|---|---|---|
| `owner` | 대표 | 전부 | — |
| `staff` | 직원 | 맡은 일, 진행 상황, 필요한 만큼의 금액 | 다른 직원 인사 정보, 회사 전체 수익 |
| `client` | 고객 | 자기 건의 진행 상황과 자기가 낸 돈 | 원가·단가, 다른 고객의 모든 것 |

- 이름은 회사 말로 바꿔도 된다(저장 값 `staff`는 그대로 두고 화면 글자만 바꾼다).
- 거래처·협력업체가 앱을 쓰면 네 번째 역할(`partner`)을 만든다. 이들은 보통 **고객 정보를 한 글자도 못 본다.**

업종별로 보면 이렇게 대응된다.

| 업종 | `staff` 예 | `client` 예 | 네 번째가 필요한 경우 |
|---|---|---|---|
| 제조 | 생산·출하 담당 | 발주처 | 외주 가공업체 |
| 유통 | 입출고·정산 담당 | 거래 소매점 | 배송 기사 |
| 서비스(수리·점검) | 방문 기사 | 의뢰 고객 | 협력 기사 |
| 예약업 | 응대 직원 | 이용 고객 | — |

---

## 3. 최소 구현 — Supabase 기준

### 3-1. 역할 표

2회차 `0001` 이 만든 명단(`app_users` — 계정·회사·이름·역할·활성)을 그대로 쓰고, 역할 값에 허용 목록만 건다.

```sql
alter table app_users alter column role set not null;
alter table app_users add constraint app_users_role_check
  check (role in ('owner','staff'));   -- 템플릿은 이 목록이 없을 때만 만든다
```

- `role` 은 `not null` + 허용 목록. **비워 둘 수 있게 두면 그 계정이 거부 목록 검사를 통과한다**(아래 4번).
- 템플릿(`assets/role-check-template.sql`)은 허용 목록이 **이미 있으면 그대로 둔다.** 고객 역할을 더한 뒤 권한 파일을 다시 실행해도 고객 역할이 목록에서 빠지지 않고, 등록된 고객 계정 때문에 실행이 멈추지 않는다. 역할을 늘리거나 줄일 때는 그 역할의 다음 번호 파일에서 목록을 지우고 새 목록으로 만든다(템플릿 맨 아래 고객 블록이 그 예다).
- `active` 는 차단용. 지우지 않고 막는 것이 기본이다.

### 3-2. 판정 함수

```sql
create or replace function my_role()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$ select role from public.app_users where id = auth.uid() and active $$;

revoke all on function my_role() from public, anon;
grant execute on function my_role() to authenticated;   -- 이 줄을 빼면 안 된다
```

- `security definer` 로 두는 이유: 이 함수가 역할 표를 읽을 때 그 표의 규칙에 다시 걸려 무한히 도는 것을 피한다.
- **`set search_path` 에 `pg_temp` 를 넣고, 표 이름은 `public.app_users` 처럼 앞에 폴더 이름을 붙인다.** `pg_temp` 를 빼면 로그인 사용자가 같은 이름의 임시 표를 만들어 이 함수를 속일 수 있다. 이 함수는 만든 사람(관리자) 권한으로 돌기 때문에, 속으면 그 권한으로 엉뚱한 표를 읽는다.
- **`authenticated` 실행 권한을 회수하지 않는다.** 규칙 안에서 불리는 함수는 **부르는 사람의 권한으로 실행**된다. 권한이 없으면 규칙 판정이 오류로 죽고, 규칙은 행이 아니라 **표 전체**에 걸리므로 그 표가 통째로 안 열린다.

### 3-3. 표별 규칙

```sql
alter table jobs enable row level security;          -- 먼저 전부 잠근다

create policy jobs_read on jobs for select to authenticated
using (company_id = my_company() and coalesce(my_role(),'') in ('owner','staff'));

create policy jobs_insert on jobs for insert to authenticated
with check (company_id = my_company() and coalesce(my_role(),'') in ('owner','staff'));

create policy jobs_update on jobs for update to authenticated
using (company_id = my_company() and coalesce(my_role(),'') in ('owner','staff'))
with check (company_id = my_company() and coalesce(my_role(),'') in ('owner','staff'));
```

- 소속 검사(`company_id = my_company()`)와 역할 검사를 **같이** 쓴다. 한쪽만 쓰면 그쪽이 비는 날 새거나 막힌다.
- 고객 역할은 기본 규칙에 섞지 않는다. 고객을 만들기로 했을 때 **다음 번호 파일 하나에** 고객 칸(`client_id`)과 고객 읽기 규칙(`jobs_read_client`)을 함께 만든다(`assets/role-check-template.sql` 맨 아래 블록). 칸 없이 규칙만 만들면 실행이 멈추고, 규칙 없이 칸만 만들면 고객이 아무것도 못 본다.

- `using` 은 읽기·삭제에, `with check` 는 넣기·고치기에 적용된다. 고치기는 둘 다 필요하다.
- `for all` 로 쓴 규칙은 **읽기에도 걸린다.** 나중에 좁은 읽기 규칙을 추가해도 넓은 `for all` 이 그것을 덮는다. 새 규칙을 좁힐 때는 같은 표에 `for all` 이 있는지 먼저 본다.
- 역할 표 자신도 규칙이 필요하다: 본인 행은 읽을 수 있고, 고치는 것은 대표만.

### 3-4. 변경 기록

```sql
create table change_log (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default my_company() references companies(id),
  target text not null,          -- 무엇 (예: 'jobs')
  target_id uuid,
  action text not null,          -- 무슨 일 (예: 'status_change')
  before_value text,
  after_value text,
  actor_id uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);
alter table change_log enable row level security;
create policy change_log_read on change_log for select to authenticated
using (company_id = my_company() and coalesce(my_role(),'') = 'owner');
create policy change_log_insert on change_log for insert to authenticated
with check (company_id = my_company() and actor_id = auth.uid() and my_role() is not null);
```

- 기록에도 **회사 칸**을 둔다. 회사 칸이 없으면 같은 데이터베이스를 쓰는 다른 회사 대표가 이 회사의 바뀌기 전·후 값을 읽는다.

- 기록은 **고치거나 지울 수 없게** 둔다(수정·삭제 규칙을 만들지 않으면 아무도 못 한다).
- 기록 대상은 인터뷰 3-5에서 고른 두세 가지만.

### 3-5. 로그인 (앱 쪽)

```ts
const { error } = await supabase.auth.signInWithPassword({ email, password })
const { data: { user } } = await supabase.auth.getUser()
const { data: me } = await supabase.from('app_users').select('name, role').eq('id', user.id).single()
```

- 화면 분기는 `me.role` 로 한다. `me` 가 없거나 `role` 이 비면 **아무 화면도 열지 않고** "관리자에게 문의" 안내를 띄운다.
- 역할이 바뀌면(로그아웃·계정 전환) **보고 있던 화면을 닫고 그 역할의 첫 화면으로 보낸다.** 이전 역할의 상세 화면이 열린 채로 남으면 그 화면은 새 역할의 규칙을 안 거친다.
- 가입은 열어 두지 않는다. 대표가 만들고 역할을 정해 준다.

---

## 4. 빈칸이 통과하는 이유 (꼭 알 것)

역할이 비어 있는 계정에서 `my_role()` 은 값이 없다(NULL). 이때 비교의 결과는 참도 거짓도 아닌 **판정 불가**가 된다.

- 데이터 규칙에서는 판정 불가를 거부로 본다 → 안전하다.
- **앱 코드에서는 다르다.** `if (role !== 'client')` 는 역할이 없을 때 **참이 되어 통과한다.**
- 데이터베이스 함수 안에서도 `if my_role() not in ('owner') then 거부` 라고 쓰면 판정 불가가 되어 거부가 실행되지 않는다.

그래서 규칙은 항상 **허용 목록**으로 쓴다.

```ts
const ALLOWED = ['owner', 'staff']
if (!ALLOWED.includes(me?.role ?? '')) return <아무것도 못 봄 />
```

```sql
-- 좋음
coalesce(my_role(),'') in ('owner','staff')
-- 나쁨
my_role() <> 'client'
```

---

## 5. 적용한 뒤 확인 질의 (한 덩어리)

SQL Editor 는 마지막 한 문장의 결과만 보여 준다. 그래서 점검을 **한 결과 표**로 모았다. 이 덩어리만 따로 붙여 넣고 Run 한다(마이그레이션 파일에는 넣지 않는다). **걸린_것 칸이 전부 비어 있어야(NULL) 통과**다. ②에 비밀값·발송 기록 표(`app_secret`·`report_log`)가 나오는 것은 일부러다.

```sql
select '① 잠금 꺼진 표' as 점검, string_agg(relname, ', ') as 걸린_것
  from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' and not relrowsecurity
union all
select '② 규칙이 하나도 없는 표(아무도 못 봄)', string_agg(c.relname, ', ')
  from pg_class c
 where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and c.relrowsecurity
   and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname)
union all
select '③ 로그인 안 한 사람(anon·public)에게 걸린 규칙', string_agg(tablename || '.' || policyname, ', ')
  from pg_policies where schemaname = 'public' and roles && array['public','anon']::name[]
union all
select '④ 판정 함수를 로그인 사용자가 못 부름', string_agg(proname, ', ')
  from pg_proc where pronamespace = 'public'::regnamespace and proname in ('my_role','my_company')
   and not has_function_privilege('authenticated', oid, 'execute')
union all
select '⑤ search_path 없는 권한 높은 함수', string_agg(proname, ', ')
  from pg_proc where pronamespace = 'public'::regnamespace and prosecdef
   and not exists (select 1 from unnest(coalesce(proconfig, '{}'::text[])) c where c like 'search_path=%')
union all
select '⑥ 로그인 안 한 사람이 부를 수 있는 권한 높은 함수', string_agg(proname, ', ')
  from pg_proc where pronamespace = 'public'::regnamespace and prosecdef
   and has_function_privilege('anon', oid, 'execute');
```

SQL 확인은 **도달 검증이 아니다.** 함수의 답이 맞아도 실제 사용자가 그 함수에 닿지 못하면 화면이 통째로 빈다. 마지막 확인은 언제나 역할별 계정으로 앱을 열어 보는 것이다(SKILL.md 9단계).

---

## 6. 권한 높은 함수(security definer) — 가드 세 줄

`security definer` 함수는 **만든 사람(관리자) 권한으로** 돈다. 행 수준 규칙을 지나치기 때문에, 함수 안에 검사가 없으면 그 함수가 곧 뒷문이다. 새로 만들 때마다 세 가지를 같이 쓴다.

1. **검사** — 함수 첫 줄에서 역할·소속을 본다. 거부 검사는 `coalesce` 와 함께: `if coalesce(my_role(),'') not in ('owner') then raise exception '권한 없음'; end if;`
2. **search_path 고정** — `set search_path = public, pg_temp` 를 넣고 표 이름 앞에 `public.` 을 붙인다.
3. **실행 권한** — `revoke all on function <이름>(…) from public, anon;` 그리고 앱이 부를 함수면 `grant execute … to authenticated;`. 서버 예약만 부르는 함수(운영 보고 발송)는 `authenticated` 에게도 주지 않는다.

예외 하나: **정책 안에서 부르는 판정 함수(`my_role`·`my_company`)는 `authenticated` 실행 권한을 절대 거두지 않는다.** 거두면 그 함수를 쓰는 표의 조회가 통째로 실패한다(`lessons.md` 4번).

함수를 다시 쓸 때(`create or replace`)도 이 세 줄이 그대로인지 확인한다. 다시 쓰다가 빠지는 일이 흔하다(`lessons.md` 5번).
