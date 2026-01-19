"use client"

import { Card, CardContent, CardHeader } from "@aha.chat/ui/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@aha.chat/ui/components/ui/chart"
import { Bar, BarChart, XAxis, YAxis } from "recharts"

export default function AverageDurationOfConversation() {
  return (
    <Card className="flex-1">
      <CardHeader>Average duration of a conversation (Minutes)</CardHeader>
      <CardContent>
        <ChartContainer
          config={{
            value: { label: "Minutes" },
          }}
        >
          <BarChart
            data={[
              { name: "Jan 7", value: 1 },
              { name: "Jan 8", value: 2 },
              { name: "Jan 9", value: 3 },
              { name: "Jan 10", value: 1 },
              { name: "Jan 11", value: 2 },
            ]}
          >
            <XAxis dataKey="name" />
            <YAxis width="auto" />
            <Bar
              activeBar={{
                fill: "var(--color-primary)",
                stroke: "var(--color-primary)",
              }}
              dataKey="value"
              fill="var(--color-primary)"
            />
            <ChartTooltip content={<ChartTooltipContent />} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
