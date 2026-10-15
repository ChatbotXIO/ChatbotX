"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { toast } from "sonner"
import { deleteInboundWebhooksAction } from "../actions/delete-inbound-webhooks.action"
import { translateInboundWebhookError } from "../lib/server-error"

type DeleteInboundWebhookDialogProps = {
  workspaceId: string
  webhook: { id: string; name: string } | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export const DeleteInboundWebhookDialog = ({
  workspaceId,
  webhook,
  open,
  onOpenChange,
}: DeleteInboundWebhookDialogProps) => {
  const t = useTranslations()
  const router = useRouter()

  const { execute, isPending } = useAction(
    deleteInboundWebhooksAction.bind(null, workspaceId),
    {
      onSuccess: () => {
        toast.success(
          t("messages.deletedSuccess", {
            feature: t("inboundWebhooks.feature"),
          }),
        )
        onOpenChange(false)
        router.refresh()
      },
      onError: ({ error }) => {
        toast.error(
          translateInboundWebhookError(
            t,
            error.serverError,
            t("inboundWebhooks.feature"),
          ),
        )
      },
    },
  )

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {t("messages.deleteFeature", {
              feature: t("inboundWebhooks.feature"),
            })}
          </DialogTitle>
          <DialogDescription className="whitespace-pre-wrap text-sm/6">
            {webhook?.name}
            {"\n"}
            {t("inboundWebhooks.deleteDescription")}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:space-x-0">
          <Button
            onClick={() => onOpenChange(false)}
            size="sm"
            type="button"
            variant="ghost"
          >
            {t("actions.cancel")}
          </Button>
          <Button
            disabled={isPending || !webhook}
            onClick={() => webhook && execute({ ids: [webhook.id] })}
            size="sm"
            type="button"
            variant="destructive"
          >
            {isPending && <Loader2Icon aria-hidden className="animate-spin" />}
            {t("actions.delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
