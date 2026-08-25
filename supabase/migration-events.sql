-- ============================================================
-- Migration: Events feature
-- Run this ONCE in the SQL Editor on your existing Supabase project.
-- Safe to re-run (uses IF NOT EXISTS / OR REPLACE throughout).
-- ============================================================

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  status text not null default 'draft' check (status in ('draft','active','completed')),
  event_date date,
  location text,
  country text,
  cert_sequence integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_events_status on events(status);
alter table events disable row level security;

create or replace function next_event_cert_sequence(p_event_id uuid)
returns integer
language plpgsql
as $$
declare
  v_seq integer;
begin
  update events set cert_sequence = cert_sequence + 1
  where id = p_event_id
  returning cert_sequence into v_seq;
  return v_seq;
end;
$$;

alter table groups add column if not exists event_id uuid references events(id);
alter table inductees add column if not exists event_id uuid references events(id);
alter table certificates add column if not exists event_id uuid references events(id);

-- Reminder: this new `events` table needs RLS disabled (done above), same
-- as every other table in this project — it's a recurring Supabase default
-- that catches new tables specifically.
