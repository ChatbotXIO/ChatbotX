"use client"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@chatbotx.io/ui/components/ui/alert-dialog"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Textarea } from "@chatbotx.io/ui/components/ui/textarea"
import { useQuery } from "@tanstack/react-query"
import { CopyIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useClipboard } from "@/hooks/use-clipboard"
import { orpc } from "@/lib/orpc/query"

type MessengerAdsJsonDialogProps = {
  workspaceId: string
  flowId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

const ERROR_MESSAGE_KEY = {
  notPublished: "messages.messengerAdsNotPublished",
  noStartNode: "messages.messengerAdsNoStartNode",
  invalidStepType: "messages.messengerAdsInvalidStepType",
  invalidVariable: "messages.messengerAdsInvalidVariable",
} as const

export function MessengerAdsJsonDialog({
  workspaceId,
  flowId,
  open,
  onOpenChange,
}: MessengerAdsJsonDialogProps) {
  const t = useTranslations()
  const { handleCopy } = useClipboard()

  const { data, isFetching, error } = useQuery(
    orpc.flowsAPI.privateGetMessengerAdsJsonAPI.queryOptions({
      input: { workspaceId, flowId },
      enabled: open,
      // The starting step may have changed since the last open, so always
      // refetch on open and never surface a stale cached value. Focus/reconnect
      // refetch is disabled so an open dialog's content can't blank out.
      staleTime: 0,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    }),
  )

  const renderError = (message: string) => (
    <AlertDialog onOpenChange={onOpenChange} open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("actions.getMessengerAdsJson")}
          </AlertDialogTitle>
          <AlertDialogDescription>{message}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction onClick={() => onOpenChange(false)}>
            {t("actions.ok")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )

  // Wait for the in-flight fetch to settle before rendering anything: a loading
  // dialog never flashes open, and a reopen never shows the previous (possibly
  // stale) cached JSON while it refetches.
  if (!open || isFetching) {
    return null
  }

  // A thrown request error (network/500/expired session) leaves `data`
  // undefined; surface a generic failure instead of rendering nothing forever.
  if (error || !data) {
    return renderError(t("messages.messengerAdsError"))
  }

  if (data.status === "error") {
    return renderError(t(ERROR_MESSAGE_KEY[data.reason]))
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("actions.getMessengerAdsJson")}</DialogTitle>
          <DialogDescription>
            {t("messages.messengerAdsJsonDescription")}
          </DialogDescription>
        </DialogHeader>

        <Textarea
          className="min-h-64 resize-none font-mono text-sm focus-visible:outline-none focus-visible:ring-0"
          readOnly
          value={data.json}
        />

        <DialogFooter>
          <Button onClick={() => handleCopy(data.json)}>
            <CopyIcon className="h-4 w-4" />
            {t("actions.copy")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
