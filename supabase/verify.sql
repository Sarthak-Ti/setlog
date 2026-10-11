
begin;
insert into auth.users(id,aud,role,email) values
 ('84783c87-a4ab-4bd9-8660-00cb7150ae89','authenticated','authenticated','setlog-rls-a@example.invalid'),
 ('84783c87-a4ab-4bd9-8660-00cb7150ae90','authenticated','authenticated','setlog-rls-b@example.invalid');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"84783c87-a4ab-4bd9-8660-00cb7150ae89","role":"authenticated"}',true);
select public.save_notebook('{"version":1,"history":[{"id":"strength-fixture","kind":"strength","name":"Push A","completedAt":"2026-10-07T02:00:00Z","entries":[{"sets":[{"completed":true,"weight":75,"reps":8},{"completed":false,"weight":75,"reps":8}]}]},{"kind":"cardio","name":"Cardio","completedAt":"2026-10-06T16:00:00Z","cardio":{"duration":20},"entries":[]},{"kind":"cardio","name":"Push A · cardio","afterWorkoutId":"strength-fixture","queueId":null,"completedAt":"2026-10-07T02:30:00Z","cardio":{"activity":"Zone 2 Elliptical","duration":35.5,"distance":null,"heartRate":null,"unit":"mi"},"entries":[]}]}',0);
do $$ begin
 if (select count(*) from public.notebooks)<>1 then raise exception 'Owner read failed'; end if;
 begin perform public.save_notebook('{"version":1,"history":[]}',0);raise exception 'Stale write was accepted';exception when sqlstate 'PT409' then null;end;
 begin perform public.compile_daily_workout_summary('2026-10-06');raise exception 'Public compilation was allowed';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claims','{"sub":"84783c87-a4ab-4bd9-8660-00cb7150ae90","role":"authenticated"}',true);
do $$ begin
 if (select count(*) from public.notebooks)<>0 then raise exception 'Cross-account data leak';end if;
 begin insert into public.notebooks(user_id,state) values('84783c87-a4ab-4bd9-8660-00cb7150ae89','{"version":1,"history":[]}');raise exception 'Cross-account write allowed';exception when insufficient_privilege then null;end;
end $$;
reset role;
select * from public.compile_daily_workout_summary('2026-10-06');
select * from public.compile_daily_workout_summary('2026-10-06');
do $$ declare s public.daily_workout_summaries;begin
 select * into s from public.daily_workout_summaries where user_id='84783c87-a4ab-4bd9-8660-00cb7150ae89' and day='2026-10-06';
 if s.workouts<>3 or s.strength_sets<>1 or s.volume_lbs<>600 or s.cardio_minutes<>55.5 then raise exception 'Summary totals incorrect, including optional cardio';end if;
 if (select count(*) from public.daily_workout_summaries where user_id='84783c87-a4ab-4bd9-8660-00cb7150ae89')<>1 then raise exception 'Duplicate summaries';end if;
end $$;
set local role anon;
do $$ begin
 begin perform * from public.notebooks;raise exception 'Anonymous read allowed';exception when insufficient_privilege then null;end;
end $$;
reset role;
select 'PASS: owner isolation, anonymous denial, stale revision rejection, restricted compilation, optional-cardio NY-day totals, and idempotent daily summaries' as result;
rollback;
