import { prisma } from '@/lib/db/prisma'
import type { MediaReferenceChange } from '@/lib/media/reference-rewriters'

// Provider for the core.media-reference-rewriters extension point.
//
// A filter can show a colour swatch, and that swatch is held here as the media
// item's url rather than its id, so a blob that moves takes the picture out of
// the shop's filter bar without anything reporting it. A filter collection page
// holds two more: its social share image, and every picture inside its designed
// intro document.
export async function filtersMediaReferenceRewriter(change: MediaReferenceChange): Promise<void> {
  const { oldUrl, newUrl, oldKey, newKey } = change

  // A needle is only worth swapping when it actually moved; '' reads as "nothing
  // to do for this pair", since replace() with an empty needle returns the
  // string untouched and the WHERE guards keep it from matching every row.
  const urlFrom = oldUrl && oldUrl !== newUrl ? oldUrl : ''
  const keyFrom = oldKey && oldKey !== newKey ? oldKey : ''
  if (!urlFrom && !keyFrom) return

  if (urlFrom) {
    await prisma.$executeRaw`
      UPDATE "flt_filters" SET "swatch" = ${newUrl} WHERE "swatch" = ${urlFrom}
    `
    // Each shrunk copy is its own library item with its own url, so a move or an
    // optimise of THOSE files has to land here the same way.
    await prisma.$executeRaw`
      UPDATE "flt_filters" SET "swatch_small" = ${newUrl} WHERE "swatch_small" = ${urlFrom}
    `
    await prisma.$executeRaw`
      UPDATE "flt_filters" SET "swatch_tiny" = ${newUrl} WHERE "swatch_tiny" = ${urlFrom}
    `
    await prisma.$executeRaw`
      UPDATE "flt_collections" SET "og_image" = ${newUrl} WHERE "og_image" = ${urlFrom}
    `
  }

  // The intro document is Puck JSON, so the swap happens inside the blob - and
  // in one statement rather than read-swap-write, exactly as core does for page
  // and layout content. Postgres holds the row for the duration of an UPDATE, so
  // two images on the same intro rewritten at the same time stack instead of the
  // second one putting the first one's dead url back.
  //
  // strpos rather than LIKE: these needles carry filenames, and an underscore in
  // a filename would be read as a wildcard.
  await prisma.$executeRaw`
    UPDATE "flt_collections"
    SET "intro_puck" = replace(replace("intro_puck"::text, ${urlFrom}, ${newUrl}), ${keyFrom}, ${newKey})::jsonb
    WHERE (${urlFrom} <> '' AND strpos("intro_puck"::text, ${urlFrom}) > 0)
       OR (${keyFrom} <> '' AND strpos("intro_puck"::text, ${keyFrom}) > 0)
  `
}
