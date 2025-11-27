"use client"

import { Button } from "@aha.chat/ui/components/ui/button"
import Link from "next/link"
import { useTranslations } from "next-intl"

export function NoAIIntegrationFound({ chatbotId }: { chatbotId: string }) {
  const t = useTranslations()

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4">
      <p>{t("messages.noAIIntegrationFound")}</p>
      <Button asChild type="button">
        <Link href={`/chatbots/${chatbotId}/settings/integrations`}>
          {t("actions.connect")}
        </Link>
      </Button>
    </div>
  )
}
