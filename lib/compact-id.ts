// How an id is spelled on the filter grid's wire.
//
// Nearly every id the grid sends is a database uuid, and a uuid written the
// usual way is thirty-six characters of which four are hyphens and the rest are
// hex, four bits apiece. The same 128 bits fit in twenty-two characters of the
// url-safe base64 alphabet. On deskwell.co.uk's office-chairs category that is
// the difference between the grid's 1,170 ids costing 44 KB and costing 28 KB -
// and most of them are the source ids the card photo swaps point at, which no
// amount of interning can shrink because each one is different.
//
// Only a uuid in the form Postgres itself writes - lowercase, hyphenated - is
// folded, because only that form can be written back out exactly. Anything else
// (a synthetic `cat:` filter id, an uppercase uuid somebody typed, an empty
// string) travels as itself behind a `~`, a character the base64 alphabet never
// uses. So every string has exactly one spelling and comes back identical.

const BASE64_URL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

const DIGIT_OF_CHARACTER = new Map<string, number>([...BASE64_URL_ALPHABET].map((character, digit) => [character, digit]))

const CANONICAL_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

// Twenty-two characters carry 132 bits, four more than a uuid has, so the last
// character's low four bits are always zero - which leaves exactly A, Q, g and w.
// Checked on the way back in so that a string this file never wrote is handed
// back untouched rather than read as a uuid it is not.
const COMPACT_UUID = /^[A-Za-z0-9_-]{21}[AQgw]$/

/** The marker in front of an id that is travelling as itself. */
export const RAW_ID_MARKER = '~'

/** The wire spelling of one id - see the note at the top of this file. */
export function compactId(id: string): string {
  if (!CANONICAL_UUID.test(id)) return RAW_ID_MARKER + id
  const hex = id.replaceAll('-', '')
  let compact = ''
  // Three hex digits are twelve bits, which is exactly two base64 digits, so the
  // first thirty hex digits convert in step with no carrying between groups.
  for (let at = 0; at < 30; at += 3) {
    const twelveBits = parseInt(hex.slice(at, at + 3), 16)
    compact += BASE64_URL_ALPHABET.charAt(twelveBits >> 6) + BASE64_URL_ALPHABET.charAt(twelveBits & 63)
  }
  // The last two hex digits are eight bits, padded out with four zero bits.
  const lastBits = parseInt(hex.slice(30), 16) << 4
  compact += BASE64_URL_ALPHABET.charAt(lastBits >> 6) + BASE64_URL_ALPHABET.charAt(lastBits & 63)
  return compact
}

/** The id a wire spelling stands for. The exact inverse of compactId. */
export function expandId(wire: string): string {
  if (wire.startsWith(RAW_ID_MARKER)) return wire.slice(RAW_ID_MARKER.length)
  if (!COMPACT_UUID.test(wire)) return wire
  const digitAt = (at: number) => DIGIT_OF_CHARACTER.get(wire.charAt(at)) ?? 0
  let hex = ''
  for (let at = 0; at < 20; at += 2) {
    hex += ((digitAt(at) << 6) | digitAt(at + 1)).toString(16).padStart(3, '0')
  }
  hex += (((digitAt(20) << 6) | digitAt(21)) >> 4).toString(16).padStart(2, '0')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
