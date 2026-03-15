"use client"

import type { InboxType } from "@aha.chat/database/types"
import { cn } from "@aha.chat/ui/lib/utils"
import { memo, useMemo } from "react"
import type { InboxResource } from "../schemas/resource"
import { InboxMessengerCard } from "./inbox-messenger-card"
import InboxNewCard from "./inbox-new-card"
import { InboxWebchatCard } from "./inbox-webchat-card"
import { InboxWhatsappCard } from "./inbox-whatsapp-card"
import { InboxZaloCard } from "./inbox-zalo-card"

type InboxCardListProps = {
  chatbotId: string
  allowAddNew?: boolean
  actionLabel?: string
  direction?: "horizontal" | "vertical"
  inboxes: InboxResource[]
}

export const cardConfigs: Record<
  InboxType,
  React.ComponentType<{
    inbox: InboxResource
    actionLabel?: string
    refId?: string
  }>
> = {
  whatsapp: InboxWhatsappCard,
  webchat: InboxWebchatCard,
  messenger: InboxMessengerCard,
  zalo: InboxZaloCard,
}

export const InboxCardList = memo(function InboxCardList({
  chatbotId,
  actionLabel,
  allowAddNew = true,
  direction = "horizontal",
  inboxes,
}: InboxCardListProps) {
  const inboxesFiltered = useMemo(
    () =>
      allowAddNew
        ? inboxes
        : inboxes.filter((inbox) => inbox.inboxType !== "zalo"),
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
        const CardComponent = cardConfigs[inbox.inboxType]
        return (
          <CardComponent
            actionLabel={actionLabel}
            inbox={inbox}
            key={inbox.id}
          />
        )
      })}

      {allowAddNew && <InboxNewCard chatbotId={chatbotId} />}
    </div>
  )
})
