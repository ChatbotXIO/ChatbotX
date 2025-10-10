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
  SiMessengerHex,
  SiWhatsapp,
  SiWhatsappHex,
  SiZalo,
  SiZaloHex,
} from "@icons-pack/react-simple-icons"
import { AppWindowIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import type { ReactNode } from "react"

type SettingsChannelsPageProps = {
  readonly whatsapp: ReactNode
  readonly messenger: ReactNode
  readonly zalo: ReactNode
  readonly webchat: ReactNode
}

type IntegrationItem = {
  readonly keyName: string
  readonly icon: IconType
  readonly iconColor?: string
  readonly content: ReactNode
}

export default function SettingsChannelsPage({
  whatsapp,
  messenger,
  zalo,
  webchat,
}: SettingsChannelsPageProps) {
  const t = useTranslations()

  const integrationItems: IntegrationItem[] = [
    {
      keyName: t("whatsapp.title"),
      icon: SiWhatsapp,
      iconColor: SiWhatsappHex,
      content: whatsapp,
    },
    {
      keyName: t("messenger.title"),
      icon: SiMessenger,
      iconColor: SiMessengerHex,
      content: messenger,
    },
    {
      keyName: t("zalo.title"),
      icon: SiZalo,
      iconColor: SiZaloHex,
      content: zalo,
    },
    {
      keyName: t("webchat.title"),
      icon: AppWindowIcon,
      iconColor: "none",
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
