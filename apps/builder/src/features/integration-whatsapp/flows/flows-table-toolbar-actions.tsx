"use client"

import { Button } from "@aha.chat/ui/components/ui/button"
import { useTranslate } from "@tolgee/react"
import { Loader2Icon } from "lucide-react"
import Link from "next/link"
import { useAction } from "next-safe-action/hooks"
import { toast } from "sonner"
import { syncWhatsappFlowAction } from "./actions/sync-flows"

export function WhatsappFlowsTableToolbarActions({
  chatbotId,
}: {
  chatbotId: string
}) {
  const { t } = useTranslate()

  const { execute, isPending } = useAction(
    syncWhatsappFlowAction.bind(null, chatbotId),
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
      <Button asChild size="sm">
        <Link href="#">{t("common.manage")}</Link>
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
        {t("common.Synchronize")}
      </Button>
    </div>
  )
}
