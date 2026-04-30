"use client"

import type { IntegrationZaloModel } from "@chatbotx.io/database/types"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { toast } from "sonner"
import { useWorkspaceId } from "@/hooks/routing"
import { refreshZaloPermissionsAction } from "../actions/refresh-permissions.action"

export function ZaloRefreshPermissions({
  integrationZalo,
}: {
  integrationZalo: IntegrationZaloModel
}) {
  const t = useTranslations()
  const workspaceId = useWorkspaceId()

  const { execute, isPending } = useAction(
    refreshZaloPermissionsAction.bind(null, workspaceId, integrationZalo.id),
    {
      onSuccess: () => {
        toast.success(t("zalo.refreshPermissions"))
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
      {t("zalo.refreshPermissions")}
    </Button>
  )
}
