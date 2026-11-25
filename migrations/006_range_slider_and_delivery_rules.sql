-- filters-for-shop 006: a price range slider, and delivery-sourced rules.
--
--   * RANGE is a new control type for PRICE groups: the panel draws a two-handled
--     slider with min/max boxes instead of a tick per band. The group's band
--     filters stay as they are - a filter collection page that arrives with
--     "Under £200" ticked opens the slider on that band instead.
--   * DELIVERY is a new rule source, answered by whichever module publishes
--     delivery timing (Advanced Shipping today). Two names are used under it:
--     "Delivery service" (the value is a service's own label, so one filter can
--     stand for several services) and "Delivery lead time" (the value is a
--     working-day count, matched as "can arrive within this many").
-- All DDL idempotent; this file never edits 001-005.

ALTER TABLE "flt_groups" DROP CONSTRAINT IF EXISTS "flt_groups_control_type_check";
DO $$ BEGIN
  ALTER TABLE "flt_groups" ADD CONSTRAINT "flt_groups_control_type_check"
    CHECK ("control_type" IN ('CHECKBOX', 'SWATCH', 'IMAGE', 'DROPDOWN', 'RANGE'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "flt_filter_rules" DROP CONSTRAINT IF EXISTS "flt_filter_rules_source_check";
DO $$ BEGIN
  ALTER TABLE "flt_filter_rules" ADD CONSTRAINT "flt_filter_rules_source_check"
    CHECK ("source" IN ('OPTION', 'ATTRIBUTE', 'DELIVERY'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
