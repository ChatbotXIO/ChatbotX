"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { toast } from "sonner"
import { testLineWebhookAction } from "../actions/test-webhook.action"

export function LineTestWebhook({
  workspaceId,
  integrationId,
}: {
  workspaceId: string
  integrationId: string
}) {
  const t = useTranslations("integrationLine")

  const { execute, isPending } = useAction(
    testLineWebhookAction.bind(null, workspaceId, integrationId),
    {
      onSuccess: ({ data }) => {
        if (!data) {
          return
        }
        if (data.success && data.active) {
          toast.success(t("testWebhookSuccess"))
        } else if (data.active) {
          toast.error(
            t("webhookTestFailed", { reason: data.reason ?? "unknown" }),
          )
        } else {
          toast.error(t("webhookNotEnabled"))
        }
      },
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
      type="button"
      variant="secondary"
    >
      {isPending && <Loader2Icon className="animate-spin" />}
      {t("testWebhook")}
    </Button>
  )
}
