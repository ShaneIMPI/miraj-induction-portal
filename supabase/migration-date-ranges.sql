-- ============================================================
-- Migration: build-up / event / breakdown date ranges
-- ============================================================
-- Run this once in Supabase SQL Editor (Project > SQL Editor > New query)
-- on your EXISTING project. Safe to re-run.
--
-- Replaces the old single "event_date" field with three proper date
-- ranges, matching how event logistics actually work:
--   Build Up Dates  — build_up_start / build_up_end
--   Event Dates     — event_start / event_end
--   Breakdown Dates — breakdown_start / breakdown_end
--
-- The old event_date column is left in place untouched (nothing reads
-- or writes it anymore, so it's safe to ignore or drop later yourself
-- if you want to tidy up).
-- ============================================================

alter table events add column if not exists build_up_start date;
alter table events add column if not exists build_up_end date;
alter table events add column if not exists event_start date;
alter table events add column if not exists event_end date;
alter table events add column if not exists breakdown_start date;
alter table events add column if not exists breakdown_end date;
