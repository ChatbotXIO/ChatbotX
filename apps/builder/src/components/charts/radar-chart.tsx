"use client"

import { Card, CardContent, CardHeader } from "@aha.chat/ui/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@aha.chat/ui/components/ui/chart"
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart as RC,
} from "recharts"

type RadarData = {
  name: string
  value: number
  fullMark?: number
}

export interface CustomRadarChartProps {
  name: string
  valueLabel: string
  data: Array<{ name: string; value: number }>
}

export function RadarChart({ name, valueLabel, data }: CustomRadarChartProps) {
  const maxValue = data.reduce(
    (max, item) => (item.value > max ? item.value : max),
    0,
  )
  const chartData: RadarData[] = data.map((item) => ({
    ...item,
    fullMark: maxValue,
  }))

  return (
    <Card className="flex-1">
      <CardHeader>{name}</CardHeader>
      <CardContent>
        <ChartContainer
          config={{
            value: { label: valueLabel },
          }}
        >
          <RC data={chartData}>
            <PolarGrid />
            <PolarAngleAxis dataKey="name" />
            <PolarRadiusAxis domain={[0, maxValue]} />
            <Radar
              dataKey="value"
              fill="var(--color-primary)"
              fillOpacity={0.6}
              stroke="var(--color-primary)"
            />
            <ChartTooltip content={<ChartTooltipContent />} />
          </RC>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
