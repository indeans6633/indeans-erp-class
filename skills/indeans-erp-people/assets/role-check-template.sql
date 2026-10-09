-- 역할·권한 마이그레이션 템플릿
-- 쓰는 법: supabase/migrations/ 의 마지막 번호 +1 로 새 파일을 만들어 이 내용을 옮긴 뒤 회사에 맞게 고친다.
-- 기존 마이그레이션 파일은 고치지 않는다. <표이름> 자리를 실제 표 이름으로 바꾼다.
-- 적용 전에 반드시 읽을 것: references/roles-basics.md 4절(빈칸이 통과하는 이유), references/lessons.md 4번.
-- 실행 순서: npm run check(게이트) → 롤백 시뮬(indeans-erp-check 의 references/rollback-sim.md) → SQL Editor 실행
--           → company/data.md 실행 기록에 한 줄 → references/roles-basics.md 5절 확인 질의.
-- 이 파일은 대표·직원 두 역할 기준이다. 고객 역할은 맨 아래 "고객 역할을 만들 때" 블록을 다음 번호 파일로 따로 만든다.

-- ─────────────────────────────────────────────────────────
-- 0. 좁히기 전에 이 줄부터 — 앞 회차에서 만든 넓은 규칙을 먼저 지운다
--    규칙은 더할수록 넓어진다. 같은 표에 넓은 규칙과 좁은 규칙이 함께 있으면
--    둘 중 하나라도 통과시키는 쪽이 이겨서, 아래에서 아무리 좁혀도 그대로 다 보인다.
--    (2회차 0001 이 만든 app_users_read(우리 회사 사람이면 전부)가 남아 있으면
--     직원이 동료 명단을 그대로 다 읽는다 — 2026-09-18 리허설에서 실제로 새던 자리다.)
-- ─────────────────────────────────────────────────────────
drop policy if exists app_users_read on app_users;
drop policy if exists <표이름>_read   on <표이름>;
drop policy if exists <표이름>_insert on <표이름>;
drop policy if exists <표이름>_update on <표이름>;
drop policy if exists <표이름>_delete on <표이름>;

-- 이 파일이 아래에서 다시 만드는 것들 — 두 번 실행해도 "이미 있습니다" 로 멈추지 않게 한다.
drop policy if exists app_users_read_self   on app_users;
drop policy if exists app_users_write_owner on app_users;
drop policy if exists app_users_update_owner on app_users;
-- change_log 의 규칙은 5번에서 그 표를 만든 바로 뒤에 지운다(표가 생기기 전에는 지울 것이 없다).

-- 다 지운 뒤에는 그 표가 잠깐 아무에게도 안 보인다(규칙 0개 = 전부 차단). 이 파일을 끝까지 실행해야 열린다.
-- 같은 표에 다른 이름의 넓은 규칙(for all · using (true) 등)이 더 있는지 supabase/migrations 전체에서 찾아 여기에 더한다.

-- ─────────────────────────────────────────────────────────
-- 1. 역할 표 — 2회차 0001 이 만든 app_users 를 그대로 쓴다. 역할 값에 허용 목록을 건다.
--    허용 목록 밖의 값(오타·빈칸)은 저장 자체가 안 된다. 역할을 늘리면 이 목록부터 고친다.
-- ─────────────────────────────────────────────────────────
alter table app_users alter column role set not null;
-- 허용 목록은 없을 때만 만든다. 이미 있으면 지금 목록을 그대로 둔다 —
-- 고객 역할을 더한 뒤(맨 아래 블록) 이 파일을 다시 실행해도 고객 역할이 목록에서 빠지거나, 등록된 고객 계정 때문에 멈추지 않게.
-- 역할을 더하거나 빼는 일은 그 역할의 다음 번호 파일에서 한다(목록을 지우고 새 목록으로 다시 만든다).
do $roles$
begin
  if exists (select 1 from pg_constraint
              where conrelid = 'public.app_users'::regclass and conname = 'app_users_role_check') then
    raise notice '역할 허용 목록(app_users_role_check)이 이미 있어 그대로 둡니다.';
  elsif exists (select 1 from public.app_users where role not in ('owner','staff')) then
    raise exception '명단에 대표(owner)·직원(staff) 밖의 역할 값이 있습니다 — 그 사람의 역할을 먼저 바로잡거나, 그 역할을 더하는 파일을 먼저 만드세요.';
  else
    alter table public.app_users add constraint app_users_role_check
      check (role in ('owner','staff'));        -- 고객 역할을 만들 때는 맨 아래 블록이 'client' 를 더한 목록으로 바꾼다
  end if;
end
$roles$;

alter table app_users enable row level security;

-- ─────────────────────────────────────────────────────────
-- 2. 판정 함수 — 지금 로그인한 사람의 역할
--    security definer 로 두는 이유: 역할 표를 읽을 때 그 표의 규칙에 다시 걸려 무한히 도는 것을 피한다.
--    가드 세 줄: ① search_path 는 public 다음에 pg_temp(맨 끝) ② public·anon 에게서 회수 ③ authenticated 에게 실행 권한.
--    `pg_temp` 를 빼거나 앞에 두면 로그인 사용자가 같은 이름의 임시 표를 만들어 이 함수를 속일 수 있다.
--    활성(active)이 꺼진 사람은 아무것도 돌려받지 못한다 — 차단한 사람의 출입증이 남아 있어도 데이터가 안 나간다.
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
-- 3. 역할 표 자신의 규칙 — 본인 행은 읽기, 대표는 우리 회사 사람 전부, 고치는 것은 대표만
--    직원이 담당자 이름 목록을 봐야 하면(배정 화면) 이 표를 열지 말고, 이름만 돌려주는 함수를 따로 만든다.
--    그 함수도 security definer 면 가드 세 줄 + 함수 안에서 `company_id = my_company()` 를 검사한다.
-- ─────────────────────────────────────────────────────────
create policy app_users_read_self on app_users for select to authenticated
  using (company_id = my_company() and (id = auth.uid() or coalesce(my_role(),'') = 'owner'));

create policy app_users_write_owner on app_users for insert to authenticated
  with check (company_id = my_company() and coalesce(my_role(),'') = 'owner');

create policy app_users_update_owner on app_users for update to authenticated
  using (company_id = my_company() and coalesce(my_role(),'') = 'owner')
  with check (company_id = my_company() and coalesce(my_role(),'') = 'owner');

-- 삭제 규칙은 만들지 않는다 = 아무도 못 지운다(기본은 차단, active=false).

-- ─────────────────────────────────────────────────────────
-- 4. 업무 표 — 먼저 전부 잠그고, 필요한 것만 연다
--    <표이름> 을 실제 표로 바꾸고, 표마다 이 블록을 반복한다.
--    소속 검사(company_id = my_company())와 역할 검사를 같이 쓴다 — 한쪽만 쓰면 그쪽이 비는 날 새거나 막힌다.
-- ─────────────────────────────────────────────────────────
alter table <표이름> enable row level security;

-- 읽기: 대표·직원은 우리 회사 것 전부
create policy <표이름>_read on <표이름> for select to authenticated
  using (company_id = my_company() and coalesce(my_role(),'') in ('owner','staff'));

-- 넣기
create policy <표이름>_insert on <표이름> for insert to authenticated
  with check (company_id = my_company() and coalesce(my_role(),'') in ('owner','staff'));

-- 고치기: using(어느 행을 고칠 수 있나) + with check(고친 뒤 값이 허용되나) 둘 다 필요
create policy <표이름>_update on <표이름> for update to authenticated
  using (company_id = my_company() and coalesce(my_role(),'') in ('owner','staff'))
  with check (company_id = my_company() and coalesce(my_role(),'') in ('owner','staff'));

-- 지우기: 대표만
create policy <표이름>_delete on <표이름> for delete to authenticated
  using (company_id = my_company() and coalesce(my_role(),'') = 'owner');

-- 주의 1: for all 로 쓴 규칙은 읽기에도 걸린다. 나중에 좁은 읽기 규칙을 더해도 넓은 for all 이 덮는다.
-- 주의 2: 검사는 허용 목록으로 쓴다. my_role() <> 'client' 처럼 쓰면 역할이 빈 계정이 통과한다.
-- 주의 3: 로그인 안 한 사람(anon)에게는 아무 규칙도 만들지 않는다. 규칙마다 "to authenticated" 를 적는다.
-- 주의 4: 직원에게 안 보여야 할 칸(금액·단가)이 같은 표에 있으면 줄 단위 규칙으로는 못 가린다 —
--         그 칸을 대표만 읽는 별도 표로 옮기거나(돈 흐름 단계는 indeans-erp-money), 그 칸을 뺀 조회를 따로 만든다.
-- 주의 5: 이 표의 사진·파일을 파일 저장소(Storage)에 두면 저장소 정책도 같은 조건으로 건다. 목록만 막으면 파일 주소로 샌다.

-- ─────────────────────────────────────────────────────────
-- 5. 변경 기록 — 인터뷰에서 고른 두세 가지 행동만. 기록도 회사별로 나눈다.
-- ─────────────────────────────────────────────────────────
create table if not exists change_log (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null default my_company() references companies(id),
  target        text not null,          -- 무엇 (표 이름)
  target_id     uuid,
  action        text not null,          -- 무슨 일 (예: 'status_change', 'delete', 'amount_edit')
  before_value  text,
  after_value   text,
  actor_id      uuid not null default auth.uid(),
  created_at    timestamptz not null default now()
);
create index if not exists change_log_company_idx on change_log (company_id, target, target_id, created_at desc);

-- 표가 생긴 뒤에 지운다 — 두 번 실행해도 "이미 있습니다" 로 멈추지 않게.
drop policy if exists change_log_read   on change_log;
drop policy if exists change_log_insert on change_log;

alter table change_log enable row level security;

-- 로그인 안 한 접속(anon)은 이 표에서 아예 뺀다. 표를 새로 만들 때마다 이 두 줄을 같이 쓴다.
revoke all on table change_log from anon;
grant select, insert on table change_log to authenticated;

create policy change_log_read on change_log for select to authenticated
  using (company_id = my_company() and coalesce(my_role(),'') = 'owner');

create policy change_log_insert on change_log for insert to authenticated
  with check (company_id = my_company() and actor_id = auth.uid() and my_role() is not null);

-- 수정·삭제 규칙은 만들지 않는다 = 기록은 고칠 수도 지울 수도 없다.

notify pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────
-- 6. 적용한 뒤 확인 — 이 파일에는 넣지 않는다
--    확인 질의(잠금 꺼진 표·규칙 없는 표·anon 에게 걸린 규칙·판정 함수 실행 권한·search_path·anon 이 부르는 함수)는
--    references/roles-basics.md 5절의 한 덩어리를 SQL Editor 에서 따로 실행한다. 걸린_것 칸이 전부 비어 있어야 통과다.
--    마지막 확인은 SQL이 아니라 화면에서 한다(SKILL.md 9단계 — erp-verifier).
--    역할별 계정으로 실제 로그인해 첫 화면·상세·검색·파일까지 열어 본다. 역할이 빈 계정·차단한 계정으로도 한 번.
-- ─────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────
-- 고객 역할을 만들 때 (SKILL.md 3-4 가 "예"일 때만) — 아래를 다음 번호 파일로 따로 만든다.
-- 고객 칸과 고객 규칙은 같은 파일에서 함께 만든다. 칸 없이 규칙만 만들면 실행이 멈추고,
-- 규칙 없이 칸만 만들면 고객이 아무것도 못 본다.
--
-- alter table app_users drop constraint if exists app_users_role_check;
-- alter table app_users add constraint app_users_role_check check (role in ('owner','staff','client'));
-- alter table <표이름> add column if not exists client_id uuid references app_users(id);
-- create index if not exists <표이름>_client_idx on <표이름> (company_id, client_id);
-- drop policy if exists <표이름>_read_client on <표이름>;
-- create policy <표이름>_read_client on <표이름> for select to authenticated
--   using (company_id = my_company() and coalesce(my_role(),'') = 'client' and client_id = auth.uid());
-- notify pgrst, 'reload schema';
--
-- 고객 화면은 내부 화면의 축소판이 아니라 다른 화면이다. 고객에게 보여 줄 칸만 돌려주는 조회를 따로 둔다.
-- ─────────────────────────────────────────────────────────
