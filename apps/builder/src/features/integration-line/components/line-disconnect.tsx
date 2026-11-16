"use client"

import { useParams, useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useState } from "react"
import { toast } from "sonner"
import { DisconnectIntegrationDialog } from "@/features/common/components/disconnect-integration-dialog"
import { useInvalidateInboxes } from "@/features/inboxes/provider/inbox-hook"
import { disconnectLineAction } from "../actions/disconnect.action"

export function LineDisconnect({ integrationId }: { integrationId: string }) {
  const t = useTranslations()
  const router = useRouter()
  const invalidateInboxes = useInvalidateInboxes()
  const [open, setOpen] = useState(false)
  const { workspaceId } = useParams<{ workspaceId: string }>()

  const { executeAsync: onDisconnect, isPending } = useAction(
    disconnectLineAction.bind(null, workspaceId, integrationId),
    {
      onSuccess: () => {
        invalidateInboxes()
        router.refresh()
      },
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
    },
  )

  return (
    <DisconnectIntegrationDialog
      featureLabel={t("fields.line.label")}
      isPending={isPending}
      onConfirm={onDisconnect}
      onOpenChange={setOpen}
      open={open}
    />
  )
}
