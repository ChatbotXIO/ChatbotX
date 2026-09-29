"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"
import { processMissedCommentsAction } from "./actions/process-missed-comments.action"
import type { CommentAutomationRow } from "./types"

/**
 * Confirms, then runs "process missed comments" for one automation. The run
 * sends real replies and DMs, which is why it sits behind a confirmation.
 * Shared by every comment channel — the action resolves the channel itself.
 */
export function ProcessMissedCommentsDialog({
  resource,
  onOpenChange,
  onSuccess,
}: {
  resource: Pick<CommentAutomationRow, "id" | "workspaceId"> | null
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}) {
  const t = useTranslations()
  const [isPending, setIsPending] = useState(false)

  const handleConfirm = async () => {
    if (!resource) {
      return
    }
    setIsPending(true)
    const result = await processMissedCommentsAction(
      resource.workspaceId,
      resource.id,
    )
    setIsPending(false)

    if (result?.serverError || !result?.data) {
      toast.error(
        result?.serverError ??
          t("commentAutomationMissedComments.errors.fetchFailed"),
      )
      return
    }

    if (result.data.status === "failed") {
      toast.error(
        t(`commentAutomationMissedComments.errors.${result.data.reason}`),
      )
      return
    }

    toast.success(
      t("commentAutomationMissedComments.success", {
        scanned: result.data.scanned,
        skipped: result.data.skipped,
        queued: result.data.queued,
        failed: result.data.failed,
      }),
    )
    onOpenChange(false)
    onSuccess?.()
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={resource !== null}>
      <DialogContent className="max-h-screen max-w-lg overflow-y-scroll">
        <DialogHeader>
          <DialogTitle>
            {t("commentAutomationMissedComments.title")}
          </DialogTitle>
          <DialogDescription>
            {t("commentAutomationMissedComments.description")}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="justify-end">
          <DialogClose
            render={
              <Button size="sm" type="button" variant="ghost">
                {t("actions.cancel")}
              </Button>
            }
          />
          <Button
            className="ms-auto"
            disabled={isPending || !resource}
            onClick={handleConfirm}
            size="sm"
          >
            {isPending && <Loader2Icon className="animate-spin" />}
            {t("actions.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
