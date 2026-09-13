import { describe, expect, it } from 'vitest'
import { expandFrontCodedStrings, frontCodeStrings, packFilterGrid, unpackFilterGrid } from './grid-pack'
import { compactId } from './compact-id'
import type { FltGridData } from '@/modules/filters-for-shop/components/public/FilterShell'
import type { FltControlType } from '@/modules/filters-for-shop/lib/types'

// The shell cannot tell whether its data was packed, and that is the whole
// contract: every filter, count, sort and card swap it works out is worked out
// from whatever comes back here. A wrong answer would not throw, it would quietly
// offer the wrong products - so the round trip is asserted, including across a
// JSON encode, which is near enough what the flight format does to it on the way
// to the browser.
const overTheWire = (data: FltGridData) => unpackFilterGrid(JSON.parse(JSON.stringify(packFilterGrid(data))))

const PRODUCT_A = '0ab6d395-f3e8-4981-a2dc-d698f3fd4ac4'
const PRODUCT_B = '2dfa0766-1123-4df8-85db-e65b551878ea'
const PRODUCT_C = 'e538b8ce-e96d-405e-8f72-c14a04733dd8'
const PRODUCT_D = '870fab5c-7e79-476f-b139-1f5d4bb5b4e8'
const RED = 'd68ce8e7-4ae0-46f0-bd6f-5ab13f25c2a3'
const BLUE = '5e11003a-79b6-4769-8f5b-6289a64d137d'
const MESH = 'efeef5f4-4d96-409d-bc22-22056ce11702'
const UNDER_100 = '27ae8dfb-306e-42a6-9ad2-d2a0ac933b8d'
const TASK_CHAIRS = 'cat:12d48796-edd9-407c-85f0-3ec6a53b373a'
const ERGONOMIC = 'cat:2f1afed4-fc81-4228-9293-9da06f3c745e'
// A filter from a group culled for offering only one way to cut: gone from the
// panel, still on the products.
const CULLED = 'a209bcf2-8b58-4174-89d5-38a89f04cc46'

const FOLDER = 'https://media.example.test/media/shop/office-chairs/task/'

// A shelf with every awkward thing the real one has: a synthetic Category group,
// picture and colour swatches, a product the matrix has no row for, an empty row,
// a filter no group offers, swaps without a photo or a parameter, an unranked and
// unpriced product, and a page that arrived with a filter ticked.
function realisticShelf(): FltGridData {
  return {
    groups: [
      { id: 'flt-category-group', name: 'Category', slug: 'category', controlType: 'CHECKBOX', filters: [
        { id: TASK_CHAIRS, label: 'Computer & Task Chairs', slug: 'computer-task-chairs', swatch: null },
        { id: ERGONOMIC, label: 'Ergonomic Office Chairs', slug: 'ergonomic-office-chairs', swatch: null },
      ] },
      { id: 'f551a1cb-5ce0-4e32-a722-4223c4b233da', name: 'Colour', slug: 'colour', controlType: 'SWATCH', filters: [
        { id: RED, label: 'Red', slug: 'red', swatch: 'https://media.example.test/attributes/red-tiny.webp' },
        { id: BLUE, label: 'Blue', slug: 'blue', swatch: '#1f3a93' },
      ] },
      { id: 'adfceb15-8e9b-4e5a-b42a-106c5188b65c', name: 'Upholstery', slug: 'upholstery', controlType: 'CHECKBOX', filters: [
        { id: MESH, label: 'Mesh', slug: 'mesh', swatch: null },
        { id: UNDER_100, label: 'Under £100', slug: 'under-100', swatch: '' },
      ] },
    ],
    matrix: {
      [PRODUCT_B]: [RED, TASK_CHAIRS, MESH, UNDER_100],
      [PRODUCT_A]: [BLUE, RED, CULLED, ERGONOMIC],
      [PRODUCT_C]: [],
    },
    variations: {
      filterIds: [RED, MESH, BLUE, CULLED],
      combos: [[0, 1], [2], [2, 3], []],
      byProduct: { [PRODUCT_B]: [0], [PRODUCT_A]: [1, 2, 3], [PRODUCT_C]: [] },
    },
    swaps: {
      g: [RED, BLUE],
      f: [FOLDER, `${FOLDER}variations/`, ''],
      q: ['upholstery-colour=red', 'upholstery-colour=blue'],
      p: {
        [PRODUCT_B]: [[0, 1, 'kcup2024_1.webp', 0, '859a9306-d3b6-4b13-9934-6cc5158f48cc']],
        [PRODUCT_A]: [
          [1, 0, 'blue.webp', -1, 'cac3fecd-9a82-40e2-a20c-f8da22906bbc'],
          [0, -1, '', 0, 'not-a-uuid'],
          [1, 2, 'photo-with-no-folder.webp', 1, ''],
        ],
        [PRODUCT_D]: [],
      },
    },
    sortKeys: {
      [PRODUCT_A]: { name: 'Eclipse Plus Medium Back Task Chair', price: 129.99, created: 1788985250015, popularity: 869 },
      [PRODUCT_B]: { name: 'ISO Mesh Back Stacking Chair', price: 47, created: 1788985250015, popularity: null },
      [PRODUCT_C]: { name: '', price: null, created: 1784218029161, popularity: 0 },
      [PRODUCT_D]: { name: 'Café Chair', price: 0, created: 1784218029162, popularity: -3 },
    },
    serverOrder: [PRODUCT_B, PRODUCT_A, PRODUCT_C, PRODUCT_D],
    renderedIds: [PRODUCT_A, PRODUCT_C],
    preselect: [BLUE],
  }
}

describe('packFilterGrid / unpackFilterGrid', () => {
  it('hands the shell back exactly what the server built', () => {
    const shelf = realisticShelf()
    expect(overTheWire(shelf)).toStrictEqual(shelf)
  })

  it('keeps the order and the repeats inside a matrix row', () => {
    const shelf = realisticShelf()
    shelf.matrix[PRODUCT_B] = [MESH, RED, MESH, TASK_CHAIRS]
    expect(overTheWire(shelf).matrix[PRODUCT_B]).toEqual([MESH, RED, MESH, TASK_CHAIRS])
  })

  it('keeps a product the matrix holds no row for apart from one with an empty row', () => {
    // The shell counts the matrix's rows, so the two are not the same thing.
    const out = overTheWire(realisticShelf())
    expect(Object.hasOwn(out.matrix, PRODUCT_C)).toBe(true)
    expect(out.matrix[PRODUCT_C]).toEqual([])
    expect(Object.hasOwn(out.matrix, PRODUCT_D)).toBe(false)
    expect(Object.hasOwn(out.swaps.p, PRODUCT_D)).toBe(true)
    expect(Object.hasOwn(out.swaps.p, PRODUCT_C)).toBe(false)
  })

  it('holds an empty shelf', () => {
    const empty: FltGridData = {
      groups: [],
      matrix: {},
      variations: { filterIds: [], combos: [], byProduct: {} },
      swaps: { g: [], f: [], q: [], p: {} },
      sortKeys: {},
      serverOrder: [],
      renderedIds: [],
      preselect: [],
    }
    expect(overTheWire(empty)).toStrictEqual(empty)
  })

  it('leaves off what the server never sent, and keeps what it sent empty', () => {
    const bare: FltGridData = { groups: [], matrix: {}, swaps: { g: [], f: [], q: [], p: {} }, sortKeys: {} }
    const out = overTheWire(bare)
    expect(out).toStrictEqual(bare)
    expect('variations' in out).toBe(false)
    expect('serverOrder' in out).toBe(false)
    expect('renderedIds' in out).toBe(false)
    expect('preselect' in out).toBe(false)
  })

  it('keeps products that match no filter at all', () => {
    const shelf = realisticShelf()
    shelf.matrix = {}
    shelf.variations = { filterIds: [], combos: [], byProduct: {} }
    shelf.swaps = { g: [], f: [], q: [], p: {} }
    expect(overTheWire(shelf)).toStrictEqual(shelf)
  })

  it('keeps a group with no filters, and a filter id two groups share', () => {
    const shelf = realisticShelf()
    shelf.groups.push({ id: 'empty-group', name: 'Nothing here', slug: 'nothing', controlType: 'DROPDOWN', filters: [] })
    shelf.groups.push({ id: 'second-home', name: 'Also red', slug: 'also-red', controlType: 'IMAGE', filters: [
      { id: RED, label: 'Red again', slug: 'red-again', swatch: null },
    ] })
    expect(overTheWire(shelf)).toStrictEqual(shelf)
  })

  it('keeps the matrix in its own order when there is no server order to follow', () => {
    // The shell falls back to the matrix's own key order for "Recommended" when
    // it has no server order, so that order is part of what must survive.
    const shelf = realisticShelf()
    delete shelf.serverOrder
    const out = overTheWire(shelf)
    expect(out).toStrictEqual(shelf)
    expect(Object.keys(out.matrix)).toEqual(Object.keys(shelf.matrix))
  })

  it('keeps a server order that names a product twice', () => {
    const shelf = realisticShelf()
    shelf.serverOrder = [PRODUCT_A, PRODUCT_B, PRODUCT_A, PRODUCT_D]
    expect(overTheWire(shelf)).toStrictEqual(shelf)
  })

  it('keeps ids the server order does not name', () => {
    const stray = '9147ece3-c68e-4581-b98d-52e01db1fc2a'
    const shelf = realisticShelf()
    shelf.serverOrder = [PRODUCT_C]
    shelf.renderedIds = [stray]
    shelf.preselect = ['a-filter-no-group-offers']
    expect(overTheWire(shelf)).toStrictEqual(shelf)
  })

  it('carries creation times that are not whole numbers as they are', () => {
    // NaN is what an unparseable date reads as. The flight format carries it
    // where JSON cannot, so this one skips the JSON leg.
    const shelf = realisticShelf()
    const keyA = shelf.sortKeys[PRODUCT_A]
    const keyB = shelf.sortKeys[PRODUCT_B]
    if (!keyA || !keyB) throw new Error('fixture is missing a sort key')
    keyA.created = Number.NaN
    keyB.created = 1788985250015.5
    const packed = packFilterGrid(shelf)
    expect(packed.sortKeys.createdAsSteps).toBe(false)
    expect(unpackFilterGrid(packed)).toStrictEqual(shelf)
  })

  it('writes creation times as steps where it can', () => {
    const packed = packFilterGrid(realisticShelf())
    expect(packed.sortKeys.createdAsSteps).toBe(true)
    // PRODUCT_B, then PRODUCT_A a step of nothing later.
    expect(packed.sortKeys.created.slice(0, 2)).toEqual([1788985250015, 0])
  })

  it('names each product and each filter once, and the server order as a count', () => {
    const shelf = realisticShelf()
    const wire = JSON.stringify(packFilterGrid(shelf))
    for (const id of [PRODUCT_A, PRODUCT_B, PRODUCT_C, PRODUCT_D, RED, BLUE, MESH, UNDER_100, CULLED]) {
      expect(wire).not.toContain(id)
      expect(wire.split(compactId(id)).length - 1).toBe(1)
    }
    expect(packFilterGrid(shelf).serverOrder).toBe(4)
  })

  it('agrees with itself across randomly built shelves', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const shelf = randomShelf(seed)
      expect(overTheWire(shelf)).toStrictEqual(shelf)
    }
  })
})

describe('frontCodeStrings', () => {
  it('rebuilds every string exactly', () => {
    const values = [
      'https://cdn/media/shop/a/',
      'https://cdn/media/shop/a/variations/',
      'https://cdn/media/shop/a/',
      '',
      'https://cdn/media/shop/b/',
      'https://cdn/media/shop/b/',
      'no-slash',
    ]
    expect(expandFrontCodedStrings(frontCodeStrings(values))).toEqual(values)
  })

  it('never splits a surrogate pair between the shared part and the rest', () => {
    // Two emoji sharing their first half: a prefix ending mid-pair would leave
    // each suffix starting with half a character.
    const values = ['folder/\u{1F600}/', 'folder/\u{1F601}/']
    const coded = frontCodeStrings(values)
    expect(coded.sharedLengths).toEqual([0, 'folder/'.length])
    expect(JSON.parse(JSON.stringify(coded.suffixes))).toEqual(['folder/\u{1F600}/', '\u{1F601}/'])
    expect(expandFrontCodedStrings(coded)).toEqual(values)
  })
})

// A small seeded generator, so a failing shelf can be rebuilt from its number.
function randomShelf(seed: number): FltGridData {
  let state = seed >>> 0
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state)
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296
  }
  const below = (limit: number) => Math.floor(next() * limit)
  const chance = (odds: number) => next() < odds
  const hex = (length: number) => Array.from({ length }, () => below(16).toString(16)).join('')
  const uuid = () => `${hex(8)}-${hex(4)}-${hex(4)}-${hex(4)}-${hex(12)}`
  const pick = <Value,>(values: readonly Value[]): Value => values[below(values.length)] as Value
  const some = <Value,>(values: readonly Value[], most: number): Value[] =>
    values.length === 0 ? [] : Array.from({ length: below(most + 1) }, () => pick(values))

  const productIds = Array.from({ length: below(12) }, () => (chance(0.9) ? uuid() : `prod-${hex(3)}`))
  const controlTypes: FltControlType[] = ['CHECKBOX', 'SWATCH', 'IMAGE', 'DROPDOWN']
  const groups = Array.from({ length: below(5) }, () => ({
    id: chance(0.8) ? uuid() : 'flt-category-group',
    name: `Group ${hex(2)}`,
    slug: hex(4),
    controlType: pick(controlTypes),
    filters: Array.from({ length: below(6) }, () => ({
      id: chance(0.8) ? uuid() : `cat:${uuid()}`,
      label: `Label ${hex(3)}`,
      slug: hex(5),
      swatch: chance(0.5) ? null : `https://cdn/swatch/${hex(6)}.webp`,
    })),
  }))
  const offered = groups.flatMap((group) => group.filters.map((filter) => filter.id))
  const filterIds = [...offered, ...Array.from({ length: below(3) }, () => uuid())]
  const folders = Array.from({ length: below(4) }, () => `https://cdn/media/${hex(3)}/${chance(0.5) ? 'variations/' : ''}`)
  const params = Array.from({ length: below(4) }, () => `colour=${hex(4)}`)
  const combos = Array.from({ length: below(6) }, () => some(Array.from({ length: 5 }, (_, at) => at), 3))
  const inSomeOrder = (ids: string[]) => ids.filter(() => chance(0.7)).reverse()

  const shelf: FltGridData = {
    groups,
    matrix: Object.fromEntries(inSomeOrder(productIds).map((id) => [id, some(filterIds, 6)])),
    swaps: {
      g: some(filterIds, 4),
      f: folders,
      q: params,
      p: Object.fromEntries(inSomeOrder(productIds).map((id) => [id, Array.from({ length: below(4) }, () => [
        below(4),
        folders.length > 0 && chance(0.9) ? below(folders.length) : -1,
        chance(0.9) ? `${hex(6)}_1.webp` : '',
        params.length > 0 && chance(0.8) ? below(params.length) : -1,
        chance(0.9) ? uuid() : hex(5),
      ] as [number, number, string, number, string])])),
    },
    sortKeys: Object.fromEntries(inSomeOrder(productIds).map((id) => [id, {
      name: `Product ${hex(4)}`,
      price: chance(0.8) ? below(100000) / 100 : null,
      created: 1784218029161 + below(5) * 1000,
      popularity: chance(0.7) ? below(1000) : null,
    }])),
  }
  if (chance(0.8)) {
    shelf.variations = {
      filterIds: some(filterIds, 5),
      combos,
      byProduct: Object.fromEntries(inSomeOrder(productIds).map((id) => [id, some(combos.map((_, at) => at), 4)])),
    }
  }
  if (chance(0.8)) shelf.serverOrder = chance(0.9) ? [...productIds] : some(productIds, 8)
  if (chance(0.5)) shelf.renderedIds = some(productIds, 4)
  if (chance(0.5)) shelf.preselect = some(filterIds, 2)
  return shelf
}
