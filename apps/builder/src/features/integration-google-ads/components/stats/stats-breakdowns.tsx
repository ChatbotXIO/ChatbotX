"use client"

import type { GoogleAdsStatsResponse } from "@chatbotx.io/business"
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
import { bucketLabelKey, STAT_BUCKET_ORDER } from "../../lib/stats-buckets"
import { formatCount } from "../../lib/stats-format"
import { channelLabel, failureStageLabelKey } from "../../lib/status"

type Stats = GoogleAdsStatsResponse

export function ByActionTable({
  rows,
  isTruncated,
}: {
  rows: Stats["byAction"]
  isTruncated: boolean
}) {
  const t = useTranslations()
  const locale = useLocale()
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-5">
        <h3 className="font-medium text-sm">
          {t("googleAds.stats.byAction.title")}
        </h3>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">
                {t("googleAds.stats.filters.actionLabel")}
              </TableHead>
              {STAT_BUCKET_ORDER.map((bucket) => (
                <TableHead className="text-end" key={bucket} scope="col">
                  {t(bucketLabelKey[bucket])}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const buckets = toStatBuckets(row.counts)
              return (
                <TableRow key={row.conversionActionId}>
                  <TableHead className="max-w-64 whitespace-normal" scope="row">
                    <span className="break-words">
                      {row.name ??
                        t("googleAds.stats.actionFallback", {
                          id: row.conversionActionId,
                        })}
                    </span>
                    {row.category ? (
                      <span className="block font-mono font-normal text-muted-foreground text-xs">
                        {row.category}
                      </span>
                    ) : null}
                  </TableHead>
                  {STAT_BUCKET_ORDER.map((bucket) => (
                    <TableCell className="text-end tabular-nums" key={bucket}>
                      {formatCount(locale, buckets[bucket])}
                    </TableCell>
                  ))}
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
        {isTruncated ? (
          <p className="text-muted-foreground text-xs">
            {t("googleAds.stats.byAction.truncated")}
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}

const BreakdownList = ({
  title,
  items,
}: {
  title: string
  items: { key: string; label: string; value: string }[]
}) => (
  <Card>
    <CardContent className="flex flex-col gap-3 p-5">
      <h3 className="font-medium text-sm">{title}</h3>
      <dl className="flex flex-col gap-1.5 text-sm">
        {items.map((item) => (
          <div
            className="flex items-baseline justify-between gap-3"
            key={item.key}
          >
            <dt className="text-muted-foreground">{item.label}</dt>
            <dd className="tabular-nums">{item.value}</dd>
          </div>
        ))}
      </dl>
    </CardContent>
  </Card>
)

export function ByChannelList({ rows }: { rows: Stats["byChannel"] }) {
  const t = useTranslations()
  return (
    <BreakdownList
      items={rows.map((row) => ({
        key: row.channel,
        label: channelLabel(row.channel),
        value: t("googleAds.stats.byChannel.confirmedCount", {
          count: toStatBuckets(row.counts).confirmed,
        }),
      }))}
      title={t("googleAds.stats.byChannel.title")}
    />
  )
}

export function FailuresByStageList({
  failures,
}: {
  failures: Stats["failuresByStage"]
}) {
  const t = useTranslations()
  const locale = useLocale()
  const known = (["delivery", "processing", "timeout"] as const).map(
    (stage) => ({
      key: stage,
      label: t(failureStageLabelKey[stage]),
      value: formatCount(locale, failures[stage]),
    }),
  )
  // `unknown` is a data-quality fallback, so it only appears when it has rows.
  const unknown =
    failures.unknown > 0
      ? [
          {
            key: "unknown",
            label: t("googleAds.stats.failures.unknown"),
            value: formatCount(locale, failures.unknown),
          },
        ]
      : []
  return (
    <BreakdownList
      items={[...known, ...unknown]}
      title={t("googleAds.stats.failures.title")}
    />
  )
}
