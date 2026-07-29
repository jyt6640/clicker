-- 와글 — Supabase 스키마
--
-- Supabase 대시보드 > SQL Editor 에 통째로 붙여넣고 실행하세요.
-- 여러 번 실행해도 안전합니다.
--
-- 설계 의도
--  * 클라이언트는 테이블을 직접 쓰지 않습니다. 아래 RPC만 호출할 수 있고,
--    증가는 서버에서만 일어나므로 감소·삭제·조작이 불가능합니다.
--  * 자물쇠 정답은 secrets 테이블에 있고 아무에게도 읽기 권한이 없습니다.
--    대조는 security definer 함수 안에서만 이뤄져, 정답도 정답의 해시도
--    클라이언트로 내려가지 않습니다.
--  * 초기화 대신 회차를 올립니다. 지난 회차 행은 그대로 남습니다.

-- ==========================================================================
-- 테이블
-- ==========================================================================

-- 게임 회차. id는 '{게임}-r{회차}' 형식입니다.
create table if not exists public.games (
  id            text primary key,
  status        text        not null default 'active',
  target        bigint,
  start_time    timestamptz not null default now(),
  end_time      timestamptz,
  milestones    jsonb       not null default '{}'::jsonb,
  hint_level    int         not null default 0,
  last_press    timestamptz,
  last_presser  text,
  winner        text
);

-- 카운터. 줄다리기처럼 갈래가 필요한 게임은 bucket을 나눠 씁니다.
-- Firestore와 달리 샤드가 필요 없습니다. Postgres는 한 행에 대한 동시
-- 증가를 행 잠금으로 직렬화하며, 이 규모에서는 병목이 되지 않습니다.
create table if not exists public.counters (
  game_id  text   not null references public.games(id) on delete cascade,
  bucket   text   not null default 'main',
  value    bigint not null default 0,
  primary key (game_id, bucket)
);

-- 익명 참여자별 기록
-- uid가 uuid가 아니라 text인 이유: Supabase 익명 uid는 uuid지만, Firebase에서
-- 옮겨온 과거 회차의 uid는 28자 문자열이라 uuid에 담기지 않습니다.
create table if not exists public.participants (
  game_id      text        not null references public.games(id) on delete cascade,
  uid          text        not null,
  count        bigint      not null default 0,
  first_visit  timestamptz not null default now(),
  first_action timestamptz,
  last_action  timestamptz,
  solved       boolean     not null default false,
  solved_at    timestamptz,
  primary key (game_id, uid)
);

-- 관리자가 /stats/에서 바꾸는 값
create table if not exists public.settings (
  key   text primary key,
  value jsonb not null default '{}'::jsonb
);

-- 아무도 읽을 수 없는 값. 함수만 들여다봅니다.
create table if not exists public.secrets (
  game_id     text not null,
  kind        text not null,          -- 'answer' | 'hint' | 'payload'
  idx         int  not null default 0, -- 힌트 자릿수
  value       text not null,
  primary key (game_id, kind, idx)
);

-- ==========================================================================
-- 관리자 판별
-- ==========================================================================
-- 이 이메일 계정만 설정과 정답을 바꿀 수 있습니다.
-- Supabase 대시보드 > Authentication > Users 에서 같은 이메일로 계정을
-- 만들어 두세요.
create or replace function public.is_admin()
returns boolean language sql stable as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'jyt6640@gmail.com';
$$;

-- ==========================================================================
-- 행 수준 보안
-- ==========================================================================
alter table public.games        enable row level security;
alter table public.counters     enable row level security;
alter table public.participants enable row level security;
alter table public.settings     enable row level security;
alter table public.secrets      enable row level security;

-- 읽기는 모두에게 열려 있습니다. 화면에 숫자를 보여줘야 하니까요.
drop policy if exists games_read on public.games;
create policy games_read on public.games for select using (true);

drop policy if exists counters_read on public.counters;
create policy counters_read on public.counters for select using (true);

drop policy if exists participants_read on public.participants;
create policy participants_read on public.participants for select using (true);

drop policy if exists settings_read on public.settings;
create policy settings_read on public.settings for select using (true);

-- 쓰기는 관리자만. 일반 참여자의 증가는 아래 RPC가 대신 처리합니다.
drop policy if exists settings_admin on public.settings;
create policy settings_admin on public.settings for all
  using (public.is_admin()) with check (public.is_admin());

-- secrets에는 select 정책을 만들지 않습니다. 즉 아무도 못 읽습니다.
-- 관리자도 못 읽고, 오직 security definer 함수만 들여다봅니다.
drop policy if exists secrets_admin_write on public.secrets;
create policy secrets_admin_write on public.secrets for all
  using (false) with check (public.is_admin());

-- games / counters / participants 에는 쓰기 정책이 없습니다.
-- 클라이언트는 어떤 경로로도 직접 쓸 수 없습니다.

-- ==========================================================================
-- 실시간 구독
-- ==========================================================================
do $$
begin
  begin
    alter publication supabase_realtime add table public.counters;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.games;
  exception when duplicate_object then null;
  end;
end $$;

-- ==========================================================================
-- RPC — 클라이언트가 호출할 수 있는 전부
-- ==========================================================================

-- 회차를 준비합니다. 없으면 만들고, 방문 기록을 남기고, 현재 상태를 돌려줍니다.
create or replace function public.join_game(p_game text, p_target bigint default null)
returns table (total bigint, my_count bigint, status text, hint_level int)
language plpgsql security definer set search_path = public as $$
declare
  v_uid text := auth.uid()::text;
begin
  if v_uid is null then
    raise exception 'not signed in';
  end if;

  insert into games (id, target) values (p_game, p_target)
    on conflict (id) do nothing;

  insert into counters (game_id, bucket) values (p_game, 'main')
    on conflict do nothing;

  insert into participants (game_id, uid) values (p_game, v_uid)
    on conflict do nothing;

  return query
    select coalesce((select sum(c.value) from counters c where c.game_id = p_game), 0)::bigint,
           (select p.count from participants p where p.game_id = p_game and p.uid = v_uid),
           (select g.status from games g where g.id = p_game),
           (select g.hint_level from games g where g.id = p_game);
end $$;

-- 카운터를 올립니다. 감소는 어떤 방법으로도 불가능합니다.
-- 목표가 있으면 정확히 목표에서 멈추고, 목표를 밟은 사람에게만 won=true.
create or replace function public.bump(
  p_game text, p_amount int, p_bucket text default 'main'
)
returns table (total bigint, won boolean, completed boolean)
language plpgsql security definer set search_path = public as $$
declare
  v_uid    text := auth.uid()::text;
  v_target bigint;
  v_before bigint;
  v_add    bigint;
  v_after  bigint;
  v_status text;
begin
  if v_uid is null then
    raise exception 'not signed in';
  end if;
  -- 한 번에 밀어 넣을 수 있는 양을 제한해 대량 조작을 억제합니다.
  if p_amount is null or p_amount < 1 or p_amount > 5000 then
    raise exception 'bad amount';
  end if;

  select g.target, g.status into v_target, v_status from games g where g.id = p_game;
  if v_status is null then
    raise exception 'no such game';
  end if;
  if v_status = 'completed' then
    return query select
      coalesce((select sum(c.value) from counters c where c.game_id = p_game), 0)::bigint,
      false, true;
    return;
  end if;

  insert into counters (game_id, bucket) values (p_game, p_bucket)
    on conflict do nothing;

  -- 목표를 넘지 않도록 실제로 더할 양을 먼저 정합니다.
  select coalesce(sum(c.value), 0) into v_before from counters c where c.game_id = p_game;
  v_add := p_amount;
  if v_target is not null then
    v_add := least(p_amount, greatest(v_target - v_before, 0));
  end if;

  if v_add > 0 then
    update counters set value = value + v_add
      where game_id = p_game and bucket = p_bucket;

    update participants
       set count        = count + v_add,
           last_action  = now(),
           first_action = coalesce(first_action, now())
     where game_id = p_game and uid = v_uid;
  end if;

  select coalesce(sum(c.value), 0) into v_after from counters c where c.game_id = p_game;

  -- 구간별 도달 시각.
  -- UPDATE ... FROM (values ...) 로 쓰면 대상 행이 한 번만 갱신되어 한
  -- 호출에 구간 하나씩만 기록됩니다. 한 번에 여러 구간을 넘길 수 있으므로
  -- 해당하는 구간을 모두 모아 한 번에 합칩니다.
  if v_target is not null then
    update games g
       set milestones = g.milestones || coalesce((
             select jsonb_object_agg(k.pct::text, now())
               from (values (25, 0.25), (50, 0.50), (75, 0.75), (100, 1.0))
                      as k(pct, ratio)
              where v_after >= v_target * k.ratio
                and not (g.milestones ? k.pct::text)
           ), '{}'::jsonb)
     where g.id = p_game;
  end if;

  -- 목표 도달 처리
  if v_target is not null and v_after >= v_target then
    update games set status = 'completed', end_time = coalesce(end_time, now())
      where id = p_game and status <> 'completed';
    return query select v_after, (v_before < v_target and v_add > 0), true;
    return;
  end if;

  return query select v_after, false, false;
end $$;

-- 자물쇠 정답 대조. 정답은 서버 밖으로 나가지 않습니다.
create or replace function public.check_lock_answer(p_game text, p_guess text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_uid text := auth.uid()::text;
  v_ok  boolean;
begin
  if v_uid is null then
    raise exception 'not signed in';
  end if;

  select exists (
    select 1 from secrets s
     where s.game_id = p_game and s.kind = 'answer' and s.value = p_guess
  ) into v_ok;

  if v_ok then
    update participants
       set solved = true, solved_at = coalesce(solved_at, now())
     where game_id = p_game and uid = v_uid;
  end if;

  return v_ok;
end $$;

-- 공개 단계에 도달한 자리만 돌려줍니다.
create or replace function public.get_lock_hint(p_game text, p_index int)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_level int;
begin
  select hint_level into v_level from games where id = p_game;
  if v_level is null or p_index > v_level then
    return null;
  end if;
  return (select value from secrets
           where game_id = p_game and kind = 'hint' and idx = p_index);
end $$;

-- 전체 시도 횟수에 따라 공개 단계를 올립니다. 내리지는 못합니다.
create or replace function public.raise_hint_level(p_game text, p_level int)
returns int
language plpgsql security definer set search_path = public as $$
begin
  update games set hint_level = greatest(hint_level, p_level) where id = p_game;
  return (select hint_level from games where id = p_game);
end $$;

-- 게임이 끝난 뒤에만 읽히는 문구
create or replace function public.get_payload(p_game text)
returns text
language plpgsql security definer set search_path = public as $$
begin
  if (select status from games where id = p_game) <> 'completed' then
    return null;
  end if;
  return (select value from secrets where game_id = p_game and kind = 'payload' and idx = 0);
end $$;

-- 더 버튼: 타이머를 되돌립니다.
create or replace function public.press_button(p_game text)
returns table (last_press timestamptz, last_presser text)
language plpgsql security definer set search_path = public as $$
declare v_uid text := auth.uid()::text;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  update games set last_press = now(), last_presser = v_uid
    where id = p_game and status <> 'completed';
  return query select g.last_press, g.last_presser from games g where g.id = p_game;
end $$;

-- 게임 쪽에서 승부를 판정하는 경우(줄다리기·더 버튼)
create or replace function public.finish_game(p_game text, p_winner text default null)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update games
     set status = 'completed',
         end_time = coalesce(end_time, now()),
         winner = coalesce(winner, p_winner)
   where id = p_game and status <> 'completed';
end $$;

-- 관리자: 자물쇠 정답과 힌트를 넣습니다. 평문은 여기서만 존재합니다.
create or replace function public.set_lock_answer(p_game text, p_answer text)
returns void
language plpgsql security definer set search_path = public as $$
declare i int;
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  if p_answer !~ '^[0-9]+$' then raise exception 'digits only'; end if;

  delete from secrets where game_id = p_game and kind in ('answer', 'hint');
  insert into secrets (game_id, kind, idx, value) values (p_game, 'answer', 0, p_answer);
  for i in 1 .. length(p_answer) loop
    insert into secrets (game_id, kind, idx, value)
      values (p_game, 'hint', i, substr(p_answer, i, 1));
  end loop;
end $$;

-- 관리자: 게임이 끝난 뒤 보여줄 문구
create or replace function public.set_payload(p_game text, p_text text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  insert into secrets (game_id, kind, idx, value) values (p_game, 'payload', 0, p_text)
    on conflict (game_id, kind, idx) do update set value = excluded.value;
end $$;

-- Firebase에서 넘어온 과거 회차를 통째로 넣습니다. 관리자만 호출할 수 있고,
-- 이미 있는 회차는 건드리지 않습니다.
create or replace function public.import_round(p jsonb)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_id text := p ->> 'id';
  r    jsonb;
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  if v_id is null then raise exception 'id required'; end if;
  if exists (select 1 from games where id = v_id) then
    return 'skipped';
  end if;

  insert into games (id, status, target, start_time, end_time, milestones,
                     hint_level, last_press, last_presser, winner)
  values (
    v_id,
    coalesce(p ->> 'status', 'active'),
    nullif(p ->> 'target', '')::bigint,
    coalesce((p ->> 'start_time')::timestamptz, now()),
    (p ->> 'end_time')::timestamptz,
    coalesce(p -> 'milestones', '{}'::jsonb),
    coalesce((p ->> 'hint_level')::int, 0),
    (p ->> 'last_press')::timestamptz,
    p ->> 'last_presser',
    p ->> 'winner'
  );

  for r in select * from jsonb_array_elements(coalesce(p -> 'counters', '[]'::jsonb)) loop
    insert into counters (game_id, bucket, value)
    values (v_id, coalesce(r ->> 'bucket', 'main'), (r ->> 'value')::bigint)
    on conflict (game_id, bucket) do update set value = excluded.value;
  end loop;

  for r in select * from jsonb_array_elements(coalesce(p -> 'participants', '[]'::jsonb)) loop
    insert into participants (game_id, uid, count, first_visit, first_action,
                              last_action, solved, solved_at)
    values (
      v_id, r ->> 'uid', coalesce((r ->> 'count')::bigint, 0),
      coalesce((r ->> 'first_visit')::timestamptz, now()),
      (r ->> 'first_action')::timestamptz,
      (r ->> 'last_action')::timestamptz,
      coalesce((r ->> 'solved')::boolean, false),
      (r ->> 'solved_at')::timestamptz
    )
    on conflict (game_id, uid) do nothing;
  end loop;

  return 'imported';
end $$;

-- ==========================================================================
-- 권한
-- ==========================================================================
-- 읽기가 필요한 네 테이블만 select를 엽니다. 대시보드의
-- Data API > Exposed tables 목록에도 이 네 개가 켜져 있어야 합니다.
--
-- 스키마 전체에 revoke를 걸지 않는 이유: Supabase의 노출 토글이 같은 권한을
-- 관리하기 때문에, 광범위한 revoke는 대시보드 설정과 서로 덮어씁니다.
grant usage on schema public to anon, authenticated;
grant select on public.games        to anon, authenticated;
grant select on public.counters     to anon, authenticated;
grant select on public.participants to anon, authenticated;
grant select on public.settings     to anon, authenticated;
grant insert, update on public.settings to authenticated;

-- 비밀 값은 어떤 역할도 직접 건드릴 수 없습니다. security definer 함수만
-- 들여다봅니다. 대시보드에서도 secrets는 노출하지 마세요.
revoke all on public.secrets from anon, authenticated;

grant execute on function
  public.join_game(text, bigint),
  public.bump(text, int, text),
  public.check_lock_answer(text, text),
  public.get_lock_hint(text, int),
  public.raise_hint_level(text, int),
  public.get_payload(text),
  public.press_button(text),
  public.finish_game(text, text),
  public.set_lock_answer(text, text),
  public.set_payload(text, text),
  public.import_round(jsonb)
to anon, authenticated;
