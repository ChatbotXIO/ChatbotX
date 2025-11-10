"use client"

import { Button } from "@aha.chat/ui/components/ui/button"
import { Card, CardContent } from "@aha.chat/ui/components/ui/card"
import { SiMessenger, SiMessengerHex } from "@icons-pack/react-simple-icons"
import { useTranslations } from "next-intl"
import type { InboxResource } from "../schemas"

export default function InboxMessengerCard({
  inbox,
}: {
  inbox: InboxResource
}) {
  const t = useTranslations()

  return (
    <Card className="py-3" key={inbox.id}>
      <CardContent className="flex flex-wrap items-center justify-between gap-2 px-4">
        <SiMessenger
          aria-hidden="true"
          className="size-5"
          fill={SiMessengerHex}
        />
        <p className="flex-1 truncate text-sm">
          {inbox.integrationMessenger?.name}
        </p>
        <Button size="sm" type="button" variant="secondary">
          {t("actions.testNow")}
        </Button>
      </CardContent>
    </Card>
  )
}
