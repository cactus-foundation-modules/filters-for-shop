import { describe, expect, it } from 'vitest'
import { buildBranchIndex, categoryFilterId, productBranchFilterIds, type FltCategoryNode } from './category-filter'

// A tree shaped like a real shop: one parent under review, children with their
// own grandchildren, a sibling branch that must stay invisible, and a root.
const nodes: FltCategoryNode[] = [
  { id: 'root', name: 'Shop', slug: 'shop', parentId: null },
  { id: 'seating', name: 'Office Seating', slug: 'office-seating', parentId: 'root' },
  { id: 'mesh', name: 'Mesh chairs', slug: 'mesh-chairs', parentId: 'seating' },
  { id: 'exec', name: 'Executive chairs', slug: 'executive-chairs', parentId: 'seating' },
  { id: 'exec-leather', name: 'Leather executive', slug: 'leather-executive', parentId: 'exec' },
  { id: 'desks', name: 'Office Desks', slug: 'office-desks', parentId: 'root' },
  { id: 'rect', name: 'Rectangular desks', slug: 'rectangular-desks', parentId: 'desks' },
]

describe('buildBranchIndex', () => {
  const branchOf = buildBranchIndex(nodes, 'seating')

  it('maps each child to itself', () => {
    expect(branchOf.get('mesh')).toBe('mesh')
    expect(branchOf.get('exec')).toBe('exec')
  })

  it('maps grandchildren to the child whose branch they are on', () => {
    expect(branchOf.get('exec-leather')).toBe('exec')
  })

  it('leaves the parent, siblings and unrelated branches out', () => {
    expect(branchOf.has('seating')).toBe(false)
    expect(branchOf.has('desks')).toBe(false)
    expect(branchOf.has('rect')).toBe(false)
    expect(branchOf.has('root')).toBe(false)
  })

  // The top of the tree, asked for by a page that has no category of its own.
  describe('at the top of the tree', () => {
    const rootBranchOf = buildBranchIndex(nodes, null)

    it('offers the parentless categories as the branches', () => {
      expect(rootBranchOf.get('root')).toBe('root')
    })

    it('rolls every descendant up to the top-level category it sits under', () => {
      expect(rootBranchOf.get('seating')).toBe('root')
      expect(rootBranchOf.get('exec-leather')).toBe('root')
      expect(rootBranchOf.get('rect')).toBe('root')
    })

    it('treats several parentless categories as separate branches', () => {
      const flat: FltCategoryNode[] = [
        { id: 'desks', name: 'Office Desks', slug: 'office-desks', parentId: null },
        { id: 'rect', name: 'Rectangular desks', slug: 'rectangular-desks', parentId: 'desks' },
        { id: 'chairs', name: 'Office Chairs', slug: 'office-chairs', parentId: null },
      ]
      const index = buildBranchIndex(flat, null)
      expect(index.get('desks')).toBe('desks')
      expect(index.get('rect')).toBe('desks')
      expect(index.get('chairs')).toBe('chairs')
    })

    it('turns a deep filing into its top-level branch filter id', () => {
      const flat: FltCategoryNode[] = [
        { id: 'desks', name: 'Office Desks', slug: 'office-desks', parentId: null },
        { id: 'rect', name: 'Rectangular desks', slug: 'rectangular-desks', parentId: 'desks' },
      ]
      const index = buildBranchIndex(flat, null)
      expect(productBranchFilterIds(['rect'], index)).toEqual([categoryFilterId('desks')])
    })
  })

  it('survives a parent cycle without looping', () => {
    const cyclic: FltCategoryNode[] = [
      { id: 'a', name: 'A', slug: 'a', parentId: 'p' },
      { id: 'b', name: 'B', slug: 'b', parentId: 'a' },
      { id: 'p', name: 'P', slug: 'p', parentId: 'b' },
    ]
    const index = buildBranchIndex(cyclic, 'p')
    expect(index.get('a')).toBe('a')
    expect(index.get('b')).toBe('a')
  })
})

describe('productBranchFilterIds', () => {
  const branchOf = buildBranchIndex(nodes, 'seating')

  it('turns filed categories into branch filter ids', () => {
    expect(productBranchFilterIds(['mesh'], branchOf)).toEqual([categoryFilterId('mesh')])
  })

  it('rolls a grandchild filing up to its branch child', () => {
    expect(productBranchFilterIds(['exec-leather'], branchOf)).toEqual([categoryFilterId('exec')])
  })

  it('dedupes two filings on the same branch', () => {
    expect(productBranchFilterIds(['exec', 'exec-leather'], branchOf)).toEqual([categoryFilterId('exec')])
  })

  it('ignores filings outside the tree under review', () => {
    expect(productBranchFilterIds(['rect', 'root', 'seating'], branchOf)).toEqual([])
  })
})
