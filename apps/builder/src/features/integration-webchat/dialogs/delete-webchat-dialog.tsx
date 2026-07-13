"use client"

import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { toast } from "sonner"
import { DisconnectIntegrationDialog } from "@/features/common/components/disconnect-integration-dialog"
import { deleteWebchatAction } from "../actions/delete-webchat.action"

type DeleteWebchatDialogProps = {
  open: boolean
  workspaceId: string
  webchatId: string
  showTrigger?: boolean
  onSuccess?: () => void
  onOpenChange: (val: boolean) => void
}

export function DeleteWebchatDialog({
  workspaceId,
  webchatId,
  showTrigger = true,
  open,
  onSuccess,
  onOpenChange,
}: DeleteWebchatDialogProps) {
  const t = useTranslations()

  const { execute, isPending } = useAction(
    deleteWebchatAction.bind(null, workspaceId, webchatId),
    {
      onSuccess: () => {
        toast.success(
          t("messages.deletedSuccess", {
            feature: t("fields.webchat.label"),
          }),
        )
        onOpenChange(false)
        onSuccess?.()
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
      featureLabel={t("fields.webchat.label")}
      isPending={isPending}
      onConfirm={execute}
      onOpenChange={onOpenChange}
      open={open}
      showTrigger={showTrigger}
      translationKey="delete"
    />
  )
}
