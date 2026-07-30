"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { toast } from "sonner"
import { syncMessengerMessageTemplateAction } from "./actions/sync-message-templates"
import { CreateMessageTemplateDialog } from "./create-message-template-dialog"

export function MessengerMessageTemplatesTableToolbarActions({
  workspaceId,
  integrationMessengerId,
}: {
  workspaceId: string
  integrationMessengerId: string
}) {
  const t = useTranslations()
  const router = useRouter()

  const { execute, isPending } = useAction(
    syncMessengerMessageTemplateAction.bind(
      null,
      workspaceId,
      integrationMessengerId,
    ),
    {
      onSuccess() {
        toast.success(t("messages.syncedSuccessfully"))
        router.refresh()
      },
      onError({ error }) {
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
    },
  )

  return (
    <div className="flex items-center gap-2">
      <CreateMessageTemplateDialog
        integrationMessengerId={integrationMessengerId}
        workspaceId={workspaceId}
      />
      <Button
        disabled={isPending}
        onClick={() => execute()}
        size="sm"
        variant="secondary"
      >
        {isPending && (
          <Loader2Icon
            aria-hidden="true"
            className="me-2 size-4 animate-spin"
          />
        )}
        {t("actions.synchronize")}
      </Button>
    </div>
  )
}
