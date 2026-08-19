"use client"

import { useParams, useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useState } from "react"
import { toast } from "sonner"
import { DisconnectIntegrationDialog } from "@/features/common/components/disconnect-integration-dialog"
import { deleteApiAction } from "../actions/delete-api.action"
import type { ApiResource } from "../schema/resource"

export function ApiDisconnect({ api }: { api: ApiResource }) {
  const t = useTranslations()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const { workspaceId } = useParams<{ workspaceId: string }>()

  const { executeAsync: onDisconnect, isPending: isPendingDisconnect } =
    useAction(deleteApiAction.bind(null, workspaceId, api.id), {
      onSuccess: () => {
        router.refresh()
      },
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
    })

  return (
    <DisconnectIntegrationDialog
      featureLabel={t("fields.api.label")}
      isPending={isPendingDisconnect}
      onConfirm={onDisconnect}
      onOpenChange={setOpen}
      open={open}
      translationKey="delete"
    />
  )
}
