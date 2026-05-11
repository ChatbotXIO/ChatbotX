"use client"

import type { PlatformUrls } from "@chatbotx.io/business"
import { createContext, type ReactNode, useContext } from "react"

const PlatformUrlsContext = createContext<PlatformUrls | null>(null)

type PlatformUrlsProviderProps = {
  urls: PlatformUrls
  children: ReactNode
}

export const PlatformUrlsProvider = ({
  urls,
  children,
}: PlatformUrlsProviderProps) => (
  <PlatformUrlsContext.Provider value={urls}>
    {children}
  </PlatformUrlsContext.Provider>
)

export const usePlatformUrls = (): PlatformUrls => {
  const ctx = useContext(PlatformUrlsContext)
  if (!ctx) {
    throw new Error(
      "usePlatformUrls must be used within a PlatformUrlsProvider",
    )
  }
  return ctx
}
