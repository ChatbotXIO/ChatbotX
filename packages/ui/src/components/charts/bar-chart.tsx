"use client"

import { Card, CardContent } from "@chatbotx.io/ui/components/ui/card"
import {
  ChartContainer,
  ChartLegend,
  ChartTooltip,
  ChartTooltipContent,
} from "@chatbotx.io/ui/components/ui/chart"
import { Bar, BarChart as BC, CartesianGrid, XAxis, YAxis } from "recharts"
import { useChartCardProvider } from "./chart-card-context"
import ChartHeader from "./chart-header"
import {
  getCategoricalColor,
  getSeriesColor,
  resolveColorIndex,
} from "./constants"

type BarValue = {
  label: string
  value: number
}

type DataItem = {
  name: string
  value: BarValue[]
}

type BarChartProps = {
  title: string
  data: DataItem[]
  helpText?: string
  /** Shown instead of an empty plot when no series has a value. */
  noDataLabel?: string
  /** Use clearly distinct hues per series (default: the theme chart palette). */
  categoricalColors?: boolean
  /**
   * Series labels in a fixed order that decides each series' colour, so
   * several charts can colour the same series identically. Labels not listed
   * follow after the listed ones. Absent: colours follow this chart's own order.
   */
  colorKeys?: string[]
  /** Locale for tooltip numbers (default: the browser locale). */
  locale?: string
}

export default function BarChart({
  title,
  data,
  helpText,
  noDataLabel,
  categoricalColors = false,
  colorKeys,
  locale,
}: BarChartProps) {
  const hasCardProvider = useChartCardProvider()
  const barLabels = Array.from(
    new Set(data.flatMap((item) => item.value.map((v) => v.label))),
  )
  const chartData = data.map((item) => {
    const obj: Record<string, number | string> = { name: item.name }
    for (const v of item.value) {
      obj[v.label] = v.value
    }
    return obj
  })
  const content = (
    <>
      <ChartHeader helpText={helpText} title={title} />

      <CardContent>
        {noDataLabel && barLabels.length === 0 ? (
          <p
            className="flex min-h-48 items-center justify-center text-muted-foreground text-sm"
            role="status"
          >
            {noDataLabel}
          </p>
        ) : (
          <ChartContainer
            config={Object.fromEntries(barLabels.map((l) => [l, { label: l }]))}
          >
            <BC data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis width="auto" />
              {barLabels.map((label, index) => (
                <Bar
                  dataKey={label}
                  fill={
                    categoricalColors
                      ? getCategoricalColor(
                          resolveColorIndex(label, index, barLabels, colorKeys),
                        )
                      : getSeriesColor(
                          resolveColorIndex(label, index, barLabels, colorKeys),
                        )
                  }
                  key={label}
                />
              ))}
              <ChartTooltip content={<ChartTooltipContent locale={locale} />} />
              {barLabels.length > 1 && <ChartLegend />}
            </BC>
          </ChartContainer>
        )}
      </CardContent>
    </>
  )

  return hasCardProvider ? content : <Card className="flex-1">{content}</Card>
}
