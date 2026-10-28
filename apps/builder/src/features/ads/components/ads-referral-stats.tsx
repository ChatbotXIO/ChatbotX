"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { Skeleton } from "@chatbotx.io/ui/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@chatbotx.io/ui/components/ui/table"
import type { AdsEligibleChannelType } from "@chatbotx.io/utils/channel"
import { ORPCError } from "@orpc/client"
import { type UseQueryResult, useQuery } from "@tanstack/react-query"
import { useLocale, useTranslations } from "next-intl"
import { formatCurrencyValue } from "@/features/integration-google-ads/lib/stats-format"
import { orpc } from "@/lib/orpc/query"
import type { ReferralStatsResponse } from "../schema/referral-stats"

const AD_ROWS_LIMIT = 50
/** `reportTimeoutException` in `@chatbotx.io/business`: retrying cannot help. */
const REPORT_TIMEOUT_CODE = "reportTimeout"
/** TanStack Query's default, kept for every failure except a timeout. */
const MAX_REPORT_RETRIES = 3
const SKELETON_ROW_KEYS = ["a", "b", "c"] as const

type AdReferralStat = ReferralStatsResponse["data"][number]

const isReportTimeout = (error: unknown): boolean =>
  error instanceof ORPCError && error.code === REPORT_TIMEOUT_CODE

/** A report that hit its 15s limit would hit it again, so it is not retried. */
const shouldRetryReport = (failureCount: number, error: unknown): boolean =>
  !isReportTimeout(error) && failureCount < MAX_REPORT_RETRIES

function formatRevenue(
  locale: string,
  revenue: AdReferralStat["revenue"],
): string {
  if (revenue.length === 0) {
    return "-"
  }
  return revenue
    .map(({ currency, amount }) => formatAmount(locale, currency, amount))
    .join(" + ")
}

/** No currency (a rule that recorded none) shows as a bare number. */
function formatAmount(
  locale: string,
  currency: string | null,
  amount: string,
): string {
  return currency
    ? formatCurrencyValue(locale, amount, currency)
    : new Intl.NumberFormat(locale).format(amount as Intl.StringNumericLiteral)
}

/**
 * Conversions are credited only once a conversion rule fires for a contact that
 * came from an ad; until then their three columns would be a wall of zeros.
 */
function AdStatsTable({
  rows,
  locale,
}: {
  rows: AdReferralStat[]
  locale: string
}) {
  const t = useTranslations("adsReferralStats")
  const hasConversions = rows.some(
    (ad) => ad.leads > 0 || ad.purchases > 0 || ad.revenue.length > 0,
  )

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("ad")}</TableHead>
          <TableHead className="text-right">{t("contacts")}</TableHead>
          <TableHead className="text-right">{t("firstTouch")}</TableHead>
          {hasConversions ? (
            <>
              <TableHead className="text-right">{t("leads")}</TableHead>
              <TableHead className="text-right">{t("purchases")}</TableHead>
              <TableHead className="text-right">{t("revenue")}</TableHead>
            </>
          ) : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((ad) => (
          <TableRow key={ad.adId}>
            <TableCell>
              <div className="font-medium">{ad.title ?? ad.adId}</div>
              {ad.title ? (
                <div className="font-mono text-muted-foreground text-xs">
                  {ad.adId}
                </div>
              ) : null}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {ad.anyTouchContacts.toLocaleString(locale)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {ad.firstTouchContacts.toLocaleString(locale)}
            </TableCell>
            {hasConversions ? (
              <>
                <TableCell className="text-right tabular-nums">
                  {ad.leads.toLocaleString(locale)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {ad.purchases.toLocaleString(locale)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatRevenue(locale, ad.revenue)}
                </TableCell>
              </>
            ) : null}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function StatsBody({
  stats,
  locale,
}: {
  stats: UseQueryResult<ReferralStatsResponse>
  locale: string
}) {
  const t = useTranslations("adsReferralStats")
  const tCommon = useTranslations()

  if (stats.isPending) {
    return (
      <div aria-busy="true" className="flex flex-col gap-2 px-6">
        {SKELETON_ROW_KEYS.map((key) => (
          <Skeleton className="h-9 w-full" key={key} />
        ))}
      </div>
    )
  }

  if (stats.isError) {
    return isReportTimeout(stats.error) ? (
      <p className="px-6 text-destructive text-sm" role="alert">
        {t("timeout")}
      </p>
    ) : (
      <div className="flex items-center gap-3 px-6">
        <p className="text-destructive text-sm" role="alert">
          {tCommon("messages.errorLoadingData")}
        </p>
        <Button
          onClick={() => stats.refetch()}
          size="sm"
          type="button"
          variant="outline"
        >
          {tCommon("actions.retry")}
        </Button>
      </div>
    )
  }

  if (stats.data.data.length === 0) {
    return <p className="px-6 text-muted-foreground text-sm">{t("empty")}</p>
  }

  return <AdStatsTable locale={locale} rows={stats.data.data} />
}

/**
 * Contacts per ad over the dashboard's date range: how many each ad reached,
 * how many met the business through it first, and (once any are credited) its
 * conversions. Loads on its own so a slow report never delays the dashboard.
 */
export function AdsReferralStats({
  workspaceId,
  channel,
  range,
}: {
  workspaceId: string
  channel: AdsEligibleChannelType
  range: { from: string; to: string; tz: string }
}) {
  const t = useTranslations("adsReferralStats")
  const locale = useLocale()
  const stats = useQuery({
    ...orpc.adsAPI.getReferralStats.queryOptions({
      input: {
        workspaceId,
        from: range.from,
        to: range.to,
        tz: range.tz || undefined,
        channel,
        limit: AD_ROWS_LIMIT,
      },
    }),
    retry: shouldRetryReport,
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        <StatsBody locale={locale} stats={stats} />
      </CardContent>
    </Card>
  )
}
