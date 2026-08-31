-- ============================================================
-- Miraj Media Safety Induction Portal — Supabase Schema
-- ============================================================
-- Run this in Supabase SQL Editor (Project > SQL Editor > New query)
-- IMPORTANT: After running this, go to Table Editor and manually
-- DISABLE Row Level Security on every table below, OR run the
-- disable statements included at the bottom of this file.
-- (RLS is ON by default on new tables and will silently return
-- zero rows to the app if left enabled without matching policies.)
-- ============================================================

-- Groups (for group inductions — e.g. a crew arriving under one sponsor/service provider)
create table if not exists groups (
  id uuid primary key default gen_random_uuid(),
  group_name text not null,
  sponsor_type text not null check (sponsor_type in ('service_provider','contractor','sponsor','client_staff','other')),
  sponsor_company text not null,
  site_or_event text,
  country text,               -- e.g. Bahrain, Saudi Arabia, Qatar, UAE, Nigeria, Kenya, Ghana
  induction_language text not null default 'en',
  created_at timestamptz not null default now()
);

-- Inductees (individual or member of a group)
create table if not exists inductees (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references groups(id) on delete set null,   -- null = individual induction
  full_name text not null,
  id_or_passport_number text not null,
  nationality text,
  company_or_sponsor text not null,
  sponsor_type text not null check (sponsor_type in ('service_provider','contractor','sponsor','client_staff','other')),
  role_or_trade text,
  contact_number text,
  site_or_event text,
  country text,
  induction_language text not null default 'en',
  acknowledged_topics jsonb,          -- array of topic ids the inductee ticked off
  signature_data text,                -- base64 PNG of signature capture
  induction_date timestamptz not null default now(),
  status text not null default 'completed' check (status in ('completed','revoked')),
  created_at timestamptz not null default now()
);

-- Certificates (one per inductee, holds the QR verification token)
create table if not exists certificates (
  id uuid primary key default gen_random_uuid(),
  inductee_id uuid not null references inductees(id) on delete cascade,
  certificate_number text not null unique,   -- e.g. MM-2026-000123
  qr_token uuid not null default gen_random_uuid() unique,
  issued_at timestamptz not null default now(),
  valid boolean not null default true,
  verified_count integer not null default 0,
  last_verified_at timestamptz
);

-- Induction content/topics per language (lets admin edit wording without touching code)
create table if not exists induction_topics (
  id uuid primary key default gen_random_uuid(),
  topic_key text not null,            -- stable key shared across languages, e.g. 'ppe_requirements'
  language text not null,             -- 'en' | 'ar' | 'fr' | 'sw'
  sort_order integer not null default 0,
  title text not null,
  body text not null,
  active boolean not null default true
);

-- ============================================================
-- Events — each induction is now tied to a specific event, which
-- has a status (draft/active/completed) controlling whether it's
-- selectable on the public induction flow. Certificate numbers are
-- scoped per event via cert_sequence + the next_event_cert_sequence()
-- function below, so each event gets its own clean numbering run
-- (e.g. MM-DXB25-0001, MM-DXB25-0002...).
-- ============================================================
create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,     -- short code used in certificate numbers, e.g. 'DXB25'. Keep it short, uppercase, no spaces.
  status text not null default 'draft' check (status in ('draft','active','completed')),
  event_date date,               -- deprecated, kept for backward compatibility; use event_start/event_end below
  build_up_start date,
  build_up_end date,
  event_start date,
  event_end date,
  breakdown_start date,
  breakdown_end date,
  location text,
  country text,
  brand_color text,              -- hex primary colour e.g. '#0F1214' — header, text, event card border, certificate border/title
  brand_color_accent text,       -- hex accent colour e.g. '#FD843B' — buttons, CTAs, interactive hover states
  logo_url text,                 -- public URL of the event's logo in the 'event-logos' storage bucket
  cert_sequence integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_events_status on events(status);
alter table events disable row level security;

-- Storage bucket for per-event logos, uploaded from the admin panel when
-- adding/editing an event. Public bucket so the logo can be shown on the
-- public event-selection page and on generated certificates without auth.
-- Only authenticated (admin) users may upload/change/delete files in it.
insert into storage.buckets (id, name, public)
values ('event-logos', 'event-logos', true)
on conflict (id) do nothing;

drop policy if exists "Public read access for event logos" on storage.objects;
create policy "Public read access for event logos"
on storage.objects for select
using (bucket_id = 'event-logos');

drop policy if exists "Authenticated upload for event logos" on storage.objects;
create policy "Authenticated upload for event logos"
on storage.objects for insert
with check (bucket_id = 'event-logos' and auth.role() = 'authenticated');

drop policy if exists "Authenticated update for event logos" on storage.objects;
create policy "Authenticated update for event logos"
on storage.objects for update
using (bucket_id = 'event-logos' and auth.role() = 'authenticated');

drop policy if exists "Authenticated delete for event logos" on storage.objects;
create policy "Authenticated delete for event logos"
on storage.objects for delete
using (bucket_id = 'event-logos' and auth.role() = 'authenticated');

-- Atomically increments and returns the next certificate sequence
-- number for an event. Using a DB function (not read-then-write in
-- JS) avoids two people generating certificates at the same moment
-- from ever getting the same number.
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

-- Link existing tables to events. Nullable so this is safe to run
-- even with existing data — but the induction flow now requires an
-- event to be selected going forward, so new rows will always have one.
alter table groups add column if not exists event_id uuid references events(id);
alter table inductees add column if not exists event_id uuid references events(id);
alter table certificates add column if not exists event_id uuid references events(id);
create table if not exists admin_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  full_name text,
  created_at timestamptz not null default now()
);

-- Indexes
create index if not exists idx_inductees_group on inductees(group_id);
create index if not exists idx_certificates_token on certificates(qr_token);
create index if not exists idx_topics_lang on induction_topics(language, sort_order);

-- ============================================================
-- IMPORTANT — disable RLS so the static frontend (using the
-- anon/public key) can read and write. Do this for every table.
-- ============================================================
alter table groups disable row level security;
alter table inductees disable row level security;
alter table certificates disable row level security;
alter table induction_topics disable row level security;
alter table admin_users disable row level security;

-- ============================================================
-- Seed: starter induction topics (English) — placeholder content
-- carried over from the IMPI induction portal structure.
-- Replace/expand once Miraj Media confirms their own content.
-- ============================================================
insert into induction_topics (topic_key, language, sort_order, title, body) values
('welcome', 'en', 1, 'Welcome & Purpose', 'This induction ensures every person on site understands the safety rules, emergency procedures, and code of conduct before starting work.'),
('ppe_requirements', 'en', 2, 'Personal Protective Equipment (PPE)', 'Appropriate PPE must be worn at all times in designated areas. This may include hi-vis clothing, safety footwear, hard hats, and hearing protection depending on the site.'),
('emergency_procedures', 'en', 3, 'Emergency Procedures', 'In the event of an emergency, follow posted evacuation routes, proceed to the nearest assembly point, and await instructions from site marshals or emergency services.'),
('incident_reporting', 'en', 4, 'Incident & Hazard Reporting', 'All incidents, near-misses, and hazards must be reported immediately to your supervisor or the site safety officer.'),
('access_control', 'en', 5, 'Access Control & Site Rules', 'Only authorised personnel with valid accreditation may access restricted areas. Follow all signage and instructions from security and safety personnel.'),
('code_of_conduct', 'en', 6, 'Code of Conduct', 'All personnel are expected to behave professionally, respect fellow workers and the public, and comply with all lawful instructions from site management.')
on conflict do nothing;


-- ============================================================
-- Topic Quiz Questions — one comprehension check per induction
-- topic. Two answers, unlabelled to the user. Wrong answer flashes
-- red and blocks progress (must retry); correct answer flashes
-- green and unlocks the next topic. Each answer has its OWN image
-- (one shows the correct practice, one shows the incorrect practice).
-- topic_key + language together select the row shown for that
-- topic in the user's currently selected language.
-- ============================================================
create table if not exists topic_questions (
  id uuid primary key default gen_random_uuid(),
  topic_key text not null,                  -- matches induction_topics.topic_key
  language text not null,                   -- 'en' | 'ar' | 'fr' | 'sw'
  question_text text not null,
  correct_answer_text text not null,
  incorrect_answer_text text not null,
  correct_image_url text not null,          -- shows the CORRECT practice
  incorrect_image_url text not null,        -- shows the INCORRECT practice
  active boolean not null default true
);

create unique index if not exists idx_questions_topic_lang on topic_questions(topic_key, language);

alter table topic_questions disable row level security;
