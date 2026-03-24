"use client"

import type { ChannelType } from "@aha.chat/database/types"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@aha.chat/ui/components/ui/accordion"
import type { ReactNode } from "react"
import { InboxIcon } from "@/features/inboxes/components/inbox-icon"

type SettingsChannelsPageProps = {
  readonly whatsapp: ReactNode
  readonly messenger: ReactNode
  readonly zalo: ReactNode
  readonly webchat: ReactNode
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
}: SettingsChannelsPageProps) {
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
  ]

  return (
    <Accordion className="w-full" collapsible type="single">
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
