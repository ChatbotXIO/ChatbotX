"use client"

import {
  type ChannelType,
  MANAGEABLE_CHANNELS,
} from "@chatbotx.io/database/partials"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@chatbotx.io/ui/components/ui/accordion"
import { useSearchParams } from "next/navigation"
import type { ReactNode } from "react"
import { InboxIcon } from "@/features/inboxes/components/inbox-icon"

// Next.js parallel routes require one statically-named slot prop per channel
// — this mapping can't be generated, since each key is a filesystem
// convention (`@<channel>/page.tsx`) the framework wires up at build time.
// `MANAGEABLE_CHANNELS` still drives the iteration order and which channels
// get an accordion row at all, so a channel missing its slot here fails
// loudly (an empty accordion item) instead of the old plain-array's silent
// omission.
type ChannelsAccordionProps = {
  readonly children?: ReactNode
  readonly whatsapp?: ReactNode
  readonly messenger?: ReactNode
  readonly instagram?: ReactNode
  readonly zalo?: ReactNode
  readonly telegram?: ReactNode
  readonly tiktok?: ReactNode
  readonly webchat?: ReactNode
  readonly smtp?: ReactNode
  /**
   * Channels to render an accordion row for. Already filtered to what the
   * workspace's platform admin / white-label owner allows to be *managed*
   * here, unioned with channels the workspace already has connected inboxes
   * for (grandfathering) — see `layout.tsx`, which computes this server-side.
   * Defaults to every manageable channel so callers that haven't been wired
   * up to channel-visibility yet keep today's behavior unchanged.
   */
  readonly visibleChannels?: ChannelType[]
}

export function ChannelsAccordion(props: ChannelsAccordionProps) {
  const {
    whatsapp,
    messenger,
    instagram,
    zalo,
    telegram,
    tiktok,
    webchat,
    smtp,
    visibleChannels = MANAGEABLE_CHANNELS,
  } = props
  const queriesParams = useSearchParams()
  const selectedChannel = queriesParams.get("channel") ?? ""

  const slotByChannel: Partial<Record<ChannelType, ReactNode>> = {
    whatsapp,
    messenger,
    instagram,
    zalo,
    telegram,
    tiktok,
    webchat,
    smtp,
  }

  const visibleSet = new Set(visibleChannels)
  const integrationItems = MANAGEABLE_CHANNELS.filter((channel) =>
    visibleSet.has(channel),
  ).map((channel) => ({ value: channel, content: slotByChannel[channel] }))

  return (
    <Accordion
      className="w-full"
      defaultValue={selectedChannel ? [selectedChannel] : []}
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
