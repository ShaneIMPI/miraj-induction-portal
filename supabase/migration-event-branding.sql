-- ============================================================
-- Migration: event branding (colour + logo)
-- ============================================================
-- Run this once in Supabase SQL Editor (Project > SQL Editor > New query)
-- on your EXISTING project. Safe to run even if you're not sure whether
-- some of it is already done — every statement here is written to be
-- safe to re-run.
--
-- What this adds:
--   1. Two new columns on the events table: brand_color, logo_url
--   2. A public Storage bucket called "event-logos" for the uploaded
--      logo files, with policies so:
--        - anyone can VIEW a logo (needed for the public event-selection
--          page and certificates, which aren't logged in)
--        - only a logged-in admin can UPLOAD/CHANGE/DELETE a logo
-- ============================================================

alter table events add column if not exists brand_color text;
alter table events add column if not exists logo_url text;

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
