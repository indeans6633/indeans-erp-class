# 서버 예약 발송 SQL 뼈대 (Supabase)

여기 있는 SQL 은 **뼈대**입니다. `<업무표>`·`<상태칸>`·`<관리 단위>` 처럼 꺾쇠로 싸인 곳은 `company/data.md` 에 적힌 **우리 회사 표·칸 이름**으로 바꿔 넣습니다. 바꾸지 않고 실행하면 "그런 표가 없다"는 오류가 납니다.

읽는 순서와 실행 순서가 조금 다릅니다. 시각 변환을 먼저 읽어 두는 게 편해서 예약(4절)을 함수(5절)보다 앞에 뒀습니다.
**실행은 1 → 2 → 3 → 5 → 4 → 6 순서**입니다(함수를 만든 뒤 예약을 겁니다).

무엇을 만드는지 한 문단으로: 데이터가 들어 있는 쪽(Supabase)에 **시계**(pg_cron)와 **바깥으로 보내는 입**(pg_net)을 켜고, 정해진 시각에 세어 문장을 만들어 채널로 보내는 함수를 답니다. 보낸 기록은 표 하나에 남겨 "안 온 날"을 알 수 있게 합니다.

---

## 1. 확장 두 개 켜기

대시보드 **Database > Extensions** 에서 검색해 켜도 되고, SQL Editor 에서 아래를 실행해도 됩니다.

```sql
create extension if not exists pg_cron;   -- 정해진 시각에 실행(시계)
create extension if not exists pg_net;    -- 바깥 주소로 보내기(입)
```

- 목록에 안 보이면 프로젝트 요금제·지역 설정을 확인합니다. 이 두 개가 없으면 서버 예약 발송을 할 수 없습니다.
- 켜진 뒤 확인: `select extname from pg_extension where extname in ('pg_cron','pg_net');` — 두 줄이 나와야 합니다.
- `net.http_post` 이 없다고 나오면 설치 위치가 다른 것입니다. 어디 있는지 이렇게 찾습니다.

```sql
select n.nspname as 스키마, p.proname as 함수
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where p.proname = 'http_post';
```

나온 스키마 이름을 아래 SQL 의 `net.` 자리에 그대로 씁니다.

## 2. 비밀값 두기 — 설정 표 하나

창구 주소·열쇠는 **서버가 읽을 수 있는 곳**에 있어야 합니다. 내 컴퓨터의 `.env.local` 은 서버가 못 읽습니다.

이 수업에서는 **`app_secret` 표 하나**만 씁니다. 방법을 두 가지 배워 두면 나중에 어느 쪽에 값을 넣었는지 헷갈려 "안 온다"의 원인 찾기가 두 배로 길어집니다.

**중요: 값을 넣는 SQL 은 대시보드 SQL Editor 에서 한 번만 실행하고, 마이그레이션 파일에는 넣지 않습니다.** 파일에 적으면 저장소에 그대로 올라갑니다.

```sql
create table if not exists public.app_secret (
  key        text primary key,
  value      text        not null,
  updated_at timestamptz not null default now()
);

alter table public.app_secret enable row level security;   -- 정책을 하나도 만들지 않는다
revoke all on table public.app_secret from anon, authenticated;
```

**위 두 줄이 이 표의 안전선입니다. 빼면 안 됩니다.**

- `enable row level security` 를 켜고 **정책을 하나도 만들지 않으면** 로그인한 사람도 한 줄도 못 읽습니다. 읽는 것은 5절의 함수(서버 권한으로 도는 함수)뿐입니다.
- `revoke ... from anon, authenticated` 는 그 위의 이중 자물쇠입니다. 앱에서 이 표를 실수로 조회해도 값이 나오지 않습니다.
- 둘 중 하나라도 빠지면 **웹훅 주소와 봇 열쇠가 앱을 쓰는 아무에게나 보입니다.** 그 값은 곧 "우리 방에 아무 말이나 보낼 수 있는 권한"입니다.
- 이 표에 **읽기 정책을 만들지 마세요.** 대표 화면에서 값을 확인하고 싶어도 만들지 않습니다(발송 여부는 3절 `report_log` 로 봅니다).

값 넣기(SQL Editor 에서 한 번):

```sql
insert into public.app_secret (key, value) values
  ('digest_discord_url',      '<복사한 웹후크 주소>'),
  ('digest_telegram_token',   '<봇 열쇠>'),
  ('digest_telegram_chat_id', '<방 번호>')
on conflict (key) do update set value = excluded.value, updated_at = now();
```

### 더 안전하게 하려면 (수업에 포함하지 않습니다)

Supabase 에는 값을 암호화해 두는 보관함(Vault)이 따로 있습니다. 표 방식보다 한 단계 안전하지만, 읽는 방법이 달라서 5절 함수도 함께 고쳐야 하고 값이 어디 있는지 확인하기가 번거롭습니다. 위 안전선 두 줄을 지킨 표 방식이면 1인 회사 운영 보고에는 충분합니다. 나중에 다루는 값이 늘어나면(고객 결제·외부 계정) 그때 대표가 따로 판단할 일입니다.

## 3. 발송 기록 표

```sql
create table if not exists public.report_log (
  id          bigint generated always as identity primary key,
  report_key  text        not null,              -- 보고 이름(예: owner_daily)
  report_date date        not null,              -- 한국 날짜
  channel     text        not null,              -- discord / telegram
  status      text        not null default 'sending',  -- sending / ok / failed
  request_id  bigint,                            -- 보내기 요청 번호(6절에서 대조)
  http_status int,
  detail      text,
  created_at  timestamptz not null default now()
);

-- 같은 날 같은 보고를 두 번 보내지 못하게 하는 조건. 이 줄이 중복 방지의 전부다.
create unique index if not exists report_log_once
  on public.report_log (report_key, report_date, channel);

alter table public.report_log enable row level security;
revoke all on table public.report_log from anon, authenticated;
```

대표가 앱 화면에서 발송 이력을 보고 싶으면 읽기 정책을 따로 하나 만듭니다(역할 판정 함수 사용). 그때 **정책이 부르는 함수의 실행 권한을 로그인 사용자에게서 회수하지 않습니다** — 회수하면 그 표 조회가 통째로 실패합니다.

## 4. 예약 시각과 등록

**예약은 세계 표준시(UTC)로 돕니다. 한국 시간에서 9시간을 뺀 값을 적습니다.**

| 받고 싶은 한국 시간 | 예약에 적는 값 | 설명 |
|---|---|---|
| 매일 07:00 | `0 22 * * *` | 전날 22시 |
| 매일 08:00 | `0 23 * * *` | 전날 23시 |
| 매일 08:30 | `30 23 * * *` | 전날 23시 30분 |
| 매일 09:00 | `0 0 * * *` | 같은 날 0시 |
| 매일 12:00 | `0 3 * * *` | |
| 매일 18:00 | `0 9 * * *` | |
| 매일 21:00 | `0 12 * * *` | |

다섯 칸의 뜻: `분 시 일 월 요일`. 요일은 0=일요일 ~ 6=토요일입니다.

**요일을 함께 정할 때가 함정입니다.** 한국 시간 09시 이전은 세계 표준시로 전날이 되므로 **요일도 하루 앞으로 밀립니다.**

| 받고 싶은 것 | 예약에 적는 값 |
|---|---|
| 월~금 09:00 (한국) | `0 0 * * 1-5` |
| 월~금 08:00 (한국) | `0 23 * * 0-4` (일~목 23시) |
| 월~금 18:00 (한국) | `0 9 * * 1-5` |
| 월~토 09:00 (한국) | `0 0 * * 1-6` |
| 월~토 08:00 (한국) | `0 23 * * 0-5` (일~금 23시) |

토요일 오전까지 일하는 회사가 적지 않습니다(제조·정비·시공 등). **토요일을 넣을 때는 요일 칸이 한 칸씩 늘어나는 게 아니라 통째로 하루 앞으로 밀린다**는 점만 다시 봅니다 — 08:00 은 `0-5`(일~금), 09:00 은 `1-6`(월~토)입니다.

요일 계산이 헷갈리면 **매시간 돌리고 함수 안에서 시각을 검사하는 방법**을 씁니다(5절 맨 위의 검사 두 줄).

```sql
select cron.schedule('owner-daily-digest', '0 * * * *', $$select public.send_owner_digest();$$);
```

등록·확인·삭제 명령:

```sql
-- 등록(이름은 알아보게. 같은 이름으로 다시 실행하면 시각이 바뀐다)
select cron.schedule('owner-daily-digest', '0 23 * * *', $$select public.send_owner_digest();$$);

-- 응답 확인용 뒤따르는 예약(10분 뒤)
select cron.schedule('owner-daily-digest-check', '10 23 * * *', $$select public.check_report_sends();$$);

-- 무엇이 걸려 있나
select jobid, jobname, schedule, command, active from cron.job order by jobid;

-- 실제로 돌았나(최근 것부터)
select jobid, status, return_message, start_time
  from cron.job_run_details order by start_time desc limit 10;

-- 지우기(수업 중 임시로 건 예약은 반드시 지운다)
select cron.unschedule('owner-daily-digest');
```

## 5. 발송 함수

아래는 **디스코드로 보내는** 뼈대입니다. 순서에 뜻이 있습니다: 시각 검사 → 기록 먼저 남기기(중복 방지) → 세기 → 문장 → 보내기.

```sql
create or replace function public.send_owner_digest()
returns text
language plpgsql
security definer
-- `pg_temp` 를 빼면 로그인 사용자가 같은 이름의 임시 표를 만들어 이 함수를 속일 수 있다.
-- 아래 표 이름을 모두 `public.` 으로 시작하는 것도 같은 이유다.
set search_path = public, pg_temp
as $$
declare
  kst     timestamp := (now() at time zone 'Asia/Seoul');
  today   date := kst::date;
  url     text;
  msg     text;
  n_today int;
  n_late  int;
  n_new   int;
  req_id  bigint;
begin
  -- (0) 매시간 돌리는 방식일 때만 쓰는 검사. 정시 예약이면 이 두 덩이를 지운다.
  --     반드시 (1) 보다 앞에 둔다. 뒤에 두면 엉뚱한 시각에 기록만 남고
  --     정작 보낼 시각에 '이미 보냈음'이 되어 하루가 비어 버린다.
  if to_char(kst, 'HH24') <> '08' then
    return '보낼 시각이 아님';
  end if;
  if extract(isodow from kst) > 5 then
    return '주말은 보내지 않음';
  end if;

  -- (1) 같은 날 같은 보고는 한 번만. 기록을 먼저 만들고, 이미 있으면 그대로 끝낸다.
  insert into public.report_log (report_key, report_date, channel)
  values ('owner_daily', today, 'discord')
  on conflict (report_key, report_date, channel) do nothing;

  if not found then
    return '이미 보냈음';
  end if;

  -- (2) 센다. 표·칸 이름을 company/data.md 의 실제 이름으로 바꾼다.
  select count(*) into n_today
    from public.<업무표>
   where <예정일칸> = today and <상태칸> <> '<끝난 상태>';

  select count(*) into n_late
    from public.<업무표>
   where <예정일칸> < today and <상태칸> <> '<끝난 상태>';

  select count(*) into n_new
    from public.<업무표>
   where (created_at at time zone 'Asia/Seoul')::date = today - 1;

  -- (3) 문장. 10줄 이내로, 0도 그대로 보낸다.
  msg := '<회사 이름> 운영 보고 ' || to_char(kst, 'MM-DD HH24:MI') || E'\n'
      || '오늘 할 <관리 단위>: ' || n_today || '건' || E'\n'
      || '기한 지난 <관리 단위>: ' || n_late || '건' || E'\n'
      || '어제 들어온 <관리 단위>: ' || n_new || '건';

  -- (4) 보낼 곳을 읽는다(2절에 넣어 둔 값).
  select value into url from public.app_secret where key = 'digest_discord_url';

  if url is null then
    update public.report_log
       set status = 'failed', detail = '보낼 곳이 없음'
     where report_key = 'owner_daily' and report_date = today and channel = 'discord';
    return '보낼 곳이 없음 — 2절을 먼저 한다';
  end if;

  -- (5) 보낸다. 보내기는 바로 끝나지 않는다(응답은 6절에서 확인).
  select net.http_post(
           url     := url,
           headers := jsonb_build_object('Content-Type', 'application/json'),
           body    := jsonb_build_object('content', msg)
         ) into req_id;

  update public.report_log
     set request_id = req_id, detail = left(msg, 500)
   where report_key = 'owner_daily' and report_date = today and channel = 'discord';

  return '보냄 (요청 ' || req_id || ')';
end;
$$;

-- 이 함수는 서버 예약만 부른다. 로그인 사용자에게 실행 권한을 주지 않는다.
revoke all on function public.send_owner_digest() from public, anon, authenticated;
```

**텔레그램으로 보내려면** (4)·(5) 만 바꿉니다. `channel` 값은 `'telegram'` 으로 두고, 기록 줄도 같은 값으로 맞춥니다.

```sql
  select value into token   from public.app_secret where key = 'digest_telegram_token';
  select value into chat_id from public.app_secret where key = 'digest_telegram_chat_id';

  select net.http_post(
           url     := 'https://api.telegram.org/bot' || token || '/sendMessage',
           headers := jsonb_build_object('Content-Type', 'application/json'),
           body    := jsonb_build_object('chat_id', chat_id, 'text', msg)
         ) into req_id;
```

두 창구에 모두 보내려면 같은 함수 안에서 (1)~(5) 를 채널 값만 바꿔 한 번 더 하거나, 함수를 하나 더 만들어 예약을 둘 겁니다. **하나가 실패해도 다른 하나는 가야 하니 기록 줄은 채널마다 따로 남깁니다.**

## 6. 발송 기록·응답 보는 법

보내기는 요청만 걸고 끝나므로, 도착 여부는 응답을 따로 대조합니다.

```sql
create or replace function public.check_report_sends()
returns void
language plpgsql
security definer
-- 여기도 `pg_temp` 를 넣고 표 이름은 `public.`·`net.` 으로 시작한다(위 5절과 같은 이유).
set search_path = public, pg_temp
as $$
begin
  update public.report_log l
     set status      = case when r.status_code between 200 and 299 then 'ok' else 'failed' end,
         http_status = r.status_code,
         detail      = case when r.status_code between 200 and 299 then l.detail
                            else left(coalesce(r.error_msg, r.content, ''), 300) end
    from net._http_response r
   where r.id = l.request_id
     and l.status = 'sending';
end;
$$;

revoke all on function public.check_report_sends() from public, anon, authenticated;
```

손으로 볼 때:

```sql
-- 우리 발송 기록
select report_date, channel, status, http_status, left(detail, 80) as 내용
  from public.report_log order by created_at desc limit 10;

-- 바깥으로 나간 요청의 응답(최근 것부터)
select id, status_code, left(coalesce(error_msg, content, ''), 200) as 응답
  from net._http_response order by id desc limit 10;
```

- **응답 기록은 몇 시간 뒤 정리됩니다.** 어제 것을 찾지 말고, 지금 한 번 보내 놓고 바로 봅니다.
- `status_code` 가 `204`·`200` 이면 도착했다고 봅니다. `401`·`404` 는 주소·열쇠, `400` 은 보내는 모양, `429` 는 너무 자주 보낸 것입니다.
- `timed_out` 이 참이면 네트워크 쪽 문제입니다. 다음 정시에 다시 옵니다.

## 7. 자주 나는 오류

| 오류·증상 | 원인 | 할 일 |
|---|---|---|
| `relation "<업무표>" does not exist` | 뼈대를 그대로 실행 | `company/data.md` 의 실제 표 이름으로 바꾼다 |
| `function net.http_post does not exist` | 확장이 안 켜졌거나 다른 스키마에 있음 | 1절의 찾기 SQL 로 스키마를 확인 |
| `permission denied for table app_secret` | 앱(로그인 사용자)에서 읽으려 했다 | 비밀값은 앱에서 읽지 않는다. 서버 함수만 읽는다 |
| 예약을 걸었는데 `cron.job` 이 비어 있다 | 등록이 실패했다 | 같은 이름으로 다시 등록하고 반환값을 확인한다 |
| 하루에 두 번 온다 | 임시 예약이 남아 있다 | `cron.job` 에서 찾아 `cron.unschedule` |
| 9시간 밀려 온다 | 한국 시간을 그대로 적었다 | 4절 변환표대로 고친다 |
| 아무 날도 안 온다 | 함수가 '보낼 시각이 아님'만 돌려준다 | 정시 예약인데 (0) 검사를 지우지 않았다 |
| 0건인 날만 안 온다 | 0일 때 중간에 멈추게 고쳤다 | 0도 보내도록 되돌린다 |
