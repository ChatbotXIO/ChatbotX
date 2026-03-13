"use client"

import { InboxType } from "@aha.chat/database/types"
import { Button } from "@aha.chat/ui/components/ui/button"
import { Card, CardContent } from "@aha.chat/ui/components/ui/card"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { getInboxLink } from "@/features/ref-links/helpers"
import type { InboxResource } from "../schemas/resource"
import { InboxIcon } from "./inbox-icon"

export default function InboxWebchatCard({
  inbox,
  actionLabel,
  refId,
}: {
  inbox: InboxResource
  actionLabel?: string
  refId?: string
}) {
  const t = useTranslations()
  const link = getInboxLink({
    inboxType: InboxType.webchat,
    inboxes: [inbox],
    chatbotId: inbox.chatbotId,
    refId,
  })

  return (
    <Card className="py-3" key={inbox.id}>
      <CardContent className="flex flex-wrap items-center justify-between gap-2 px-4">
        <InboxIcon
          iconClassName="size-5"
          inboxType="webchat"
          label={inbox.integrationWebchat?.name}
          wrapperClassName="flex-2"
        />
        <Button size="sm" type="button" variant="secondary">
          <Link href={link} rel="noopener noreferrer" target="_blank">
            {actionLabel ?? t("actions.testNow")}
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}
