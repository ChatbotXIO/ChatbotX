"use client"

import type { IntegrationWebchatModel } from "@chatbotx.io/database/types"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import type { Table } from "@tanstack/react-table"
import { PlusIcon } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"

type WebchatTableToolbarActionsProps = {
  workspaceId: string
  table: Table<IntegrationWebchatModel>
  onOpenChange: (open: boolean) => void
}

export function WebchatTableToolbarActions({
  workspaceId,
}: WebchatTableToolbarActionsProps) {
  const t = useTranslations()

  return (
    <div className="flex items-center gap-2">
      <Button size="sm">
        <Link
          className="flex items-center gap-2"
          href={`/space/${workspaceId}/webchats/create`}
        >
          <PlusIcon className="h-4 w-4" />
          {t("actions.addFeature", { feature: t("fields.webchat.label") })}
        </Link>
      </Button>
    </div>
  )
}
