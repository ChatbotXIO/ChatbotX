import { googleAdsEventStatusValues } from "@chatbotx.io/database/partials"
import {
  type GoogleAdsActionStatsRow,
  type GoogleAdsDayChannelStatsRow,
  googleAdsConversionEventRepository,
} from "@chatbotx.io/database/repositories"
// Direct file imports: the `ads-analytics` index pulls in the Meta service graph.
import {
  enumerateDateKeys,
  parseAnalyticsDateRange,
} from "../ads-analytics/date-range"
import type { GoogleAdsStatusCounts } from "./stat-buckets"
import {
  type GetGoogleAdsStatsInput,
  type GoogleAdsStatsResponse,
  getGoogleAdsStatsInput,
} from "./stats-schema"

/** Actions returned in `byAction`; the repository is asked for one more to detect truncation. */
const BY_ACTION_LIMIT = 50

type FailuresByStage = GoogleAdsStatsResponse["failuresByStage"]

const emptyCounts = (): GoogleAdsStatusCounts => ({
  pending: 0,
  sending: 0,
  sent: 0,
  processed: 0,
  failed: 0,
  skipped_no_account: 0,
  skipped_expired: 0,
})

const emptyFailures = (): FailuresByStage => ({
  delivery: 0,
  processing: 0,
  timeout: 0,
  unknown: 0,
})

const addCounts = (
  base: GoogleAdsStatusCounts,
  row: GoogleAdsStatusCounts,
): GoogleAdsStatusCounts => {
  const next = { ...base }
  for (const status of googleAdsEventStatusValues) {
    next[status] += row[status]
  }
  return next
}

const sumCounts = (counts: GoogleAdsStatusCounts): number =>
  googleAdsEventStatusValues.reduce(
    (total, status) => total + counts[status],
    0,
  )

const pickCounts = (row: GoogleAdsStatusCounts): GoogleAdsStatusCounts => {
  const counts = emptyCounts()
  for (const status of googleAdsEventStatusValues) {
    counts[status] = row[status]
  }
  return counts
}

/** processed / (processed + failed); queued, awaiting and skipped outcomes are not final. */
const deliveryRate = (counts: GoogleAdsStatusCounts): number | null => {
  const decided = counts.processed + counts.failed
  return decided === 0 ? null : counts.processed / decided
}

const toAction = (row: GoogleAdsActionStatsRow) => {
  const counts = pickCounts(row)
  return {
    conversionActionId: row.conversionActionId,
    name: row.name,
    category: row.category,
    total: sumCounts(counts),
    counts,
  }
}

/**
 * Everything but `byAction` and `confirmedValue` comes from the same
 * day x channel rows, so totals, series and channels always agree.
 */
const aggregateDayChannelRows = (
  rows: GoogleAdsDayChannelStatsRow[],
  dateKeys: string[],
) => {
  const byDate = new Map(dateKeys.map((date) => [date, emptyCounts()]))
  const byChannel = new Map<string, GoogleAdsStatusCounts>()
  let totals = emptyCounts()
  const failures = emptyFailures()

  for (const row of rows) {
    const day = byDate.get(row.date)
    // Every block derives from the same rows, so a row whose day key is not
    // one of the enumerated days (the window and the SQL buckets resolved the
    // timezone differently) is dropped from ALL of them rather than letting
    // totals and timeseries disagree. `byAction` and `confirmedValue` are
    // separate reads and still count it.
    if (!day) {
      continue
    }
    const counts = pickCounts(row)
    totals = addCounts(totals, counts)
    byChannel.set(
      row.channel,
      addCounts(byChannel.get(row.channel) ?? emptyCounts(), counts),
    )
    byDate.set(row.date, addCounts(day, counts))
    failures.delivery += row.failedDelivery
    failures.processing += row.failedProcessing
    failures.timeout += row.failedTimeout
    failures.unknown += row.failedUnknown
  }

  return {
    totals: {
      ...totals,
      total: sumCounts(totals),
      deliveryRate: deliveryRate(totals),
    },
    failuresByStage: failures,
    timeseries: dateKeys.map((date) => ({
      date,
      counts: byDate.get(date) ?? emptyCounts(),
    })),
    byChannel: [...byChannel]
      .map(([channel, counts]) => ({
        channel,
        total: sumCounts(counts),
        counts,
      }))
      .sort((a, b) => b.total - a.total || a.channel.localeCompare(b.channel)),
  }
}

/** Conversion statistics for the dashboard and the public API; no SQL and no UI wording. */
export async function getGoogleAdsStats(
  rawInput: GetGoogleAdsStatsInput,
): Promise<GoogleAdsStatsResponse> {
  const input = getGoogleAdsStatsInput.parse(rawInput)
  const { since, until, from, to, timezone } = parseAnalyticsDateRange(input)
  const filters = {
    workspaceId: input.workspaceId,
    since,
    until,
    channel: input.channel,
    conversionActionId: input.conversionActionId,
  }

  // One Promise.all: a failing query fails the call, nothing partial returns.
  const [dayRows, actionRows, valueRows] = await Promise.all([
    googleAdsConversionEventRepository.statsByDayAndChannel(filters, timezone),
    googleAdsConversionEventRepository.statsByAction(filters, BY_ACTION_LIMIT),
    googleAdsConversionEventRepository.confirmedValueByCurrency(filters),
  ])

  return {
    range: { from, to, tz: timezone },
    ...aggregateDayChannelRows(dayRows, enumerateDateKeys(from, to)),
    confirmedValue: valueRows.flatMap((row) =>
      row.currency === null
        ? []
        : [{ currency: row.currency, value: row.value, count: row.count }],
    ),
    byAction: actionRows.slice(0, BY_ACTION_LIMIT).map(toAction),
    // `byAction` is a separate read: it can differ from `totals` under concurrent status changes.
    byActionTruncated: actionRows.length > BY_ACTION_LIMIT,
  }
}
