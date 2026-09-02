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
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { toast } from "sonner"
import { deleteBroadcastAction } from "../actions/delete-broadcast.action"
import { deleteBroadcastsAction } from "../actions/delete-broadcasts.action"

type BroadcastDeleteTarget = { id: string; name: string | null }

type DeleteBroadcastResult = { deletedCount: number; requestedCount: number }

export function DeleteBroadcastDialog({
  workspaceId,
  broadcasts,
  open,
  onOpenChange,
  onSuccess,
}: {
  workspaceId: string
  broadcasts: BroadcastDeleteTarget[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}) {
  const t = useTranslations()
  const router = useRouter()

  const isBulk = broadcasts.length > 1
  const singleId = broadcasts.length === 1 ? broadcasts[0].id : ""

  const handleSuccess = (result: DeleteBroadcastResult | undefined) => {
    if (!result) {
      return
    }

    if (result.deletedCount === result.requestedCount) {
      toast.success(
        t("messages.deletedSuccess", {
          feature: t("fields.broadcast.label"),
        }),
      )
    } else {
      toast.warning(
        t("broadcasts.deleteDialog.partial", {
          deleted: result.deletedCount,
          requested: result.requestedCount,
        }),
      )
    }
    onOpenChange(false)
    router.refresh()
    onSuccess?.()
  }

  const handleError = (serverError: string | undefined) => {
    if (serverError) {
      toast.error(serverError)
    }
    // A transition may have raced (e.g. a broadcast started sending
    // between the row rendering and the click) — refresh so the stale row
    // self-corrects instead of continuing to offer an action that will
    // fail again.
    router.refresh()
  }

  const { execute: executeSingle, isPending: isSinglePending } = useAction(
    deleteBroadcastAction.bind(null, workspaceId, singleId),
    {
      onSuccess: ({ data }) => handleSuccess(data),
      onError: ({ error }) => handleError(error.serverError),
    },
  )

  const { execute: executeBulk, isPending: isBulkPending } = useAction(
    deleteBroadcastsAction.bind(null, workspaceId),
    {
      onSuccess: ({ data }) => handleSuccess(data),
      onError: ({ error }) => handleError(error.serverError),
    },
  )

  const isPending = isBulk ? isBulkPending : isSinglePending

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t("broadcasts.deleteDialog.title", { count: broadcasts.length })}
          </DialogTitle>
          <DialogDescription>
            {t("broadcasts.deleteDialog.description", {
              count: broadcasts.length,
              name: broadcasts[0]?.name ?? "",
            })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose
            render={
              <Button type="button" variant="outline">
                {t("actions.cancel")}
              </Button>
            }
          />
          <Button
            disabled={isPending || broadcasts.length === 0}
            onClick={() =>
              isBulk
                ? executeBulk({ ids: broadcasts.map((b) => b.id) })
                : executeSingle()
            }
            variant="destructive"
          >
            {isPending && <Loader2Icon className="animate-spin" />}
            {t("actions.delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
