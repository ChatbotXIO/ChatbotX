"use client"

import { Card, CardContent, CardHeader } from "@aha.chat/ui/components/ui/card"
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

export interface DonutChartProps {
  name: string
  valueLabel: string
  data: Array<{ name: string; value: number; color?: string }>
}

const COLORS = [
  "var(--color-primary)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
  "var(--color-chart-6)",
  "var(--color-chart-7)",
  "var(--color-chart-8)",
]

export function DonutChart({ name, valueLabel, data }: DonutChartProps) {
  return (
    <Card className="flex-1">
      <CardHeader>{name}</CardHeader>
      <CardContent>
        <ChartContainer config={{ value: { label: valueLabel } }}>
          <ResponsiveContainer height={300} width="100%">
            <PieChart>
              <Pie
                cx="50%"
                cy="50%"
                data={data}
                dataKey="value"
                fill="var(--color-primary)"
                innerRadius={60}
                label
                nameKey="name"
                outerRadius={100}
              >
                {data.map((entry, index) => (
                  <Cell
                    fill={entry.color || COLORS[index % COLORS.length]}
                    key={`cell-${
                      // biome-ignore lint/suspicious/noArrayIndexKey: <explanation>
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
