"use client"

import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@chatbotx.io/ui/components/ui/chart"
import { Skeleton } from "@chatbotx.io/ui/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@chatbotx.io/ui/components/ui/table"
import { useLocale, useTranslations } from "next-intl"
import { useMemo } from "react"
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { formatCount, formatGain } from "../lib/analytics-format"
import { type MergedSeries, OTHER_SERIES_KEY } from "../lib/series"

const SERIES_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
]
const OTHER_COLOR = "var(--muted-foreground)"
const CHART_HEIGHT_CLASS = "h-64 w-full"

const colorOf = (key: string, index: number): string =>
  key === OTHER_SERIES_KEY
    ? OTHER_COLOR
    : (SERIES_COLORS[index % SERIES_COLORS.length] ?? OTHER_COLOR)

const toLocalDate = (day: string): Date => new Date(`${day}T00:00:00`)

export const ChartSkeleton = () => <Skeleton className={CHART_HEIGHT_CLASS} />

/**
 * The per-day gain as an area chart. The same numbers are available as a table
 * (`DailyGainTable`), the chart itself carries a text summary.
 */
export const DailyGainChart = ({
  labelOf,
  merged,
  summary,
}: {
  labelOf: (key: string) => string
  merged: MergedSeries
  /** A sentence with the metric, range and total, read in place of the picture. */
  summary: string
}) => {
  const locale = useLocale()
  const config = useMemo<ChartConfig>(
    () =>
      Object.fromEntries(
        merged.keys.map((key, index) => [
          key,
          { color: colorOf(key, index), label: labelOf(key) },
        ]),
      ),
    [labelOf, merged.keys],
  )
  const dayFormat = useMemo(
    () => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }),
    [locale],
  )

  return (
    <div aria-label={summary} role="img">
      <ChartContainer className={CHART_HEIGHT_CLASS} config={config}>
        <AreaChart data={merged.rows}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="day"
            minTickGap={28}
            tickFormatter={(day: string) => dayFormat.format(toLocalDate(day))}
            tickMargin={8}
          />
          <YAxis
            tickFormatter={(value: number) => formatCount(value, locale)}
            width="auto"
          />
          {merged.keys.map((key, index) => (
            <Area
              dataKey={key}
              fill={colorOf(key, index)}
              fillOpacity={0.18}
              key={key}
              stroke={colorOf(key, index)}
              strokeDasharray={index % 2 === 1 ? "5 3" : undefined}
              strokeWidth={2}
              type="monotone"
            />
          ))}
          <ChartTooltip
            content={
              <ChartTooltipContent
                labelFormatter={(_, payload) => {
                  const day = payload?.[0]?.payload?.day
                  return typeof day === "string"
                    ? dayFormat.format(toLocalDate(day))
                    : ""
                }}
              />
            }
          />
        </AreaChart>
      </ChartContainer>
      {merged.keys.length > 1 ? (
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {merged.keys.map((key, index) => (
            <li className="flex items-center gap-1.5" key={key}>
              <span
                aria-hidden="true"
                className="inline-block h-0.5 w-4"
                style={{
                  background: colorOf(key, index),
                  opacity: index % 2 === 1 ? 0.6 : 1,
                }}
              />
              {labelOf(key)}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

/** The chart's numbers: one row per day, one column per series. */
export const DailyGainTable = ({
  caption,
  labelOf,
  merged,
}: {
  caption: string
  labelOf: (key: string) => string
  merged: MergedSeries
}) => {
  const t = useTranslations("posts.analytics.chart")
  const locale = useLocale()
  const dayFormat = new Intl.DateTimeFormat(locale, { dateStyle: "medium" })
  return (
    <div className="max-h-72 overflow-auto rounded-lg border">
      <Table>
        <caption className="sr-only">{caption}</caption>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">{t("day")}</TableHead>
            {merged.keys.map((key) => (
              <TableHead className="text-end" key={key} scope="col">
                {labelOf(key)}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {merged.rows.map((row) => (
            <TableRow key={row.day}>
              <TableHead scope="row">
                {dayFormat.format(toLocalDate(row.day))}
              </TableHead>
              {merged.keys.map((key) => (
                <TableCell className="text-end tabular-nums" key={key}>
                  {formatGain(Number(row[key] ?? 0), locale)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
