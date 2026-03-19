"use client"

import { Card, CardContent } from "@aha.chat/ui/components/ui/card"
import {
  ChartContainer,
  ChartLegend,
  ChartTooltip,
  ChartTooltipContent,
} from "@aha.chat/ui/components/ui/chart"
import { Cell, PieChart as PC, Pie, ResponsiveContainer } from "recharts"
import ChartHeader from "./chart-header"
import { COLORS } from "./constants"

export interface DonutChartProps {
  data: Array<{ name: string; value: number; color?: string }>
  helpText?: string
  title: string
  valueLabel: string
}

export function DonutChart({
  title,
  valueLabel,
  data,
  helpText,
}: DonutChartProps) {
  const chartData =
    data.length === 0 ? [{ name: "No data", value: 1, color: "#e5e7eb" }] : data

  return (
    <Card className="flex-1">
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
    </Card>
  )
}
