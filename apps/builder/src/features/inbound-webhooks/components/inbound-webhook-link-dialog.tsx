"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { CopyIcon, Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { useCopyToClipboard } from "usehooks-ts"
import { getInboundWebhookTokenAction } from "../actions/get-inbound-webhook-token.action"
import { buildInboundWebhookUrl } from "../lib/endpoint-url"
import { SecretUrlInput } from "./secret-url-input"

type LinkState =
  | { status: "loading" }
  | { status: "ready"; token: string }
  | { status: "error"; message: string }

type InboundWebhookLinkDialogProps = {
  workspaceId: string
  webhook: { id: string } | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Shows the secret URL on demand; the list itself never carries the token. */
export const InboundWebhookLinkDialog = ({
  workspaceId,
  webhook,
  open,
  onOpenChange,
}: InboundWebhookLinkDialogProps) => {
  const t = useTranslations()
  const [, copy] = useCopyToClipboard()
  const [state, setState] = useState<LinkState>({ status: "loading" })
  const webhookId = webhook?.id

  useEffect(() => {
    if (!(open && webhookId)) {
      return
    }
    let cancelled = false
    setState({ status: "loading" })
    getInboundWebhookTokenAction(workspaceId, webhookId).then((result) => {
      if (cancelled) {
        return
      }
      setState(
        result?.data
          ? { status: "ready", token: result.data.token }
          : {
              status: "error",
              message: result?.serverError ?? t("messages.unknownError"),
            },
      )
    })
    return () => {
      cancelled = true
    }
  }, [open, webhookId, workspaceId, t])

  const url =
    state.status === "ready"
      ? buildInboundWebhookUrl({
          origin: window.location.origin,
          token: state.token,
        })
      : ""

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("inboundWebhooks.link.title")}</DialogTitle>
          <DialogDescription>
            {t("inboundWebhooks.link.description")}
          </DialogDescription>
        </DialogHeader>
        {state.status === "loading" ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2Icon aria-hidden className="size-4 animate-spin" />
            {t("actions.loading")}
          </div>
        ) : null}
        {state.status === "error" ? (
          <p className="text-destructive text-sm" role="alert">
            {state.message}
          </p>
        ) : null}
        {url ? (
          <div className="flex gap-2">
            <SecretUrlInput
              aria-label={t("inboundWebhooks.link.title")}
              value={url}
            />
            <Button
              onClick={() =>
                copy(url).then(() =>
                  toast.success(t("messages.copiedToClipboard")),
                )
              }
              type="button"
              variant="outline"
            >
              <CopyIcon aria-hidden className="size-4" />
              {t("actions.copy")}
            </Button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
