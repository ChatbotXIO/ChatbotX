import type { CachePublicRecord, TolgeeStaticData } from "@tolgee/react"
import type { ThemeProviderProps } from "next-themes"
import { NuqsAdapter } from "nuqs/adapters/next/app"
import { Toaster } from "./components/ui/sonner"
import { TooltipProvider } from "./components/ui/tooltip"
import { ThemeProvider } from "./providers/theme"

type UiProviderProperties = ThemeProviderProps & {
  privacyUrl?: string
  termsUrl?: string
  helpUrl?: string
  language: string
  staticData: TolgeeStaticData | CachePublicRecord[]
}

export const UiProvider = ({
  children,
  privacyUrl,
  termsUrl,
  helpUrl,
  language,
  staticData,
  ...properties
}: UiProviderProperties) => {
  return (
    <NuqsAdapter>
      <ThemeProvider {...properties}>
        {/* <AuthProvider privacyUrl={privacyUrl} termsUrl={termsUrl} helpUrl={helpUrl}>
      <AnalyticsProvider> */}
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster richColors position="top-right" duration={800} />
        {/* </AnalyticsProvider>
    </AuthProvider> */}
      </ThemeProvider>
    </NuqsAdapter>
  )
}
