export type AdminActivityRow = {
  name: string
  created: number
  won: number
  lost: number
}

type AdminPieMetric = "created" | "won" | "lost"

type AdminPieSlice = { key: string; value: number }

export type AdminPieModel = {
  /** Slotted admins in slot order; `slot` indexes the categorical palette. */
  slotted: { key: string; name: string; slot: number }[]
  /** Whether any admin folded into the shared "Other" slice. */
  hasOther: boolean
  slices: Record<AdminPieMetric, AdminPieSlice[]>
}

export const OTHER_SLICE_KEY = "other"

const activity = (row: AdminActivityRow) => row.created + row.won + row.lost

/**
 * Splits created / won / lost by admin. The most active admins take the
 * palette slots once, so an admin has the same color in every pie; the rest
 * fold into one "Other" slice rather than a generated color.
 */
export function buildAdminPieModel(
  rows: AdminActivityRow[],
  slotCount: number,
): AdminPieModel {
  const active = rows
    .filter((row) => activity(row) > 0)
    .sort((a, b) => activity(b) - activity(a) || a.name.localeCompare(b.name))
  const slotted = active.slice(0, slotCount).map((row, slot) => ({
    row,
    key: `admin${slot}`,
    name: row.name,
    slot,
  }))
  const keyByRow = new Map(slotted.map((entry) => [entry.row, entry.key]))

  const slicesFor = (metric: AdminPieMetric): AdminPieSlice[] => {
    const totals = new Map<string, number>()
    for (const row of active) {
      if (row[metric] > 0) {
        const key = keyByRow.get(row) ?? OTHER_SLICE_KEY
        totals.set(key, (totals.get(key) ?? 0) + row[metric])
      }
    }
    return [...totals].map(([key, value]) => ({ key, value }))
  }

  return {
    slotted: slotted.map(({ key, name, slot }) => ({ key, name, slot })),
    hasOther: active.length > slotted.length,
    slices: {
      created: slicesFor("created"),
      won: slicesFor("won"),
      lost: slicesFor("lost"),
    },
  }
}
