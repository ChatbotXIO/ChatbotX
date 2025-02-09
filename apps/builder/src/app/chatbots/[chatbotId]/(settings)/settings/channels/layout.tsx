"use client"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { T } from "@tolgee/react"
import type { ReactNode } from "react"

export default function SettingsChannelsPage({
  whatsapp,
}: {
  whatsapp: ReactNode
}) {
  const integrationItems = [
    {
      keyName: "Settings.Integrations.Whatsapp",
      icon: null,
      content: whatsapp,
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
