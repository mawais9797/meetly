-- Repairs from the 22 October QA pass. Existing function grants are preserved.

-- Strict full-URL validation, shared in behavior with the client helper.
-- ASCII DNS names (including punycode) or dotted IPv4; no credentials/whitespace.
create function public.valid_meeting_url(p_url text) returns boolean
language plpgsql immutable set search_path=public as $$
declare authority text; host text; port text; part text; begin
 if p_url is null or p_url ~ '[[:space:][:cntrl:]]' or position(chr(92) in p_url)>0 then return false; end if;
 if p_url !~* '^https?://([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(:[0-9]{1,5})?([/?#][^[:space:][:cntrl:]]*)?$' then return false; end if;
 authority:=split_part(split_part(split_part(regexp_replace(p_url,'^https?://','','i'),'/',1),'?',1),'#',1);
 host:=split_part(authority,':',1); port:=split_part(authority,':',2);
 if length(host)>253 or (port<>'' and port::integer>65535) then return false; end if;
 if host ~ '^[0-9.]+$' then
  if array_length(string_to_array(host,'.'),1)<>4 then return false; end if;
  foreach part in array string_to_array(host,'.') loop
   if length(part)>3 or part::integer>255 or (length(part)>1 and left(part,1)='0') then return false; end if;
  end loop;
 end if;
 return true;
end $$;
revoke execute on function public.valid_meeting_url(text) from public,anon,authenticated;
grant execute on function public.valid_meeting_url(text) to service_role;

create or replace function public.validate_schedule(p_start timestamptz,p_duration integer,p_type text,p_location text) returns void language plpgsql security definer set search_path=public as $$
declare ls timestamp; le timestamp; r availability_rules; begin
 -- Serializes availability edits and schedule validation; exclusion constraint handles overlaps.
 perform pg_advisory_xact_lock(7281901);
 if p_start is null or not isfinite(p_start) or p_start<=now() then raise exception 'Choose a future start time'; end if;
 if p_duration is null or p_duration<1 or p_duration>(select max_duration_minutes from system_settings) then raise exception 'Invalid appointment duration'; end if;
 if p_type is null or p_type not in ('Physical','Online') or p_location is null or length(trim(p_location))=0 then raise exception 'Meeting format and location are required'; end if;
 if p_type='Online' and not public.valid_meeting_url(p_location) then raise exception 'Enter a valid http or https meeting URL'; end if;
 ls:=p_start at time zone 'Asia/Karachi'; le:=(p_start+make_interval(mins=>p_duration)) at time zone 'Asia/Karachi';
 select * into r from availability_rules where weekday=extract(dow from ls);
 if not found or not r.is_workday or ls::date<>le::date or ls::time<r.start_local or le::time>r.end_local then raise exception 'Appointment must fit working hours'; end if;
 if exists(select 1 from blocked_dates where local_date=ls::date) then raise exception 'This date is unavailable'; end if;
 if exists(select 1 from availability_breaks where (local_date=ls::date or (local_date is null and weekday=extract(dow from ls))) and start_local<le::time and end_local>ls::time) then raise exception 'Appointment overlaps a break'; end if;
end $$;

create or replace function public.save_availability(p_rules jsonb,p_breaks jsonb,p_blocks jsonb) returns void language plpgsql security definer set search_path=public as $$
declare uid uuid; begin
 uid:=require_admin(); perform pg_advisory_xact_lock(7281901);
 if jsonb_typeof(p_rules) is distinct from 'array' or jsonb_typeof(p_breaks) is distinct from 'array' or jsonb_typeof(p_blocks) is distinct from 'array' then raise exception 'Rules, breaks and blocks must be non-null arrays'; end if;
 if jsonb_array_length(p_rules)<>7 then raise exception 'Provide all seven weekdays'; end if;
 delete from availability_rules; insert into availability_rules select weekday,is_workday,start_local,end_local from jsonb_to_recordset(p_rules) as x(weekday integer,is_workday boolean,start_local time,end_local time);
 delete from availability_breaks; insert into availability_breaks(weekday,local_date,start_local,end_local) select weekday,local_date,start_local,end_local from jsonb_to_recordset(p_breaks) as x(weekday integer,local_date date,start_local time,end_local time);
 delete from blocked_dates; insert into blocked_dates(local_date,type,description) select local_date,type,coalesce(description,'') from jsonb_to_recordset(p_blocks) as x(local_date date,type text,description text);
 insert into admin_audit_logs(admin_id,action,target_type,metadata) values(uid,'availability_updated','calendar',jsonb_build_object('rules',p_rules,'breaks',p_breaks,'blocks',p_blocks));
end $$;

create or replace function public.admin_delete_user(p_user uuid,p_confirmation text) returns void language plpgsql security definer set search_path=public,auth as $$
declare uid uuid; p public.profiles; days integer; begin
 uid:=public.require_admin(); perform pg_advisory_xact_lock(hashtextextended(p_user::text,0)); select * into p from public.profiles where user_id=p_user for update;
 if not found or p.role<>'User' or p.account_status='Deleted' or p_confirmation is distinct from ('DELETE '||p.email) then raise exception 'Type DELETE followed by the account email'; end if;
 if exists(select 1 from public.appointments where user_id=p_user and status in ('Pending','Approved')) then raise exception 'Resolve active appointments before deleting this account'; end if;
 select retention_days into days from public.system_settings;
 if exists(select 1 from public.appointments where user_id=p_user and closed_at>now()-make_interval(days=>days)) then raise exception 'Configured retention period has not elapsed'; end if;
 -- Retain de-identified appointment/audit records; remove auth identity and personal content.
 update public.appointments set subject='Deleted account appointment',purpose='Removed on account deletion',physical_address=null,meeting_url=null,rejection_reason=null,cancellation_reason=null where user_id=p_user;
 update public.appointment_events set old_value=null,new_value=null where appointment_id in(select id from public.appointments where user_id=p_user);
 delete from public.delivery_jobs where recipient_id=p_user or appointment_id in(select id from public.appointments where user_id=p_user);
 delete from public.notifications where recipient_id=p_user or appointment_id in(select id from public.appointments where user_id=p_user);
 delete from public.device_tokens where user_id=p_user;
 update public.deletion_requests set email='deleted',reason='',status='Resolved' where user_id=p_user;
 update public.profiles set full_name='Deleted user',email=p_user::text||'@deleted.invalid',phone='+10000000000',account_status='Deleted',updated_at=now() where user_id=p_user;
 -- Profiles intentionally survive identity deletion via FK removal below.
 delete from auth.users where id=p_user;
 insert into public.admin_audit_logs(admin_id,action,target_type,target_id,metadata) values(uid,'account_deleted','user',p_user,jsonb_build_object('retention_days',days));
end $$;

create or replace function public.claim_delivery_jobs(p_limit integer default 50) returns setof public.delivery_jobs language plpgsql security definer set search_path=public as $$ begin
 -- Recover retryable leases, but terminalize exhausted jobs (including older
 -- Pending rows stranded by the previous implementation).
 update delivery_jobs set status='Failed',locked_at=null,last_error=coalesce(last_error,'Delivery attempt limit exhausted after worker interruption')
 where attempt_count>=8 and (status='Pending' or (status='Processing' and (locked_at is null or locked_at < now()-interval '10 minutes')));
 update delivery_jobs set status='Pending',locked_at=null where status='Processing' and attempt_count<8 and (locked_at is null or locked_at < now()-interval '10 minutes');
 update delivery_jobs j set status='Cancelled' where j.status='Pending' and j.schedule_version is not null and not exists(select 1 from appointments a where a.id=j.appointment_id and a.status='Approved' and a.schedule_version=j.schedule_version and a.scheduled_start_utc>now());
 return query with candidates as(select id from delivery_jobs where status='Pending' and scheduled_for<=now() and attempt_count<8 order by scheduled_for for update skip locked limit least(greatest(p_limit,1),100))
 update delivery_jobs j set status='Processing',locked_at=now(),attempt_count=attempt_count+1 from candidates c where j.id=c.id returning j.*;
end $$;

-- Remove retained payloads for accounts already de-identified before this patch.
-- Push receipts follow the job FK's ON DELETE CASCADE.
delete from public.delivery_jobs where recipient_id in(select user_id from public.profiles where account_status='Deleted')
 or appointment_id in(select a.id from public.appointments a join public.profiles p on p.user_id=a.user_id where p.account_status='Deleted');

-- Protect future writes without rejecting deployment over legacy malformed URLs.
-- Existing approved records should be reviewed before validating this constraint.
alter table public.appointments add constraint approved_online_url_valid
 check(status<>'Approved' or meeting_type<>'Online' or public.valid_meeting_url(meeting_url)) not valid;
