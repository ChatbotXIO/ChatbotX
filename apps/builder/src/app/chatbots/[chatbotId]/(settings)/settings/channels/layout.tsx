"use client"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@aha.chat/ui/components/ui/accordion"
import {
  type IconType,
  SiMessenger,
  SiWhatsapp,
} from "@icons-pack/react-simple-icons"
import { useTranslations } from "next-intl"
import type { ReactNode } from "react"

type SettingsChannelsPageProps = {
  readonly whatsapp: ReactNode
  readonly messenger: ReactNode
}

type IntegrationItem = {
  readonly keyName: string
  readonly icon: IconType
  readonly iconColor: string
  readonly content: ReactNode
}

export default function SettingsChannelsPage({
  whatsapp,
  messenger,
}: SettingsChannelsPageProps) {
  const t = useTranslations()

  const integrationItems: IntegrationItem[] = [
    {
      keyName: t("whatsapp.title"),
      icon: SiWhatsapp,
      iconColor: "#25D366",
      content: whatsapp,
    },
    {
      keyName: t("messenger.title"),
      icon: SiMessenger,
      iconColor: "#0866FF",
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
              <integration.icon fill={integration.iconColor} />
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
