"use client"

import { type ChannelType, channelTypes } from "@chatbotx.io/database/partials"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { memo, useMemo } from "react"
import type { InboxResource } from "../schema/resource"
import { InboxMessengerCard } from "./inbox-messenger-card"
import InboxNewCard from "./inbox-new-card"
import { InboxWebchatCard } from "./inbox-webchat-card"
import { InboxWhatsappCard } from "./inbox-whatsapp-card"
import { InboxZaloCard } from "./inbox-zalo-card"

type InboxCardListProps = {
  workspaceId: string
  allowAddNew?: boolean
  actionLabel?: string
  direction?: "horizontal" | "vertical"
  inboxes: InboxResource[]
}

export const cardConfigs: Record<
  ChannelType,
  | React.ComponentType<{
      inbox: InboxResource
      actionLabel?: string
      refId?: string
    }>
  | undefined
> = {
  omnichannel: undefined,
  whatsapp: InboxWhatsappCard,
  webchat: InboxWebchatCard,
  messenger: InboxMessengerCard,
  zalo: InboxZaloCard,
  smtp: undefined,
}

export const InboxCardList = memo(function InboxCardList({
  workspaceId,
  actionLabel,
  allowAddNew = true,
  direction = "horizontal",
  inboxes,
}: InboxCardListProps) {
  const inboxesFiltered = useMemo(
    () =>
      allowAddNew
        ? inboxes
        : inboxes.filter((inbox) => inbox.channel !== channelTypes.enum.zalo),
    [allowAddNew, inboxes],
  )

  return (
    <div
      className={cn(
        "grid gap-4",
        direction === "horizontal"
          ? "md:grid-cols-2 lg:grid-cols-4"
          : "w-full grid-cols-1",
      )}
    >
      {inboxesFiltered.map((inbox) => {
        const CardComponent = cardConfigs[inbox.channel as ChannelType]
        return CardComponent ? (
          <CardComponent
            actionLabel={actionLabel}
            inbox={inbox}
            key={inbox.id}
          />
        ) : null
      })}

      {allowAddNew && <InboxNewCard workspaceId={workspaceId} />}
    </div>
  )
})
