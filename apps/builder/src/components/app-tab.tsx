"use client"

import { Card, CardContent } from "@aha.chat/ui/components/ui/card"
import Link from "next/link"
import { useTranslations } from "next-intl"

export function AppTab({ chatbotId }: { chatbotId: string }) {
  const t = useTranslations()
  return (
    <Card>
      <CardContent className="flex items-center gap-8 px-8">
        <Link
          className="font-medium text-sm"
          href={`/chatbots/${chatbotId}/tags`}
        >
          {t("tags.title")}
        </Link>
        <Link
          className="font-medium text-sm"
          href={`/chatbots/${chatbotId}/custom-fields`}
        >
          {t("customFields.title")}
        </Link>
        <Link
          className="font-medium text-sm"
          href={`/chatbots/${chatbotId}/error-logs`}
        >
          {t("errorLogs.title")}
        </Link>
      </CardContent>
    </Card>
  )
}
