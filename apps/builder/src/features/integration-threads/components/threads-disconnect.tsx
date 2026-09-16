"use client"

import type { IntegrationThreadsModel } from "@chatbotx.io/database/types"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { toast } from "sonner"
import { useWorkspaceId } from "@/hooks/routing"
import { disconnectThreadsAction } from "../actions/disconnect.action"

export function ThreadsDisconnect({
  integrationThreads,
}: {
  integrationThreads: IntegrationThreadsModel
}) {
  const t = useTranslations()
  const router = useRouter()
  const workspaceId = useWorkspaceId()
  const { execute, isPending } = useAction(
    disconnectThreadsAction.bind(null, workspaceId, integrationThreads.id),
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
    <Button
      disabled={isPending}
      onClick={() => execute()}
      size="sm"
      variant="destructive"
    >
      {t("actions.disconnect")}
    </Button>
  )
}
