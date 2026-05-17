import type { Metadata } from "next"
import type { ReactNode } from "react"
import "./globals.css"
import { resolvePlatformUrlsByDomain } from "@chatbotx.io/business"
import { UiProvider } from "@chatbotx.io/ui"
import { NextIntlClientProvider } from "next-intl"
import { getLocale } from "next-intl/server"
import { PlatformUrlsProvider } from "@/features/platform"
import { getDomainFromHeader } from "@/lib/domain"

export const metadata: Metadata = {
  title: "ChatbotX",
  description: "ChatbotX",
}

type Props = {
  children: ReactNode
}

export default async function RootLayout({ children }: Props) {
  const locale = await getLocale()

  const domain = await getDomainFromHeader()
  const platformUrls = await resolvePlatformUrlsByDomain(domain)

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        {/* <script
          crossOrigin="anonymous"
          src="//unpkg.com/react-scan/dist/auto.global.js"
        /> */}
        <link
          href="/brand/favicon/favicon-96x96.png"
          rel="icon"
          sizes="96x96"
          type="image/png"
        />
        <link
          href="/brand/favicon/favicon.svg"
          rel="icon"
          type="image/svg+xml"
        />
        <link href="/brand/favicon/favicon.ico" rel="shortcut icon" />
        <link
          href="/brand/favicon/apple-touch-icon.png"
          rel="apple-touch-icon"
          sizes="180x180"
        />
        <link href="/brand/favicon/site.webmanifest" rel="manifest" />
      </head>
      <body suppressHydrationWarning>
        <PlatformUrlsProvider urls={platformUrls}>
          <UiProvider>
            <NextIntlClientProvider>{children}</NextIntlClientProvider>
          </UiProvider>
        </PlatformUrlsProvider>
      </body>
    </html>
  )
}
