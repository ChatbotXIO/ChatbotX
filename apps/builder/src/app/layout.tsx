import type { Metadata } from "next"
import type { ReactNode } from "react"
import { TolgeeNextProvider } from "@/tolgee/client"
import { getLanguage } from "@/tolgee/language"
import { getStaticData } from "@/tolgee/shared"
import "./globals.css"
import { UiProvider } from "@aha.chat/ui"

export const metadata: Metadata = {
  title: "AhaChat AI",
  description: "AhaChat AI",
}

type Props = {
  children: ReactNode
}

export default async function RootLayout({ children }: Props) {
  const locale = await getLanguage()

  // it's important you provide all data which are needed for initial render
  // so current language and also fallback languages + necessary namespaces
  const staticData = await getStaticData([locale])

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <script
          crossOrigin="anonymous"
          src="//unpkg.com/react-scan/dist/auto.global.js"
        />
      </head>
      <body>
        <UiProvider>
          <TolgeeNextProvider language={locale} staticData={staticData}>
            {children}
          </TolgeeNextProvider>
        </UiProvider>
      </body>
    </html>
  )
}
