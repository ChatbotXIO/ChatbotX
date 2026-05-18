"use client"

import type { PlatformSettings } from "@chatbotx.io/business"
import { injectCSS, injectJS } from "@chatbotx.io/ui/lib/utils"
import { createContext, type ReactNode, useContext, useEffect } from "react"

const PlatformSettingsContext = createContext<PlatformSettings | null>(null)

type PlatformSettingsProviderProps = {
  settings: PlatformSettings
  children: ReactNode
}

export const PlatformSettingsProvider = ({
  settings,
  children,
}: PlatformSettingsProviderProps) => {
  useEffect(() => {
    injectCSS(settings.customCSS)
    injectJS(settings.customJS)
  }, [settings.customCSS, settings.customJS])

  return (
    <PlatformSettingsContext.Provider value={settings}>
      {children}
    </PlatformSettingsContext.Provider>
  )
}

export const usePlatformSettings = (): PlatformSettings => {
  const ctx = useContext(PlatformSettingsContext)
  if (!ctx) {
    throw new Error(
      "usePlatformSettings must be used within a PlatformSettingsProvider",
    )
  }
  return ctx
}
