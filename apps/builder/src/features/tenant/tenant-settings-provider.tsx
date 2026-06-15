"use client"

import type { TenantSettings } from "@chatbotx.io/business"
import { createContext, type ReactNode, useContext, useEffect } from "react"

const TenantSettingsContext = createContext<TenantSettings | null>(null)

type TenantSettingsProviderProps = {
  settings: TenantSettings
  children: ReactNode
}

export const TenantProvider = ({
  settings,
  children,
}: TenantSettingsProviderProps) => {
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
    <TenantSettingsContext.Provider value={settings}>
      {children}
    </TenantSettingsContext.Provider>
  )
}

export const useTenantSettings = (): TenantSettings => {
  const ctx = useContext(TenantSettingsContext)
  if (!ctx) {
    throw new Error("useTenantSettings must be used within a TenantProvider")
  }
  return ctx
}
