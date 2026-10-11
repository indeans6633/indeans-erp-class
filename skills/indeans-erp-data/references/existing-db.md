# 기존 DB가 있을 때 — 가져온 앱의 저장 단계

`indeans-erp-data` 의 「가져온 앱」 분기 중 **Supabase 를 쓰는 중**일 때 읽는다. 다른 도구로 만들어 온 앱(`imported_app.detected` true)이나, 이 번들 밖에서 이미 표를 만든 앱이 대상이다. 2회차에 가져온 앱은 초안(`indeans-erp-draft`)을 건너뛰고 이 분기로 **리빌딩 2단계(저장·배포)** 를 한다. (브라우저 저장만 하던 앱은 일반 절차 — 새 표, Firebase 등은 멈추고 상의 — SKILL 「가져온 앱」.)

원칙 셋.

1. **이미 있는 표를 다시 만들지 않는다.** 기존 기록 뒤에 다음 번호 파일을 이어 붙여, 빠진 것(명단·잠금·변경 기록)만 더한다. `0001_init.template.sql` 을 그대로 복사해 `0001` 로 만들면 번호가 겹치고(게이트 G9), 이미 있는 표를 건드린다.
2. **잠그기 전에 들어갈 길부터 만든다.** 로그인 전환 → 명단(`app_users`) 등록 → 대표 계정으로 실제 접속 확인이 끝난 **뒤에** 익명 접속(`anon`) 회수와 잠금(RLS)을 켠다. 순서를 바꾸면 그 순간 지금 쓰는 앱의 읽기·쓰기가 전부 막힌다.
3. **되돌릴 수 있게 바꾼다.** 바꾸기 전 상태(잠금·정책·권한)를 `company/backup.md` 에 적고, 역변경은 그 상태를 그대로 되살리는 SQL 로 쓴다.

---

## 1. 기존 표 조사 — 두 군데를 다 본다

### 1-1. 파일 기록

`supabase/migrations/` 를 열어 **마지막 번호**와 **이름 모양**을 본다.

| 이름 모양 | 예 | 다음 파일 |
|---|---|---|
| 네 자리 번호 | `0001_bookings.sql` · `0002_add_notes.sql` | `0003_…sql` |
| 시각 번호(14자리 — Supabase CLI 가 만든 것) | `20250301093000_init.sql` | **같은 모양으로**, 지금 시각과 **기존 최대 번호 + 1초** 중 큰 값. 같은 번호가 이미 있으면 1초씩 올린다. 두 파일을 이어 만들 때도 서로 다른 초 |
| 섞임·이름 규칙 없음 | `schema.sql` · `v2.sql` · 번호와 시각이 섞임 | **멈추고 대표와 확인.** `0001` 로 새로 시작하지 않는다(기존 이름과 겹치거나, 잠금 파일이 표 만들기보다 먼저 정렬된다). 실제로 어떤 파일을 어떤 순서로 실행했는지(대시보드에서 손으로 실행했는지)를 확인해, 기존 이름 중 **가장 뒤에 정렬되는 모양**을 이어 받는다 |

- **시각 번호 폴더에 `0003_…` 을 넣지 않는다.** 이름 순서로 실행·판정되는데 `0` 으로 시작하는 파일이 시각 번호보다 **앞에** 정렬돼 순서가 뒤집힌다. 게이트는 시각 번호 이름을 G9(주의)로 알리지만 막지는 않는다 — 그대로 둔다.
- 새 파일 이름을 정한 뒤 `ls supabase/migrations` 로 **새 파일이 맨 뒤에 정렬되는지** 눈으로 확인한다.
- **파일은 있는데 프로젝트가 없다**(만들다 지웠다)는 흔한 경우도 이 절차다 — 파일을 옮기거나 지우지 않고 다음 번호로 이어 붙이며, 실제 확인 칸은 1-2 의 "확인 불가 — 프로젝트 없음"으로 둔다.
- 파일마다 만든 표 · `enable row level security` 줄 수 · `create policy` 줄 수를 센다. 리빌딩 진단 문서(`company/rebuild-diagnosis.md`) 「이미 있는 데이터베이스 기록」 표가 있으면 그것을 쓰고 다시 확인만 한다.

### 1-2. 실제 데이터베이스 — 스키마·잠금·정책·권한

파일 기록과 실제가 다른 일이 흔하다(대시보드에서 손으로 만든 표, 실행하지 않은 파일, `public` 밖 스키마). Supabase 프로젝트가 **있으면** 대표에게 SQL Editor 에서 아래 네 덩어리를 실행해 결과 표를 붙여 달라고 한다(읽기만 한다).

```sql
-- ① 표 목록 — 앱이 쓰는 스키마 전부(시스템 스키마 제외), 잠금·정책 수
select n.nspname as schema, c.relname as table_name,
       c.relrowsecurity as rls_on, c.relforcerowsecurity as rls_forced,
       (select count(*) from pg_policies p where p.schemaname = n.nspname and p.tablename = c.relname) as policies
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where c.relkind in ('r', 'p')
   and n.nspname not in ('pg_catalog', 'information_schema', 'auth', 'storage', 'realtime', 'supabase_functions',
                         'extensions', 'graphql', 'graphql_public', 'pgbouncer', 'vault', 'net', 'cron', 'pgsodium')
 order by 1, 2;

-- ② 정책 내용 — 누구에게(roles)·무엇을(cmd)·조건(qual / with_check)·허용형인지(permissive)
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
  from pg_policies
 where schemaname not in ('auth', 'storage', 'realtime')
 order by 1, 2, 3;

-- ③ 권한(ACL) 원문 — 표·시퀀스는 pg_class.relacl, 열은 pg_attribute.attacl. 부여자·grant option(*)까지 원문 그대로 남는다.
--    (information_schema.role_table_grants·column_privileges 는 요약이라 되돌리기 근거로 쓰지 않는다)
select n.nspname as schema, c.relname as name, c.relkind as kind, c.relacl::text as acl
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where c.relkind in ('r', 'p', 'S')
   and n.nspname not in ('pg_catalog', 'information_schema', 'auth', 'storage', 'realtime', 'supabase_functions',
                         'extensions', 'graphql', 'graphql_public', 'pgbouncer', 'vault', 'net', 'cron', 'pgsodium')
 order by 1, 2;
select n.nspname as schema, c.relname as table_name, a.attname as column_name, a.attacl::text as acl
  from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
 where a.attacl is not null and a.attnum > 0 and not a.attisdropped
   and n.nspname not in ('pg_catalog', 'information_schema', 'auth', 'storage', 'realtime')
 order by 1, 2, 3;

-- ④ 이미 있는 이름 — 번들 기준선과 겹치는 표·함수·트리거, updated_at 칸 타입, 시퀀스
select 'table' as kind, table_schema || '.' || table_name as name from information_schema.tables where table_name in ('companies', 'app_users')
union all select 'function', n.nspname || '.' || p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where p.proname in ('my_company', 'my_role', 'touch_updated_at')
union all select 'trigger', event_object_schema || '.' || event_object_table || ' ' || trigger_name from information_schema.triggers
 where trigger_schema not in ('auth', 'storage', 'realtime')
union all select 'updated_at', table_schema || '.' || table_name || ' ' || data_type from information_schema.columns
 where column_name in ('updated_at', 'created_at') and table_schema not in ('auth', 'storage', 'realtime', 'pg_catalog', 'information_schema')
union all select 'sequence', sequence_schema || '.' || sequence_name from information_schema.sequences
 where sequence_schema not in ('pg_catalog', 'information_schema');
```

- 프로젝트가 **없으면**(지웠거나 처음부터 없었다) 파일 기록만으로 판정하고, 실제 확인 칸은 "확인 불가 — 프로젝트 없음"으로 둔다. 새 프로젝트를 만들면 기존 파일을 **번호 순서대로 먼저 실행**하고 이어 붙인 파일을 실행한다.
- **"실제에만 있음" 표**(파일에 없는데 실제에 있다): 그 표를 만드는 마이그레이션 파일은 쓰지 않는다(기존 DB 에 다시 실행되면 안 된다). 대신 대표가 대시보드의 표 정의(또는 `supabase db dump --schema-only`)를 내려받아 **`supabase/schema-baseline.sql`** 로 보관한다 — 마이그레이션 폴더 밖이라 실행되지 않는 기록이다. 맨 위에 `-- 실행하지 않는다. 새 프로젝트로 옮길 때만 기존 파일보다 먼저 손으로 실행` 주석. 새 프로젝트 복구 순서는 `company/backup.md` 에 "schema-baseline → 기존 파일 → 이어 붙인 파일"로 적는다.
- `public` 밖 스키마(예: `erp`)에 업무 표가 있으면 그 스키마도 대상이다. 아래 SQL 의 표 이름은 **항상 스키마를 붙이고**, 대문자·빈칸이 든 이름은 큰따옴표로 감싼다: `public."BookingNotes"`, `erp.bookings`.

## 2. `company/data.md` 「기존 표」 절과 바꾸기 전 상태

`assets/data.template.md` 의 「2-1. 기존 표」 절을 채운다.

| 표(스키마 포함) | 어디서 만들었나 | 잠금(RLS) | 정책(요지) | anon·authenticated 권한 | 이번에 할 것 |
|---|---|---|---|---|---|
| `public.bookings` | `0001_bookings.sql` | 꺼짐 | 0 | anon: 전부 | 기준선 → 로그인 확인 뒤 잠금 + 정책 4개 |
| `public.booking_notes` | `0002_add_booking_notes.sql` | 꺼짐 | 0 | anon: 전부 | 같은 잠금 파일 |
| `public.notes` | 실제에만 있음(대시보드 — `schema-baseline.sql`) | 켜짐 | `notes_all` select `using (true)` | authenticated: select | 넓은 정책 — 대표 확인 뒤 교체 |
| `public.audit_log` | `0002_…` | 켜짐 | 1(insert만) | authenticated: insert | **삭제 금지 표** — 지금 권한 유지 |

(위 표 이름은 예시다. 업종마다 다르다 — 예약 앱이면 `bookings`, 납품 앱이면 `deliveries`, 정비 앱이면 `work_orders`.)

**바꾸기 전 상태를 `company/backup.md` 「바꾸기 전 잠금·권한」에 그대로 옮겨 둔다** — 1-2 의 ①②③ 결과 **원문**: 표별 RLS 켜짐/꺼짐, 정책마다 이름·역할·명령·조건(`qual`·`with_check`)·허용형 여부, 표·시퀀스 `relacl`·열 `attacl` 원문(예: `{postgres=arwdDxt/postgres,anon=arwd/postgres,authenticated=r*/postgres}` — `*` 는 grant option, `/` 뒤는 부여자). 3-4 의 역변경이 이것과 바꾼 뒤 원문의 차이로 만들어진다.

## 3. 이어 붙이는 파일 — 한 파일 = 한 가지 일

### 3-1. 기준선 파일 (다음 번호) — 명단 · 판정 함수 · 변경 기록 (잠그지 않는다)

`0001_init.template.sql` 에서 **회사·명단·판정 함수·고친 시각 자동 기록**만 가져온다. 업무 표(`jobs`)는 만들지 않는다 — 기존 표가 그 자리다. 이 파일은 기존 표의 잠금·권한을 **건드리지 않는다**(지금 앱이 계속 돈다).

- 가져오는 것: 0절(다시 실행 막기) · 1절 `companies` · 2절 `app_users` · 3절 `my_company()` · 5절 `touch_updated_at()` · 6절 중 `companies`·`app_users` 의 잠금·정책·권한 · 7절 처음 한 번 안내 주석 · 9절 `notify pgrst`.
- **`my_company()` 는 템플릿 3절의 정의를 글자 그대로 쓴다** — `security definer` · `set search_path = public, pg_temp` · 표 이름 앞 `public.` · `revoke all … from public, anon` · `grant execute … to authenticated` 다섯 가지가 다 있어야 한다. 하나라도 빠지면 권한 오류로 조회가 통째로 막히거나(execute 없음), 명단 표의 잠금을 다시 검사하다 되돌아 들어가거나(definer 없음), 임시 표로 속을 수 있다(search_path). 이 함수를 손으로 다시 짓지 않는다.
- **1-2 ④에서 `companies`·`app_users`·`my_company`·`my_role`·`touch_updated_at` 중 하나라도 이미 있으면 멈춘다.** 기존 정의(`pg_get_functiondef`·표 칸 목록)를 템플릿과 나란히 대표에게 보여 주고 "그대로 쓸지 / 다른 이름으로 둘지"를 정한 뒤에 쓴다. `create or replace` 로 덮어 기존 동작을 바꾸지 않는다. `my_role` 이 있으면 권한 단계가 이미 적용된 DB 다 — 0절이 실행을 막는다(정상).
- **변경 기록**: 1-2 ④의 결과로 판단한다.
  - `updated_at` 이 없다 → `alter table <스키마>.<표> add column if not exists updated_at timestamptz not null default now();` + `touch_updated_at` 트리거. 기존 행에는 지금 시각이 들어간다 — 대표에게 한 줄 알린다.
  - `updated_at` 이 있는데 `timestamp with time zone` 이 아니다(숫자·글자 등) → **칸도 트리거도 건드리지 않는다.** `company/data.md` 에 "기존 형식 유지"로 적는다.
  - 이미 그 표에 `updated_at` 을 고치는 트리거가 있다 → 새 트리거를 붙이지 않는다.
  - `created_at` 도 같은 규칙.
- 파일 이름 예: `0003_baseline_roster.sql`(시각 번호 폴더면 1-1 규칙으로 정한 14자리 + `_baseline_roster.sql`).

### 3-2. 들어갈 길 만들기 — 잠그기 전에 반드시

1. 앱에 로그인 화면을 붙인다(SKILL 의 접속 정보·앱 연결 절차 — 이미 있는 Supabase 연결 코드를 고쳐 쓴다).
2. 대표 계정을 만들고 기준선의 명단에 넣는다(템플릿 7절 안내 주석의 순서 — `companies` 한 줄, `app_users` 에 대표 한 줄). 직원 계정도 있으면 같이.
3. **로그인 사용자에게 최소 권한을 준다**(별도 파일 — 잠금은 아직 켜지 않는다). 잠금(RLS)이 꺼져 있어도 표 권한(ACL)은 적용되므로, 앱이 지금까지 `anon` 권한만으로 돌았다면 로그인한 순간 막힌다. 앱이 쓰는 표마다 `authenticated` 에 **앱이 실제로 쓰는 명령만** 준다 — 조회만 하는 표는 `select` 만, 넣고 고치는 표는 `select`·`insert`·`update`(`delete` 는 앱이 지우기를 쓸 때만), 새 행을 넣는 표는 연결 시퀀스 `usage` 까지. 1-2 ③ 원문에 **열 단위 권한**(`attacl`)이 있던 표는 그 열 권한을 그대로 옮기고 표 전체 권한으로 넓히지 않는다(3-3 의 "권한은 최소로" 와 같은 기준이다). 1-2 ③ 원문에 이미 있는 것은 다시 주지 않는다. 3-2.4 의 "시험 건 하나" 확인은 쓰기 권한을 준 표에서만 한다. 기존 잠금이 켜진 표에서 새 대표 계정이 통과하지 못하면(좁은 기존 정책) 여기서 멈추고 대표와 정한다. 이 파일도 3-4 역변경 대상이다.
4. **대표 계정으로 실제 앱에 로그인해** 목록이 보이고 시험 건 하나를 넣을 수 있는지 본다(로그인 흐름과 3의 권한이 도는지가 확인 대상이다). 그리고 SQL Editor 에서 대표 계정으로 `my_company()` 가 값을 돌려주는지 확인한다(authenticated 역할 시험):

```sql
-- 대표 계정 id 로 바꿔 넣는다(Authentication > Users 에서 복사). 통째로 실행 — 아무것도 남기지 않는다.
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '<대표 계정 id>', 'role', 'authenticated')::text, true);
select public.my_company();     -- 회사 id 가 나와야 한다. null 이면 명단 등록이 안 된 것 — 여기서 멈춘다
rollback;
```

이 시험은 함수·명단 확인이다 — **업무 표의 최종 잠금 통과 증거는 아니다.** 그것은 3-3 실행 뒤 대표 계정으로 실제 앱에 접속해 확인한다.

이 네 가지가 확인되기 전에는 3-3 을 실행하지 않는다.

### 3-3. 잠금 파일 (그다음 번호) — 대상: 잠금 꺼짐 · 정책 0개 · 넓은 정책

대상 표는 1-2 결과에서 **셋 중 하나라도** 해당하는 표다: ① 잠금(RLS) 꺼짐 ② 정책 0개 ③ 넓은 정책(`using (true)`·`auth.uid() is not null`·`auth.role() = 'authenticated'` 처럼 "로그인만 하면 전부", 또는 `anon` 에게 열린 정책). SKILL 의 분기 조건과 같은 말이다.

**정책 조건 — 표에 회사 구분 칸이 있으면 그 칸으로.** 기존 표에 `company_id`(회사 구분 칸)가 이미 있고 값이 `companies.id` 와 같은 형식이면 `company_id = public.my_company()` 로 행을 대조한다(빈 값·형식이 다르면 멈추고 대표와 정한다 — 귀속이 불분명한 행을 자동으로 열지 않는다). **없으면 회사 1곳 앱인지 먼저 확인한다** — 기존 표에 `company_id` 가 없으면, 대표에게 "이 앱은 한 회사(우리 회사)만 씁니까?"를 확인한 **뒤에만** `public.my_company() is not null`(= 우리 회사 명단에 있으면 통과)을 쓴다. 이 조건은 행의 소속·작성자·역할을 보지 않는다 — 회사가 둘 이상이거나, 지점·개인별로 볼 수 있는 행이 달라야 하면 **여기서 멈추고** "회사·사람별 구분 칸(`company_id` 등)을 더하는 별도 작업"으로 대표와 정한다(기존 행에 값을 채워야 해서 되돌리기 어렵다).

**기존 넓은 정책은 교체해야 닫힌다.** 허용형(permissive) 정책은 여러 개가 **OR 로 합쳐진다** — 좁은 정책을 더해도 넓은 정책 하나가 남아 있으면 그대로 다 통과한다. 그래서 2절 표의 넓은 정책을 대표에게 보여 주고 "이 규칙을 지우고 아래 규칙으로 바꿉니다"를 확인받은 뒤 같은 파일에서 `drop policy` 한다. **지우는 것은 대표가 교체 대상으로 확인한 이름뿐이다.** 좁은 정책(역할·작성자로 이미 제한된 것)은 지우지 않고 그대로 둔다.

**새 정책 이름이 기존과 겹치면**(1-2 ②에 같은 이름이 있음) 정의(역할·명령·조건)를 비교한다: 같으면 그 정책은 만들지 않고 건너뛴다. 다르면 멈추고 대표에게 보여 준다 — 기존 것을 교체 대상으로 확인받거나, 새 정책을 `_erp` 접미사 이름(`bookings_read_erp`)으로 만든다. `drop policy if exists <새 이름>` 을 먼저 적어 확인 없이 지우지 않는다.

**권한(GRANT)은 최소로.** 1-2 ③의 원문과 3-2.3 에서 준 권한에서 출발한다: **앱이 쓰지 않는 명령은 주지 않는다.** 앱이 실제로 쓰는 명령만(조회만 하는 표는 `select` 만), 삭제 금지 표(감사 기록 등)에는 `delete` 를 주지 않는다. 열 단위 권한이 있던 표는 표 전체 권한으로 바꾸지 않는다. 새 행 번호를 시퀀스(`serial`·`identity`)로 받는 표는 그 시퀀스에 `usage` 를 준다(없으면 조회는 되는데 추가가 실패한다).

```sql
-- 0004_lock_existing_tables.sql — 기존 표 잠그기(표를 다시 만들지 않는다)
-- 전제: 3-2 확인 끝(대표 계정으로 my_company() 가 값을 돌려줌). 회사 1곳 앱 — 대표 확인 <날짜>.
-- 바꾸기 전 상태: company/backup.md 「바꾸기 전 잠금·권한」. 역변경은 3-4.
alter table public.bookings        enable row level security;
alter table public."BookingNotes"  enable row level security;

revoke all on table public.bookings, public."BookingNotes" from anon;
-- 지금 권한에서 필요한 것만 — 예: bookings 는 넷 다 쓰고, BookingNotes 는 지우기 없음
grant select, insert, update, delete on public.bookings       to authenticated;
grant select, insert, update         on public."BookingNotes" to authenticated;
grant usage on sequence public."BookingNotes_id_seq" to authenticated;   -- serial 칸이 있을 때만

-- 대표가 교체 대상으로 확인한 넓은 정책만 지운다(이름은 2절 표 그대로 — 이것 말고는 지우지 않는다)
drop policy if exists "Enable read access for all users" on public.bookings;

-- 새 정책 — 1-2 ② 에 같은 이름이 없음을 확인했다(겹치면 위 규칙: 같으면 건너뜀, 다르면 멈춤 또는 _erp)
create policy bookings_read   on public.bookings for select to authenticated using (public.my_company() is not null);
create policy bookings_insert on public.bookings for insert to authenticated with check (public.my_company() is not null);
create policy bookings_update on public.bookings for update to authenticated using (public.my_company() is not null) with check (public.my_company() is not null);
create policy bookings_delete on public.bookings for delete to authenticated using (public.my_company() is not null);
-- (BookingNotes 도 같은 모양 — 지우기 권한이 없으면 delete 정책도 만들지 않는다)

notify pgrst, 'reload schema';
```

- 위 표·시퀀스 이름은 예시다. 기존 이름 그대로, 스키마를 붙여 쓴다. 게이트가 G11(인덱스) 주의를 내면 같은 파일에 `create index if not exists` 를 더한다.
- `using (true)`·`auth.uid() is not null` 은 쓰지 않는다 — "로그인만 하면 전부"라 게이트 G14 가 막는다.
- 실행 직후 대표 계정으로 앱을 다시 열어 목록·추가가 되는지 본다. 막히면 3-4 역변경으로 즉시 되돌리고 원인을 찾는다(대개 명단 등록·시퀀스 권한).

### 3-4. 역변경 — 바꾸기 전 상태를 그대로 되살린다

`drop policy … ; disable row level security;` 만으로는 되돌아가지 않는다(지운 넓은 정책·회수한 권한이 돌아오지 않고, 원래 잠금이 켜져 있던 표는 오히려 열린다). 잠금 파일과 같이 **`company/backup.md` 의 바꾸기 전 상태로 되돌리는 SQL** 을 써 둔다(실행 파일이 아니라 기록 — `company/backup.md` 「되돌리기 SQL」):

- 정책: 이번에 만든 정책만 `drop policy` → 지운 정책은 2절에 적은 이름·역할(`to`)·명령(`for`)·조건(`using`·`with check`)·허용형(`as permissive`/`as restrictive`)으로 `create policy` 를 다시 짠다.
- 잠금: 원래 꺼져 있던 표만 `disable row level security`. 원래 켜져 있던 표는 그대로.
- 권한: 바꾸기 전 `relacl`·`attacl` 원문과 **바꾼 뒤 원문**(같은 ③ 조회를 다시 실행)을 나란히 놓고 차이만 되돌린다 — 사라진 항목은 `grant …`(grant option `*` 이 있던 것은 `with grant option`), 새로 생긴 항목은 `revoke …`. 표·열·시퀀스 각각. **부여자(`/` 뒤 이름)도 맞춘다**: 원문의 부여자가 지금 실행하는 역할(SQL Editor 는 보통 `postgres`)과 다르면 `set role <부여자>;` 뒤에 `grant` 하고 `reset role;` 로 돌아온다 — 그 역할로 바꿀 수 없으면(권한 없음) 되돌리기 전에 멈추고 대표에게 "부여자가 달라 원문과 완전히 같게는 못 돌린다"고 말한 뒤 진행한다(동작은 같고 기록만 다르다). 되돌린 뒤 ③ 을 다시 실행해 원문이 바꾸기 전과 같은지 본다.
- 롤백 시뮬(`indeans-erp-check` 의 `references/rollback-sim.md`)은 이 역변경으로 한다.

## 4. 게이트와 나머지

- `scripts/migration-gate.mjs` 를 붙이고(SKILL 4절) `npm run check`. 게이트는 **모든 파일을 순서대로 읽은 뒤의 마지막 상태**로 판정하므로, 잠금 없는 기존 파일(G1·G2)도 이어 붙인 잠금 파일 뒤에는 통과한다. 통과하지 않으면 빠진 표가 있는 것이다 — 잠금 파일에 더한다. (시험 2026-10-11: 잠금 없는 기존 파일 2개만 있을 때 G1 막힘 2건 → 위 모양의 기준선·잠금 파일을 이어 붙인 뒤 막힘 0, 주의는 G11 인덱스 1건.) `supabase/schema-baseline.sql` 은 마이그레이션 폴더 밖이라 게이트가 읽지 않는다.
- 실행 순서: (새 프로젝트면 schema-baseline → 기존 파일 먼저) → 기준선 → **3-2 들어갈 길 확인** → 잠금. 실행할 때마다 `company/data.md` 실행 기록에 한 줄. 기존 파일을 이번에 처음 실행했으면 그것도 적는다.
- 정책을 바꾸는 파일이므로 실행 전 롤백 시뮬(3-4 의 역변경으로).
- 이후 절차(접속 정보 → 앱 연결 → 잠금 확인 → 배포 → 직원 확인)는 SKILL 6~13절 그대로다. 앱의 저장 코드는 **이미 있는 Supabase 연결 코드를 고쳐 쓴다** — 화면마다 새 접속 객체를 만들지 않는다. 브라우저 저장으로 빠지는 폴백이 있으면, 실제 저장이 확인된 뒤에 폴백을 끄고 그 사실을 보고서에 적는다.
- 커밋된 `.env` 가 진단에 있으면 이 단계에서 다시 확인한다: 기록에서 뺐는지(`git ls-files`), 대표가 키를 새로 발급했는지. 새로 발급하지 않았으면 배포 전에 한 번 더 권한다.
- 끝나면 `.owner/progress.json` 의 `imported_app.stage` 를 `"data"` 로.
