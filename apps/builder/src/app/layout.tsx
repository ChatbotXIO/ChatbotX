import type { Metadata } from "next"
import type { ReactNode } from "react"
import "./globals.css"
import { UiProvider } from "@aha.chat/ui"
import { NextIntlClientProvider } from "next-intl"
import { getLocale } from "next-intl/server"

export const metadata: Metadata = {
  title: "ChatbotX",
  description: "ChatbotX",
}

type Props = {
  children: ReactNode
}

export default async function RootLayout({ children }: Props) {
  const locale = await getLocale()

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
        <UiProvider>
          <NextIntlClientProvider>{children}</NextIntlClientProvider>
        </UiProvider>
      </body>
    </html>
  )
}
