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
  name: string
  valueLabel: string
  data: Array<{ name: string; value: number }>
  helpMessage?: string
}

export default function AreaChart({
  name,
  valueLabel,
  data,
  helpMessage,
}: AreaChartProps) {
  return (
    <Card className="flex-1">
      <ChartHeader helpMessage={helpMessage} name={name} />

      <CardContent>
        <ChartContainer
          config={{
            value: { label: valueLabel },
          }}
        >
          <AC data={data}>
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
