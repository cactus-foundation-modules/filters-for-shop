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

/**
 * Make (or decline to make) both shrunk copies of the picture at `swatchUrl`.
 *
 * Either may come back null - an external host, a format not worth shrinking, a
 * picture already small enough - which is a fine answer: the panel falls back to
 * the next size up, exactly as it did before copies existed.
 */
export async function generateSwatchCopies(swatchUrl: string, userId?: string): Promise<SwatchCopies> {
  const made = await generateImageRenditions(
    swatchUrl,
    [
      { maxPx: SWATCH_SMALL_MAX_PX, suffix: 'small' },
      { maxPx: SWATCH_TINY_MAX_PX, suffix: 'tiny' },
    ],
    { worthwhileBytes: SWATCH_RENDITION_WORTHWHILE_BYTES, userId },
  )
  return { small: made.small ?? null, tiny: made.tiny ?? null }
}
