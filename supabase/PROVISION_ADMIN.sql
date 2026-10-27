-- Run privately in the Supabase SQL Editor as the project owner.
-- First sign up on the website and verify that account's email.
-- Replace the email below. This script never creates or changes passwords.
begin;
do $$
declare
  admin_email text := 'REPLACE_WITH_YOUR_VERIFIED_EMAIL';
  target_id uuid;
begin
  perform pg_advisory_xact_lock(27102026);
  if admin_email = 'REPLACE_WITH_YOUR_VERIFIED_EMAIL' then
    raise exception 'Replace the email placeholder before running this script.';
  end if;
  select id into strict target_id from auth.users
    where lower(email) = lower(trim(admin_email)) and email_confirmed_at is not null;
  if not exists (select 1 from public.profiles where user_id=target_id and account_status='Active') then
    raise exception 'The verified account needs an active profile.';
  end if;
  if exists (select 1 from public.profiles where role='Admin' and user_id<>target_id) then
    raise exception 'An administrator already exists. No account was changed.';
  end if;
  update public.profiles set role='Admin' where user_id=target_id;
end $$;
select email,role,account_status from public.profiles where role='Admin';
commit;
