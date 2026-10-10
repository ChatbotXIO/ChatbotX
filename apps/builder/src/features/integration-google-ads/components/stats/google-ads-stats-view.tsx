"use client"

import type {
  GoogleAdsConversionReport,
  GoogleAdsStatsResponse,
} from "@chatbotx.io/business"
import { buttonVariants } from "@chatbotx.io/ui/components/ui/button"
import { Card, CardContent } from "@chatbotx.io/ui/components/ui/card"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { GOOGLE_ADS_CHANNEL_VALUES } from "@chatbotx.io/utils/google-click"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useWorkspaceId } from "@/hooks/routing"
import { useStatsFilters } from "../../hooks/use-stats-filters"
import { ConfirmedValueLine } from "./confirmed-value-line"
import {
  ByActionTable,
  ByChannelList,
  FailuresByStageList,
} from "./stats-breakdowns"
import { StatsChart } from "./stats-chart"
import { type StatsActionOption, StatsFilters } from "./stats-filters"
import { StatsGoogleReport } from "./stats-google-report"
import { StatsOutcomeChart } from "./stats-outcome-chart"
import { StatsTiles } from "./stats-tiles"

type GoogleAdsStatsViewProps = {
  stats: GoogleAdsStatsResponse
  /** A Google Ads account is connected (history shows either way). */
  connected: boolean
  /** Floors the "Lifetime" preset at workspace birth. */
  workspaceCreatedAt: Date
  /** One instant captured by the server for this request (ISO). */
  referenceNow: string
  channel: string | null
  action: string | null
  /** Synced conversion actions, so the select can switch away from a filtered action. */
  syncedActions: readonly StatsActionOption[]
  /** What Google reports for the same days; absent when no account is connected. */
  googleReport?: GoogleAdsConversionReport
}

/** Synced actions first, then any action that only exists in the data (removed or renamed in Google). */
const mergeActions = (
  synced: readonly StatsActionOption[],
  byAction: GoogleAdsStatsResponse["byAction"],
): StatsActionOption[] => {
  const known = new Set(synced.map((action) => action.id))
  const dataOnly = byAction
    .filter((row) => !known.has(row.conversionActionId))
    .map((row) => ({ id: row.conversionActionId, name: row.name }))
  return [...synced, ...dataOnly]
}

const ZERO_COUNTS: GoogleAdsStatsResponse["byAction"][number]["counts"] = {
  pending: 0,
  sending: 0,
  sent: 0,
  processed: 0,
  failed: 0,
  skipped_no_account: 0,
  skipped_expired: 0,
}

/** A connected account with no conversions still lists its actions and channels, at zero. */
const withZeroRows = (
  stats: GoogleAdsStatsResponse,
  syncedActions: readonly StatsActionOption[],
): Pick<GoogleAdsStatsResponse, "byAction" | "byChannel"> => ({
  byAction:
    stats.byAction.length > 0
      ? stats.byAction
      : syncedActions.map((action) => ({
          conversionActionId: action.id,
          name: action.name,
          category: null,
          total: 0,
          counts: ZERO_COUNTS,
        })),
  byChannel:
    stats.byChannel.length > 0
      ? stats.byChannel
      : GOOGLE_ADS_CHANNEL_VALUES.map((channel) => ({
          channel,
          total: 0,
          counts: ZERO_COUNTS,
        })),
})

function EmptyState({
  workspaceId,
  connected,
}: {
  workspaceId: string
  connected: boolean
}) {
  const t = useTranslations()
  return (
    <Card>
      <CardContent className="flex flex-col items-start gap-2 p-6">
        <h3 className="font-medium">{t("googleAds.stats.empty.title")}</h3>
        <p className="text-muted-foreground text-sm">
          {t("googleAds.stats.empty.description")}
        </p>
        {connected ? null : (
          <Link
            className={buttonVariants({ size: "sm", variant: "outline" })}
            href={`/space/${workspaceId}/settings/integrations/google-ads`}
          >
            {t("googleAds.stats.openSettings")}
          </Link>
        )}
      </CardContent>
    </Card>
  )
}

export function GoogleAdsStatsView({
  stats,
  connected,
  workspaceCreatedAt,
  referenceNow,
  channel,
  action,
  syncedActions,
  googleReport,
}: GoogleAdsStatsViewProps) {
  const workspaceId = useWorkspaceId()
  const { isPending, pushRange, setParam } = useStatsFilters(stats.range.tz)
  const t = useTranslations()
  const hasData = stats.totals.total > 0
  // Not connected and nothing recorded: explain how to start. Connected (or with
  // history): the real dashboard, at zero when the range is empty.
  const showDashboard = connected || hasData
  const rows = withZeroRows(stats, syncedActions)

  return (
    <div className="flex min-w-0 flex-col gap-5">
      {/* Same shape as the Click-to-WhatsApp / Messenger dashboards: no page
          title, just the filters aligned to the end. */}
      <div className="flex justify-end">
        <StatsFilters
          action={action}
          actions={mergeActions(syncedActions, stats.byAction)}
          channel={channel}
          onParamChange={setParam}
          onRangeChange={pushRange}
          range={stats.range}
          referenceNow={referenceNow}
          workspaceCreatedAt={workspaceCreatedAt}
        />
      </div>

      <div
        aria-busy={isPending}
        className={cn(
          "flex min-w-0 flex-col gap-5 transition-opacity",
          isPending && "opacity-60",
        )}
      >
        {showDashboard ? (
          <>
            {hasData ? null : (
              <p className="text-muted-foreground text-sm">
                {t("googleAds.stats.empty.title")}.{" "}
                {t("googleAds.stats.empty.description")}
              </p>
            )}
            <StatsTiles totals={stats.totals} />
            <ConfirmedValueLine items={stats.confirmedValue} />
            <StatsChart timeseries={stats.timeseries} />
            <ByActionTable
              isTruncated={stats.byActionTruncated}
              rows={rows.byAction}
            />
            {googleReport ? (
              <StatsGoogleReport
                byAction={rows.byAction}
                report={googleReport}
              />
            ) : null}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <StatsOutcomeChart totals={stats.totals} />
              <ByChannelList rows={rows.byChannel} />
              <FailuresByStageList failures={stats.failuresByStage} />
            </div>
          </>
        ) : (
          <EmptyState connected={connected} workspaceId={workspaceId} />
        )}
      </div>
    </div>
  )
}
