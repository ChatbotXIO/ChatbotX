"use client"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@aha.chat/ui/components/ui/accordion"
import { AppWindowIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import type { ReactNode } from "react"
import WhatsappIcon from "@/components/icons/whatsapp"

export default function SettingsChannelsPage({
  whatsapp,
  webchat,
}: {
  whatsapp: ReactNode
  webchat: ReactNode
}) {
  const t = useTranslations()

  const integrationItems = [
    {
      keyName: t("whatsapp.title"),
      icon: WhatsappIcon,
      content: whatsapp,
    },
    {
      keyName: t("webchat.title"),
      icon: AppWindowIcon,
      content: webchat,
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
              <integration.icon height="24" width="24" />
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
