-- filters-for-shop 002: price-band groups and attribute-sourced rules.
--
-- Two new match sources join the original variation-option rules:
--   * ATTRIBUTE rules match product-attributes-for-shop values (pat_ tables),
--     read at both product level and variant-child level - specs like
--     "Recommended Usage: 24 hours" or "Shape: Wave" live there, not on
--     variation options.
--   * PRICE groups hold band filters (price_min <= price < price_max) matched
--     against the product's displayed from-price, so they work for products
--     with no variations at all.
-- All DDL idempotent; this file never edits 001.

ALTER TABLE "flt_groups" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'VALUES';
DO $$ BEGIN
  ALTER TABLE "flt_groups" ADD CONSTRAINT "flt_groups_kind_check" CHECK ("kind" IN ('VALUES', 'PRICE'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Band bounds live on the filter itself: label "£100 - £250", min 100, max 250.
-- Min NULL = open start (Under £100), max NULL = open end (Over £1000). Max is
-- exclusive so adjacent bands never double-claim a product on the boundary.
ALTER TABLE "flt_filters" ADD COLUMN IF NOT EXISTS "price_min" NUMERIC;
ALTER TABLE "flt_filters" ADD COLUMN IF NOT EXISTS "price_max" NUMERIC;

-- OPTION = shop-variations option values (the original behaviour, hence the
-- default); ATTRIBUTE = product-attributes values, matched by the same
-- (name, label) pairing - option_name then holds the attribute's name.
ALTER TABLE "flt_filter_rules" ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'OPTION';
DO $$ BEGIN
  ALTER TABLE "flt_filter_rules" ADD CONSTRAINT "flt_filter_rules_source_check" CHECK ("source" IN ('OPTION', 'ATTRIBUTE'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Uniqueness now includes the source: "Finish" exists as both an option and a
-- spec attribute, and a filter may legitimately match both.
ALTER TABLE "flt_filter_rules" DROP CONSTRAINT IF EXISTS "flt_filter_rules_unique";
DO $$ BEGIN
  ALTER TABLE "flt_filter_rules" ADD CONSTRAINT "flt_filter_rules_source_unique" UNIQUE ("filter_id", "source", "option_name", "value_label");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
