"use client"

import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useState } from "react"
import { toast } from "sonner"
import { DisconnectIntegrationDialog } from "@/features/common/components/disconnect-integration-dialog"
import { disconnectWhatsappAction } from "./actions/disconnect.action"

type WhatsappDisconnectDialogProps = {
  workspaceId: string
  integrationWhatsappId: string
}

export function WhatsappDisconnectDialog({
  workspaceId,
  integrationWhatsappId,
}: WhatsappDisconnectDialogProps) {
  const t = useTranslations()
  const router = useRouter()
  const [open, setOpen] = useState<boolean>(false)

  const { executeAsync: onDisconnect, isPending: isPendingDisconnect } =
    useAction(
      disconnectWhatsappAction.bind(null, workspaceId, integrationWhatsappId),
      {
        onSuccess: () => {
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
      featureLabel={t("fields.whatsapp.label")}
      isPending={isPendingDisconnect}
      onConfirm={onDisconnect}
      onOpenChange={setOpen}
      open={open}
    />
  )
}
