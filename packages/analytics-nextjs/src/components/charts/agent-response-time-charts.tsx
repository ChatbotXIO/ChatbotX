"use client"

import BarChart from "@chatbotx.io/ui/components/charts/bar-chart"
import { useLocale, useTranslations } from "next-intl"
import { useMemo } from "react"
import { useAnalysisStore } from "../../provider/analysis-store-context"
import {
  type AgentResponseSeriesMetric,
  buildAgentResponseChartData,
  buildAgentResponseColorKeys,
} from "../../utils/agent-response-series"

function useAgentResponseChartData(metric: AgentResponseSeriesMetric) {
  const locale = useLocale()
  const rows = useAnalysisStore((state) => state.agentResponseSeries)

  return useMemo(
    () => ({
      data: buildAgentResponseChartData({ rows, metric, locale }),
      colorKeys: buildAgentResponseColorKeys(rows),
    }),
    [rows, metric, locale],
  )
}

export function AverageFirstResponseTimeWithinWorkingHoursChart() {
  const t = useTranslations()
  const locale = useLocale()
  const { data, colorKeys } = useAgentResponseChartData(
    "avgWorkingFirstResponseSeconds",
  )

  return (
    <BarChart
      categoricalColors
      colorKeys={colorKeys}
      data={data}
      helpText={t(
        "analytics.averageFirstResponseTimeWithinWorkingHoursByAdminHelp",
      )}
      locale={locale}
      noDataLabel={t("analytics.noData")}
      title={t("analytics.averageFirstResponseTimeWithinWorkingHoursByAdmin")}
    />
  )
}

export function AverageResponseTimeWithinWorkingHoursChart() {
  const t = useTranslations()
  const locale = useLocale()
  const { data, colorKeys } = useAgentResponseChartData(
    "avgWorkingResponseSeconds",
  )

  return (
    <BarChart
      categoricalColors
      colorKeys={colorKeys}
      data={data}
      helpText={t("analytics.averageResponseTimeWithinWorkingHoursByAdminHelp")}
      locale={locale}
      noDataLabel={t("analytics.noData")}
      title={t("analytics.averageResponseTimeWithinWorkingHoursByAdmin")}
    />
  )
}
