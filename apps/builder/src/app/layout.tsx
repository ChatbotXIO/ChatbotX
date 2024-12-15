import type { Metadata } from "next";
import "./globals.css";
import { getLanguage } from "@/tolgee/language";
import { getStaticData } from "@/tolgee/shared";
import { ReactNode } from "react";
import { TolgeeNextProvider } from "@/tolgee/client";
import { Toaster } from "@/components/ui/sonner"

export const metadata: Metadata = {
  title: "AhaChat AI",
  description: "AhaChat AI",
};

type Props = {
  children: ReactNode;
  params: { locale: string };
};

export default async function RootLayout({ children, }: Props) {
  const locale = await getLanguage();

  // it's important you provide all data which are needed for initial render
  // so current language and also fallback languages + necessary namespaces
  const staticData = await getStaticData([locale]);

  return (
    <html lang={locale}>
      <body>
        <TolgeeNextProvider language={locale} staticData={staticData}>
          {children}

          <Toaster />
        </TolgeeNextProvider>
      </body>
    </html>
  );
}
