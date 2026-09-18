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

## 2. 기본 역할 3종

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

```sql
create table app_users (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  role text not null check (role in ('owner','staff','client')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table app_users enable row level security;
```

- `role` 은 `not null`. **비워 둘 수 있게 만들면 그 계정이 검사를 통과한다**(아래 4번).
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
using (
  coalesce(my_role(),'') in ('owner','staff')
  or (my_role() = 'client' and client_id = auth.uid())
);

create policy jobs_write on jobs for insert to authenticated
with check (coalesce(my_role(),'') in ('owner','staff'));

create policy jobs_update on jobs for update to authenticated
using (coalesce(my_role(),'') in ('owner','staff'))
with check (coalesce(my_role(),'') in ('owner','staff'));
```

- `using` 은 읽기·삭제에, `with check` 는 넣기·고치기에 적용된다. 고치기는 둘 다 필요하다.
- `for all` 로 쓴 규칙은 **읽기에도 걸린다.** 나중에 좁은 읽기 규칙을 추가해도 넓은 `for all` 이 그것을 덮는다. 새 규칙을 좁힐 때는 같은 표에 `for all` 이 있는지 먼저 본다.
- 역할 표 자신도 규칙이 필요하다: 본인 행은 읽을 수 있고, 고치는 것은 대표만.

### 3-4. 변경 기록

```sql
create table change_log (
  id uuid primary key default gen_random_uuid(),
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
using (coalesce(my_role(),'') = 'owner');
create policy change_log_insert on change_log for insert to authenticated
with check (actor_id = auth.uid());
```

- 기록은 **고치거나 지울 수 없게** 둔다(수정·삭제 규칙을 만들지 않으면 아무도 못 한다).
- 기록 대상은 인터뷰 3-4에서 고른 두세 가지만.

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
