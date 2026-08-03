-- filters-for-shop: initial schema.
-- All DDL is idempotent (IF NOT EXISTS / ON CONFLICT DO NOTHING). Later schema
-- changes ship as a NEW numbered file (002_*.sql, 003_*.sql, ...) - never edits
-- to this one: the migration ledger records this file as applied, so an edit
-- here would only ever reach fresh installs.

-- A filter group is one heading on the storefront filter panel: "Colour",
-- "Finish", "Width". Its slug doubles as the query-string parameter.
CREATE TABLE IF NOT EXISTS "flt_groups" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "control_type" TEXT NOT NULL DEFAULT 'SWATCH' CHECK ("control_type" IN ('CHECKBOX', 'SWATCH', 'IMAGE', 'DROPDOWN')),
  "position" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "flt_groups_slug_key" UNIQUE ("slug")
);

-- A filter is one tick inside a group: "Blue" inside "Colour". The swatch is a
-- hex colour for SWATCH groups or an image URL for IMAGE groups.
CREATE TABLE IF NOT EXISTS "flt_filters" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "group_id" TEXT NOT NULL REFERENCES "flt_groups"("id") ON DELETE CASCADE,
  "label" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "swatch" TEXT,
  "position" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "flt_filters_group_id_slug_key" UNIQUE ("group_id", "slug")
);
CREATE INDEX IF NOT EXISTS "flt_filters_group_id_idx" ON "flt_filters"("group_id");

-- What a filter actually matches: (option name, value label) pairs against the
-- shop-variations data. Options are per-product rows over there, so matching by
-- name and label is what makes one "Blue" cover "Stevia Blue" on every product
-- that offers it, present and future, with no per-product wiring.
CREATE TABLE IF NOT EXISTS "flt_filter_rules" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "filter_id" TEXT NOT NULL REFERENCES "flt_filters"("id") ON DELETE CASCADE,
  "option_name" TEXT NOT NULL,
  "value_label" TEXT NOT NULL,
  CONSTRAINT "flt_filter_rules_unique" UNIQUE ("filter_id", "option_name", "value_label")
);
CREATE INDEX IF NOT EXISTS "flt_filter_rules_filter_id_idx" ON "flt_filter_rules"("filter_id");

CREATE TABLE IF NOT EXISTS "flt_settings" (
  "id" TEXT PRIMARY KEY DEFAULT 'singleton' CHECK ("id" = 'singleton'),
  "hide_empty_filters" BOOLEAN NOT NULL DEFAULT true,
  "swap_card_images" BOOLEAN NOT NULL DEFAULT true,
  "preselect_on_click" BOOLEAN NOT NULL DEFAULT true,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "flt_settings" ("id") VALUES ('singleton') ON CONFLICT DO NOTHING;
