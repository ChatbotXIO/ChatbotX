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
  RadarChart,
} from "recharts"

export default function AverageFirstResponseTimeByAdmin() {
  const data = [
    { name: "Member 1", value: 120, fullMark: 280 },
    { name: "Member 2", value: 200, fullMark: 280 },
    { name: "Member 3", value: 150, fullMark: 280 },
    { name: "Member 4", value: 280, fullMark: 280 },
    { name: "Member 5", value: 100, fullMark: 280 },
    { name: "Member 6", value: 220, fullMark: 280 },
  ]

  return (
    <Card className="flex-1">
      <CardHeader>Average first response time by admins (Minutes)</CardHeader>
      <CardContent>
        <ChartContainer
          config={{
            value: { label: "Value" },
          }}
        >
          <RadarChart data={data}>
            <PolarGrid />
            <PolarAngleAxis dataKey="name" />
            <PolarRadiusAxis />
            <Radar
              dataKey="value"
              fill="var(--color-primary)"
              fillOpacity={0.6}
              stroke="var(--color-primary)"
            />
            <ChartTooltip content={<ChartTooltipContent />} />
          </RadarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
