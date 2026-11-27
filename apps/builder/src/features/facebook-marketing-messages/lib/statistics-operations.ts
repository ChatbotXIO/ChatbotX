import "server-only"

import { facebookMarketingMessagesService } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import type { WorkspaceModel } from "@chatbotx.io/database/types"
import {
  getMarketingMessagesAdAccounts,
  getMarketingMessagesAdInsights,
  getMarketingMessagesAggregateInsights,
  type MarketingMessagesInsightMetrics,
} from "@chatbotx.io/integration-facebook-ads"
import { getChildLogger } from "@chatbotx.io/logger"
import { withCache } from "@chatbotx.io/redis"
import { sha256Hex } from "@chatbotx.io/utils/crypto"
import { getTranslations } from "next-intl/server"
import type { StatisticsInput, StatisticsOutput } from "../schema/statistics"
import { requireValidGrant } from "./grant"
import { isRangeWithinLimit, statisticsPresetRange } from "./statistics-range"

const logger = getChildLogger("fb-marketing-messages:statistics")

/** Insights are near-live on Meta's side; 10 minutes keeps Graph calls low. */
const INSIGHTS_CACHE_TTL_SECONDS = 600

const NO_METRICS: MarketingMessagesInsightMetrics = {
  delivered: null,
  readRate: null,
  linkClicks: null,
  linkClickRate: null,
  costPerClick: null,
  costPerDelivery: null,
  spend: null,
}

function pickMetrics(
  source: MarketingMessagesInsightMetrics,
): MarketingMessagesInsightMetrics {
  return {
    delivered: source.delivered,
    readRate: source.readRate,
    linkClicks: source.linkClicks,
    linkClickRate: source.linkClickRate,
    costPerClick: source.costPerClick,
    costPerDelivery: source.costPerDelivery,
    spend: source.spend,
  }
}

/** Order-insensitive cache-key fragment for an ad id set (Web Crypto: Edge-safe). */
function hashIds(ids: string[]): Promise<string> {
  return sha256Hex([...ids].sort().join(","))
}

/**
 * The Statistics tab read — one implementation behind the public API and
 * the builder's private procedure (AGENTS.md invariant 23).
 *
 * Campaign rows (search, sort, paging) come from our DB; Meta supplies the
 * numbers for exactly the current page in two Graph calls: per-ad rows and
 * the page aggregate (spec U3/U4). The workspace must own a campaign on the
 * requested ad account, so the grant cannot be used to read arbitrary
 * accounts.
 */
export async function getMarketingMessagesStatistics(
  workspace: WorkspaceModel,
  input: StatisticsInput,
  now = new Date(),
): Promise<StatisticsOutput> {
  const t = await getTranslations()
  const invalidRange = () =>
    new ChatbotXException(
      t("facebookMarketingMessages.errors.statisticsInvalidRange"),
      "mmStatisticsInvalidRange",
      400,
    )
  // Validation and the DB-only paths run before the grant check and any
  // Graph call, so bad input is a 400 and an empty workspace renders its
  // empty state even while Meta is unreachable.
  if (
    input.since &&
    input.until &&
    !isRangeWithinLimit(input.since, input.until)
  ) {
    throw invalidRange()
  }

  const workspaceAccounts =
    await facebookMarketingMessagesService.listAdAccountsByWorkspaceId(
      workspace.id,
    )
  const pagination = { page: input.page, perPage: input.perPage }
  const selected = input.adAccountId
    ? workspaceAccounts.find((a) => a.adAccountId === input.adAccountId)
    : workspaceAccounts[0]
  if (input.adAccountId && !selected) {
    throw new ChatbotXException(
      t("facebookMarketingMessages.errors.statisticsUnknownAdAccount"),
      "mmStatisticsUnknownAdAccount",
      400,
    )
  }

  if (!selected) {
    const range = statisticsPresetRange("last30", "UTC", now)
    return {
      adAccountId: null,
      adAccounts: [],
      currency: null,
      timezone: "UTC",
      since: input.since ?? range.since,
      until: input.until ?? range.until,
      rows: [],
      aggregate: null,
      aggregateUnavailable: false,
      pagination: { ...pagination, total: 0, pageCount: 0 },
    }
  }

  const grant = await requireValidGrant(workspace)
  // Only names and the live timezone come from here (spec C6), so a failure
  // degrades to the stored timezone and id-only labels instead of failing.
  const metaAccounts = await withCache(
    `mm-stats:accounts:${workspace.id}`,
    () => getMarketingMessagesAdAccounts(grant.accessToken, grant.version),
    { ttl: INSIGHTS_CACHE_TTL_SECONDS },
  ).catch((err: unknown) => {
    logger.warn(
      { err, workspaceId: workspace.id },
      "Marketing Messages statistics ad account lookup failed",
    )
    return []
  })
  const metaById = new Map(metaAccounts.map((account) => [account.id, account]))
  const adAccounts = workspaceAccounts.map((account) => ({
    id: account.adAccountId,
    name: metaById.get(account.adAccountId)?.name ?? null,
  }))

  const timezone =
    metaById.get(selected.adAccountId)?.timezoneName ||
    selected.timezoneName ||
    "UTC"
  const defaults = statisticsPresetRange("last30", timezone, now)
  const since = input.since ?? defaults.since
  const until = input.until ?? defaults.until
  if (!isRangeWithinLimit(since, until)) {
    throw invalidRange()
  }

  const page = await facebookMarketingMessagesService.listForStatistics({
    workspaceId: workspace.id,
    adAccountId: selected.adAccountId,
    search: input.search,
    page: input.page,
    perPage: input.perPage,
    sort: input.sort
      ? [{ id: input.sort, desc: input.order === "desc" }]
      : undefined,
  })
  const adIds = page.data.map((row) => row.campaignId)

  let insights: Awaited<ReturnType<typeof getMarketingMessagesAdInsights>> = []
  let aggregate: Awaited<
    ReturnType<typeof getMarketingMessagesAggregateInsights>
  > = null
  let aggregateUnavailable = false

  if (adIds.length > 0) {
    const graphInput = {
      accessToken: grant.accessToken,
      version: grant.version,
      adAccountId: selected.adAccountId,
      adIds,
      since,
      until,
    }
    const keyBase = `mm-stats:${workspace.id}:${selected.adAccountId}:${since}:${until}`
    const idsHash = await hashIds(adIds)
    const [rowsResult, aggregateResult] = await Promise.allSettled([
      withCache(
        `${keyBase}:ad:${idsHash}`,
        () => getMarketingMessagesAdInsights(graphInput),
        { ttl: INSIGHTS_CACHE_TTL_SECONDS },
      ),
      withCache(
        `${keyBase}:account:${idsHash}`,
        () => getMarketingMessagesAggregateInsights(graphInput),
        { ttl: INSIGHTS_CACHE_TTL_SECONDS },
      ),
    ])
    if (rowsResult.status === "rejected") {
      throw rowsResult.reason
    }
    insights = rowsResult.value
    if (aggregateResult.status === "fulfilled") {
      aggregate = aggregateResult.value
    } else {
      // Spec C5: the table still renders; only the footer is unavailable.
      aggregateUnavailable = true
      logger.warn(
        { err: aggregateResult.reason, workspaceId: workspace.id },
        "Marketing Messages statistics aggregate failed",
      )
    }
  }

  const insightById = new Map(insights.map((row) => [row.adId, row]))
  const currency =
    insights.find((row) => row.currency)?.currency ??
    aggregate?.currency ??
    selected.currency

  return {
    adAccountId: selected.adAccountId,
    adAccounts,
    currency,
    timezone,
    since,
    until,
    rows: page.data.map((row) => {
      const insight = insightById.get(row.campaignId)
      return {
        id: row.id,
        campaignId: row.campaignId,
        name: row.name,
        pageId: row.pageId,
        ...(insight ? pickMetrics(insight) : NO_METRICS),
      }
    }),
    aggregate: aggregate ? pickMetrics(aggregate) : null,
    aggregateUnavailable,
    pagination: { ...pagination, total: page.total, pageCount: page.pageCount },
  }
}
