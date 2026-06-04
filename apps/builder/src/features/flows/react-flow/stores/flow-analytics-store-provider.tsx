"use client"

import { createContext, useContext } from "react"

type FlowAnalyticsContextValue = {
  isAnalytics: boolean
  buttonStats: Record<string, number> // buttonId -> clicks
  totalSent: number
}

const FlowAnalyticsContext = createContext<FlowAnalyticsContextValue>({
  isAnalytics: false,
  buttonStats: {},
  totalSent: 0,
})

export const FlowAnalyticsStoreProvider = ({
  children,
  buttonStats,
  totalSent,
}: {
  children: React.ReactNode
  buttonStats: Record<string, number>
  totalSent: number
}) => (
  <FlowAnalyticsContext.Provider
    value={{ isAnalytics: true, buttonStats, totalSent }}
  >
    {children}
  </FlowAnalyticsContext.Provider>
)

export const useFlowAnalyticsStore = () => useContext(FlowAnalyticsContext)
