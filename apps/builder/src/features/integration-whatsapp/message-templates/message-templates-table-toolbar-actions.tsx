"use client"

import { Button } from "@aha.chat/ui/components/ui/button"
import { Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { toast } from "sonner"
import { syncMessageTemplateAction } from "./actions/sync-message-templates"

export function WhatsappMessageTemplatesTableToolbarActions({
  chatbotId,
  integrationWhatsappId,
}: {
  chatbotId: string
  integrationWhatsappId: string
}) {
  const t = useTranslations()

  const { execute, isPending } = useAction(
    syncMessageTemplateAction.bind(null, chatbotId, integrationWhatsappId),
    {
      onSuccess() {
        toast.success(t("messages.syncedSuccessfully"))
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
        {t("actions.synchronize")}
      </Button>
    </div>
  )
}
