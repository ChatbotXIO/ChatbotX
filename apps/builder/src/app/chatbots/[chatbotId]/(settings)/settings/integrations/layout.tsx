"use client"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@aha.chat/ui/components/ui/accordion"
import { BotIcon, TableIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import type { ReactNode } from "react"

type SettingIntegrationLayoutProps = {
  openAI: ReactNode
  gemini: ReactNode
  googleSheets: ReactNode
}

export default function SettingIntegrationLayout({
  openAI,
  gemini,
  googleSheets,
}: SettingIntegrationLayoutProps) {
  const t = useTranslations()

  const integrationItems = [
    {
      keyName: t("openai.title"),
      icon: BotIcon,
      content: openAI,
    },
    {
      keyName: t("gemini.title"),
      icon: BotIcon,
      content: gemini,
    },
    {
      keyName: t("googleSheets.title"),
      icon: TableIcon,
      content: googleSheets,
    },
  ]

  return (
    <Accordion className="w-full" collapsible type="single">
      {integrationItems.map((integration) => (
        <AccordionItem
          className="transition-all hover:rounded-lg hover:data-[state=open]:rounded-none"
          key={integration.keyName}
          value={integration.keyName}
        >
          <AccordionTrigger className="rounded-none px-4 transition-all hover:bg-gray-200 hover:no-underline data-[state=open]:bg-gray-200">
            <div className="flex items-center gap-2">
              <integration.icon size={24} />
              {integration.keyName}
            </div>
          </AccordionTrigger>
          <AccordionContent className="p-4">
            {integration.content}
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  )
}
