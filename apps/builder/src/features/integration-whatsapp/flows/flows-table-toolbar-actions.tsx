"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { toast } from "sonner"
import { syncWhatsappFlowsAction } from "./actions/sync-whatsapp-flows"

export function WhatsappFlowsTableToolbarActions({
  workspaceId,
  integrationWhatsappId,
}: {
  workspaceId: string
  integrationWhatsappId: string
}) {
  const t = useTranslations()
  const router = useRouter()

  const { execute, isPending } = useAction(
    syncWhatsappFlowsAction.bind(null, workspaceId, integrationWhatsappId),
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
