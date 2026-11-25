-- filters-for-shop 007: a per-group "show counts" switch.
--
-- The grid block's own "Show counts" setting still decides for the whole panel;
-- this lets one group opt out beneath it. Wanted first for delivery groups,
-- where "Within 6 working days (183)" reads as a count of something it is not.
-- Default true, so every existing group keeps exactly what it showed.
-- Idempotent; this file never edits 001-006.

ALTER TABLE "flt_groups" ADD COLUMN IF NOT EXISTS "show_counts" BOOLEAN NOT NULL DEFAULT true;
