"use client"

import { Card, CardContent } from "@aha.chat/ui/components/ui/card"
import { PlusCircleIcon } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"

export default function InboxNewCard({ chatbotId }: { chatbotId: string }) {
  const t = useTranslations()

  return (
    <Card className="w-[416px] items-center justify-center py-0">
      <CardContent className="justify-middle flex h-full w-full flex-wrap items-center gap-2 px-0">
        <Link
          className="flex h-14 w-full items-center justify-center gap-2 text-sm"
          href={`/channels/create?chatbotId=${chatbotId}`}
        >
          <PlusCircleIcon className="h-4 w-4" />
          {t("actions.createFeature", { feature: t("fields.inbox.label") })}
        </Link>
      </CardContent>
    </Card>
  )
}
