"use client"

import { Button } from "@/components/ui/button"
import { useTranslate } from "@tolgee/react"
import { Loader2Icon } from "lucide-react"
import { useAction } from "next-safe-action/hooks"
import { syncMessageTemplateAction } from "./actions/sync-message-templates"
import { toast } from "sonner"

export function MessageTemplatesTableToolbarActions({
  chatbotId,
}: { chatbotId: string }) {
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
        variant="secondary"
        disabled={isPending}
        onClick={() => execute()}
        size="sm"
      >
        {isPending && (
          <Loader2Icon
            className="mr-2 size-4 animate-spin"
            aria-hidden="true"
          />
        )}
        {t("common.Synchronize")}
      </Button>
    </div>
  )
}
