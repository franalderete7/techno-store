-- ============================================================
-- Add per-unit color to stock units
-- Run in Supabase SQL Editor
-- ============================================================

ALTER TABLE public.stock_units
  ADD COLUMN IF NOT EXISTS color text;

COMMENT ON COLUMN public.stock_units.color IS
  'Color of the physical stock unit. Can be filled manually or by AI image scan.';
