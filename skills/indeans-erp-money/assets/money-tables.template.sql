-- NNNN_money_in.sql — 받을 돈(들어오는 돈) 한 축: 받을 돈 일정 + 받은 돈 기록 + 서버 규칙 + 건별 합계
-- 쓰는 법: supabase/migrations/ 의 마지막 번호 +1 로 이 파일을 만들고 <꺾쇠> 를 company/money.md 대로 바꾼다.
-- 실행 순서: npm run check → 롤백 시뮬(indeans-erp-check 의 references/rollback-sim.md 틀 1·2) → SQL Editor 실행
--           → company/data.md 실행 기록에 한 줄.
-- 전제: 2회차 0001(companies·app_users·jobs·my_company)과 권한 단계의 판정 함수 my_role() 이 실행돼 있다.
-- 이 파일은 "받을 돈" 한 축만 다룬다. 줄 돈(나가는 돈·원가)은 다른 파일·다른 표로 만든다 — 한 표에 섞지 않는다.
-- 금액은 원 단위 정수(bigint)다. 소수 자리 숫자(numeric(…,2))·실수를 쓰지 않는다.
-- 한 줄의 금액은 10조 원(1e13) 아래로 막고, 합계는 서버가 numeric 으로 더한다 — 큰 값이 들어와도 합계 계산이 넘치지 않는다.
-- jobs 는 관리 단위 표 이름이다. 회사에서 바꿨으면 같이 바꾼다.

-- ─────────────────────────────────────────────────────────
-- 0. 준비 두 가지
--    ① 연결을 회사까지 묶는다 — (회사 + 건) 두 칸을 함께 가리키게 하면, 다른 회사의 건 번호를 알아도 우리 회사 일정에 붙일 수 없다.
--    ② 건마다 돈 차례 번호(money_version) — 돈을 넣거나 일정을 고칠 때마다 서버가 그 건의 이 칸을 1씩 올린다(3번).
--       그 건의 줄을 실제로 고쳐서, 같은 건에 동시에 온 일들을 한 줄로 세운다. 앱은 이 칸을 읽지도 쓰지도 않는다.
--       이 칸이 바뀌면 그 건의 updated_at 도 바뀐다(돈이 들어온 것도 그 건의 변화로 본다).
-- ─────────────────────────────────────────────────────────
create unique index if not exists jobs_company_id_uidx on jobs (company_id, id);
alter table jobs add column if not exists money_version bigint not null default 0;

-- ─────────────────────────────────────────────────────────
-- 1. 받을 돈 일정 — 한 건의 돈을 몇 번에 나눠 받는지. 회차(계약금·중도금·잔금 / 선금·잔금 / 월 정기)마다 한 줄.
-- ─────────────────────────────────────────────────────────
create table if not exists money_in_plan (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null default my_company() references companies(id),
  job_id         uuid not null,
  kind           text not null,                                  -- 회차 코드('deposit'·'middle'·'balance'·'monthly' …). 화면 글자는 앱이 갖는다
  supply_amount  bigint not null check (supply_amount > 0),      -- 공급가(원)
  vat_amount     bigint not null default 0 check (vat_amount >= 0),  -- 부가세(원). 부가세가 없는 거래면 0
  due_stage      text,                                           -- 받는 때를 단계로 정했으면 단계 코드(company/workflow.md)
  due_date       date,                                           -- 날짜로 정했으면 날짜
  created_by     uuid not null default auth.uid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint money_in_plan_amount_cap check (supply_amount < 1e13 and vat_amount < 1e13),   -- 한 줄 10조 원 미만
  foreign key (company_id, job_id) references jobs (company_id, id)   -- 우리 회사 건에만 붙는다
);
comment on table  money_in_plan        is '<받을 돈 일정 — 회사 말>';
comment on column money_in_plan.kind   is '<회차: 계약금 / 중도금 / 잔금 …>';
create index if not exists money_in_plan_job_idx on money_in_plan (company_id, job_id);
create unique index if not exists money_in_plan_company_job_id_uidx on money_in_plan (company_id, job_id, id);

drop trigger if exists money_in_plan_touch on money_in_plan;
create trigger money_in_plan_touch before update on money_in_plan
  for each row execute function touch_updated_at();

-- ─────────────────────────────────────────────────────────
-- 2. 받은 돈 기록 — 받을 때마다 한 줄. 고치지도 지우지도 않는다(아래 5번에 고치기·지우기 규칙이 없다).
--    잘못 넣었으면 "취소 기록"을 한 줄 더한다: reverses_id 에 원래 줄 번호, reason 에 사유.
-- ─────────────────────────────────────────────────────────
create table if not exists money_in (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null default my_company() references companies(id),
  job_id         uuid not null,
  plan_id        uuid,                                           -- 어느 회차의 돈인지(모르면 비운다)
  supply_amount  bigint not null check (supply_amount > 0),
  vat_amount     bigint not null default 0 check (vat_amount >= 0),
  evidence_type  text not null
                 check (evidence_type in ('tax_invoice','cash_receipt','card','simple_receipt','none')),  -- company/money.md 의 증빙 목록대로
  received_on    date not null,
  reverses_id    uuid unique references money_in(id),            -- 취소 기록이면 원래 줄. 한 줄은 한 번만 취소된다(unique)
  reason         text,
  created_by     uuid not null default auth.uid(),
  created_at     timestamptz not null default now(),
  constraint money_in_amount_cap   check (supply_amount < 1e13 and vat_amount < 1e13),   -- 한 줄 10조 원 미만
  -- 취소 기록에는 보이는 글자가 있는 사유가 반드시 있다(비운 것·공백·탭·줄바꿈만은 안 된다).
  -- "reason is not null" 을 빼면 안 된다 — 검사(check)는 판정 불가(NULL)를 통과로 본다.
  constraint money_in_reason_check check (reverses_id is null or (reason is not null and reason ~ '\S')),
  foreign key (company_id, job_id) references jobs (company_id, id),                          -- 우리 회사 건
  foreign key (company_id, job_id, plan_id) references money_in_plan (company_id, job_id, id) -- 그 건의 일정(비우면 검사 안 함)
);
comment on table  money_in               is '<받은 돈 기록 — 회사 말>';
comment on column money_in.evidence_type is '<증빙: 세금계산서 / 현금영수증 / 카드 / 간이영수증 / 없음>';
create index if not exists money_in_job_idx on money_in (company_id, job_id, received_on desc);

-- 표가 생긴 뒤에 규칙을 지운다 — 두 번 실행해도 "이미 있습니다" 로 멈추지 않게.
drop policy if exists money_in_plan_read   on money_in_plan;
drop policy if exists money_in_plan_insert on money_in_plan;
drop policy if exists money_in_plan_update on money_in_plan;
drop policy if exists money_in_read        on money_in;
drop policy if exists money_in_insert      on money_in;

-- ─────────────────────────────────────────────────────────
-- 3. 서버가 지키는 규칙 — 화면이 아니라 데이터베이스에서
--
--    누가 금액을 보고 누가 넣는가 — company/money.md 5절대로 아래 두 함수만 고친다.
--    5번 규칙과 이 검사가 같은 함수를 쓴다. 한쪽만 고쳐 어긋나는 일이 없다.
-- ─────────────────────────────────────────────────────────
create or replace function money_can_read()
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$ select coalesce(public.my_role(), '') in ('owner') $$;

create or replace function money_can_write()
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$ select coalesce(public.my_role(), '') in ('owner') $$;   -- 직원이 "넣기만" 하면 ('owner','staff')

revoke all on function money_can_read()  from public, anon;
revoke all on function money_can_write() from public, anon;
grant execute on function money_can_read()  to authenticated;   -- 5번 규칙 안에서 불린다. 회수하면 돈 표가 통째로 안 열린다
grant execute on function money_can_write() to authenticated;

-- ─────────────────────────────────────────────────────────
--    (가) 취소 기록은 원래 줄의 건·회차·금액·증빙을 그대로 따른다(다른 금액으로 취소할 수 없다)
--    (나) 받은 돈 합계(취소 반영)가 그 건의 받을 돈 일정 합계를 넘지 못한다
--    (다) 이미 받은 것보다 일정을 작게 줄이지 못하고, 일정을 다른 건으로 옮기지 못한다
--    이 검사는 그 건의 "모든 줄"을 봐야 한다. 보는 사람 권한으로 돌면 안 보이는 줄을 빼고 계산해 검사가 뚫린다.
--    그래서 권한 높은 함수(security definer)로 돌리고, 가드(search_path 고정·회사 검사·실행 권한 회수)를 같이 둔다.
--
--    금액을 볼 수 없는 사람(넣기만 하는 직원 등)에게는 무엇이 틀렸는지 알려 주지 않는다 — 넣을 권한이 없을 때도,
--    일정보다 많을 때도 언제나 같은 말 "접수할 수 없습니다 — 대표에게 확인하세요" 를 낸다.
--    금액을 바꿔 가며 넣어 보고 오류 문구의 차이로 남은 돈을 알아내는 일을 막기 위해서다.
--    이유(초과 등)는 대표가 자기 화면의 건별 합계(6번 — 남은 돈)와 감사(erp-auditor M1)에서 본다.
--
--    차례 지키기: 두 검사 모두 합계를 세기 전에 그 건(jobs 한 줄)의 money_version 을 실제로 고친다(update).
--    Supabase 기본(READ COMMITTED)에서는 같은 건에 동시에 온 넣기·일정 줄이기 중 뒤에 온 쪽이 앞의 것이 끝날 때까지
--    기다렸다가 그 결과까지 보고 검사한다. REPEATABLE READ 로 바꿔 써도 같은 줄을 고친 충돌로 뒤에 온 쪽이 멈춘다(앱이 다시 시도).
--    (번들 시험은 연결 하나짜리 환경이라 동시 실행은 아직 실측하지 않았다 — 그 줄이 실제로 고쳐지는 것까지만 확인했다.)
-- ─────────────────────────────────────────────────────────
create or replace function money_in_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  orig       public.money_in%rowtype;
  planned    numeric;
  received   numeric;
  v_can_read boolean := public.money_can_read();
  c_deny     constant text := '접수할 수 없습니다 — 대표에게 확인하세요';
begin
  -- 넣을 권한이 없으면 금액을 보기 전에 멈춘다(권한 규칙보다 이 검사가 먼저 돈다)
  if not public.money_can_write() then
    raise exception '%', c_deny;
  end if;
  if new.company_id is distinct from public.my_company() then
    raise exception '%', case when v_can_read then '우리 회사 기록만 넣을 수 있습니다' else c_deny end;
  end if;

  if new.reverses_id is not null then
    -- 취소는 금액을 볼 수 있는 사람만 — 볼 수 없는 기록을 취소할 수는 없다
    if not v_can_read then raise exception '%', c_deny; end if;
    select * into orig from public.money_in where id = new.reverses_id and company_id = new.company_id;
    if not found then raise exception '취소할 원래 기록이 없습니다'; end if;
    if orig.reverses_id is not null then raise exception '취소 기록은 다시 취소할 수 없습니다'; end if;
    update public.jobs set money_version = money_version + 1 where id = orig.job_id and company_id = orig.company_id;
    new.job_id        := orig.job_id;
    new.plan_id       := orig.plan_id;
    new.supply_amount := orig.supply_amount;
    new.vat_amount    := orig.vat_amount;
    new.evidence_type := orig.evidence_type;
    return new;
  end if;

  -- 그 건의 줄을 실제로 고쳐 차례를 세운다(위 "차례 지키기")
  update public.jobs set money_version = money_version + 1 where id = new.job_id and company_id = new.company_id;

  select coalesce(sum(supply_amount::numeric + vat_amount), 0) into planned
    from public.money_in_plan where company_id = new.company_id and job_id = new.job_id;
  select coalesce(sum(case when reverses_id is null then supply_amount::numeric + vat_amount
                           else -(supply_amount::numeric + vat_amount) end), 0) into received
    from public.money_in where company_id = new.company_id and job_id = new.job_id;

  if received + new.supply_amount + new.vat_amount > planned then
    raise exception '%', case when v_can_read
      then '받을 돈 일정보다 많이 받을 수 없습니다 — 추가로 받기로 했으면 받을 돈 일정을 먼저 더하세요'
      else c_deny end;
  end if;
  return new;
end
$$;

drop trigger if exists money_in_guard on money_in;
create trigger money_in_guard before insert on money_in
  for each row execute function money_in_guard();
revoke all on function money_in_guard() from public, anon;   -- 트리거로만 돈다(직접 부르는 길은 없다)

create or replace function money_in_plan_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  planned    numeric;
  received   numeric;
  v_can_read boolean := public.money_can_read();
  c_deny     constant text := '접수할 수 없습니다 — 대표에게 확인하세요';
begin
  if new.job_id is distinct from old.job_id or new.company_id is distinct from old.company_id then
    raise exception '%', case when v_can_read
      then '받을 돈 일정을 다른 건으로 옮길 수 없습니다 — 새 일정을 만들고 이 일정은 그대로 두세요'
      else c_deny end;
  end if;
  -- 받은 돈 넣기와 같은 차례(그 건의 줄을 실제로 고친다) — 넣는 중인 돈을 못 본 채 일정을 줄이는 일을 막는다
  update public.jobs set money_version = money_version + 1 where id = new.job_id and company_id = new.company_id;
  select coalesce(sum(supply_amount::numeric + vat_amount), 0) into planned
    from public.money_in_plan where company_id = new.company_id and job_id = new.job_id;
  select coalesce(sum(case when reverses_id is null then supply_amount::numeric + vat_amount
                           else -(supply_amount::numeric + vat_amount) end), 0) into received
    from public.money_in where company_id = new.company_id and job_id = new.job_id;
  if planned < received then
    raise exception '%', case when v_can_read
      then '이미 받은 돈보다 받을 돈 일정을 작게 만들 수 없습니다 — 먼저 받은 기록을 취소 기록으로 바로잡으세요'
      else c_deny end;
  end if;
  return new;
end
$$;

drop trigger if exists money_in_plan_guard on money_in_plan;
create trigger money_in_plan_guard after update on money_in_plan
  for each row execute function money_in_plan_guard();
revoke all on function money_in_plan_guard() from public, anon;

-- ─────────────────────────────────────────────────────────
-- 4. 돈이 들어가는 길은 하나 — 앱은 표에 직접 넣지 않고 이 두 함수만 부른다
--    합계만 아는 경우(서류에 합계·부가세가 찍혀 있을 때): p_total 과 p_vat 를 주면 공급가 = 합계 - 부가세 를 서버가 계산한다.
--    두 함수는 부르는 사람 권한으로 돈다(security invoker) — 아래 5번 규칙이 그대로 걸린다.
--    번호(UUID)를 서버에서 먼저 만들고 넣은 뒤 그 번호를 돌려준다. 넣은 줄을 다시 읽지 않으므로(RETURNING 없음)
--    "넣기만 되고 읽기는 안 되는" 역할(예: 직원)도 쓸 수 있다.
-- ─────────────────────────────────────────────────────────
create or replace function record_money_in(
  p_job uuid, p_plan uuid, p_supply bigint, p_total bigint, p_vat bigint, p_evidence text, p_received_on date)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_id     uuid := gen_random_uuid();
  v_supply numeric;
begin
  if p_supply is null and p_total is null then raise exception '공급가나 합계 중 하나는 있어야 합니다'; end if;
  v_supply := coalesce(p_supply::numeric, p_total::numeric - coalesce(p_vat, 0));
  insert into public.money_in (id, job_id, plan_id, supply_amount, vat_amount, evidence_type, received_on)
  values (v_id, p_job, p_plan, v_supply, coalesce(p_vat, 0), p_evidence, p_received_on);
  return v_id;
end
$$;

-- 취소 기록 — 원래 줄의 건·금액·증빙은 서버 규칙(money_in_guard)이 원래 줄에서 그대로 채운다.
-- 취소할 수 있는 사람: 금액을 볼 수 있고(money_can_read) 넣을 수 있는(money_can_write) 사람.
create or replace function cancel_money_in(p_id uuid, p_reason text)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_id uuid := gen_random_uuid();
begin
  insert into public.money_in (id, reverses_id, reason, received_on)
  values (v_id, p_id, p_reason, current_date);
  return v_id;
end
$$;

revoke all on function record_money_in(uuid, uuid, bigint, bigint, bigint, text, date) from public, anon;
revoke all on function cancel_money_in(uuid, text) from public, anon;
grant execute on function record_money_in(uuid, uuid, bigint, bigint, bigint, text, date) to authenticated;
grant execute on function cancel_money_in(uuid, text) to authenticated;

-- ─────────────────────────────────────────────────────────
-- 5. 볼 사람 — 3번의 money_can_read() · money_can_write() 가 정한다. 기본은 대표만 읽기·넣기.
--    직원이 "넣기만" 해야 하면 money_can_write() 의 목록에 'staff' 를 더하고 money_can_read() 는 그대로 둔다.
--    (4번 함수가 넣은 줄을 다시 읽지 않으므로 그 구성에서도 넣기가 된다. 넣기만 하는 직원은 취소할 수 없다.)
--    일정 만들기·고치기는 대표만(아래 두 규칙).
-- ─────────────────────────────────────────────────────────
alter table money_in_plan enable row level security;
alter table money_in      enable row level security;
revoke all on table money_in_plan, money_in from anon;
grant select, insert, update on table money_in_plan to authenticated;
grant select, insert         on table money_in      to authenticated;

create policy money_in_plan_read on money_in_plan for select to authenticated
  using (company_id = my_company() and money_can_read());
create policy money_in_plan_insert on money_in_plan for insert to authenticated
  with check (company_id = my_company() and coalesce(my_role(),'') = 'owner');
create policy money_in_plan_update on money_in_plan for update to authenticated
  using (company_id = my_company() and coalesce(my_role(),'') = 'owner')
  with check (company_id = my_company() and coalesce(my_role(),'') = 'owner');
-- 일정 지우기 규칙은 만들지 않는다 = 지우지 못한다(바꿀 때는 고치기 — 3번 (다)가 지킨다).

create policy money_in_read on money_in for select to authenticated
  using (company_id = my_company() and money_can_read());
create policy money_in_insert on money_in for insert to authenticated
  with check (company_id = my_company() and money_can_write() and created_by = auth.uid());
-- 받은 돈 기록의 고치기·지우기 규칙은 만들지 않는다 = 쌓이기만 한다.

-- ─────────────────────────────────────────────────────────
-- 6. 건별 합계 — 화면은 이것을 읽어 표시만 한다(계산하지 않는다)
--    security_invoker 라 5번 규칙이 그대로 걸린다. 금액을 못 보는 역할에게는 줄이 하나도 안 나온다.
-- ─────────────────────────────────────────────────────────
create or replace view money_in_by_job with (security_invoker = on) as
select p.job_id,
       p.planned_total,
       coalesce(r.received_total, 0)                   as received_total,
       p.planned_total - coalesce(r.received_total, 0) as remaining
  from (select job_id, sum(supply_amount::numeric + vat_amount) as planned_total
          from public.money_in_plan group by job_id) p
  left join (select job_id,
                    sum(case when reverses_id is null then supply_amount::numeric + vat_amount
                             else -(supply_amount::numeric + vat_amount) end) as received_total
               from public.money_in group by job_id) r on r.job_id = p.job_id;

revoke all on money_in_by_job from anon;
grant select on money_in_by_job to authenticated;

notify pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────
-- 줄 돈(나가는 돈)은 이 파일에 넣지 않는다. 같은 모양을 다른 이름(money_out_plan·money_out)의 다음 번호 파일로 만든다.
-- 건에 묶이지 않는 회사 공통 비용은 references/money-patterns.md 7절.
-- ─────────────────────────────────────────────────────────
