import type { AgentResponseSeriesRow } from "@chatbotx.io/analytics"
import { formatDateWithYear } from "./date-format"
import { secondsToMinutes } from "./format-duration"

export type AgentResponseSeriesMetric =
  | "avgWorkingResponseSeconds"
  | "avgWorkingFirstResponseSeconds"

export type AgentResponseChartDatum = {
  name: string
  value: { label: string; value: number }[]
}

type AdminIdentity = Pick<
  AgentResponseSeriesRow,
  "adminId" | "userName" | "userEmail"
>

/** BarChart stores the x-axis value under this key; a series must not use it. */
const RESERVED_LABEL = "name"
const MS_PER_DAY = 86_400_000
const DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})$/

function adminDisplayName(row: AdminIdentity): string {
  return row.userName || row.userEmail || row.adminId
}

/**
 * One unique label per adminId. The bare display name is used unless it is
 * shared by several admins or equals the reserved x-axis key, in which case the
 * email (or id) is appended.
 */
export function buildAdminLabels(
  rows: readonly AdminIdentity[],
): Map<string, string> {
  const admins = new Map<string, AdminIdentity>()
  for (const row of rows) {
    if (!admins.has(row.adminId)) {
      admins.set(row.adminId, row)
    }
  }

  const adminsByName = new Map<string, number>()
  for (const admin of admins.values()) {
    const name = adminDisplayName(admin)
    adminsByName.set(name, (adminsByName.get(name) ?? 0) + 1)
  }

  const labels = new Map<string, string>()
  const used = new Set<string>()
  for (const [adminId, admin] of admins) {
    const name = adminDisplayName(admin)
    let label = name
    if ((adminsByName.get(name) ?? 0) > 1 || name === RESERVED_LABEL) {
      label = `${name} (${admin.userEmail || adminId})`
    }
    if (used.has(label) || label === RESERVED_LABEL) {
      label = `${name} (${adminId})`
    }
    used.add(label)
    labels.set(adminId, label)
  }
  return labels
}

const NUMERIC_ID = /^\d+$/

/** Numeric ids (bigint strings) by value, anything else lexicographically. */
function compareAdminIds(a: string, b: string): number {
  if (NUMERIC_ID.test(a) && NUMERIC_ID.test(b)) {
    const diff = BigInt(a) - BigInt(b)
    if (diff !== BigInt(0)) {
      return diff < BigInt(0) ? -1 : 1
    }
    return 0
  }
  return a.localeCompare(b)
}

/**
 * Series labels in one fixed order (adminId, numeric-aware) for the WHOLE dataset, so
 * every chart built from the same rows gives an admin the same colour. Labels
 * are the final unique ones `buildAgentResponseChartData` uses.
 */
export function buildAgentResponseColorKeys(
  rows: readonly AgentResponseSeriesRow[],
): string[] {
  const labels = buildAdminLabels(rows)
  return [...labels.keys()]
    .sort(compareAdminIds)
    .map((adminId) => labels.get(adminId) ?? adminId)
}

function addDays(key: string, days: number): string {
  const parts = DAY_KEY.exec(key)
  if (!parts) {
    return key
  }
  const ms = Date.UTC(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]))
  return new Date(ms + days * MS_PER_DAY).toISOString().slice(0, 10)
}

/** `YYYY-MM-DD` keys between the first and last key, inclusive, by calendar arithmetic. */
function fillDayKeys(keys: readonly string[]): string[] {
  const sorted = [...keys].sort()
  const first = sorted[0]
  const last = sorted.at(-1)
  if (!(first && last && DAY_KEY.test(first) && DAY_KEY.test(last))) {
    return sorted
  }
  const filled: string[] = []
  for (let key = first; key <= last; key = addDays(key, 1)) {
    filled.push(key)
  }
  return filled
}

/**
 * Rows (one per admin per day) -> BarChart data: one group per day, one series
 * per admin, values in minutes with one decimal. A null measure is omitted
 * rather than drawn as zero. The axis uses only the day keys the server
 * returned (already bucketed in the workspace timezone), filling gaps between
 * the first and last key with pure calendar arithmetic.
 */
export function buildAgentResponseChartData({
  rows,
  metric,
  locale,
}: {
  rows: readonly AgentResponseSeriesRow[]
  metric: AgentResponseSeriesMetric
  locale: string
}): AgentResponseChartDatum[] {
  const labels = buildAdminLabels(rows)
  const byDay = new Map<string, Map<string, number>>()

  for (const row of rows) {
    const seconds = row[metric]
    if (seconds === null) {
      continue
    }
    const series = byDay.get(row.date) ?? new Map<string, number>()
    series.set(row.adminId, secondsToMinutes(seconds))
    byDay.set(row.date, series)
  }

  if (byDay.size === 0) {
    return []
  }

  return fillDayKeys([...byDay.keys()]).map((key) => ({
    name: formatDateWithYear(key, locale),
    value: [...(byDay.get(key) ?? [])].map(([adminId, value]) => ({
      label: labels.get(adminId) ?? adminId,
      value,
    })),
  }))
}
