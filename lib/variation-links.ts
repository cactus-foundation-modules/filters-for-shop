// Where a card goes when the shopper has already answered the questions.
//
// A variation's own address, folded for the wire by internVariations and read
// back here. The fold is per product against the address its own variations
// share, because that is the scope the repetition actually has:
//
//   /brixworth-2-and-3-seater-office-sofa-2-seater-rivet-burnish-white
//   /brixworth-2-and-3-seater-office-sofa-2-seater-rivet-burnish-black
//
// Same trick as lib/swap-pack.ts, and deliberately its own small module: the
// swaps answer "one filter at a time" and these answer "the whole combination",
// and only one of them is what a click should follow.

/** product id -> [the address its variations share, one tail per combination]. */
export type FltVariationLinks = Record<string, [prefix: string, tails: string[]]>

/**
 * The address of one of a product's variations, by its index into the same
 * product's combination list.
 *
 * Null rather than a guess wherever the answer is not known outright: a shop
 * with no variations module ships no links at all, and an index past the end is
 * a caller and a payload that disagree. Both cases mean "link where you would
 * have linked anyway", which is the card's own href.
 */
export function variationHref(links: FltVariationLinks | undefined, productId: string, at: number): string | null {
  if (!links || at < 0) return null
  const entry = links[productId]
  if (!entry) return null
  const [prefix, tails] = entry
  const tail = tails[at]
  return tail === undefined ? null : prefix + tail
}
