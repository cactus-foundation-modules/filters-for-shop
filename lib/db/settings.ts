import { prisma } from '@/lib/db/prisma'
import type { FltSettings } from '@/modules/filters-for-shop/lib/types'

const DEFAULTS: FltSettings = { hideEmptyFilters: true, swapCardImages: true, preselectOnClick: true }

export function filterSettingsDefaults(): FltSettings {
  return { ...DEFAULTS }
}

export async function getSettings(): Promise<FltSettings> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT * FROM "flt_settings" WHERE "id" = 'singleton' LIMIT 1
  `
  const row = rows[0]
  if (!row) return { ...DEFAULTS }
  return {
    hideEmptyFilters: (row.hide_empty_filters as boolean) ?? DEFAULTS.hideEmptyFilters,
    swapCardImages: (row.swap_card_images as boolean) ?? DEFAULTS.swapCardImages,
    preselectOnClick: (row.preselect_on_click as boolean) ?? DEFAULTS.preselectOnClick,
  }
}

export async function updateSettings(fields: Partial<FltSettings>): Promise<void> {
  if (fields.hideEmptyFilters === undefined && fields.swapCardImages === undefined && fields.preselectOnClick === undefined) return
  await prisma.$executeRaw`
    INSERT INTO "flt_settings" ("id") VALUES ('singleton') ON CONFLICT ("id") DO NOTHING
  `
  await prisma.$executeRaw`
    UPDATE "flt_settings" SET
      "hide_empty_filters" = COALESCE(${fields.hideEmptyFilters ?? null}::boolean, "hide_empty_filters"),
      "swap_card_images" = COALESCE(${fields.swapCardImages ?? null}::boolean, "swap_card_images"),
      "preselect_on_click" = COALESCE(${fields.preselectOnClick ?? null}::boolean, "preselect_on_click"),
      "updated_at" = CURRENT_TIMESTAMP
    WHERE "id" = 'singleton'
  `
}
