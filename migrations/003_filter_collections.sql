-- filters-for-shop 003: filter collections - SEO landing pages built out of the
-- filters that already exist.
--
-- A filter collection is "Green Office Chairs": the Office Chairs category page,
-- arrived at with Colour=Green already ticked, but carrying its own address,
-- its own page title and meta description, and its own designed intro. The
-- filters themselves are untouched - a collection only names a starting
-- selection, so a filter added to Colour tomorrow appears on every collection
-- built on Colour without anyone revisiting them.
-- All DDL idempotent; this file never edits 001 or 002.

CREATE TABLE IF NOT EXISTS "flt_collections" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  -- What the page calls itself: the H1, and the tab title when no meta title is
  -- given. "Green Office Chairs".
  "name" TEXT NOT NULL,
  -- The bare top-level address the page answers at: /green-office-chairs. Bare
  -- rather than prefixed because that is where this platform already puts
  -- products and posts, and because it is the address worth ranking.
  "slug" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT' CHECK ("status" IN ('DRAFT', 'PUBLISHED')),
  -- Which products the page starts from, before any filter is applied. The three
  -- named sources mirror the Filter Grid block's own three; ALL is the whole
  -- catalogue, for a page cut purely by filters ("Everything in Green").
  "source_type" TEXT NOT NULL DEFAULT 'CATEGORY' CHECK ("source_type" IN ('CATEGORY', 'COLLECTION', 'TAG', 'ALL')),
  -- The shop category/collection/tag slug the source names. NULL on ALL.
  --
  -- Deliberately the slug and not a foreign key: shop owns those tables, and a
  -- dependent module has no business putting a constraint on the module it
  -- depends on. A renamed category leaves the page pointing at nothing, which
  -- the admin screen shows as a warning rather than the database refusing a
  -- rename it should never have had a say in.
  "source_slug" TEXT,
  -- The one-line blurb under the heading. The long version is the designed
  -- intro below.
  "short_description" TEXT,
  -- The page's designed intro, built in the full-screen builder. Same shape and
  -- same builder as a category's designed description.
  "intro_puck" JSONB,
  "meta_title" TEXT,
  "meta_description" TEXT,
  -- Social share image, held as a media url (the media hooks in
  -- lib/media-reference-rewriter.ts keep it pointing at the right blob).
  "og_image" TEXT,
  -- A page built for a search engine that should not be indexed is a real case:
  -- a seasonal cut, or one built to be linked to from a campaign only.
  "noindex" BOOLEAN NOT NULL DEFAULT false,
  "position" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "flt_collections_slug_key" UNIQUE ("slug")
);

-- Which filters arrive ticked. A real reference this time: these rows are this
-- module's own, so a filter deleted in the admin takes its preselection with it
-- rather than leaving a page selecting a filter that no longer exists.
CREATE TABLE IF NOT EXISTS "flt_collection_filters" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "collection_id" TEXT NOT NULL REFERENCES "flt_collections"("id") ON DELETE CASCADE,
  "filter_id" TEXT NOT NULL REFERENCES "flt_filters"("id") ON DELETE CASCADE,
  "position" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "flt_collection_filters_unique" UNIQUE ("collection_id", "filter_id")
);
CREATE INDEX IF NOT EXISTS "flt_collection_filters_collection_id_idx" ON "flt_collection_filters"("collection_id");
CREATE INDEX IF NOT EXISTS "flt_collection_filters_filter_id_idx" ON "flt_collection_filters"("filter_id");
