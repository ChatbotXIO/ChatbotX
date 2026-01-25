"use client"

import { Card, CardContent } from "@aha.chat/ui/components/ui/card"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@aha.chat/ui/components/ui/chart"
import { Bar, BarChart as BC, CartesianGrid, XAxis, YAxis } from "recharts"
import ChartHeader from "./chart-header"

type BarValue = {
  label: string
  value: number
  color?: string
}

type DataItem = {
  name: string
  value: BarValue[]
}

type BarChartProps = {
  name: string
  data: DataItem[]
  helpMessage?: string
}

export default function BarChart({ name, data, helpMessage }: BarChartProps) {
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
  const labelColor: Record<string, string | undefined> = {}
  for (const item of data) {
    for (const v of item.value) {
      if (v.color && !labelColor[v.label]) {
        labelColor[v.label] = v.color
      }
    }
  }

  return (
    <Card className="flex-1">
      <ChartHeader helpMessage={helpMessage} name={name} />

      <CardContent>
        <ChartContainer
          config={Object.fromEntries(barLabels.map((l) => [l, { label: l }]))}
        >
          <BC data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis width="auto" />
            {barLabels.map((label) => (
              <Bar
                activeBar={
                  labelColor[label]
                    ? { fill: labelColor[label], stroke: labelColor[label] }
                    : undefined
                }
                dataKey={label}
                fill={labelColor[label] || undefined}
                key={label}
              />
            ))}
            <ChartTooltip content={<ChartTooltipContent />} />
            {data[0]?.value.length > 1 && (
              <ChartLegend content={<ChartLegendContent payload={{}} />} />
            )}
          </BC>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
