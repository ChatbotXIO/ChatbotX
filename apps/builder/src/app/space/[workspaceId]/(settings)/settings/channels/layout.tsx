"use client"

import type { ChannelType } from "@chatbotx.io/database/partials"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@chatbotx.io/ui/components/ui/accordion"
import { useSearchParams } from "next/navigation"
import type { ReactNode } from "react"
import { InboxIcon } from "@/features/inboxes/components/inbox-icon"

type SettingsChannelsPageProps = {
  readonly whatsapp: ReactNode
  readonly messenger: ReactNode
  readonly zalo: ReactNode
  readonly webchat: ReactNode
  readonly smtp: ReactNode
}

type IntegrationItem = {
  readonly value: ChannelType
  readonly content: ReactNode
}

export default function SettingsChannelsPage({
  whatsapp,
  messenger,
  zalo,
  webchat,
  smtp,
}: SettingsChannelsPageProps) {
  const queriesParams = useSearchParams()
  const selectedChannel = queriesParams.get("channel") ?? ""

  const integrationItems: IntegrationItem[] = [
    {
      value: "whatsapp",
      content: whatsapp,
    },
    {
      value: "messenger",
      content: messenger,
    },
    {
      value: "zalo",
      content: zalo,
    },
    {
      value: "webchat",
      content: webchat,
    },
    {
      value: "smtp",
      content: smtp,
    },
  ]

  return (
    <Accordion
      className="w-full"
      collapsible
      defaultValue={selectedChannel}
      type="single"
    >
      {integrationItems.map((integration) => (
        <AccordionItem
          className="transition-all hover:data-[state=open]:rounded-none"
          key={integration.value}
          value={integration.value}
        >
          <AccordionTrigger className="rounded-none px-4 transition-all hover:bg-muted hover:no-underline data-[state=open]:bg-muted">
            <InboxIcon channel={integration.value} />
          </AccordionTrigger>
          <AccordionContent className="p-4">
            {integration.content}
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  )
}
