-- 제 시험 흔적을 지우고, 구간 기록 버그를 고친 bump 함수로 교체합니다.
-- Supabase SQL Editor 에 통째로 붙여넣고 한 번 실행하세요.
--
-- schema.sql 전체를 다시 실행하셔도 결과는 같습니다.

-- 1) 시험용으로 만든 행 정리 (counters·participants는 함께 지워집니다)
delete from public.games where id in ('selftest-r1', 'cylinder-r1');

-- 2) 구간 기록 수정
--    UPDATE ... FROM (values ...) 는 대상 행을 한 번만 갱신해서 한 호출에
--    구간이 하나씩만 남았습니다. 해당하는 구간을 모아 한 번에 합칩니다.
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

  if v_target is not null and v_after >= v_target then
    update games set status = 'completed', end_time = coalesce(end_time, now())
      where id = p_game and status <> 'completed';
    return query select v_after, (v_before < v_target and v_add > 0), true;
    return;
  end if;

  return query select v_after, false, false;
end $$;
