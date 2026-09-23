"use client"

import { Card, CardContent } from "@chatbotx.io/ui/components/ui/card"
import {
  ChartContainer,
  ChartLegend,
  ChartTooltip,
  ChartTooltipContent,
} from "@chatbotx.io/ui/components/ui/chart"
import { Cell, PieChart as PC, Pie, ResponsiveContainer } from "recharts"
import { useChartCardProvider } from "./chart-card-context"
import ChartHeader from "./chart-header"
import { COLORS } from "./constants"

export interface DonutChartProps {
  data: Array<{ name: string; value: number; color?: string }>
  helpText?: string
  noDataLabel?: string
  title: string
  valueLabel: string
}

export function DonutChart({
  title,
  valueLabel,
  data,
  helpText,
  noDataLabel = "No data",
}: DonutChartProps) {
  const hasCardProvider = useChartCardProvider()
  const chartData =
    data.length === 0
      ? [{ name: noDataLabel, value: 0, color: "#e5e7eb" }]
      : data
  const content = (
    <>
      <ChartHeader helpText={helpText} title={title} />
      <CardContent>
        <ChartContainer config={{ value: { label: valueLabel } }}>
          <ResponsiveContainer height={300} width="100%">
            <PC>
              <Pie
                cx="50%"
                cy="50%"
                data={chartData}
                dataKey="value"
                innerRadius={60}
                nameKey="name"
                outerRadius={100}
              >
                {chartData.map((entry, index) => (
                  <Cell
                    fill={entry.color || COLORS[index % COLORS.length]}
                    key={`cell-${
                      // biome-ignore lint/suspicious/noArrayIndexKey: wip
                      index
                    }`}
                  />
                ))}
              </Pie>
              <ChartTooltip content={<ChartTooltipContent />} />
              <ChartLegend />
            </PC>
          </ResponsiveContainer>
        </ChartContainer>
      </CardContent>
    </>
  )

  return hasCardProvider ? content : <Card className="flex-1">{content}</Card>
}
