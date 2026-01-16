"use client"

import { Card, CardContent, CardHeader } from "@aha.chat/ui/components/ui/card"
import { ChartContainer } from "@aha.chat/ui/components/ui/chart"
import { Bar, BarChart, CartesianGrid, Legend, XAxis, YAxis } from "recharts"

export default function AverageResponseTime() {
  return (
    <Card className="flex-1">
      <CardHeader>Average Response Time</CardHeader>
      <CardContent>
        <ChartContainer
          config={{
            firstResponseTime: { label: "First Response Time" },
            responseTime: { label: "Response Time" },
          }}
        >
          <BarChart
            data={[
              { name: "Jan 7", firstResponseTime: 4000, responseTime: 2400 },
              { name: "Jan 8", firstResponseTime: 3000, responseTime: 1398 },
              { name: "Jan 9", firstResponseTime: 2000, responseTime: 9800 },
              { name: "Jan 10", firstResponseTime: 2780, responseTime: 3908 },
              { name: "Jan 11", firstResponseTime: 1890, responseTime: 4800 },
              { name: "Jan 12", firstResponseTime: 2390, responseTime: 3800 },
              { name: "Jan 13", firstResponseTime: 3490, responseTime: 4300 },
              { name: "Jan 14", firstResponseTime: 4000, responseTime: 2400 },
              { name: "Jan 15", firstResponseTime: 3000, responseTime: 1398 },
              { name: "Jan 16", firstResponseTime: 2000, responseTime: 9800 },
              { name: "Jan 17", firstResponseTime: 2780, responseTime: 3908 },
              { name: "Jan 18", firstResponseTime: 1890, responseTime: 4800 },
              { name: "Jan 19", firstResponseTime: 2390, responseTime: 3800 },
              { name: "Jan 20", firstResponseTime: 3490, responseTime: 4300 },
              { name: "Jan 21", firstResponseTime: 4000, responseTime: 2400 },
              { name: "Jan 22", firstResponseTime: 3000, responseTime: 1398 },
              { name: "Jan 23", firstResponseTime: 2000, responseTime: 9800 },
              { name: "Jan 24", firstResponseTime: 2780, responseTime: 3908 },
              { name: "Jan 25", firstResponseTime: 1890, responseTime: 4800 },
              { name: "Jan 26", firstResponseTime: 2390, responseTime: 3800 },
              { name: "Jan 27", firstResponseTime: 3490, responseTime: 4300 },
              { name: "Jan 28", firstResponseTime: 4000, responseTime: 2400 },
              { name: "Jan 29", firstResponseTime: 3000, responseTime: 1398 },
              { name: "Jan 30", firstResponseTime: 2000, responseTime: 9800 },
              { name: "Jan 31", firstResponseTime: 2780, responseTime: 3908 },
              { name: "Feb 1", firstResponseTime: 1890, responseTime: 4800 },
            ]}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis width="auto" />
            <Legend />
            <Bar
              activeBar={{
                fill: "var(--color-primary)",
                stroke: "var(--color-primary)",
              }}
              dataKey="firstResponseTime"
              fill="var(--color-primary)"
            />
            <Bar
              activeBar={{
                fill: "var(--color-chart-2)",
                stroke: "var(--color-chart-2)",
              }}
              dataKey="responseTime"
              fill="var(--color-chart-2)"
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
