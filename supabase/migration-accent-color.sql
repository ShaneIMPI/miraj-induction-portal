-- ============================================================
-- Migration: add accent colour for two-colour event branding
-- ============================================================
-- Run this once in Supabase SQL Editor (Project > SQL Editor > New query)
-- on your EXISTING project. Safe to re-run.
--
-- Events already have brand_color (used as the "Primary" colour —
-- header, text, event card border, certificate border/title).
-- This adds brand_color_accent (the "Accent" colour — buttons, CTAs,
-- interactive hover states), so each event can carry the two key
-- colours from its own marketing brand, e.g.:
--   Primary (brand_color):        near-black navy  #0F1214
--   Accent  (brand_color_accent): orange            #FD843B
-- ============================================================

alter table events add column if not exists brand_color_accent text;
