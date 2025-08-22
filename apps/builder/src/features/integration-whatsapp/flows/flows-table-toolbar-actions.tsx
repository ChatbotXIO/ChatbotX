"use client"

import { Button } from "@aha.chat/ui/components/ui/button"
import { Loader2Icon } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { toast } from "sonner"
import { syncWhatsappFlowAction } from "./actions/sync-flows"

export function WhatsappFlowsTableToolbarActions({
  chatbotId,
}: {
  chatbotId: string
}) {
  const t = useTranslations()

  const { execute, isPending } = useAction(
    syncWhatsappFlowAction.bind(null, chatbotId),
    {
      onSuccess() {
        toast.success(t("messages.syncedSuccessfully"))
      },
      onError({ error }) {
        error.serverError && toast.error(error.serverError)
      },
    },
  )

  return (
    <div className="flex items-center gap-2">
      <Button asChild size="sm">
        <Link href="#">{t("actions.manage")}</Link>
      </Button>
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
