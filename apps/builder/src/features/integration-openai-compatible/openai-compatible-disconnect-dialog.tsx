"use client"

import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useState } from "react"
import { AiIntegrationDisconnectDialog } from "@/features/integration-ai/components/ai-integration-disconnect-dialog"
import { useWorkspaceId } from "@/hooks/routing"
import { disconnectOpenaiCompatibleAction } from "./actions/disconnect.action"

type OpenaiCompatibleDisconnectDialogProps = {
  integrationId: string
  title: string
}

export function OpenaiCompatibleDisconnectDialog({
  integrationId,
  title,
}: OpenaiCompatibleDisconnectDialogProps) {
  const [open, setOpen] = useState(false)
  const workspaceId = useWorkspaceId()
  const router = useRouter()
  const t = useTranslations()

  const { execute, isPending } = useAction(
    disconnectOpenaiCompatibleAction.bind(null, workspaceId, integrationId),
    {
      onSuccess: () => {
        setOpen(false)
        router.refresh()
      },
    },
  )

  return (
    <AiIntegrationDisconnectDialog
      isPending={isPending}
      onConfirm={() => execute()}
      onOpenChange={setOpen}
      open={open}
      title={`${t("openaiCompatible.provider")}: ${title}`}
    />
  )
}
