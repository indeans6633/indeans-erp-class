# 롤백 시뮬 — 바꾸기 전에 한 번 돌려 보고 전부 되돌리기

정책(누가 무엇을 보나)·제약(넣으면 안 되는 값)·데이터를 고치는 SQL 은 **실제로 적용하기 전에** 한 번 돌려 본다. 돌려 본 결과만 보고, 바꾼 것은 전부 되돌린다. 인디언즈가 권한·돈 사고를 겪고 굳힌 순서다 — "SQL 이 오류 없이 실행됐다"와 "직원 계정으로 보니 맞게 보인다"는 다른 문장이다.

언제 쓰나: 위험 등급 1(권한·돈·새 표 구조·삭제 조건)의 마이그레이션을 실행하기 전. 게이트(`npm run check`)를 먼저 통과시키고 그다음 이것을 한다.

---

## 왜 이 모양인가 (SQL Editor 에 맞춘 이유)

교과서의 모양은 `begin; … 바꾸기 … 확인 … rollback;` 이다. 그런데 Supabase SQL Editor 는 **마지막 한 문장의 결과만** 보여 준다. 마지막 문장이 `rollback` 이면 확인 결과를 볼 수 없다.

그래서 **한 덩어리(`do $sim$ … $sim$;`) 안에서 바꾸고, 세고, 그 결과를 일부러 오류로 띄운다.** 오류가 나면 그 덩어리 안에서 바꾼 것은 데이터베이스가 전부 취소한다. 화면에는 빨간 글씨로 결과가 나온다 — **빨간 글씨가 정상이다.**

규칙 세 가지:

1. **바꿀 SQL 은 반드시 덩어리 안에 넣는다.** 덩어리 밖(위·아래)에 붙인 SQL 은 취소되지 않을 수 있다.
2. 실행한 뒤 **바뀐 것이 없는지** 한 번 본다(Table Editor 의 정책 목록·표 구조가 그대로인지). 되돌려진 것을 눈으로 확인하는 데 10초면 된다.
3. 이 덩어리는 SQL Editor 에만 붙인다. `supabase/migrations/` 파일에 넣지 않는다 — 고정 검사(G16)가 "DO 블록 안에서 보안 설정을 바꾼다"로 막는다.

---

## 틀 1 — 정책(누가 무엇을 보나)

`<…>` 자리를 바꾼다. 계정 번호(User UID)는 Authentication > Users 에서 복사한다 — 테스트 계정만 쓴다.

```sql
do $sim$
declare
  n_staff int;
  n_owner int;
  r_anon  text;
begin
  -- 1) 시험할 변경 — 새 마이그레이션 파일의 내용을 그대로 넣는다
  drop policy if exists jobs_read on public.jobs;
  create policy jobs_read on public.jobs for select to authenticated
    using (company_id = public.my_company() and coalesce(public.my_role(),'') in ('owner','staff'));

  -- 2) 직원 계정 자리에서 센다
  perform set_config('request.jwt.claims', '{"sub":"<직원 테스트 계정 User UID>","role":"authenticated"}', true);
  set local role authenticated;
  select count(*) into n_staff from public.jobs;
  reset role;

  -- 3) 대표 계정 자리에서 센다
  perform set_config('request.jwt.claims', '{"sub":"<대표 계정 User UID>","role":"authenticated"}', true);
  set local role authenticated;
  select count(*) into n_owner from public.jobs;
  reset role;

  -- 4) 로그인 안 한 자리 — 막혀 있으면 "권한 없음"
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  begin
    select count(*)::text || '줄' into r_anon from public.jobs;
  exception when insufficient_privilege then
    r_anon := '권한 없음(막힘)';
  end;
  reset role;

  -- 5) 결과를 띄우고 전부 되돌린다
  raise exception '롤백 시뮬 결과 — 직원 %줄 · 대표 %줄 · 로그인 안 함 % (일부러 낸 오류다. 위에서 바꾼 것은 모두 취소됐다)',
    n_staff, n_owner, r_anon;
end
$sim$;
```

읽는 법:

| 나온 결과 | 뜻 |
|---|---|
| 직원 숫자가 기대와 같다 · 대표는 전부 · 로그인 안 함은 "권한 없음" 또는 0줄 | 적용해도 된다 |
| 직원 숫자가 대표와 같다(줄어야 하는데) | 같은 표에 넓은 정책이 남아 있다. 지울 정책을 1)에 더한다 |
| 대표도 0줄 | 판정 함수의 실행 권한이 빠졌거나 명단(`app_users`)에 그 계정이 없다 |
| "permission denied for function …" | 정책이 부르는 함수의 실행 권한을 로그인 사용자에게서 거뒀다. 되돌린다 |
| 로그인 안 함이 1줄 이상 | 정책에 `to authenticated` 가 빠졌거나 `anon` 에게 표 권한이 남아 있다 |

역할이 빈 계정·차단한(`active = false`) 계정도 같은 방식으로 한 칸 더 세면 좋다 — 둘 다 0줄이어야 한다.

---

## 틀 2 — 제약(넣으면 안 되는 값이 정말 막히나)

돈·수량처럼 "넘으면 안 되는 값"을 데이터베이스 제약이나 트리거로 막을 때 쓴다. 일부러 틀린 값을 넣어 보고, **막히면 통과**다.

```sql
do $sim$
declare
  r_ok  text := '들어감';
  r_bad text := '들어감(막히지 않음)';
begin
  -- 1) 시험할 변경(제약·트리거)을 그대로 넣는다
  -- alter table public.<표> add constraint <이름> check (<조건>);

  -- 2) 맞는 값 — 들어가야 한다
  begin
    insert into public.<표> (<칸들>) values (<맞는 값>);
  exception when others then
    r_ok := '막힘: ' || sqlerrm;
  end;

  -- 3) 틀린 값 — 막혀야 한다
  begin
    insert into public.<표> (<칸들>) values (<틀린 값>);
  exception when others then
    r_bad := '막힘: ' || sqlerrm;
  end;

  raise exception '롤백 시뮬 결과 — 맞는 값: % / 틀린 값: % (일부러 낸 오류다. 넣은 것과 바꾼 것은 모두 취소됐다)', r_ok, r_bad;
end
$sim$;
```

맞는 값은 "들어감", 틀린 값은 "막힘: …" 이어야 적용한다. 둘 다 막히면 제약이 너무 세고, 둘 다 들어가면 제약이 안 걸린 것이다.

---

## 하지 않는 것

- 실제 업무 데이터를 지우거나 바꾸는 시험을 하지 않는다. 시험 값은 이 덩어리 안에서 넣고 함께 취소된다.
- 대표·직원의 실제 비밀번호를 쓰지 않는다. 계정 번호(User UID)만 쓴다.
- 결과에 나온 줄 수 말고 내용(고객 이름·금액)을 화면에 띄우지 않는다. 세기만 한다.
- 시뮬이 통과했다고 실측을 생략하지 않는다. 시뮬은 "적용해도 되나"를, 실측(`erp-verifier`)은 "적용한 뒤 앱에서 정말 그렇게 보이나"를 본다.

## 자주 막히는 지점

- **"syntax error at or near $sim$"** — 덩어리의 시작(`do $sim$`)과 끝(`$sim$;`) 중 하나가 빠졌다. 안에 넣은 SQL 에 `$sim$` 글자가 들어 있어도 깨진다.
- **"permission denied to set role"** — 이 프로젝트의 SQL Editor 계정이 역할 바꾸기를 못 하는 상태다. 그 사실을 적고, 시뮬 대신 적용 직후 실측(역할별 계정으로 앱에서 확인)을 바로 한다. 되돌리는 SQL 을 미리 써 둔다.
- **결과가 안 나오고 "Success" 만 나온다** — 맨 끝의 `raise exception` 줄이 빠졌다. 그러면 바꾼 것이 실제로 적용됐다. 정책 목록을 확인하고, 의도한 변경이 아니면 되돌리는 SQL 을 바로 실행한다.
