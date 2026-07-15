"use client"

import type { IntegrationInstagramModel } from "@chatbotx.io/database/types"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { toast } from "sonner"
import { useWorkspaceId } from "@/hooks/routing"
import { reconnectInstagramAction } from "../actions/reconnect.action"

export function InstagramReconnect({
  integrationInstagram,
}: {
  integrationInstagram: IntegrationInstagramModel
}) {
  const t = useTranslations()
  const workspaceId = useWorkspaceId()

  // No onSuccess: the action ends in a redirect to the OAuth dialog.
  const { execute, isPending } = useAction(
    reconnectInstagramAction.bind(null, workspaceId, integrationInstagram.id),
    {
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
      {t("instagram.reconnect")}
    </Button>
  )
}
