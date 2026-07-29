"use client"

import type { IntegrationMessengerModel } from "@chatbotx.io/database/types"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useState } from "react"
import { toast } from "sonner"
import { DisconnectIntegrationDialog } from "@/features/common/components/disconnect-integration-dialog"
import { useWorkspaceId } from "@/hooks/routing"
import { disconnectMessengerAction } from "../actions/disconnect-messenger.action"

export function MessengerDisconnect({
  integrationMessenger,
}: {
  integrationMessenger: IntegrationMessengerModel
}) {
  const t = useTranslations()
  const router = useRouter()
  const [open, setOpen] = useState<boolean>(false)
  const workspaceId = useWorkspaceId()

  const { executeAsync: onDisconnect, isPending: isPendingDisconnect } =
    useAction(
      disconnectMessengerAction.bind(
        null,
        workspaceId,
        integrationMessenger.id,
      ),
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
      featureLabel={t("fields.messenger.label")}
      isPending={isPendingDisconnect}
      onConfirm={onDisconnect}
      onOpenChange={setOpen}
      open={open}
    />
  )
}
