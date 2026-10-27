-- Pakistan mobile and landline validation. Apply once to an existing Meetly project.
-- Phone patterns from libphonenumber-js 1.13.15 max metadata.
-- Existing records are retained; NOT VALID constraints enforce new writes without scanning old data.
create or replace function public.normalize_pakistan_phone(value text) returns text
language plpgsql immutable set search_path=public as $$
declare p text;
begin
 p:=translate(trim(value),'٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹','01234567890123456789');
 if p is null or length(p)>32 or p !~ '^\+?[0-9 ()-]*$' then return null; end if;
 p:=regexp_replace(p,'[ ()-]','','g');
 if p like '0092%' then p:='+'||substring(p from 3);
 elsif p like '0%' then p:='+92'||substring(p from 2);
 elsif p like '92%' then p:='+'||p; end if;
 if p ~ '^\+92(?:(?:(?:21|42)[2-9]|58[126])\d{7}|(?:2[25]|4[0146-9]|5[1-35-7]|6[1-8]|7[14]|8[16]|91)[2-9]\d{6,7}|(?:2(?:3[2358]|4[2-4]|9[2-8])|45[3479]|54[2-467]|60[468]|72[236]|8(?:2[2-689]|3[23578]|4[3478]|5[2356])|9(?:2[2-8]|3[27-9]|4[2-6]|6[3569]|9[25-8]))[2-9]\d{5,6}|3(?:[0-247]\d|3[0-79]|55|64)\d{7})$' then return p; end if;
 return null;
end $$;

create or replace function public.validate_profile_contact() returns trigger
language plpgsql set search_path=public as $$
begin
 if new.account_status='Deleted' then return new; end if;
 new.full_name:=trim(new.full_name);
 if new.full_name is null or length(new.full_name) not between 1 and 120
    or new.full_name !~ '[[:alpha:]]' or new.full_name ~ '[[:cntrl:]]'
    or new.full_name !~ '^[[:alpha:][:space:].’''-]+$' then
  raise exception 'Enter a full name using letters, spaces, apostrophes or hyphens (maximum 120 characters).';
 end if;
 new.phone:=public.normalize_pakistan_phone(new.phone);
 if new.phone is null then raise exception 'Enter a valid Pakistan mobile or landline number, e.g. 03001234567 or 02134567890.'; end if;
 return new;
end $$;
create trigger validate_profile_contact before insert or update of full_name,phone on public.profiles
for each row execute function public.validate_profile_contact();

alter table public.profiles add constraint pakistan_phone_required
 check(account_status='Deleted' or (public.normalize_pakistan_phone(phone) is not null and phone=public.normalize_pakistan_phone(phone))) not valid;
alter table public.appointments add constraint appointment_text_limits
 check(coalesce(length(physical_address),0)<=2000 and coalesce(length(meeting_url),0)<=2000
 and coalesce(length(rejection_reason),0)<=2000 and coalesce(length(cancellation_reason),0)<=2000) not valid;
alter table public.blocked_dates add constraint blocked_description_limit check(length(description)<=500) not valid;
revoke all on function public.validate_profile_contact() from public,anon,authenticated;
