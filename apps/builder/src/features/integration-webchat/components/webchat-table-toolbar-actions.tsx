"use client"

import type { IntegrationWebchatModel } from "@chatbotx.io/database/types"
import type { Table } from "@tanstack/react-table"
import { useTranslations } from "next-intl"
import { AddChannelButton } from "@/features/inboxes/components/add-channel-button"

type WebchatTableToolbarActionsProps = {
  canCreate?: boolean
  workspaceId: string
  table: Table<IntegrationWebchatModel>
  onOpenChange: (open: boolean) => void
}

export function WebchatTableToolbarActions({
  canCreate = true,
  workspaceId,
}: WebchatTableToolbarActionsProps) {
  const t = useTranslations()

  return (
    <div className="flex items-center gap-2">
      <AddChannelButton
        canCreate={canCreate}
        href={`/space/${workspaceId}/webchats/create`}
        label={t("fields.webchat.label")}
      />
    </div>
  )
}
