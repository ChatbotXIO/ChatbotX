"use client"

import { Button } from "@aha.chat/ui/components/ui/button"
import { useTranslate } from "@tolgee/react"
import { Loader2Icon } from "lucide-react"
import { useAction } from "next-safe-action/hooks"
import { toast } from "sonner"
import { syncMessageTemplateAction } from "./actions/sync-message-templates"

export function WhatsappMessageTemplatesTableToolbarActions({
  chatbotId,
}: {
  chatbotId: string
}) {
  const { t } = useTranslate()

  const { execute, isPending } = useAction(
    syncMessageTemplateAction.bind(null, chatbotId),
    {
      onSuccess() {
        toast.success(t("common.synced"))
      },
      onError({ error }) {
        error.serverError && toast.error(error.serverError)
      },
    },
  )

  return (
    <div className="flex items-center gap-2">
      <Button
        disabled={isPending}
        onClick={() => execute()}
        size="sm"
        variant="secondary"
      >
        {isPending && (
          <Loader2Icon
            aria-hidden="true"
            className="mr-2 size-4 animate-spin"
          />
        )}
        {t("common.Synchronize")}
      </Button>
    </div>
  )
}
