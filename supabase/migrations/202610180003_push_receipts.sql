-- Provider receipts are private operational data. Ticket acceptance is not
-- equivalent to successful handoff to Apple/Google push services.
create table public.push_receipts (
 ticket_id text primary key,
 job_id uuid not null references public.delivery_jobs(id) on delete cascade,
 expo_push_token text not null,
 status text not null default 'Pending' check(status in ('Pending','Delivered','Failed','Unknown')),
 created_at timestamptz not null default now(),
 checked_at timestamptz,
 last_error text
);
create index push_receipts_due on public.push_receipts(created_at) where status='Pending';
alter table public.push_receipts enable row level security;
revoke all on public.push_receipts from public,anon,authenticated;
grant all on public.push_receipts to service_role;
