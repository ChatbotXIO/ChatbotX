"use client"

import type { IntegrationMessengerModel } from "@chatbotx.io/database/types"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { toast } from "sonner"
import { useWorkspaceId } from "@/hooks/routing"
import { reconnectMessengerAction } from "../actions/reconnect.action"

export function MessengerReconnect({
  integrationMessenger,
}: {
  integrationMessenger: IntegrationMessengerModel
}) {
  const t = useTranslations()
  const workspaceId = useWorkspaceId()

  // No onSuccess: the action ends in a redirect to the Facebook OAuth dialog.
  const { execute, isPending } = useAction(
    reconnectMessengerAction.bind(null, workspaceId, integrationMessenger.id),
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
      {t("messenger.reconnect")}
    </Button>
  )
}
