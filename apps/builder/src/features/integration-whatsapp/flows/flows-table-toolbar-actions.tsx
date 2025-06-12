"use client"

import { Button } from "@/components/ui/button"
import { useTranslate } from "@tolgee/react"
import { Loader2Icon } from "lucide-react"
import { useAction } from "next-safe-action/hooks"
import { syncWhatsappFlowAction } from "./actions/sync-flows"
import { toast } from "sonner"
import Link from "next/link"

export function WhatsappFlowsTableToolbarActions({
  chatbotId,
}: { chatbotId: string }) {
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
      <Button size="sm" asChild>
        <Link href="#">{t("common.manage")}</Link>
      </Button>
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
