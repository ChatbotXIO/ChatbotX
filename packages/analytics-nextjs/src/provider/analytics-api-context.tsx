"use client"

import type { RouterClient } from "@orpc/server"
import { createContext, type ReactNode, useContext } from "react"
import type { analyticsRoutes } from "../routes"

export type AnalyticsApi = RouterClient<typeof analyticsRoutes>

export const AnalyticsApiContext = createContext<AnalyticsApi | undefined>(
  undefined,
)

export type AnalyticsApiProviderProps = {
  api: AnalyticsApi
  children: ReactNode
}

export const AnalyticsApiProvider = ({
  api,
  children,
}: AnalyticsApiProviderProps) => (
  <AnalyticsApiContext.Provider value={api}>
    {children}
  </AnalyticsApiContext.Provider>
)

export const useAnalyticsApi = (): AnalyticsApi => {
  const api = useContext(AnalyticsApiContext)

  if (!api) {
    throw new Error("useAnalyticsApi must be used within AnalyticsApiProvider")
  }

  return api
}
