import type { Metadata } from "next"
import type { ReactNode } from "react"
import "./globals.css"
import "./themes.css"
import { UiProvider } from "@chatbotx.io/ui"
import { NextIntlClientProvider } from "next-intl"
import { getLocale } from "next-intl/server"
import { PlatformSettingsProvider } from "@/features/platform"
import { getPlatformSettings } from "@/features/platform/utils"

export async function generateMetadata(): Promise<Metadata> {
  const { name, logo } = await getPlatformSettings()

  return {
    title: name,
    description: name,
    icons: [
      {
        rel: "icon",
        url: logo ?? "/brand/favicon/favicon-96x96.png",
        type: "image/png",
      },
      {
        rel: "apple-touch-icon",
        url: logo ?? "/brand/favicon/apple-touch-icon.png",
        sizes: "180x180",
      },
    ],
    manifest: "/brand/favicon/site.webmanifest",
  }
}

type Props = {
  children: ReactNode
}

export default async function RootLayout({ children }: Props) {
  const locale = await getLocale()
  const platformSettings = await getPlatformSettings()

  return (
    <html lang={locale} suppressHydrationWarning>
      <head />
      <body
        className={
          platformSettings.theme
            ? `theme-${platformSettings.theme.toLowerCase()}`
            : undefined
        }
        suppressHydrationWarning
      >
        <PlatformSettingsProvider settings={platformSettings}>
          <UiProvider>
            <NextIntlClientProvider>{children}</NextIntlClientProvider>
          </UiProvider>
        </PlatformSettingsProvider>
      </body>
    </html>
  )
}
