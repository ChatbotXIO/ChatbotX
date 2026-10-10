"use client"

import type { GoogleAdsStatsResponse } from "@chatbotx.io/business"
import { toStatBuckets } from "@chatbotx.io/business/google-ads/stat-buckets"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Card, CardContent } from "@chatbotx.io/ui/components/ui/card"
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@chatbotx.io/ui/components/ui/chart"
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@chatbotx.io/ui/components/ui/table"
import { useLocale, useTranslations } from "next-intl"
import { useState } from "react"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import {
  bucketChartColor,
  bucketLabelKey,
  STAT_BUCKET_ORDER,
} from "../../lib/stats-buckets"
import { formatCount, formatDayKey } from "../../lib/stats-format"

type Timeseries = GoogleAdsStatsResponse["timeseries"]

const toRows = (timeseries: Timeseries) =>
  timeseries.map((day) => ({ date: day.date, ...toStatBuckets(day.counts) }))

/** Per-day stacked chart; "View as table" swaps it for the same numbers as a table (the chart itself is not readable by assistive tech). */
export function StatsChart({ timeseries }: { timeseries: Timeseries }) {
  const t = useTranslations()
  const locale = useLocale()
  const [asTable, setAsTable] = useState(false)
  const rows = toRows(timeseries)

  const chartConfig = Object.fromEntries(
    STAT_BUCKET_ORDER.map((bucket) => [
      bucket,
      { label: t(bucketLabelKey[bucket]), color: bucketChartColor[bucket] },
    ]),
  ) satisfies ChartConfig

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-medium text-sm">
            {t("googleAds.stats.chart.title")}
          </h3>
          <Button
            aria-pressed={asTable}
            onClick={() => setAsTable((current) => !current)}
            size="sm"
            type="button"
            variant="outline"
          >
            {t("googleAds.stats.chart.viewAsTable")}
          </Button>
        </div>
        {asTable ? (
          <div className="max-h-80 overflow-auto">
            <Table>
              <TableCaption className="sr-only">
                {t("googleAds.stats.chart.tableCaption")}
              </TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">
                    {t("googleAds.stats.chart.dateColumn")}
                  </TableHead>
                  {STAT_BUCKET_ORDER.map((bucket) => (
                    <TableHead className="text-end" key={bucket} scope="col">
                      {t(bucketLabelKey[bucket])}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.date}>
                    <TableHead scope="row">
                      {formatDayKey(locale, row.date)}
                    </TableHead>
                    {STAT_BUCKET_ORDER.map((bucket) => (
                      <TableCell className="text-end tabular-nums" key={bucket}>
                        {formatCount(locale, row[bucket])}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <ChartContainer
            className="aspect-auto h-72 w-full"
            config={chartConfig}
          >
            <BarChart data={rows}>
              <CartesianGrid vertical={false} />
              <XAxis
                axisLine={false}
                dataKey="date"
                minTickGap={24}
                tickFormatter={(value: string) => formatDayKey(locale, value)}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                axisLine={false}
                tickLine={false}
                width={40}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={(value) =>
                      formatDayKey(locale, String(value))
                    }
                  />
                }
              />
              <ChartLegend content={<ChartLegendContent />} />
              {STAT_BUCKET_ORDER.map((bucket) => (
                <Bar
                  dataKey={bucket}
                  fill={`var(--color-${bucket})`}
                  key={bucket}
                  stackId="conversions"
                />
              ))}
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}
