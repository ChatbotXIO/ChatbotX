"use client"

import { Card, CardContent } from "@aha.chat/ui/components/ui/card"
import {
  ChartContainer,
  ChartLegend,
  ChartTooltip,
  ChartTooltipContent,
} from "@aha.chat/ui/components/ui/chart"
import { Bar, BarChart as BC, CartesianGrid, XAxis, YAxis } from "recharts"
import ChartHeader from "./chart-header"
import { COLORS } from "./constants"

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
}

export default function BarChart({ title, data, helpText }: BarChartProps) {
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

  return (
    <Card className="flex-1">
      <ChartHeader helpText={helpText} title={title} />

      <CardContent>
        <ChartContainer
          config={Object.fromEntries(barLabels.map((l) => [l, { label: l }]))}
        >
          <BC data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" />
            <YAxis width="auto" />
            {barLabels.map((label, index) => (
              <Bar
                dataKey={label}
                fill={COLORS[index % COLORS.length]}
                key={label}
              />
            ))}
            <ChartTooltip content={<ChartTooltipContent />} />
            {data[0]?.value.length > 1 && <ChartLegend />}
          </BC>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
