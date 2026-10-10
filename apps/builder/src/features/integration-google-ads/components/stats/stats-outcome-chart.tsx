"use client"

import type { GoogleAdsStatsResponse } from "@chatbotx.io/business"
import { toStatBuckets } from "@chatbotx.io/business/google-ads/stat-buckets"
import { Card, CardContent } from "@chatbotx.io/ui/components/ui/card"
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@chatbotx.io/ui/components/ui/chart"
import { useLocale, useTranslations } from "next-intl"
import { Cell, Pie, PieChart } from "recharts"
import {
  bucketChartColor,
  bucketLabelKey,
  STAT_BUCKET_ORDER,
} from "../../lib/stats-buckets"
import { formatCount } from "../../lib/stats-format"

/** Share of each outcome over the whole range; the list beside it carries the same numbers for assistive tech. */
export function StatsOutcomeChart({
  totals,
}: {
  totals: GoogleAdsStatsResponse["totals"]
}) {
  const t = useTranslations()
  const locale = useLocale()
  const buckets = toStatBuckets(totals)
  const total = STAT_BUCKET_ORDER.reduce(
    (sum, bucket) => sum + buckets[bucket],
    0,
  )
  const percent = new Intl.NumberFormat(locale, {
    style: "percent",
    maximumFractionDigits: 0,
  })

  const chartConfig = Object.fromEntries(
    STAT_BUCKET_ORDER.map((bucket) => [
      bucket,
      { label: t(bucketLabelKey[bucket]), color: bucketChartColor[bucket] },
    ]),
  ) satisfies ChartConfig

  // An empty range draws one neutral ring instead of an invisible chart.
  const slices =
    total === 0
      ? [{ bucket: "empty", value: 1, fill: "var(--color-muted)" }]
      : STAT_BUCKET_ORDER.filter((bucket) => buckets[bucket] > 0).map(
          (bucket) => ({
            bucket,
            value: buckets[bucket],
            fill: `var(--color-${bucket})`,
          }),
        )

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-5">
        <h3 className="font-medium text-sm">
          {t("googleAds.stats.outcome.title")}
        </h3>
        <ChartContainer
          className="mx-auto aspect-auto h-40 w-40"
          config={chartConfig}
        >
          <PieChart>
            {total === 0 ? null : (
              <ChartTooltip
                content={<ChartTooltipContent hideLabel nameKey="bucket" />}
              />
            )}
            <Pie
              data={slices}
              dataKey="value"
              innerRadius={44}
              nameKey="bucket"
              stroke="none"
            >
              {slices.map((slice) => (
                <Cell fill={slice.fill} key={slice.bucket} />
              ))}
            </Pie>
          </PieChart>
        </ChartContainer>
        <dl className="flex flex-col gap-1.5 text-sm">
          {STAT_BUCKET_ORDER.map((bucket) => (
            <div
              className="flex items-baseline justify-between gap-3"
              key={bucket}
            >
              <dt className="flex items-center gap-2 text-muted-foreground">
                <span
                  aria-hidden
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: bucketChartColor[bucket] }}
                />
                {t(bucketLabelKey[bucket])}
              </dt>
              <dd className="tabular-nums">
                {formatCount(locale, buckets[bucket])}
                {total === 0 ? null : (
                  <span className="ms-1.5 text-muted-foreground">
                    {percent.format(buckets[bucket] / total)}
                  </span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  )
}
