-- ============================================================
-- DEBOUNCE FIX: Prevent double replies when user sends 2+ messages quickly
-- Run this in Supabase SQL Editor.
-- ============================================================
-- 1. Fix check_is_latest_message (return false when no row, add COALESCE)
-- 2. Increase effective debounce by re-checking: only respond if we're still
--    the latest AFTER the wait. Both executions check; only the one with
--    the newest message gets true.

CREATE OR REPLACE FUNCTION public.check_is_latest_message(
  p_manychat_id text,
  p_message_id integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Return true ONLY if p_message_id is the id of the most recent user message
  RETURN COALESCE((
    SELECT (c.id = p_message_id)
    FROM public.conversations c
    WHERE c.manychat_id = p_manychat_id
      AND c.role = 'user'
    ORDER BY c.created_at DESC
    LIMIT 1
  ), false);
EXCEPTION
  WHEN OTHERS THEN
    RETURN false;
END;
$$;
