"use client"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { T } from "@tolgee/react"
import { BotIcon, TableIcon } from "lucide-react"
import type { ReactNode } from "react"

interface SettingIntegrationLayoutProps {
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
      icon: <BotIcon size={24} />,
      content: openAI,
    },
    {
      keyName: "Settings.Integrations.GoogleSheets",
      icon: <TableIcon size={24} />,
      content: googleSheets,
    },
  ]

  return (
    <Accordion type="single" collapsible className="w-full">
      {integrationItems.map((integration) => (
        <AccordionItem
          key={integration.keyName}
          value={integration.keyName}
          className="transition-all hover:rounded-lg hover:[&[data-state=open]]:rounded-none"
        >
          <AccordionTrigger className="px-4 rounded-none transition-all [&[data-state=open]]:bg-gray-200 hover:no-underline hover:bg-gray-200">
            <div className="flex items-center gap-2">
              {integration.icon}
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
