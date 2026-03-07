-- ============================================================
-- Stock Proof Images - Storage bucket + stock_units column
-- Run in Supabase SQL Editor
-- ============================================================
-- Stores proof images uploaded when adding stock (e.g. from AI scan)
-- so you can compare IMEI from the real image to what the bot saved.
-- ============================================================

-- 1. Create storage bucket for stock proof images
-- (id, name, public) - file_size_limit/allowed_mime_types can be set in Dashboard if needed
INSERT INTO storage.buckets (id, name, public)
VALUES ('stock-proof-images', 'stock-proof-images', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Storage policies (allow uploads and reads)
-- Allow inserts (uploads) for the bucket
DROP POLICY IF EXISTS "Allow stock proof uploads" ON storage.objects;
CREATE POLICY "Allow stock proof uploads" ON storage.objects
  FOR INSERT TO public
  WITH CHECK (bucket_id = 'stock-proof-images');

-- Allow selects (reads) for the bucket
DROP POLICY IF EXISTS "Allow stock proof reads" ON storage.objects;
CREATE POLICY "Allow stock proof reads" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'stock-proof-images');

-- Allow deletes (e.g. when removing a stock unit)
DROP POLICY IF EXISTS "Allow stock proof deletes" ON storage.objects;
CREATE POLICY "Allow stock proof deletes" ON storage.objects
  FOR DELETE TO public
  USING (bucket_id = 'stock-proof-images');

-- 3. Add column to stock_units for proof image URLs
ALTER TABLE stock_units
  ADD COLUMN IF NOT EXISTS proof_image_urls text[] DEFAULT '{}';

COMMENT ON COLUMN stock_units.proof_image_urls IS 'Array of Supabase Storage URLs for proof images (IMEI photos) uploaded when adding stock.';
