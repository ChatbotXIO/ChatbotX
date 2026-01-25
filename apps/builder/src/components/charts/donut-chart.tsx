"use client"

import { Card, CardContent } from "@aha.chat/ui/components/ui/card"
import {
  ChartContainer,
  ChartTooltipContent,
} from "@aha.chat/ui/components/ui/chart"
import {
  Cell,
  Pie,
  PieChart,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from "recharts"
import ChartHeader from "./chart-header"

export interface DonutChartProps {
  name: string
  valueLabel: string
  data: Array<{ name: string; value: number; color?: string }>
  helpMessage?: string
}

const COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
]

export function DonutChart({
  name,
  valueLabel,
  data,
  helpMessage,
}: DonutChartProps) {
  return (
    <Card className="flex-1">
      <ChartHeader helpMessage={helpMessage} name={name} />
      <CardContent>
        <ChartContainer config={{ value: { label: valueLabel } }}>
          <ResponsiveContainer height={300} width="100%">
            <PieChart>
              <Pie
                cx="50%"
                cy="50%"
                data={data}
                dataKey="value"
                innerRadius={60}
                label
                nameKey="name"
                outerRadius={100}
              >
                {data.map((entry, index) => (
                  <Cell
                    fill={entry.color || COLORS[index % COLORS.length]}
                    key={`cell-${
                      // biome-ignore lint/suspicious/noArrayIndexKey: wip
                      index
                    }`}
                  />
                ))}
              </Pie>
              <RechartsTooltip content={<ChartTooltipContent />} />
            </PieChart>
          </ResponsiveContainer>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
