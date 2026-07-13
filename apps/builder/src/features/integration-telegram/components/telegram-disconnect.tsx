"use client"

import type { IntegrationTelegramResource } from "@chatbotx.io/business"
import { useParams, useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useState } from "react"
import { toast } from "sonner"
import { DisconnectIntegrationDialog } from "@/features/common/components/disconnect-integration-dialog"
import { disconnectTelegramAction } from "../actions/disconnect.action"

export function TelegramDisconnect({
  integrationTelegram,
}: {
  integrationTelegram: IntegrationTelegramResource
}) {
  const t = useTranslations()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const { workspaceId } = useParams<{ workspaceId: string }>()

  const { executeAsync: onDisconnect, isPending: isPendingDisconnect } =
    useAction(
      disconnectTelegramAction.bind(null, workspaceId, integrationTelegram.id),
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
      featureLabel={t("fields.telegram.label")}
      isPending={isPendingDisconnect}
      onConfirm={onDisconnect}
      onOpenChange={setOpen}
      open={open}
    />
  )
}
