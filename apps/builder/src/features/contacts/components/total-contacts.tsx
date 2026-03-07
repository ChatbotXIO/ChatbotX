"use client"

import { Card, CardContent, CardHeader } from "@aha.chat/ui/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@aha.chat/ui/components/ui/chart"
import { Area, AreaChart, XAxis, YAxis } from "recharts"

export default function TotalContacts() {
  return (
    <Card className="flex-1">
      <CardHeader>Total Contacts</CardHeader>
      <CardContent>
        <ChartContainer
          config={{
            value: { label: "Total" },
          }}
        >
          <AreaChart
            data={[
              { name: "Jan", value: 1200 },
              { name: "Feb", value: 2100 },
              { name: "Mar", value: 2800 },
              { name: "Apr", value: 3600 },
              { name: "May", value: 4900 },
            ]}
          >
            <XAxis dataKey="name" />
            <YAxis width="auto" />
            <Area
              dataKey="value"
              fill="var(--color-primary)"
              stroke="var(--color-primary)"
              type="monotone"
            />
            <ChartTooltip content={<ChartTooltipContent />} />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
