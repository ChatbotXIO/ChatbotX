"use client"

import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useState } from "react"
import { DisconnectIntegrationDialog } from "@/features/common/components/disconnect-integration-dialog"
import { useWorkspaceId } from "@/hooks/routing"
import { disconnectOpenRouterAction } from "./actions/disconnect.action"

export const OpenRouterDisconnectDialog = () => {
  const [open, setOpen] = useState(false)
  const workspaceId = useWorkspaceId()
  const t = useTranslations()
  const router = useRouter()

  const { execute, isPending } = useAction(
    disconnectOpenRouterAction.bind(null, workspaceId),
    {
      onSuccess: () => {
        setOpen(false)
        router.refresh()
      },
    },
  )

  return (
    <DisconnectIntegrationDialog
      featureLabel={t("openrouter.title")}
      isPending={isPending}
      onConfirm={() => execute()}
      onOpenChange={setOpen}
      open={open}
    />
  )
}
