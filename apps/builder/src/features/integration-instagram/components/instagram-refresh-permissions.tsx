"use client"

import type { IntegrationInstagramModel } from "@chatbotx.io/database/types"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { toast } from "sonner"
import { useWorkspaceId } from "@/hooks/routing"
import { refreshInstagramPermissionsAction } from "../actions/refresh-permissions.action"

export function InstagramRefreshPermissions({
  integrationInstagram,
}: {
  integrationInstagram: IntegrationInstagramModel
}) {
  const t = useTranslations()
  const workspaceId = useWorkspaceId()

  const { execute, isPending } = useAction(
    refreshInstagramPermissionsAction.bind(
      null,
      workspaceId,
      integrationInstagram.id,
    ),
    {
      onSuccess: () => {
        toast.success(t("instagram.refreshPermissions"))
      },
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
    },
  )

  return (
    <Button
      disabled={isPending}
      onClick={() => execute()}
      size="sm"
      variant="secondary"
    >
      {isPending && <Loader2Icon className="animate-spin" />}
      {t("instagram.refreshPermissions")}
    </Button>
  )
}
