"use client"

import { Card, CardContent } from "@chatbotx.io/ui/components/ui/card"
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@chatbotx.io/ui/components/ui/chart"
import { useTranslations } from "next-intl"
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"
import type { AdsAnalyticsTimeseriesRow } from "../queries/analytics"

type AdsPerformanceChartProps = {
  data: AdsAnalyticsTimeseriesRow[]
}

export function AdsPerformanceChart({ data }: AdsPerformanceChartProps) {
  const t = useTranslations()

  const chartConfig = {
    conversations: {
      label: t("ads.analytics.conversationsStarted"),
      color: "var(--color-chart-1)",
    },
    leads: {
      label: t("ads.analytics.qualifiedLeads"),
      color: "var(--color-chart-2)",
    },
    purchases: {
      label: t("ads.analytics.purchases"),
      color: "var(--color-chart-3)",
    },
    spend: {
      label: t("ads.analytics.adSpend"),
      color: "var(--color-chart-4)",
    },
  } satisfies ChartConfig

  const hasData = data.some(
    (row) =>
      row.conversations > 0 ||
      row.leads > 0 ||
      row.purchases > 0 ||
      (row.spend ?? 0) > 0,
  )

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-5">
        <div className="font-medium text-sm">
          {t("ads.analytics.performanceChart.title")}
        </div>
        {hasData ? (
          <ChartContainer
            className="aspect-auto h-72 w-full"
            config={chartConfig}
          >
            <LineChart data={data}>
              <CartesianGrid vertical={false} />
              <XAxis axisLine={false} dataKey="date" tickLine={false} />
              <YAxis
                axisLine={false}
                tickLine={false}
                width={40}
                yAxisId="count"
              />
              <YAxis
                axisLine={false}
                orientation="right"
                tickLine={false}
                width={60}
                yAxisId="spend"
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Line
                dataKey="conversations"
                dot={false}
                stroke="var(--color-conversations)"
                type="monotone"
                yAxisId="count"
              />
              <Line
                dataKey="leads"
                dot={false}
                stroke="var(--color-leads)"
                type="monotone"
                yAxisId="count"
              />
              <Line
                dataKey="purchases"
                dot={false}
                stroke="var(--color-purchases)"
                type="monotone"
                yAxisId="count"
              />
              <Line
                dataKey="spend"
                dot={false}
                stroke="var(--color-spend)"
                strokeDasharray="4 4"
                type="monotone"
                yAxisId="spend"
              />
            </LineChart>
          </ChartContainer>
        ) : (
          <div className="text-muted-foreground text-sm">
            {t("ads.analytics.performanceChart.empty")}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
