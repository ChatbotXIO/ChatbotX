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
      </head>
      <body suppressHydrationWarning>
        <UiProvider>
          <NextIntlClientProvider>{children}</NextIntlClientProvider>
        </UiProvider>
      </body>
    </html>
  )
}
