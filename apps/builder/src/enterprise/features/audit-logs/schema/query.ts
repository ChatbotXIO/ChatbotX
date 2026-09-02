import type { AuditLogModel } from "@chatbotx.io/database/types"
import { getSortingStateParser } from "@chatbotx.io/ui/lib/parsers"
import {
  createSearchParamsCache,
  parseAsInteger,
  parseAsString,
} from "nuqs/server"

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/
const MAX_AUDIT_LOG_RANGE_DAYS = 90

const toDateKey = (date: Date): string => date.toISOString().slice(0, 10)

const isValidDateKey = (value: string): boolean => {
  if (!DATE_KEY_RE.test(value)) {
    return false
  }
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && toDateKey(date) === value
}

export function getDefaultAuditLogsRange(now = new Date()) {
  const to = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  )
  const from = new Date(to)
  from.setUTCDate(from.getUTCDate() - 89)

  return {
    from: toDateKey(from),
    to: toDateKey(to),
  }
}

const defaultRange = getDefaultAuditLogsRange()

export const listAuditLogsSearchParamsCache = createSearchParamsCache({
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
  from: parseAsString.withDefault(defaultRange.from),
  to: parseAsString.withDefault(defaultRange.to),
  keyword: parseAsString.withDefault(""),
  sort: getSortingStateParser<AuditLogModel>().withDefault([
    { id: "createdAt", desc: true },
  ]),
  userId: parseAsString.withDefault(""),
})

export type ListAuditLogsRequest = Awaited<
  ReturnType<typeof listAuditLogsSearchParamsCache.parse>
> & {
  workspaceId: string
}

export function parseAuditLogsDateRange(
  input: { from: string; to: string },
  now = new Date(),
): {
  from: string
  to: string
  start: Date
  end: Date
} {
  const fallback = getDefaultAuditLogsRange(now)
  let from = isValidDateKey(input.from) ? input.from : fallback.from
  let to = isValidDateKey(input.to) ? input.to : fallback.to

  if (to > fallback.to) {
    to = fallback.to
  }

  if (from > to) {
    from = fallback.from
    to = fallback.to
  }

  const minFromForWindow = new Date(`${to}T00:00:00.000Z`)
  minFromForWindow.setUTCDate(
    minFromForWindow.getUTCDate() - (MAX_AUDIT_LOG_RANGE_DAYS - 1),
  )
  if (from < toDateKey(minFromForWindow)) {
    from = toDateKey(minFromForWindow)
  }

  return {
    from,
    to,
    start: new Date(`${from}T00:00:00.000Z`),
    end: new Date(`${to}T23:59:59.999Z`),
  }
}
