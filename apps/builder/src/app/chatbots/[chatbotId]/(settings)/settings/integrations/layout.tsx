"use client"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@aha.chat/ui/components/ui/accordion"
import { T } from "@tolgee/react"
import { BotIcon, TableIcon } from "lucide-react"
import type { ReactNode } from "react"

type SettingIntegrationLayoutProps = {
  openAI: ReactNode
  googleSheets: ReactNode
}

export default function SettingIntegrationLayout({
  openAI,
  googleSheets,
}: SettingIntegrationLayoutProps) {
  const integrationItems = [
    {
      keyName: "Settings.Integrations.OpenAI",
      icon: BotIcon,
      content: openAI,
    },
    {
      keyName: "Settings.Integrations.GoogleSheets",
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
              <T keyName={integration.keyName} />
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
