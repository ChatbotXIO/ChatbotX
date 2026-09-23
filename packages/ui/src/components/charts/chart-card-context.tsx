"use client"

import { createContext, type ReactNode, useContext } from "react"

const ChartCardContext = createContext(false)

export const ChartCardProvider = ({ children }: { children: ReactNode }) => (
  <ChartCardContext.Provider value>{children}</ChartCardContext.Provider>
)

export const useChartCardProvider = () => useContext(ChartCardContext)
