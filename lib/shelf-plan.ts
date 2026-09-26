// The arithmetic behind reading a whole shelf through a list that hands it over
// 500 at a time: which pages to ask for, and how to put the answers back
// together. Pure, and in a file of its own with no database behind it, because
// this is the part that silently drops products when it is wrong - the exact
// failure lib/shelf.ts exists to end.

// The most listings one on-demand filter grid is built over.
//
// Not a paging limit - on-demand renders a page of cards whatever the shelf
// holds. What grows with the shelf is the filter matrix every shopper downloads,
// because filtering happens in the browser: measured on live Deskwell's /shop
// (2026-09-26), 434 listings came to about 340 KB of it, so roughly 0.8 KB a
// listing. Five thousand is about 4 MB, which is where filtering in the browser
// stops being the right design rather than where it stops working. It is also
// comfortably under what Postgres will bind in the id lists the matching and
// category queries build, which top out in the low tens of thousands.
export const FLT_SHELF_CEILING = 5000

/** How much of the shelf to read, and which further pages of `perPage` that
 *  takes, given the first page's reported `total`.
 *
 *  `want` is the caller's ceiling and `total` is what the scope really holds;
 *  the shelf is the smaller of the two. Page 1 has already been read, so the
 *  pages returned start at 2. */
export function planShelfPages(want: number, total: number, perPage: number): { reach: number; pages: number[] } {
  const size = Math.max(1, Math.floor(perPage) || 1)
  const reach = Math.max(0, Math.min(Math.floor(want) || 0, Math.floor(total) || 0))
  const last = Math.ceil(reach / size)
  const pages: number[] = []
  for (let page = 2; page <= last; page++) pages.push(page)
  return { reach, pages }
}

/** The pages stitched back into one shelf, in page order, cut to `reach`.
 *
 *  Duplicates are dropped by id, first sighting kept. The pages are separate
 *  OFFSET queries, so a product added between two of them pushes the next page
 *  along by one and repeats a product at the seam; showing it twice would put
 *  two identical cards side by side. The opposite race - a product deleted
 *  between pages - skips one at the seam, which the next render puts right. */
export function mergeShelfPages<T extends { id: string }>(pages: readonly (readonly T[])[], reach: number): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const page of pages) {
    for (const item of page) {
      if (seen.has(item.id)) continue
      seen.add(item.id)
      out.push(item)
    }
  }
  return out.slice(0, Math.max(0, reach))
}
