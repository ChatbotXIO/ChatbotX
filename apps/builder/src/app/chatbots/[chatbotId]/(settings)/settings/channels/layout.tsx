"use client"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@aha.chat/ui/components/ui/accordion"
import { useTranslations } from "next-intl"
import type { ReactNode } from "react"
import WhatsappIcon from "@/components/icons/whatsapp"

export default function SettingsChannelsPage({
  whatsapp,
}: {
  whatsapp: ReactNode
}) {
  const t = useTranslations()

  const integrationItems = [
    {
      keyName: "Settings.Integrations.Whatsapp",
      icon: WhatsappIcon,
      content: whatsapp,
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
              {t(integration.keyName as keyof typeof t)}
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
