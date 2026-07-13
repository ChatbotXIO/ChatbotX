"use client"

import { useParams, useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useState } from "react"
import { toast } from "sonner"
import { DisconnectIntegrationDialog } from "@/features/common/components/disconnect-integration-dialog"
import { disconnectTiktokAction } from "../actions/disconnect.action"
import type { IntegrationTiktokResource } from "../schemas/resource"

export function TiktokDisconnect({
  integrationTiktok,
}: {
  integrationTiktok: IntegrationTiktokResource
}) {
  const t = useTranslations()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const { workspaceId } = useParams<{ workspaceId: string }>()

  const { executeAsync: onDisconnect, isPending: isPendingDisconnect } =
    useAction(
      disconnectTiktokAction.bind(null, workspaceId, integrationTiktok.id),
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
      featureLabel={t("fields.tiktok.label")}
      isPending={isPendingDisconnect}
      onConfirm={onDisconnect}
      onOpenChange={setOpen}
      open={open}
    />
  )
}
