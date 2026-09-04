import { describe, expect, it } from 'vitest'
import { optionParamFragment, optionParamKey, withOptionParams } from './option-param'

describe('optionParamKey', () => {
  it('spells an option name the way shop-variations reads it back', () => {
    expect(optionParamKey('Seat Colour')).toBe('seat-colour')
    expect(optionParamKey('Back Height')).toBe('back-height')
  })

  it('folds accents to their bare letters rather than dropping them', () => {
    expect(optionParamKey('Bréadth')).toBe('breadth')
  })

  it('has no answer for a name made entirely of punctuation', () => {
    expect(optionParamKey('!!!')).toBe('')
  })
})

describe('optionParamFragment', () => {
  it('pairs the option key with the value slug', () => {
    expect(optionParamFragment('Finish', 'light-oak')).toBe('finish=light-oak')
  })

  it('says nothing rather than guessing when either half is missing', () => {
    expect(optionParamFragment(null, 'oak')).toBeNull()
    expect(optionParamFragment('Finish', null)).toBeNull()
    expect(optionParamFragment('!!!', 'oak')).toBeNull()
  })
})

describe('withOptionParams', () => {
  it('adds only the options that were ticked', () => {
    expect(withOptionParams('/oak-desk', ['finish=oak'])).toBe('/oak-desk?finish=oak')
    expect(withOptionParams('/oak-desk', ['finish=oak', 'colour=blue'])).toBe('/oak-desk?finish=oak&colour=blue')
  })

  it('leaves an unfiltered card exactly as the server rendered it', () => {
    expect(withOptionParams('/oak-desk', [])).toBe('/oak-desk')
    // A price band or a spec on the listing resolves no option value, so it has
    // nothing to say about the product page's controls.
    expect(withOptionParams('/oak-desk', [null, undefined])).toBe('/oak-desk')
  })

  it('writes a parameter once, keeping the first tick that claimed it', () => {
    expect(withOptionParams('/desk', ['finish=oak', 'finish=ash'])).toBe('/desk?finish=oak')
  })

  it('joins onto an href that already carries a parameter, and keeps its hash', () => {
    expect(withOptionParams('/desk?ref=grid', ['finish=oak'])).toBe('/desk?ref=grid&finish=oak')
    expect(withOptionParams('/desk#specs', ['finish=oak'])).toBe('/desk?finish=oak#specs')
  })
})
