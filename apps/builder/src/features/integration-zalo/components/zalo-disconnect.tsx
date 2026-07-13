"use client"

import type { IntegrationZaloResource } from "@chatbotx.io/business"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useState } from "react"
import { toast } from "sonner"
import { DisconnectIntegrationDialog } from "@/features/common/components/disconnect-integration-dialog"
import { useWorkspaceId } from "@/hooks/routing"
import { disconnectZaloAction } from "../actions/disconnect.action"

export function ZaloDisconnect({
  integrationZalo,
}: {
  integrationZalo: IntegrationZaloResource
}) {
  const t = useTranslations()
  const router = useRouter()
  const [open, setOpen] = useState<boolean>(false)
  const workspaceId = useWorkspaceId()

  const { executeAsync: onDisconnect, isPending: isPendingDisconnect } =
    useAction(
      disconnectZaloAction.bind(null, workspaceId, integrationZalo.id),
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
      featureLabel={t("fields.zalo.label")}
      isPending={isPendingDisconnect}
      onConfirm={onDisconnect}
      onOpenChange={setOpen}
      open={open}
    />
  )
}
