"use client"

import { Button } from "@aha.chat/ui/components/ui/button"
import { Card, CardContent } from "@aha.chat/ui/components/ui/card"
import Link from "next/link"
import { useTranslations } from "next-intl"
import type { InboxResource } from "../schemas/resource"
import { InboxIcon } from "./inbox-icon"

export default function InboxWebchatCard({ inbox }: { inbox: InboxResource }) {
  const t = useTranslations()

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
          <Link
            href={`/webchat?chatbotId=${inbox.chatbotId}&webchatId=${inbox.integrationWebchat?.id}`}
            rel="noopener noreferrer"
            target="_blank"
          >
            {t("actions.testNow")}
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}
