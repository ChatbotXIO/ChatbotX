"use client"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@aha.chat/ui/components/ui/accordion"
import type { ReactNode } from "react"
import { MessengerIcon } from "@/components/icons/messenger"
import WhatsappIcon from "@/components/icons/whatsapp"

export default function SettingsChannelsPage({
  whatsapp,
  messenger,
}: {
  whatsapp: ReactNode
  messenger: ReactNode
}) {
  const integrationItems = [
    {
      keyName: "Settings.Integrations.Whatsapp",
      icon: WhatsappIcon,
      content: whatsapp,
    },
    {
      keyName: "Settings.Integrations.Messenger",
      icon: MessengerIcon,
      content: messenger,
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
              <integration.icon />
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
