-- 0001_init.sql — 첫 표 만들기
-- 회사: <회사 이름>
-- 관리 단위: <company/scope.md 에 적은 관리 단위 — 납품 건 / 방문 건 / 예약 건 / 작업 지시 등>
-- 실행 위치: Supabase 대시보드 > SQL Editor 에 전부 붙여 넣고 Run
--
-- 규칙 1: 이 파일은 한 번 실행한 뒤에는 고치지 않는다. 바꿀 것이 생기면 0002_*.sql 을 새로 만든다.
-- 규칙 2: <꺾쇠> 부분만 우리 회사 말로 바꾼다. 표·칸 이름은 영문, 회사 말은 아래쪽 주석(comment)으로 붙인다.
-- 규칙 3: 표를 새로 늘릴 때마다 맨 아래 "새 표 점검 3줄"을 확인한다.
-- 규칙 4: 실행하기 전에 `npm run check`(마이그레이션 게이트)를 통과시키고, 실행한 뒤 company/data.md 실행 기록에 한 줄 적는다.

-- ─────────────────────────────────────────────────────────────
-- 0) 다시 실행 막기 — 권한 단계가 이미 적용된 데이터베이스에서는 이 파일을 다시 실행하지 않는다.
--    아래의 넓은 규칙(회사 명단에 있으면 전부)이 되살아나면, 좁혀 둔 권한이 다시 넓어진다(규칙은 더할수록 넓어진다).
--    권한 단계 전에는 몇 번을 다시 실행해도 같은 결과다(만들 규칙을 먼저 지우고 다시 만든다).
-- ─────────────────────────────────────────────────────────────
do $guard$
begin
  if exists (select 1 from pg_proc where proname = 'my_role' and pronamespace = 'public'::regnamespace) then
    raise exception '0001 은 이미 실행됐고 권한 단계가 적용돼 있습니다(my_role 함수 있음) — 다시 실행하면 좁혀 둔 권한이 넓어집니다. 표를 바꾸려면 다음 번호 파일을 만드세요.';
  end if;
end
$guard$;

-- ─────────────────────────────────────────────────────────────
-- 1) 회사 — 지금은 우리 회사 한 곳이다. 나중에 지점이 생겨도 이 구조를 쓴다.
-- ─────────────────────────────────────────────────────────────
create table if not exists companies (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table companies is '회사';

-- ─────────────────────────────────────────────────────────────
-- 2) 이 앱을 쓸 수 있는 사람 — 로그인 계정과 회사를 잇는 명단
--    여기에 없는 계정은 로그인해도 아무것도 못 본다.
-- ─────────────────────────────────────────────────────────────
create table if not exists app_users (
  id          uuid primary key references auth.users(id) on delete cascade,
  company_id  uuid not null references companies(id),
  name        text not null,
  role        text not null default 'staff',   -- owner / staff (client 는 필요할 때만 — indeans-erp-people)
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table app_users is '앱 사용자 명단';
comment on column app_users.active is '사용 안 함으로 끌 때 false. 계정을 지우지 말고 이 칸을 내린다.';
create index if not exists app_users_company_idx on app_users (company_id);

-- ─────────────────────────────────────────────────────────────
-- 3) 판정 함수 — "이 사람은 어느 회사 사람인가"
--    명단에 없거나 꺼진 사람이면 아무것도 돌려주지 않는다(= 통과 못 한다).
--    search_path 의 `pg_temp` 와 표 이름 앞의 `public.` 은 둘 다 안전장치다.
--    `pg_temp` 를 빼면 로그인 사용자가 같은 이름의 임시 표를 만들어 이 함수를 속일 수 있다.
-- ─────────────────────────────────────────────────────────────
create or replace function my_company()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select company_id from public.app_users where id = auth.uid() and active
$$;

revoke all on function my_company() from public, anon;
-- 아래 한 줄이 빠지면 잠금 검사 자체가 실패해서 그 표의 조회가 통째로 막힌다. 반드시 같이 실행한다.
grant execute on function my_company() to authenticated;

-- ─────────────────────────────────────────────────────────────
-- 4) 업무 표 — 우리 회사의 관리 단위 하나. 표 이름 jobs 를 회사에 맞게 바꿔도 된다.
-- ─────────────────────────────────────────────────────────────
create table if not exists jobs (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null default my_company() references companies(id),
  title       text not null,
  customer    text,
  status      text not null default 'open',
  due_date    date,
  -- 금액 칸은 여기 넣지 않는다. 지금은 회사 사람 모두가 같은 줄을 보므로, 금액을 넣으면 직원에게도 그대로 보인다.
  -- 권한 단계(indeans-erp-people)에서 볼 사람을 나눈 뒤 indeans-erp-money 가 받을 돈·줄 돈을 별도 표로 만든다.
  memo        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 회사 말 붙이기 — 화면 라벨은 여기 적은 말로 맞춘다.
comment on table  jobs           is '<납품 건 / 방문 건 / 예약 건 …>';
comment on column jobs.title     is '<건 이름>';
comment on column jobs.customer  is '<거래처 · 고객 이름>';
comment on column jobs.status    is '<상태: 접수 / 진행 / 완료>';
comment on column jobs.due_date  is '<예정일 · 납기>';
comment on column jobs.memo      is '<메모>';

-- 자주 쓰는 정렬을 빠르게
create index if not exists jobs_company_created_idx on jobs (company_id, created_at desc);

-- ─────────────────────────────────────────────────────────────
-- 5) 고친 시각 자동 기록
-- ─────────────────────────────────────────────────────────────
create or replace function touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end
$$;

drop trigger if exists jobs_touch on jobs;
create trigger jobs_touch before update on jobs
  for each row execute function touch_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 6) 문지기 켜기 — 표를 만들자마자 건다
-- ─────────────────────────────────────────────────────────────
alter table companies enable row level security;
alter table app_users   enable row level security;
alter table jobs      enable row level security;

-- 로그인 안 한 접속(anon)은 아예 제외한다
revoke all on table companies, app_users, jobs from anon;
grant select, insert, update, delete on jobs to authenticated;
grant select on companies, app_users to authenticated;

-- 다시 실행해도 "이미 있습니다" 로 멈추지 않게, 만들 규칙을 먼저 지운다(처음 실행이면 "없어서 건너뜁니다" 안내만 나온다).
drop policy if exists companies_read on companies;
drop policy if exists app_users_read on app_users;
drop policy if exists jobs_read      on jobs;
drop policy if exists jobs_insert    on jobs;
drop policy if exists jobs_update    on jobs;
drop policy if exists jobs_delete    on jobs;

-- 통과 규칙: 로그인했고, 우리 회사 사람이면 통과
create policy companies_read on companies for select to authenticated
  using (id = my_company());

-- 지금은 우리 회사 사람끼리 서로 보인다. 권한 단계(indeans-erp-people)에서 역할을 나눌 때
-- 이 규칙을 먼저 확인하고 필요하면 좁힌다 — 나중에 좁은 규칙을 새로 추가해도
-- 여기 있는 넓은 규칙이 그대로 통과시킨다(규칙은 더해질수록 넓어진다).
create policy app_users_read on app_users for select to authenticated
  using (company_id = my_company());

create policy jobs_read on jobs for select to authenticated
  using (company_id = my_company());

create policy jobs_insert on jobs for insert to authenticated
  with check (company_id = my_company());

create policy jobs_update on jobs for update to authenticated
  using (company_id = my_company())
  with check (company_id = my_company());

create policy jobs_delete on jobs for delete to authenticated
  using (company_id = my_company());

-- 읽기·넣기·고치기·지우기를 따로 적었는지 센다. 하나라도 빠지면 그 동작은 막힌다(또는 열린다).

-- ─────────────────────────────────────────────────────────────
-- 7) 처음 한 번만 — 우리 회사와 대표 계정 등록
--    아래 두 줄은 Authentication > Users 에서 계정을 만든 뒤 실행한다.
-- ─────────────────────────────────────────────────────────────
-- insert into companies (name) values ('<회사 이름>');
--
-- insert into app_users (id, company_id, name, role)
-- select '<Authentication > Users 에서 복사한 User UID>'::uuid,
--        c.id, '<대표 이름>', 'owner'
--   from companies c
--  where c.name = '<회사 이름>';
--
-- 직원 계정(2회차 마무리 — 직원이 폰으로 넣고 다시 보는 확인)도 같은 방식으로 넣는다. 역할만 'staff'.
-- insert into app_users (id, company_id, name, role)
-- select '<직원 계정 User UID>'::uuid, c.id, '<직원 호칭 — 실명 대신 역할로>', 'staff'
--   from companies c
--  where c.name = '<회사 이름>';

-- ─────────────────────────────────────────────────────────────
-- 8) 확인 — 여기서 보이는 것은 증거가 아니다
--    SQL Editor 는 관리자 권한으로 돌아 문지기를 지나친다.
--    반드시 앱에서 ① 대표 계정 로그인 → 목록이 보인다
--                ② 명단(app_users)에 없는 두 번째 계정 로그인 → 목록이 비어 있다
--    두 가지를 눈으로 확인한다. ②가 통과해야 잠근 것이다.
-- ─────────────────────────────────────────────────────────────

-- 새 표 점검 3줄 (표를 늘릴 때마다)
--  1. 누구 것인지 알려 주는 칸(company_id 등)이 있나?
--  2. 읽기 규칙이 그 칸을 보고 판정하나? (역할 이름만 보고 통과시키지 않나)
--  3. 같은 데이터의 다른 경로(파일 보관함·내보내기·알림)에도 같은 규칙을 걸었나?

-- ─────────────────────────────────────────────────────────────
-- 9) 앱이 새 표를 바로 알아보게 — 파일마다 맨 끝에 둔다
--    빠뜨리면 앱에서 "Could not find the table … in the schema cache" 가 날 수 있다.
-- ─────────────────────────────────────────────────────────────
notify pgrst, 'reload schema';
