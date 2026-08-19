import { prisma } from '@/lib/db/prisma'
import type { MediaReferenceChange } from '@/lib/media/reference-rewriters'

// Provider for the core.media-reference-rewriters extension point.
//
// A filter can show a colour swatch, and that swatch is held here as the media
// item's url rather than its id, so a blob that moves takes the picture out of
// the shop's filter bar without anything reporting it.
export async function filtersMediaReferenceRewriter(change: MediaReferenceChange): Promise<void> {
  const { oldUrl, newUrl } = change
  if (!oldUrl || oldUrl === newUrl) return

  await prisma.$executeRaw`
    UPDATE "flt_filters" SET "swatch" = ${newUrl} WHERE "swatch" = ${oldUrl}
  `
}
