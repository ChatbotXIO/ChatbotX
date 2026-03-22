"use client"

import { Card, CardContent } from "@aha.chat/ui/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@aha.chat/ui/components/ui/chart"
import { AreaChart as AC, Area, XAxis, YAxis } from "recharts"
import ChartHeader from "./chart-header"

type AreaChartProps = {
  title: string
  valueLabel: string
  data: Array<{ label: string; value: number }>
  helpText?: string
}

export default function AreaChart({
  title,
  valueLabel,
  data,
  helpText,
}: AreaChartProps) {
  return (
    <Card>
      <ChartHeader helpText={helpText} title={title} />

      <CardContent>
        <ChartContainer
          config={{
            value: { label: valueLabel },
          }}
        >
          <AC data={data}>
            <XAxis dataKey="label" />
            <YAxis width="auto" />
            <Area
              dataKey="value"
              fill="var(--color-chart-1)"
              stroke="var(--color-chart-1)"
              type="monotone"
            />
            <ChartTooltip content={<ChartTooltipContent />} />
          </AC>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
