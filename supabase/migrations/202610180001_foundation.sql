create extension if not exists btree_gist with schema extensions;
create extension if not exists pgcrypto with schema extensions;

create type public.appointment_status as enum ('Pending','Approved','Rejected','Cancelled','Completed','No Show');
create sequence public.appointment_reference_seq;
create table public.profiles (
 user_id uuid primary key references auth.users(id), full_name text not null check (length(trim(full_name)) between 1 and 120),
 email text not null, phone text not null check (phone ~ '^\+[1-9][0-9]{7,14}$'),
 role text not null default 'User' check (role in ('User','Admin')), account_status text not null default 'Active' check (account_status in ('Active','Suspended','Deleted')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index single_administrator on public.profiles(role) where role = 'Admin';
create table public.appointments (
 id uuid primary key default gen_random_uuid(), reference_number text not null unique default ('APT-' || lpad(nextval('public.appointment_reference_seq')::text,6,'0')),
 user_id uuid not null references public.profiles(user_id), subject text not null check(length(trim(subject)) between 1 and 150), purpose text not null check(length(trim(purpose)) between 1 and 2000),
 status public.appointment_status not null default 'Pending', submitted_at timestamptz not null default now(),
 scheduled_start_utc timestamptz, scheduled_end_utc timestamptz, duration_minutes integer check(duration_minutes between 1 and 1440),
 meeting_type text check(meeting_type in ('Physical','Online')), physical_address text, meeting_url text, rejection_reason text, cancellation_reason text, closed_at timestamptz,
 schedule_version integer not null default 0, request_key uuid not null unique,
 check (status <> 'Approved' or (scheduled_start_utc is not null and scheduled_end_utc is not null and duration_minutes is not null and meeting_type is not null and scheduled_end_utc = scheduled_start_utc + duration_minutes * interval '1 minute' and ((meeting_type='Physical' and length(trim(physical_address))>0) or (meeting_type='Online' and meeting_url ~ '^https?://[^/[:space:]]+\.[^[:space:]]+')))),
 constraint no_approved_overlap exclude using gist (tstzrange(scheduled_start_utc, scheduled_end_utc, '[)') with &&) where (status = 'Approved')
);
create unique index one_active_appointment on public.appointments(user_id) where status in ('Pending','Approved');
create index appointments_submitted on public.appointments(submitted_at);
create index appointments_user on public.appointments(user_id);
create table public.availability_rules (weekday integer primary key check(weekday between 0 and 6), is_workday boolean not null default true, start_local time not null default '09:00', end_local time not null default '17:00', check(start_local < end_local));
insert into public.availability_rules(weekday,is_workday) select d,d between 1 and 5 from generate_series(0,6) d;
create table public.availability_breaks (id uuid primary key default gen_random_uuid(), weekday integer check(weekday between 0 and 6), local_date date, start_local time not null, end_local time not null, check(start_local<end_local), check((weekday is null) <> (local_date is null)));
insert into public.availability_breaks(weekday,start_local,end_local) select d,'13:00','14:00' from generate_series(1,5) d;
create table public.blocked_dates (id uuid primary key default gen_random_uuid(), local_date date not null unique, type text not null check(type in ('holiday','unavailable')), description text not null default '');
create table public.appointment_events (id uuid primary key default gen_random_uuid(), appointment_id uuid not null references public.appointments(id), actor_id uuid references public.profiles(user_id), event_type text not null, old_value jsonb, new_value jsonb, occurred_at timestamptz not null default now());
create table public.notifications (id uuid primary key default gen_random_uuid(), recipient_id uuid not null references public.profiles(user_id), appointment_id uuid references public.appointments(id), event_type text not null, title text not null, message text not null, read_at timestamptz, deleted_at timestamptz, created_at timestamptz not null default now());
create index notifications_recipient on public.notifications(recipient_id,created_at desc);
create table public.device_tokens (id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(user_id), expo_push_token text not null unique, device_info text, active boolean not null default true);
create table public.delivery_jobs (id uuid primary key default gen_random_uuid(), event_id uuid references public.appointment_events(id), recipient_id uuid not null references public.profiles(user_id), appointment_id uuid references public.appointments(id), channel text not null check(channel in ('email','push','in_app')), title text not null, message text not null, scheduled_for timestamptz not null default now(), sent_at timestamptz, attempt_count integer not null default 0, status text not null default 'Pending' check(status in ('Pending','Processing','Sent','Failed','Cancelled')), idempotency_key text not null unique, schedule_version integer, locked_at timestamptz, last_error text);
create index delivery_due on public.delivery_jobs(scheduled_for) where status='Pending';
create table public.admin_audit_logs (id uuid primary key default gen_random_uuid(), admin_id uuid references public.profiles(user_id), action text not null, target_type text not null, target_id uuid, timestamp timestamptz not null default now(), metadata jsonb not null default '{}');
create table public.deletion_requests (id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(user_id), email text not null, reason text not null default '', status text not null default 'Pending' check(status in ('Pending','Resolved')), created_at timestamptz not null default now());
create unique index one_deletion_request on public.deletion_requests(user_id) where status='Pending';
create table public.system_settings (id boolean primary key default true check(id), max_duration_minutes integer not null default 1440 check(max_duration_minutes between 1 and 1440), retention_days integer not null default 365 check(retention_days >= 0));
insert into public.system_settings default values;

create function public.is_active() returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from profiles where user_id=auth.uid() and account_status='Active'); $$;
create function public.is_admin() returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from profiles where user_id=auth.uid() and role='Admin' and account_status='Active'); $$;
create function public.require_active() returns uuid language plpgsql volatile security definer set search_path=public as $$ begin if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if; perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0)); if not exists(select 1 from profiles where user_id=auth.uid() and account_status='Active') then raise exception 'Active account required' using errcode='42501'; end if; return auth.uid(); end $$;
create function public.require_admin() returns uuid language plpgsql volatile security definer set search_path=public as $$ begin perform require_active(); if not is_admin() then raise exception 'Administrator access required' using errcode='42501'; end if; return auth.uid(); end $$;

create function public.handle_auth_user() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if TG_OP='INSERT' then
  insert into profiles(user_id,full_name,email,phone) values(new.id,coalesce(new.raw_user_meta_data->>'full_name',''),new.email,coalesce(new.raw_user_meta_data->>'phone',''));
 elsif new.email is distinct from old.email then update profiles set email=new.email,updated_at=now() where user_id=new.id; end if;
 return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_auth_user();
create trigger on_auth_email_changed after update of email on auth.users for each row execute function public.handle_auth_user();

alter table public.profiles enable row level security;
create policy profiles_read on public.profiles for select to authenticated using (is_active() and (user_id=auth.uid() or is_admin()));
alter table public.appointments enable row level security;
create policy appointment_read on public.appointments for select to authenticated using (is_admin() or (is_active() and user_id=auth.uid() and status in ('Pending','Approved')));
alter table public.notifications enable row level security;
create policy notification_read on public.notifications for select to authenticated using (is_active() and recipient_id=auth.uid() and deleted_at is null);
alter table public.device_tokens enable row level security;
create policy token_read on public.device_tokens for select to authenticated using (is_active() and user_id=auth.uid());
alter table public.deletion_requests enable row level security;
create policy deletion_read on public.deletion_requests for select to authenticated using(is_admin() or user_id=auth.uid());
do $$ declare t text; begin
 foreach t in array array['availability_rules','availability_breaks','blocked_dates','appointment_events','admin_audit_logs','system_settings'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('create policy admin_read on public.%I for select to authenticated using (public.is_admin())',t);
 end loop;
end $$;
alter table public.delivery_jobs enable row level security;
-- Clients have SELECT only. Every mutation uses a restricted, validated function.
revoke all on all tables in schema public from anon,authenticated;
grant select on public.profiles,public.appointments,public.notifications,public.device_tokens,public.deletion_requests,public.availability_rules,public.availability_breaks,public.blocked_dates,public.appointment_events,public.admin_audit_logs,public.system_settings to authenticated;
revoke all on all sequences in schema public from anon,authenticated;

create function public.queue_notice(p_recipient uuid,p_appointment uuid,p_event uuid,p_kind text,p_title text,p_message text,p_external boolean default true) returns void language plpgsql security definer set search_path=public as $$
declare ch text; begin
 insert into notifications(recipient_id,appointment_id,event_type,title,message) values(p_recipient,p_appointment,p_kind,p_title,p_message);
 if p_external then foreach ch in array array['email','push'] loop
  insert into delivery_jobs(event_id,recipient_id,appointment_id,channel,title,message,idempotency_key) values(p_event,p_recipient,p_appointment,ch,p_title,p_message,p_event::text||':'||p_recipient::text||':'||ch) on conflict(idempotency_key) do nothing;
 end loop; end if;
end $$;
create function public.refresh_reminders(p_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare a appointments; h integer; ch text; deadline timestamptz; msg text; begin
 select * into a from appointments where id=p_id;
 update delivery_jobs set status='Cancelled' where appointment_id=p_id and schedule_version is not null and status in ('Pending','Processing');
 if a.status <> 'Approved' then return; end if;
 msg:=a.reference_number||' — '||a.subject||' on '||to_char(a.scheduled_start_utc at time zone 'Asia/Karachi','DD Mon YYYY HH24:MI')||' PKT. '||coalesce(a.physical_address,a.meeting_url);
 foreach h in array array[24,1] loop
  deadline:=a.scheduled_start_utc - make_interval(hours=>h);
  if deadline > now() then foreach ch in array array['email','push','in_app'] loop
   insert into delivery_jobs(recipient_id,appointment_id,channel,title,message,scheduled_for,schedule_version,idempotency_key)
   values(a.user_id,a.id,ch,'Appointment reminder',msg,deadline,a.schedule_version,a.id::text||':v'||a.schedule_version||':'||h||':'||ch) on conflict(idempotency_key) do nothing;
  end loop; end if;
 end loop;
end $$;

create function public.create_appointment(p_subject text,p_purpose text,p_request_key uuid) returns public.appointments language plpgsql security definer set search_path=public as $$
declare uid uuid; a appointments; e uuid; admin_uid uuid; begin
 uid:=require_active();
 if (select role from profiles where user_id=uid) <> 'User' then raise exception 'Only users may submit requests'; end if;
 if not exists(select 1 from auth.users where id=uid and email_confirmed_at is not null) then raise exception 'Verify your email before submitting'; end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
 select * into a from appointments where request_key=p_request_key and user_id=uid;
 if found then
  if a.status not in ('Pending','Approved') then raise exception 'This request was already processed and is closed'; end if;
  return a;
 end if;
 if exists(select 1 from appointments where user_id=uid and status in ('Pending','Approved')) then raise exception 'You already have an active appointment'; end if;
 if (select count(*) from appointments where user_id=uid and submitted_at>now()-interval '1 hour')>=10 then raise exception 'Too many requests. Try again later.'; end if;
 insert into appointments(user_id,subject,purpose,request_key) values(uid,trim(p_subject),trim(p_purpose),p_request_key) returning * into a;
 insert into appointment_events(appointment_id,actor_id,event_type,new_value) values(a.id,uid,'submitted',jsonb_build_object('status','Pending')) returning id into e;
 perform queue_notice(uid,a.id,e,'submitted','Request received',a.reference_number||' — '||a.subject||'. Your request is awaiting review.');
 select user_id into admin_uid from profiles where role='Admin' and account_status='Active';
 if admin_uid is not null then perform queue_notice(admin_uid,a.id,e,'submitted','New appointment request',a.reference_number||' — '||a.subject); end if;
 return a;
end $$;

create function public.validate_schedule(p_start timestamptz,p_duration integer,p_type text,p_location text) returns void language plpgsql security definer set search_path=public as $$
declare ls timestamp; le timestamp; r availability_rules; begin
 -- Serializes availability edits and schedule validation; exclusion constraint handles overlaps.
 perform pg_advisory_xact_lock(7281901);
 if p_start is null or not isfinite(p_start) or p_start<=now() then raise exception 'Choose a future start time'; end if;
 if p_duration is null or p_duration<1 or p_duration>(select max_duration_minutes from system_settings) then raise exception 'Invalid appointment duration'; end if;
 if p_type is null or p_type not in ('Physical','Online') or p_location is null or length(trim(p_location))=0 then raise exception 'Meeting format and location are required'; end if;
 if p_type='Online' and p_location !~ '^https?://[^/[:space:]]+\.[^[:space:]]+' then raise exception 'Enter a valid http or https meeting URL'; end if;
 ls:=p_start at time zone 'Asia/Karachi'; le:=(p_start+make_interval(mins=>p_duration)) at time zone 'Asia/Karachi';
 select * into r from availability_rules where weekday=extract(dow from ls);
 if not found or not r.is_workday or ls::date<>le::date or ls::time<r.start_local or le::time>r.end_local then raise exception 'Appointment must fit working hours'; end if;
 if exists(select 1 from blocked_dates where local_date=ls::date) then raise exception 'This date is unavailable'; end if;
 if exists(select 1 from availability_breaks where (local_date=ls::date or (local_date is null and weekday=extract(dow from ls))) and start_local<le::time and end_local>ls::time) then raise exception 'Appointment overlaps a break'; end if;
end $$;

create function public.appointment_action(p_id uuid,p_action text,p_reason text default null,p_start timestamptz default null,p_duration integer default null,p_type text default null,p_location text default null) returns public.appointments language plpgsql security definer set search_path=public as $$
declare uid uuid; adm boolean; a appointments; old_a appointments; e uuid; title text; msg text; admin_uid uuid; begin
 uid:=require_active(); adm:=is_admin();
 -- Same lock ordering as calendar edits and reminder delivery.
 perform pg_advisory_xact_lock(7281901);
 select * into a from appointments where id=p_id for update;
 if not found or (not adm and a.user_id<>uid) then raise exception 'Appointment not found' using errcode='42501'; end if;
 old_a:=a;
 if not adm and p_action<>'cancel' then raise exception 'Administrator access required' using errcode='42501'; end if;
 if p_action='approve' then
  if a.status<>'Pending' then raise exception 'Only pending requests can be approved'; end if;
 elsif p_action='reschedule' then
  if a.status<>'Approved' or a.scheduled_start_utc<=now() then raise exception 'Only future approved appointments can be changed'; end if;
 elsif p_action='reject' then
  if a.status<>'Pending' or coalesce(length(trim(p_reason)),0)=0 then raise exception 'Pending request and rejection reason required'; end if;
  a.status:='Rejected'; a.rejection_reason:=trim(p_reason); a.closed_at:=now();
 elsif p_action='cancel' then
  if adm then
   if a.status<>'Approved' or a.scheduled_start_utc<=now() or coalesce(length(trim(p_reason)),0)=0 then raise exception 'Admin cancellation requires a future approved appointment and reason'; end if;
  elsif not(a.status='Pending' or (a.status='Approved' and a.scheduled_start_utc>now())) then raise exception 'This appointment can no longer be cancelled'; end if;
  a.status:='Cancelled'; a.cancellation_reason:=case when adm then trim(p_reason) else 'Cancelled by user' end; a.closed_at:=now();
 elsif p_action in ('complete','no_show') then
  if a.status<>'Approved' or a.scheduled_start_utc>now() or (p_action='complete' and a.scheduled_start_utc=now()) then raise exception 'Appointment has not started or is already closed'; end if;
  a.status:=case when p_action='complete' then 'Completed'::appointment_status else 'No Show'::appointment_status end; a.closed_at:=now();
 else raise exception 'Unknown action'; end if;
 if p_action in ('approve','reschedule') then
  perform validate_schedule(p_start,p_duration,p_type,p_location);
  a.status:='Approved'; a.scheduled_start_utc:=p_start; a.scheduled_end_utc:=p_start+make_interval(mins=>p_duration); a.duration_minutes:=p_duration;
  a.meeting_type:=p_type; a.physical_address:=case when p_type='Physical' then trim(p_location) end; a.meeting_url:=case when p_type='Online' then trim(p_location) end; a.schedule_version:=a.schedule_version+1;
 end if;
 update appointments set status=a.status,scheduled_start_utc=a.scheduled_start_utc,scheduled_end_utc=a.scheduled_end_utc,duration_minutes=a.duration_minutes,meeting_type=a.meeting_type,physical_address=a.physical_address,meeting_url=a.meeting_url,rejection_reason=a.rejection_reason,cancellation_reason=a.cancellation_reason,closed_at=a.closed_at,schedule_version=a.schedule_version where id=a.id;
 insert into appointment_events(appointment_id,actor_id,event_type,old_value,new_value) values(a.id,uid,p_action,to_jsonb(old_a)-'purpose',to_jsonb(a)-'purpose') returning id into e;
 if adm then insert into admin_audit_logs(admin_id,action,target_type,target_id) values(uid,p_action,'appointment',a.id); end if;
 title:=case when p_action='reschedule' then 'Appointment updated' else 'Appointment '||lower(a.status::text) end;
 msg:=a.reference_number||' — '||a.subject||'. '||case when a.status='Approved' then to_char(a.scheduled_start_utc at time zone 'Asia/Karachi','DD Mon YYYY HH24:MI')||' PKT · '||a.duration_minutes||' minutes · '||coalesce(a.physical_address,a.meeting_url) when a.status='Rejected' then a.rejection_reason when a.status='Cancelled' then a.cancellation_reason else a.status::text end;
 perform queue_notice(a.user_id,a.id,e,p_action,title,msg,adm);
 if not adm then select user_id into admin_uid from profiles where role='Admin'; if admin_uid is not null then perform queue_notice(admin_uid,a.id,e,p_action,'User cancelled appointment',msg); end if; end if;
 perform refresh_reminders(a.id);
 return a;
end $$;

create function public.update_profile(p_name text,p_phone text) returns void language plpgsql security definer set search_path=public as $$ begin perform require_active(); update profiles set full_name=trim(p_name),phone=p_phone,updated_at=now() where user_id=auth.uid(); end $$;
create function public.notification_action(p_action text,p_id uuid default null) returns void language plpgsql security definer set search_path=public as $$ begin
 perform require_active();
 if p_action='read' then update notifications set read_at=now() where id=p_id and recipient_id=auth.uid();
 elsif p_action='unread' then update notifications set read_at=null where id=p_id and recipient_id=auth.uid();
 elsif p_action='delete' then update notifications set deleted_at=now() where id=p_id and recipient_id=auth.uid();
 elsif p_action='clear' then update notifications set deleted_at=now() where recipient_id=auth.uid();
 elsif p_action='read_all' then update notifications set read_at=now() where recipient_id=auth.uid() and deleted_at is null;
 else raise exception 'Unknown action'; end if;
end $$;
create function public.register_device(p_token text,p_device text) returns void language plpgsql security definer set search_path=public as $$ begin
 perform require_active(); if p_token !~ '^(ExponentPushToken|ExpoPushToken)\[.+\]$' then raise exception 'Invalid push token'; end if;
 insert into device_tokens(user_id,expo_push_token,device_info) values(auth.uid(),p_token,p_device) on conflict(expo_push_token) do update set user_id=auth.uid(),active=true,device_info=p_device;
end $$;
create function public.unregister_device(p_token text) returns void language plpgsql security definer set search_path=public as $$ begin update device_tokens set active=false where user_id=auth.uid() and expo_push_token=p_token; end $$;
create function public.request_deletion(p_reason text) returns void language plpgsql security definer set search_path=public as $$ begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 insert into deletion_requests(user_id,email,reason) select user_id,email,left(p_reason,2000) from profiles where user_id=auth.uid() on conflict(user_id) where status='Pending' do update set reason=excluded.reason;
end $$;

create function public.save_availability(p_rules jsonb,p_breaks jsonb,p_blocks jsonb) returns void language plpgsql security definer set search_path=public as $$
declare uid uuid; begin
 uid:=require_admin(); perform pg_advisory_xact_lock(7281901);
 if jsonb_array_length(p_rules)<>7 then raise exception 'Provide all seven weekdays'; end if;
 delete from availability_rules; insert into availability_rules select weekday,is_workday,start_local,end_local from jsonb_to_recordset(p_rules) as x(weekday integer,is_workday boolean,start_local time,end_local time);
 delete from availability_breaks; insert into availability_breaks(weekday,local_date,start_local,end_local) select weekday,local_date,start_local,end_local from jsonb_to_recordset(p_breaks) as x(weekday integer,local_date date,start_local time,end_local time);
 delete from blocked_dates; insert into blocked_dates(local_date,type,description) select local_date,type,coalesce(description,'') from jsonb_to_recordset(p_blocks) as x(local_date date,type text,description text);
 insert into admin_audit_logs(admin_id,action,target_type,metadata) values(uid,'availability_updated','calendar',jsonb_build_object('rules',p_rules,'breaks',p_breaks,'blocks',p_blocks));
end $$;
create function public.admin_user_status(p_user uuid,p_status text) returns void language plpgsql security definer set search_path=public as $$ declare uid uuid; begin
 uid:=require_admin(); perform pg_advisory_xact_lock(hashtextextended(p_user::text,0)); if p_user=uid or p_status not in ('Active','Suspended') then raise exception 'Invalid account action'; end if;
 update profiles set account_status=p_status,updated_at=now() where user_id=p_user and role='User' and account_status<>'Deleted';
 if not found then raise exception 'User not found'; end if;
 insert into admin_audit_logs(admin_id,action,target_type,target_id) values(uid,p_status,'user',p_user);
end $$;
create function public.admin_delete_user(p_user uuid,p_confirmation text) returns void language plpgsql security definer set search_path=public,auth as $$
declare uid uuid; p public.profiles; days integer; begin
 uid:=public.require_admin(); perform pg_advisory_xact_lock(hashtextextended(p_user::text,0)); select * into p from public.profiles where user_id=p_user for update;
 if not found or p.role<>'User' or p.account_status='Deleted' or p_confirmation<>'DELETE '||p.email then raise exception 'Type DELETE followed by the account email'; end if;
 if exists(select 1 from public.appointments where user_id=p_user and status in ('Pending','Approved')) then raise exception 'Resolve active appointments before deleting this account'; end if;
 select retention_days into days from public.system_settings;
 if exists(select 1 from public.appointments where user_id=p_user and closed_at>now()-make_interval(days=>days)) then raise exception 'Configured retention period has not elapsed'; end if;
 -- Retain de-identified appointment/audit records; remove auth identity and personal content.
 update public.appointments set subject='Deleted account appointment',purpose='Removed on account deletion',physical_address=null,meeting_url=null,rejection_reason=null,cancellation_reason=null where user_id=p_user;
 update public.appointment_events set old_value=null,new_value=null where appointment_id in(select id from public.appointments where user_id=p_user);
 delete from public.delivery_jobs where recipient_id=p_user;
 delete from public.notifications where recipient_id=p_user or appointment_id in(select id from public.appointments where user_id=p_user);
 delete from public.device_tokens where user_id=p_user;
 update public.deletion_requests set email='deleted',reason='',status='Resolved' where user_id=p_user;
 update public.profiles set full_name='Deleted user',email=p_user::text||'@deleted.invalid',phone='+10000000000',account_status='Deleted',updated_at=now() where user_id=p_user;
 -- Profiles intentionally survive identity deletion via FK removal below.
 delete from auth.users where id=p_user;
 insert into public.admin_audit_logs(admin_id,action,target_type,target_id,metadata) values(uid,'account_deleted','user',p_user,jsonb_build_object('retention_days',days));
end $$;
alter table public.profiles drop constraint profiles_user_id_fkey;
-- Identity inserts still originate only from the Auth trigger; clients cannot insert profiles.
create function public.save_settings(p_duration integer,p_retention integer) returns void language plpgsql security definer set search_path=public as $$ begin
 perform require_admin(); update system_settings set max_duration_minutes=p_duration,retention_days=p_retention;
 insert into admin_audit_logs(admin_id,action,target_type,metadata) values(auth.uid(),'settings_updated','settings',jsonb_build_object('max_duration_minutes',p_duration,'retention_days',p_retention));
end $$;

-- Default function privileges are PUBLIC EXECUTE: remove those explicitly.
revoke execute on all functions in schema public from public,anon,authenticated;
grant execute on function public.is_active(),public.is_admin() to authenticated;
grant execute on function public.create_appointment(text,text,uuid),public.appointment_action(uuid,text,text,timestamptz,integer,text,text),public.update_profile(text,text),public.notification_action(text,uuid),public.register_device(text,text),public.unregister_device(text),public.request_deletion(text),public.save_availability(jsonb,jsonb,jsonb),public.admin_user_status(uuid,text),public.admin_delete_user(uuid,text),public.save_settings(integer,integer) to authenticated;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;
