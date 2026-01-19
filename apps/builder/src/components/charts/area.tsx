"use client"

import { Card, CardContent, CardHeader } from "@aha.chat/ui/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@aha.chat/ui/components/ui/chart"
import { AreaChart as AC, Area, XAxis, YAxis } from "recharts"

type AreaChartProps = {
  name: string
  valueLabel: string
  data: Array<{ name: string; value: number }>
}

export default function AreaChart(props: AreaChartProps) {
  return (
    <Card className="flex-1">
      <CardHeader>{props.name}</CardHeader>
      <CardContent>
        <ChartContainer
          config={{
            value: { label: props.valueLabel },
          }}
        >
          <AC data={props.data}>
            <XAxis dataKey="name" />
            <YAxis width="auto" />
            <Area
              dataKey="value"
              fill="var(--color-primary)"
              stroke="var(--color-primary)"
              type="monotone"
            />
            <ChartTooltip content={<ChartTooltipContent />} />
          </AC>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
