-- ============================================================
-- Migration: allow "contractor" as a sponsor_type value
-- ============================================================
-- Run this once in Supabase SQL Editor (Project > SQL Editor > New query)
-- on your EXISTING project. Safe to run even if you're not sure whether
-- it's needed already.
--
-- Without this, selecting "Contractor" on the induction form will fail
-- with a database error when the person tries to submit, because the
-- old constraint only allowed: service_provider, sponsor, client_staff, other.
--
-- This version looks up each existing constraint by table/column instead
-- of assuming its exact name, so it works regardless of how Postgres/
-- Supabase auto-named it originally.
-- ============================================================

do $$
declare
  cname text;
begin
  select con.conname into cname
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_attribute att on att.attrelid = rel.oid and att.attnum = any(con.conkey)
  where rel.relname = 'groups' and att.attname = 'sponsor_type' and con.contype = 'c';

  if cname is not null then
    execute format('alter table groups drop constraint %I', cname);
  end if;

  alter table groups add constraint groups_sponsor_type_check
    check (sponsor_type in ('service_provider','contractor','sponsor','client_staff','other'));
end $$;

do $$
declare
  cname text;
begin
  select con.conname into cname
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_attribute att on att.attrelid = rel.oid and att.attnum = any(con.conkey)
  where rel.relname = 'inductees' and att.attname = 'sponsor_type' and con.contype = 'c';

  if cname is not null then
    execute format('alter table inductees drop constraint %I', cname);
  end if;

  alter table inductees add constraint inductees_sponsor_type_check
    check (sponsor_type in ('service_provider','contractor','sponsor','client_staff','other'));
end $$;
