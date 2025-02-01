import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/sonner"
import { TolgeeNextProvider } from "@/tolgee/client"
import { getLanguage } from "@/tolgee/language"
import { getStaticData } from "@/tolgee/shared"
import type { Metadata } from "next"
import { SessionProvider } from "next-auth/react"
import type { ReactNode } from "react"
import "./globals.css"

export const metadata: Metadata = {
  title: "AhaChat AI",
  description: "AhaChat AI",
}

type Props = {
  children: ReactNode
  params: { locale: string }
}

export default async function RootLayout({ children }: Props) {
  const locale = await getLanguage()

  // it's important you provide all data which are needed for initial render
  // so current language and also fallback languages + necessary namespaces
  const staticData = await getStaticData([locale])

  return (
    <html lang={locale} suppressHydrationWarning>
      <body>
        <SessionProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <TolgeeNextProvider language={locale} staticData={staticData}>
              {children}
              <Toaster richColors position="top-right" />
            </TolgeeNextProvider>
          </ThemeProvider>
        </SessionProvider>
      </body>
    </html>
  )
}
