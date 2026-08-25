import { generateImageRenditions } from '@/lib/media/renditions'
import {
  SWATCH_SMALL_MAX_PX,
  SWATCH_TINY_MAX_PX,
  SWATCH_RENDITION_WORTHWHILE_BYTES,
} from '@/lib/media/swatch-renditions'

// The two shrunk copies behind `swatch_small` and `swatch_tiny`.
//
// The resizing itself is core's (lib/media/renditions.ts), and the sizes are
// core's too, so this module, the attributes module and the variations module
// cannot drift apart on what "small" means. What is left here is the pair of
// jobs: a filter panel draws 14px dots and 56px tiles, which is the tiny copy's
// work, and the small copy is the fallback for anything drawn bigger.
export type SwatchCopies = { small: string | null; tiny: string | null }

/** Which copies a caller wants made. Both, unless it already has one. */
export type SwatchCopyName = 'small' | 'tiny'

const SIZES: Record<SwatchCopyName, number> = {
  small: SWATCH_SMALL_MAX_PX,
  tiny: SWATCH_TINY_MAX_PX,
}

/**
 * Make (or decline to make) shrunk copies of the picture at `swatchUrl`.
 *
 * `want` narrows it to the copies actually missing, which spares the download
 * and the encode for one this filter already has. The rest come back null, which
 * callers read as "leave what you had".
 *
 * Either may come back null anyway - an external host, a format not worth
 * shrinking, a picture already small enough - which is a fine answer: the panel
 * falls back to the next size up, exactly as it did before copies existed.
 */
export async function generateSwatchCopies(
  swatchUrl: string,
  opts?: { want?: SwatchCopyName[]; userId?: string },
): Promise<SwatchCopies> {
  const want = opts?.want ?? (['small', 'tiny'] as SwatchCopyName[])
  if (want.length === 0) return { small: null, tiny: null }
  const made = await generateImageRenditions(
    swatchUrl,
    want.map((name) => ({ maxPx: SIZES[name], suffix: name })),
    { worthwhileBytes: SWATCH_RENDITION_WORTHWHILE_BYTES, userId: opts?.userId },
  )
  return { small: made.small ?? null, tiny: made.tiny ?? null }
}
