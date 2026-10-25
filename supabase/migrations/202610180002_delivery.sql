-- Worker-only job claiming, with leases so interrupted jobs can be recovered.
create function public.claim_delivery_jobs(p_limit integer default 50) returns setof public.delivery_jobs language plpgsql security definer set search_path=public as $$ begin
 update delivery_jobs set status='Pending',locked_at=null where status='Processing' and locked_at < now()-interval '10 minutes';
 update delivery_jobs j set status='Cancelled' where j.status='Pending' and j.schedule_version is not null and not exists(select 1 from appointments a where a.id=j.appointment_id and a.status='Approved' and a.schedule_version=j.schedule_version and a.scheduled_start_utc>now());
 return query with candidates as(select id from delivery_jobs where status='Pending' and scheduled_for<=now() and attempt_count<8 order by scheduled_for for update skip locked limit least(greatest(p_limit,1),100))
 update delivery_jobs j set status='Processing',locked_at=now(),attempt_count=attempt_count+1 from candidates c where j.id=c.id returning j.*;
end $$;
create function public.deliver_in_app_reminder(p_job uuid) returns boolean language plpgsql security definer set search_path=public as $$
declare j delivery_jobs; begin
 perform pg_advisory_xact_lock(7281901);
 select * into j from delivery_jobs where id=p_job and status='Processing' and channel='in_app' for update;
 if not found then return false; end if;
 if j.schedule_version is not null and not exists(select 1 from appointments where id=j.appointment_id and status='Approved' and schedule_version=j.schedule_version and scheduled_start_utc>now()) then update delivery_jobs set status='Cancelled' where id=j.id; return false; end if;
 insert into notifications(recipient_id,appointment_id,event_type,title,message) values(j.recipient_id,j.appointment_id,'reminder',j.title,j.message);
 update delivery_jobs set status='Sent',sent_at=now(),locked_at=null where id=j.id;
 return true;
end $$;
revoke execute on function public.claim_delivery_jobs(integer),public.deliver_in_app_reminder(uuid) from public,anon,authenticated;
grant execute on function public.claim_delivery_jobs(integer),public.deliver_in_app_reminder(uuid) to service_role;

-- Sequence references keep every digit beyond 999999 as well.
create function public.next_appointment_reference() returns text language plpgsql security definer set search_path=public as $$ declare n text; begin n:=nextval('public.appointment_reference_seq')::text; return 'APT-'||lpad(n,greatest(6,length(n)),'0'); end $$;
alter table public.appointments alter reference_number set default public.next_appointment_reference();
revoke execute on function public.next_appointment_reference() from public,anon,authenticated;
grant execute on function public.next_appointment_reference() to service_role;
