"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { CopyIcon, Loader2Icon, RefreshCwIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useState } from "react"
import { toast } from "sonner"
import { getInboundWebhookAction } from "../actions/get-inbound-webhook.action"
import { rotateInboundWebhookAction } from "../actions/rotate-inbound-webhook.action"

type InboundWebhook = { url: string; instructions: string }

type InboundWebhookBoxProps = {
  readonly workspaceId: string
  /** The saved integration; without one there is no URL to show yet. */
  readonly integrationSmtpId?: string
}

/** Shows the secret inbound-parse URL of a relay-provider inbox, with copy and rotate. */
export const InboundWebhookBox = ({
  workspaceId,
  integrationSmtpId,
}: InboundWebhookBoxProps) => {
  const t = useTranslations()
  const router = useRouter()
  const [webhook, setWebhook] = useState<InboundWebhook | null>(null)

  const handlers = {
    onSuccess: ({ data }: { data?: InboundWebhook }) => {
      if (data) {
        setWebhook(data)
      }
      // The list's "Receiving" badge depends on whether a URL was issued.
      router.refresh()
    },
    onError: () => {
      toast.error(t("smtp.guide.webhook.failed"))
    },
  }
  const show = useAction(
    getInboundWebhookAction.bind(null, workspaceId, integrationSmtpId ?? ""),
    handlers,
  )
  const rotate = useAction(
    rotateInboundWebhookAction.bind(null, workspaceId, integrationSmtpId ?? ""),
    handlers,
  )

  if (!integrationSmtpId) {
    return (
      <p className="rounded-md border border-dashed p-3 text-muted-foreground text-sm">
        {t("smtp.guide.webhook.saveFirst")}
      </p>
    )
  }

  const copy = async () => {
    if (!webhook) {
      return
    }
    try {
      await navigator.clipboard.writeText(webhook.url)
      toast.success(t("smtp.guide.webhook.copied"))
    } catch {
      toast.error(t("smtp.guide.webhook.failed"))
    }
  }

  return (
    <div className="space-y-2 rounded-md border p-3 text-sm">
      <p className="font-medium">{t("smtp.guide.webhook.title")}</p>
      <p className="text-muted-foreground">{t("smtp.guide.webhook.hint")}</p>
      {webhook ? (
        <>
          <code className="block break-all rounded bg-muted p-2 text-xs">
            {webhook.url}
          </code>
          <p className="text-muted-foreground">{webhook.instructions}</p>
          <div className="flex gap-2">
            <Button onClick={copy} size="sm" type="button" variant="outline">
              <CopyIcon className="size-4" />
              {t("actions.copy")}
            </Button>
            <Button
              disabled={rotate.isExecuting}
              onClick={() => rotate.execute()}
              size="sm"
              type="button"
              variant="outline"
            >
              {rotate.isExecuting ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <RefreshCwIcon className="size-4" />
              )}
              {t("smtp.guide.webhook.rotate")}
            </Button>
          </div>
        </>
      ) : (
        <Button
          disabled={show.isExecuting}
          onClick={() => show.execute()}
          size="sm"
          type="button"
          variant="outline"
        >
          {show.isExecuting && <Loader2Icon className="size-4 animate-spin" />}
          {t("smtp.guide.webhook.show")}
        </Button>
      )}
    </div>
  )
}
