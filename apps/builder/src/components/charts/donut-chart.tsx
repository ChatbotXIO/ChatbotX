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
  name: string
  valueLabel: string
  data: Array<{ name: string; value: number; color?: string }>
  helpMessage?: string
}

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
            <PC>
              <Pie
                cx="50%"
                cy="50%"
                data={data}
                dataKey="value"
                innerRadius={60}
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
              <ChartTooltip content={<ChartTooltipContent />} />
              <ChartLegend />
            </PC>
          </ResponsiveContainer>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
