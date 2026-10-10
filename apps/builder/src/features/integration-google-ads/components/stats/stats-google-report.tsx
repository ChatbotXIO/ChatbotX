"use client"

import type {
  GoogleAdsConversionReport,
  GoogleAdsStatsResponse,
} from "@chatbotx.io/business"
import { toStatBuckets } from "@chatbotx.io/business/google-ads/stat-buckets"
import { Card, CardContent } from "@chatbotx.io/ui/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@chatbotx.io/ui/components/ui/table"
import { useLocale, useTranslations } from "next-intl"
import { formatCount } from "../../lib/stats-format"

/** Google's own conversion count next to what ChatbotX sent, so a gap is visible. */
export function StatsGoogleReport({
  report,
  byAction,
}: {
  report: GoogleAdsConversionReport
  byAction: GoogleAdsStatsResponse["byAction"]
}) {
  const t = useTranslations()
  const locale = useLocale()

  if (report.status === "unavailable") {
    return (
      <p className="text-muted-foreground text-sm">
        {t("googleAds.stats.googleReport.unavailable")}
      </p>
    )
  }

  const reported = new Map(
    report.byAction.map((row) => [row.conversionActionId, row]),
  )
  const sent = new Map(
    byAction.map((row) => [row.conversionActionId, row] as const),
  )
  const ids = [...new Set([...sent.keys(), ...reported.keys()])]

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-5">
        <div className="flex flex-col gap-1">
          <h3 className="font-medium text-sm">
            {t("googleAds.stats.googleReport.title")}
          </h3>
          <p className="text-muted-foreground text-xs">
            {t("googleAds.stats.googleReport.description")}
          </p>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">
                {t("googleAds.stats.filters.actionLabel")}
              </TableHead>
              <TableHead className="text-end" scope="col">
                {t("googleAds.stats.googleReport.sent")}
              </TableHead>
              <TableHead className="text-end" scope="col">
                {t("googleAds.stats.googleReport.reported")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ids.map((id) => {
              const mine = sent.get(id)
              const theirs = reported.get(id)
              return (
                <TableRow key={id}>
                  <TableHead className="max-w-64 whitespace-normal" scope="row">
                    <span className="break-words">
                      {mine?.name ??
                        theirs?.name ??
                        t("googleAds.stats.actionFallback", { id })}
                    </span>
                  </TableHead>
                  <TableCell className="text-end tabular-nums">
                    {formatCount(
                      locale,
                      mine ? toStatBuckets(mine.counts).confirmed : 0,
                    )}
                  </TableCell>
                  <TableCell className="text-end tabular-nums">
                    {formatCount(locale, theirs?.conversions ?? 0)}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
        <p className="text-muted-foreground text-xs">
          {t("googleAds.stats.googleReport.note")}
        </p>
      </CardContent>
    </Card>
  )
}
