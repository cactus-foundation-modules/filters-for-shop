-- Adds shrunk copies of a filter's picture swatch.
--
-- A filter's `swatch` is often a photograph of a real material, borrowed from
-- whichever product already carried it - and those originals are big on purpose,
-- because the 3D module paints the very same file onto a model at true scale.
--
-- The storefront filter panel draws it as a 14px dot, or a 56px tile in a
-- picture-swatch group. On the live catalogue that meant ten filter dots costing
-- four megabytes between them, every one of the pictures 1395 x 1395.
--
-- `swatch_small` (400px) and `swatch_tiny` (128px) hold the urls of copies made
-- by core's resizer. The panel prefers the tiny one and falls back through the
-- small copy to the original, so a filter with neither draws exactly what it
-- drew before. TEXT, like `swatch`: it is a url, and the url is the whole fact.
ALTER TABLE "flt_filters" ADD COLUMN IF NOT EXISTS "swatch_small" TEXT;
ALTER TABLE "flt_filters" ADD COLUMN IF NOT EXISTS "swatch_tiny" TEXT;
