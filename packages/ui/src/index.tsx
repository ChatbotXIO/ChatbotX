import type { ThemeProviderProps } from "next-themes"
import { NuqsAdapter } from "nuqs/adapters/next/app"
import { Toaster } from "./components/ui/sonner"
import { TooltipProvider } from "./components/ui/tooltip"
import { ThemeProvider } from "./providers/theme"

// Export hooks and utilities
export * from "./hooks"
export * from "./lib"

type UiProviderProperties = ThemeProviderProps & {
  privacyUrl?: string
  termsUrl?: string
  helpUrl?: string
}

export const UiProvider = ({
  children,
  privacyUrl,
  termsUrl,
  helpUrl,
  ...properties
}: UiProviderProperties) => {
  return (
    <NuqsAdapter>
      <ThemeProvider {...properties}>
        {/* <AuthProvider privacyUrl={privacyUrl} termsUrl={termsUrl} helpUrl={helpUrl}>
      <AnalyticsProvider> */}
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster duration={800} position="top-right" richColors />
        {/* </AnalyticsProvider>
    </AuthProvider> */}
      </ThemeProvider>
    </NuqsAdapter>
  )
}
