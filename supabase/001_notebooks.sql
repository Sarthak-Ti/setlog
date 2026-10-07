
create table public.notebooks (
 user_id uuid primary key references auth.users(id) on delete cascade,
 state jsonb not null check (jsonb_typeof(state)='object' and state->>'version'='1' and jsonb_typeof(state->'history')='array'),
 revision bigint not null default 1 check (revision>0),
 updated_at timestamptz not null default now()
);
alter table public.notebooks enable row level security;
create policy "Owners can read their notebook" on public.notebooks for select to authenticated using ((select auth.uid())=user_id);
create policy "Owners can create their notebook" on public.notebooks for insert to authenticated with check ((select auth.uid())=user_id);
create policy "Owners can update their notebook" on public.notebooks for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
revoke all on public.notebooks from anon;
grant select,insert,update on public.notebooks to authenticated;
create function public.save_notebook(p_state jsonb,p_expected_revision bigint)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare saved public.notebooks;
begin
 if auth.uid() is null then raise exception 'Sign in first' using errcode='42501'; end if;
 if p_expected_revision<0 or p_expected_revision is null then raise exception 'Invalid revision' using errcode='22023'; end if;
 if octet_length(p_state::text)>10485760 then raise exception 'Notebook exceeds 10 MB' using errcode='22023'; end if;
 if p_expected_revision=0 then
  insert into public.notebooks(user_id,state,revision) values(auth.uid(),p_state,1)
  on conflict(user_id) do nothing returning * into saved;
 else
  update public.notebooks set state=p_state,revision=revision+1,updated_at=now()
  where user_id=auth.uid() and revision=p_expected_revision returning * into saved;
 end if;
 if saved.user_id is null then raise exception 'Notebook changed on another device' using errcode='PT409'; end if;
 return jsonb_build_object('state',saved.state,'revision',saved.revision);
end $$;
revoke all on function public.save_notebook(jsonb,bigint) from public,anon;
grant execute on function public.save_notebook(jsonb,bigint) to authenticated;

create table public.daily_workout_summaries(
 user_id uuid not null references auth.users(id) on delete cascade,
 day date not null,
 workouts integer not null,
 strength_sets integer not null,
 volume_lbs numeric not null,
 cardio_minutes numeric not null,
 session_names jsonb not null,
 source_revision bigint not null,
 generated_at timestamptz not null default now(),
 primary key(user_id,day)
);
alter table public.daily_workout_summaries enable row level security;
create policy "Owners can read their summaries" on public.daily_workout_summaries for select to authenticated using ((select auth.uid())=user_id);
revoke all on public.daily_workout_summaries from anon,authenticated;
grant select on public.daily_workout_summaries to authenticated;

-- Run via the authorized Supabase connection, never through the public app.
create function public.compile_daily_workout_summary(p_day date default (now() at time zone 'America/New_York')::date-1)
returns table(summary_day date,notebooks_compiled bigint) language plpgsql security definer set search_path='' as $$
declare compiled bigint;
begin
 if p_day is null or p_day>(now() at time zone 'America/New_York')::date then raise exception 'Choose today or an earlier date'; end if;
 with sessions as (
  select n.user_id,n.revision,s.value as session
  from public.notebooks n cross join lateral jsonb_array_elements(n.state->'history') s
  where (s.value->>'completedAt')::timestamptz at time zone 'America/New_York'>=p_day::timestamp
   and (s.value->>'completedAt')::timestamptz at time zone 'America/New_York'<(p_day+1)::timestamp
 ), sessions_by_owner as (
  select user_id,count(*) filter(where session->>'kind'<>'rest')::integer workouts,
   coalesce(sum(case when session->>'kind'='cardio' and jsonb_typeof(session->'cardio'->'duration')='number' then (session->'cardio'->>'duration')::numeric else 0 end),0) cardio_minutes,
   jsonb_agg(session->>'name' order by session->>'completedAt') session_names
  from sessions group by user_id
 ), sets_by_owner as (
  select s.user_id,count(*)::integer strength_sets,
   coalesce(sum(case when jsonb_typeof(st.value->'weight')='number' and jsonb_typeof(st.value->'reps')='number' then (st.value->>'weight')::numeric*(st.value->>'reps')::numeric else 0 end),0) volume_lbs
  from sessions s cross join lateral jsonb_array_elements(s.session->'entries') e
   cross join lateral jsonb_array_elements(e.value->'sets') st
  where s.session->>'kind'='strength' and st.value->'completed'='true'::jsonb group by s.user_id
 )
 insert into public.daily_workout_summaries(user_id,day,workouts,strength_sets,volume_lbs,cardio_minutes,session_names,source_revision)
 select n.user_id,p_day,coalesce(s.workouts,0),coalesce(t.strength_sets,0),coalesce(t.volume_lbs,0),coalesce(s.cardio_minutes,0),coalesce(s.session_names,'[]'::jsonb),n.revision
 from public.notebooks n left join sessions_by_owner s on s.user_id=n.user_id left join sets_by_owner t on t.user_id=n.user_id
 on conflict(user_id,day) do update set workouts=excluded.workouts,strength_sets=excluded.strength_sets,volume_lbs=excluded.volume_lbs,cardio_minutes=excluded.cardio_minutes,session_names=excluded.session_names,source_revision=excluded.source_revision,generated_at=now();
 get diagnostics compiled=row_count;
 return query select p_day,compiled;
end $$;
revoke all on function public.compile_daily_workout_summary(date) from public,anon,authenticated;
grant execute on function public.compile_daily_workout_summary(date) to service_role;
comment on table public.daily_workout_summaries is 'One compact summary per account and New York calendar day; not a backup of raw workout records.';
