"use client"

import type { PlatformSettings } from "@chatbotx.io/business"
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
    if (!settings.customCSS) {
      return
    }
    const style = document.createElement("style")
    style.textContent = settings.customCSS
    document.head.appendChild(style)
    return () => style.remove()
  }, [settings.customCSS])

  useEffect(() => {
    if (!settings.customJS) {
      return
    }
    const script = document.createElement("script")
    script.textContent = settings.customJS
    document.body.appendChild(script)
    return () => script.remove()
  }, [settings.customJS])

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
