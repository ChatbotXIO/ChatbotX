"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import Link from "next/link"
import { useTranslations } from "next-intl"

export function NoAIIntegrationFound({ workspaceId }: { workspaceId: string }) {
  const t = useTranslations()

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4">
      <p>{t("messages.noAIIntegrationFound")}</p>
      <Button asChild type="button">
        <Link href={`/space/${workspaceId}/settings/integrations`}>
          {t("actions.connect")}
        </Link>
      </Button>
    </div>
  )
}
