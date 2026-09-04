// Where a filtered card sends the click, spelled as option parameters rather
// than as a variation's own address.
//
// A card used to link to the representative variation's hidden child product,
// which shop-variations aliases to the parent page opened on THAT WHOLE
// combination. Answering one question - "show me the oak ones" - therefore
// arrived on the product page with every other option answered too, by a
// variation the shopper never chose. Ticking one filter is not a decision about
// the other five.
//
// So the link carries only what was actually ticked. shop-variations reads a
// product page's option parameters back into picks (its lib/url-selection.ts):
// one parameter per option, named after the option slugified, valued with the
// option value's own slug - `?seat-colour=oxford-blue&finish=oak`. Options with
// no parameter stay unchosen, which is exactly the wanted behaviour.
//
// Spelled out here rather than imported from shop-variations because the two
// modules share TABLES, not code: this one already reads the option and value
// rows straight out of SQL, and a cross-module code import is not a seam either
// module offers. Keep the two spellings in step - a mismatch shows up as a
// parameter the product page quietly ignores.

/** An option's parameter name: lowercase, accents folded to bare letters,
 *  everything else collapsed to hyphens. Mirrors optionParamKey in
 *  shop-variations/lib/url-selection.ts. */
export function optionParamKey(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** The `key=value` fragment that picks one option value, or null where either
 *  half is missing - an option named entirely in punctuation, a value with no
 *  slug. Null rather than a guess: a fragment the product page cannot resolve
 *  is worse than no fragment at all. */
export function optionParamFragment(optionName: string | null, valueSlug: string | null): string | null {
  const key = optionParamKey(optionName ?? '')
  if (!key || !valueSlug) return null
  return `${encodeURIComponent(key)}=${encodeURIComponent(valueSlug)}`
}

/**
 * A card's href with the ticked options' fragments on it.
 *
 * Nulls (a ticked filter that resolves no option value - a price band, a spec
 * stamped on the listing) are dropped, and the first fragment for a given
 * parameter wins, so two ticks that slugify to the same option name cannot
 * write the parameter twice. Nothing to add means the href is returned exactly
 * as it came in, so an unfiltered card keeps the address the server rendered.
 */
export function withOptionParams(href: string, fragments: ReadonlyArray<string | null | undefined>): string {
  const seen = new Set<string>()
  const wanted: string[] = []
  for (const fragment of fragments) {
    if (!fragment) continue
    const key = fragment.slice(0, fragment.indexOf('='))
    if (seen.has(key)) continue
    seen.add(key)
    wanted.push(fragment)
  }
  if (wanted.length === 0) return href
  const query = wanted.join('&')
  // A card href is a plain product address today, but it costs nothing to be
  // right if it ever carries a parameter of its own.
  const [base, hash = ''] = splitHash(href)
  return `${base}${base.includes('?') ? '&' : '?'}${query}${hash}`
}

function splitHash(href: string): [string, string?] {
  const at = href.indexOf('#')
  return at < 0 ? [href] : [href.slice(0, at), href.slice(at)]
}
