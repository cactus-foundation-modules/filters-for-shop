import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FltGroup } from '@/modules/filters-for-shop/lib/types'
import type { TestDatabase, TestRole, VpsConfig } from '@/lib/backup/vps-database'

// The matcher's raw SQL, ACTUALLY EXECUTED by Postgres.
//
// Nothing else runs it. `tsc` sees a string, `eslint` sees a string, `npm test`
// never opens a connection, and the module build gate builds - which never
// executes a query either. A statement Postgres will not parse therefore passes
// every gate there is and fails for the first time on a live shop's category
// page, with the whole grid unreadable.
//
// What is awkward here, and none of it visible to a type-checker:
//
//  - a UNION of two derived tables folded with `array_agg(DISTINCT ...)`, then
//    a `DISTINCT ON` over one of the folded columns - which Postgres only
//    accepts when the ORDER BY starts with exactly those expressions;
//  - three levels of derived table, each of which has to name its columns the
//    way the level above spells them;
//  - `ROW_NUMBER() OVER (PARTITION BY ...)` picking one variation per filter.
//
// Every value import is dynamic: the shared Prisma client reads DATABASE_URL
// once, when its module first loads, and the database this runs against does not
// exist until beforeAll has made it.
//
// It provisions its OWN throwaway database on the self-hosted Postgres VPS
// (`cactus_rt_*`, owned by a throwaway role, dropped afterwards plus a
// prefix-scoped sweep), so it never touches any real database - the live site's
// sits on the same server and is never named, opened or altered. Skipped unless
// opted into, so a plain `npm test` never hits the network:
//
//   npm run test:filters-sql
const shouldRun = process.env.RUN_FILTERS_SQL === '1'
if (shouldRun) {
  try {
    ;(process as unknown as { loadEnvFile: (p: string) => void }).loadEnvFile('.env')
  } catch {
    // No .env - the guard below fails the suite loudly rather than skipping.
  }
}

const suite = shouldRun ? describe : describe.skip

const CORE_SQL = readFileSync(path.join(process.cwd(), 'prisma/migrations/20260626000000_init/migration.sql'), 'utf8')

/** Split a migration file into statements, dollar-quote aware. Its own splitter
 *  rather than the backup format's, which is not: these migrations DO use
 *  `DO $$ ... $$`, and teaching the backup splitter about it would be scope
 *  creep on the one file nobody should be casual with. */
function splitStatements(sql: string): string[] {
  const out: string[] = []
  let current = ''
  let at = 0
  while (at < sql.length) {
    const rest = sql.slice(at)
    if (rest.startsWith('--')) {
      const end = sql.indexOf('\n', at)
      at = end === -1 ? sql.length : end + 1
      continue
    }
    if (rest.startsWith('/*')) {
      const end = sql.indexOf('*/', at + 2)
      at = end === -1 ? sql.length : end + 2
      continue
    }
    const char = sql[at]!
    if (char === "'" || char === '"') {
      const end = closingQuote(sql, at, char)
      current += sql.slice(at, end)
      at = end
      continue
    }
    const dollar = /^\$[A-Za-z_]*\$/.exec(rest)
    if (dollar) {
      const tag = dollar[0]
      const end = sql.indexOf(tag, at + tag.length)
      const stop = end === -1 ? sql.length : end + tag.length
      current += sql.slice(at, stop)
      at = stop
      continue
    }
    if (char === ';') {
      if (current.trim()) out.push(current.trim())
      current = ''
      at++
      continue
    }
    current += char
    at++
  }
  if (current.trim()) out.push(current.trim())
  return out
}

/** Where a quoted run ends, doubled quotes ('' and "") counting as escapes. */
function closingQuote(sql: string, start: number, quote: string): number {
  let at = start + 1
  while (at < sql.length) {
    if (sql[at] === quote) {
      if (sql[at + 1] === quote) {
        at += 2
        continue
      }
      return at + 1
    }
    at++
  }
  return sql.length
}

function moduleSql(moduleName: string): string[] {
  const dir = path.join(process.cwd(), 'modules', moduleName, 'migrations')
  return readdirSync(dir)
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .flatMap((file) => splitStatements(readFileSync(path.join(dir, file), 'utf8')))
}

suite('filters-for-shop matching SQL, against a real Postgres', () => {
  let cfg: VpsConfig
  let role: TestRole
  let database: TestDatabase
  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  const dbName = `cactus_rt_flt_${stamp}`
  const roleName = `cactus_rt_role_flt_${stamp}`

  type DbModules = {
    matching: typeof import('@/modules/filters-for-shop/lib/db/matching')
    prisma: typeof import('@/lib/db/prisma')
  }
  let db: DbModules
  let vps: typeof import('@/lib/backup/vps-database')

  // The vocabulary the assertions read back: two groups, four filters, one
  // parent listing sold in four combinations.
  let groups: FltGroup[] = []
  const filterId: Record<string, string> = {}
  let deskId = ''

  const rule = (id: string, optionName: string, valueLabel: string) => ({
    id: `rule-${id}`,
    source: 'OPTION' as const,
    optionName,
    valueLabel,
  })

  beforeAll(async () => {
    vps = await import('@/lib/backup/vps-database')
    cfg = vps.vpsConfigFromEnv()
    await vps.dropStaleTestObjects(cfg)
    role = await vps.createTestRole(cfg, roleName)
    database = await vps.createTestDatabase(cfg, dbName, role)
    process.env.DATABASE_URL = database.connectionUri
    process.env.DIRECT_URL = database.connectionUri

    db = {
      matching: await import('@/modules/filters-for-shop/lib/db/matching'),
      prisma: await import('@/lib/db/prisma'),
    }

    // A freshly-created database takes a moment to accept connections.
    for (let attempt = 0; ; attempt++) {
      try {
        await db.prisma.prisma.$queryRawUnsafe('SELECT 1')
        break
      } catch (err) {
        if (attempt >= 15) throw err
        await new Promise((r) => setTimeout(r, 2000))
      }
    }

    // Core, then the shop, then the two modules the matcher reads through: the
    // variations tables it resolves options from, and its own. Attributes are
    // deliberately absent - a shop without that module is a shop the matcher has
    // to work on, and the probe path only gets exercised where the tables are
    // genuinely missing.
    for (const statement of splitStatements(CORE_SQL)) await db.prisma.prisma.$executeRawUnsafe(statement)
    for (const moduleName of ['shop', 'shop-variations', 'filters-for-shop']) {
      for (const statement of moduleSql(moduleName)) await db.prisma.prisma.$executeRawUnsafe(statement)
    }

    const one = async <T>(sql: Promise<T[]>): Promise<T> => (await sql)[0]!
    const insertGroup = async (name: string, slug: string) =>
      (await one(db.prisma.prisma.$queryRaw<{ id: string }[]>`
        INSERT INTO "flt_groups" ("name", "slug", "control_type") VALUES (${name}, ${slug}, 'SWATCH') RETURNING "id"
      `)).id
    const insertFilter = async (groupId: string, label: string, slug: string, optionName: string) => {
      const row = await one(db.prisma.prisma.$queryRaw<{ id: string }[]>`
        INSERT INTO "flt_filters" ("group_id", "label", "slug") VALUES (${groupId}, ${label}, ${slug}) RETURNING "id"
      `)
      await db.prisma.prisma.$executeRaw`
        INSERT INTO "flt_filter_rules" ("filter_id", "source", "option_name", "value_label")
        VALUES (${row.id}, 'OPTION', ${optionName}, ${label})
      `
      filterId[slug] = row.id
      return row.id
    }

    const colourGroup = await insertGroup('Colour', 'colour')
    const finishGroup = await insertGroup('Finish', 'finish')
    await insertFilter(colourGroup, 'Blue', 'blue', 'Colour')
    await insertFilter(colourGroup, 'Green', 'green', 'Colour')
    await insertFilter(finishGroup, 'Oak', 'oak', 'Finish')
    await insertFilter(finishGroup, 'Ash', 'ash', 'Finish')

    groups = [
      {
        id: colourGroup,
        name: 'Colour',
        slug: 'colour',
        controlType: 'SWATCH',
        kind: 'VALUES',
        position: 0,
        filters: [
          { id: filterId.blue!, groupId: colourGroup, label: 'Blue', slug: 'blue', swatch: null, swatchSmall: null, swatchTiny: null, position: 0, priceMin: null, priceMax: null, rules: [rule('blue', 'Colour', 'Blue')] },
          { id: filterId.green!, groupId: colourGroup, label: 'Green', slug: 'green', swatch: null, swatchSmall: null, swatchTiny: null, position: 1, priceMin: null, priceMax: null, rules: [rule('green', 'Colour', 'Green')] },
        ],
      },
      {
        id: finishGroup,
        name: 'Finish',
        slug: 'finish',
        controlType: 'SWATCH',
        kind: 'VALUES',
        position: 1,
        filters: [
          { id: filterId.oak!, groupId: finishGroup, label: 'Oak', slug: 'oak', swatch: null, swatchSmall: null, swatchTiny: null, position: 0, priceMin: null, priceMax: null, rules: [rule('oak', 'Finish', 'Oak')] },
          { id: filterId.ash!, groupId: finishGroup, label: 'Ash', slug: 'ash', swatch: null, swatchSmall: null, swatchTiny: null, position: 1, priceMin: null, priceMax: null, rules: [rule('ash', 'Finish', 'Ash')] },
        ],
      },
    ]

    const insertProduct = async (name: string, slug: string) =>
      (await one(db.prisma.prisma.$queryRaw<{ id: string }[]>`
        INSERT INTO "shp_products" ("name", "slug", "type", "price") VALUES (${name}, ${slug}, 'PHYSICAL', 100) RETURNING "id"
      `)).id

    deskId = await insertProduct('Desk', 'desk')

    const insertOption = async (name: string, position: number) =>
      (await one(db.prisma.prisma.$queryRaw<{ id: string }[]>`
        INSERT INTO "svr_options" ("product_id", "name", "position") VALUES (${deskId}, ${name}, ${position}) RETURNING "id"
      `)).id
    const insertValue = async (optionId: string, label: string, slug: string) =>
      (await one(db.prisma.prisma.$queryRaw<{ id: string }[]>`
        INSERT INTO "svr_option_values" ("option_id", "label", "slug") VALUES (${optionId}, ${label}, ${slug}) RETURNING "id"
      `)).id

    const colourOption = await insertOption('Colour', 0)
    const finishOption = await insertOption('Finish', 1)
    const values = {
      blue: await insertValue(colourOption, 'Blue', 'blue'),
      green: await insertValue(colourOption, 'Green', 'green'),
      oak: await insertValue(finishOption, 'Oak', 'oak'),
      ash: await insertValue(finishOption, 'Ash', 'ash'),
    }

    // Four variations in the owner's own order, each with its own hidden child
    // product - which is what a swapped card links to. The last two share a
    // combination as far as the filters are concerned, and the earlier of them
    // is the one the matcher should keep.
    const combinations: [colour: keyof typeof values, finish: keyof typeof values, slug: string, image: string | null][] = [
      ['blue', 'oak', 'desk-blue-oak', 'https://cdn.example/desks/blue-oak.jpg'],
      ['blue', 'ash', 'desk-blue-ash', 'https://cdn.example/desks/blue-ash.jpg'],
      ['green', 'oak', 'desk-green-oak', null],
      ['green', 'oak', 'desk-green-oak-2', null],
    ]
    let position = 0
    for (const [colour, finish, slug, image] of combinations) {
      const childId = await insertProduct(slug, slug)
      const variant = await one(db.prisma.prisma.$queryRaw<{ id: string }[]>`
        INSERT INTO "svr_variants" ("product_id", "child_product_id", "position") VALUES (${deskId}, ${childId}, ${position}) RETURNING "id"
      `)
      await db.prisma.prisma.$executeRaw`
        INSERT INTO "svr_variant_values" ("variant_id", "option_value_id") VALUES (${variant.id}, ${values[colour]}), (${variant.id}, ${values[finish]})
      `
      if (image) {
        await db.prisma.prisma.$executeRaw`
          INSERT INTO "shp_product_media" ("product_id", "url", "type", "is_primary", "position")
          VALUES (${childId}, ${image}, 'IMAGE', true, 0)
        `
      }
      position++
    }
  }, 300_000)

  afterAll(async () => {
    try {
      await db?.prisma.prisma.$disconnect()
    } catch {
      // Nothing to disconnect if the setup never got that far.
    }
    if (cfg && vps) {
      if (database) await vps.dropTestDatabase(cfg, database.name)
      if (role) await vps.dropTestRole(cfg, role.name)
      await vps.dropStaleTestObjects(cfg)
    }
  }, 300_000)

  it('matches a listing on every filter any of its variations resolves', async () => {
    const matches = await db.matching.getProductFilterMatches([deskId], groups, 'ROOT')
    expect([...(matches.matrix.get(deskId) ?? [])].sort()).toEqual(
      [filterId.blue!, filterId.green!, filterId.oak!, filterId.ash!].sort(),
    )
  })

  it('gives every distinct combination its own link, in the owner variant order', async () => {
    const matches = await db.matching.getProductFilterMatches([deskId], groups, 'ROOT')
    const combos = matches.combos.get(deskId) ?? []
    expect(combos.map((c) => [...c.filterIds].sort())).toEqual([
      [filterId.blue!, filterId.oak!].sort(),
      [filterId.ash!, filterId.blue!].sort(),
      [filterId.green!, filterId.oak!].sort(),
    ])
    // The fourth variation repeats the third's combination, so it is folded away
    // and the EARLIER one's link is the one that survives.
    expect(combos.map((c) => c.href)).toEqual(['/desk-blue-oak', '/desk-blue-ash', '/desk-green-oak'])
  })

  it('still borrows one variation per filter for the card swap', async () => {
    const matches = await db.matching.getProductFilterMatches([deskId], groups, 'ROOT')
    const swaps = matches.swaps.get(deskId)
    expect(swaps?.get(filterId.blue!)?.href).toBe('/desk-blue-oak')
    expect(swaps?.get(filterId.blue!)?.image).toBe('https://cdn.example/desks/blue-oak.jpg')
    expect(swaps?.get(filterId.ash!)?.href).toBe('/desk-blue-ash')
    // A variation whose child carries no photograph is a swap with no image, not
    // a missing swap: the link still moves, the picture stays put.
    expect(swaps?.get(filterId.green!)?.href).toBe('/desk-green-oak')
    expect(swaps?.get(filterId.green!)?.image).toBe(null)
  })

  it('answers nothing at all for a product nobody asked about', async () => {
    const matches = await db.matching.getProductFilterMatches([], groups, 'ROOT')
    expect(matches.matrix.size).toBe(0)
    expect(matches.combos.size).toBe(0)
  })
})
