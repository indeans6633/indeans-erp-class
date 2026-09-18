-- 역할·권한 마이그레이션 템플릿
-- 쓰는 법: supabase/migrations/ 의 마지막 번호 +1 로 새 파일을 만들어 이 내용을 옮긴 뒤 회사에 맞게 고친다.
-- 기존 마이그레이션 파일은 고치지 않는다. <표이름> 자리를 실제 표 이름으로 바꾼다.
-- 적용 전에 반드시 읽을 것: references/roles-basics.md 4절(빈칸이 통과하는 이유), references/lessons.md 4번.

-- ─────────────────────────────────────────────────────────
-- 1. 역할 표 — 로그인 계정 하나에 행 하나
-- ─────────────────────────────────────────────────────────
create table if not exists app_users (
  id          uuid primary key references auth.users(id) on delete cascade,
  name        text not null,
  role        text not null check (role in ('owner','staff','client')),  -- 역할을 늘리면 여기에 추가
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

alter table app_users enable row level security;

-- ─────────────────────────────────────────────────────────
-- 2. 판정 함수 — 지금 로그인한 사람의 역할
--    security definer 로 두는 이유: 역할 표를 읽을 때 그 표의 규칙에 다시 걸려 무한히 도는 것을 피한다.
--    search_path 의 `pg_temp` 와 표 이름 앞의 `public.` 은 둘 다 안전장치다.
--    `pg_temp` 를 빼면 로그인 사용자가 같은 이름의 임시 표를 만들어 이 함수를 속일 수 있다.
-- ─────────────────────────────────────────────────────────
create or replace function my_role()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$ select role from public.app_users where id = auth.uid() and active $$;

revoke all on function my_role() from public, anon;
grant execute on function my_role() to authenticated;
-- ↑ 이 줄을 지우거나 회수하면, 이 함수를 쓰는 표가 통째로 안 열린다. 절대 회수하지 않는다.

-- ─────────────────────────────────────────────────────────
-- 3. 역할 표 자신의 규칙 — 본인 행은 읽기, 고치는 것은 대표만
-- ─────────────────────────────────────────────────────────
create policy app_users_read_self on app_users for select to authenticated
  using (id = auth.uid() or coalesce(my_role(),'') = 'owner');

create policy app_users_write_owner on app_users for insert to authenticated
  with check (coalesce(my_role(),'') = 'owner');

create policy app_users_update_owner on app_users for update to authenticated
  using (coalesce(my_role(),'') = 'owner')
  with check (coalesce(my_role(),'') = 'owner');

-- 삭제 규칙은 만들지 않는다 = 아무도 못 지운다(기본은 차단, active=false).

-- ─────────────────────────────────────────────────────────
-- 4. 업무 표 — 먼저 전부 잠그고, 필요한 것만 연다
--    <표이름> 을 실제 표로 바꾸고, 표마다 이 블록을 반복한다.
-- ─────────────────────────────────────────────────────────
alter table <표이름> enable row level security;

-- 읽기: 대표·직원은 전부, 고객은 자기 것만
create policy <표이름>_read on <표이름> for select to authenticated
  using (
    coalesce(my_role(),'') in ('owner','staff')
    or (my_role() = 'client' and client_id = auth.uid())   -- 고객 칸 이름에 맞게 고친다
  );

-- 넣기
create policy <표이름>_insert on <표이름> for insert to authenticated
  with check (coalesce(my_role(),'') in ('owner','staff'));

-- 고치기: using(어느 행을 고칠 수 있나) + with check(고친 뒤 값이 허용되나) 둘 다 필요
create policy <표이름>_update on <표이름> for update to authenticated
  using (coalesce(my_role(),'') in ('owner','staff'))
  with check (coalesce(my_role(),'') in ('owner','staff'));

-- 지우기: 대표만
create policy <표이름>_delete on <표이름> for delete to authenticated
  using (coalesce(my_role(),'') = 'owner');

-- 주의 1: for all 로 쓴 규칙은 읽기에도 걸린다. 나중에 좁은 읽기 규칙을 더해도 넓은 for all 이 덮는다.
-- 주의 2: 검사는 허용 목록으로 쓴다. my_role() <> 'client' 처럼 쓰면 역할이 빈 계정이 통과한다.
-- 주의 3: 로그인 안 한 사람(anon)에게는 아무 규칙도 만들지 않는다.

-- ─────────────────────────────────────────────────────────
-- 5. 변경 기록 — 인터뷰에서 고른 두세 가지 행동만
-- ─────────────────────────────────────────────────────────
create table if not exists change_log (
  id            uuid primary key default gen_random_uuid(),
  target        text not null,          -- 무엇 (표 이름)
  target_id     uuid,
  action        text not null,          -- 무슨 일 (예: 'status_change', 'delete', 'amount_edit')
  before_value  text,
  after_value   text,
  actor_id      uuid not null default auth.uid(),
  created_at    timestamptz not null default now()
);

alter table change_log enable row level security;

create policy change_log_read on change_log for select to authenticated
  using (coalesce(my_role(),'') = 'owner');

create policy change_log_insert on change_log for insert to authenticated
  with check (actor_id = auth.uid());

-- 수정·삭제 규칙은 만들지 않는다 = 기록은 고칠 수도 지울 수도 없다.

-- ─────────────────────────────────────────────────────────
-- 6. 적용한 뒤 눈으로 확인 (건너뛰지 않는다)
-- ─────────────────────────────────────────────────────────
-- (1) 표마다 행 단위 보안이 켜져 있나
select relname, relrowsecurity from pg_class
where relnamespace = 'public'::regnamespace and relkind = 'r'
order by relrowsecurity, relname;

-- (2) 표마다 규칙이 몇 개 붙어 있나 (0개인데 보안만 켜져 있으면 그 표는 아무도 못 본다)
select tablename, count(*) as policies from pg_policies
where schemaname = 'public' group by tablename order by tablename;

-- (3) 판정 함수의 실행 권한이 남아 있나 (authenticated 가 보여야 한다)
select proname, proacl from pg_proc
where pronamespace = 'public'::regnamespace and proname = 'my_role';

-- (4) 마지막 확인은 SQL이 아니라 화면에서 한다.
--     역할별 계정으로 실제 로그인해 첫 화면·상세·검색·파일까지 열어 본다.
--     역할이 빈 계정으로도 한 번 로그인해 본다 — 아무것도 안 보여야 정상이다.
