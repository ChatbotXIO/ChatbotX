"use client"

import { Button } from "@aha.chat/ui/components/ui/button"
import { Card, CardContent } from "@aha.chat/ui/components/ui/card"
import { SiZalo, SiZaloHex } from "@icons-pack/react-simple-icons"
import { useTranslations } from "next-intl"
import type { InboxResource } from "../schemas"

export default function InboxZaloCard({ inbox }: { inbox: InboxResource }) {
  const t = useTranslations()

  return (
    <Card className="py-3" key={inbox.id}>
      <CardContent className="flex flex-wrap items-center justify-between gap-2 px-4">
        <SiZalo aria-hidden="true" className="size-5" fill={SiZaloHex} />
        <p className="flex-1 truncate text-sm">{inbox.integrationZalo?.name}</p>
        <Button size="sm" type="button" variant="secondary">
          {t("actions.testNow")}
        </Button>
      </CardContent>
    </Card>
  )
}
