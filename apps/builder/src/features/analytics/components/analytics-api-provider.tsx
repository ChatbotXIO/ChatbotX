"use client"

import { AnalyticsApiProvider as BaseAnalyticsApiProvider } from "@chatbotx.io/analytics-nextjs/provider/analytics-api-context"
import type { ReactNode } from "react"
import { client } from "@/lib/orpc/orpc"

export function AnalyticsApiProvider({ children }: { children: ReactNode }) {
  return (
    <BaseAnalyticsApiProvider api={client.analyticsRoutes}>
      {children}
    </BaseAnalyticsApiProvider>
  )
}
