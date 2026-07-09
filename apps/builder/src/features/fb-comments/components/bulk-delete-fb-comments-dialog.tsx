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
  DialogTrigger,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Trash } from "lucide-react"
import { useTranslations } from "next-intl"
import type { ComponentPropsWithoutRef } from "react"
import { toast } from "sonner"
import { deleteFbCommentAction } from "../actions/delete-fb-comment.action"
import type { FBCommentResource } from "../schema/resource"

type BulkDeleteFbCommentsDialogProps = ComponentPropsWithoutRef<
  typeof Dialog
> & {
  fbComments: FBCommentResource[]
  showTrigger?: boolean
  onSuccess?: () => void
  onOpenChange: (val: boolean) => void
}

export function BulkDeleteFbCommentsDialog({
  fbComments,
  showTrigger = true,
  onSuccess,
  onOpenChange,
  ...props
}: BulkDeleteFbCommentsDialogProps) {
  const t = useTranslations()

  const handleBulkDelete = async () => {
    try {
      await Promise.all(
        fbComments.map((item) =>
          deleteFbCommentAction(item.workspaceId, item.id),
        ),
      )
      toast.success(
        t("messages.deletedSuccess", {
          feature: t("facebookCommentAutomation.title"),
        }),
      )
      onOpenChange(false)
      onSuccess?.()
    } catch (error) {
      console.error("Error deleting FB Comment Automations:", error)
      toast.error(t("messages.unknownError"))
    }
  }

  return (
    <Dialog onOpenChange={onOpenChange} {...props}>
      {showTrigger ? (
        <DialogTrigger asChild>
          <Button size="sm" variant="outline">
            <Trash aria-hidden="true" className="mr-2 size-4" />
            {t("actions.delete")} ({fbComments.length})
          </Button>
        </DialogTrigger>
      ) : null}
      <DialogContent className="max-h-screen max-w-lg overflow-y-scroll">
        <DialogHeader>
          <DialogTitle>
            {t("messages.deleteFeature", {
              feature: t("facebookCommentAutomation.title"),
            })}
          </DialogTitle>
          <DialogDescription className="whitespace-pre-wrap text-sm/6">
            {t("dialog.deleteConfirmation", {
              feature: t("facebookCommentAutomation.title"),
            })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:space-x-0">
          <DialogClose asChild>
            <Button
              onClick={() => onOpenChange(false)}
              size="sm"
              variant="ghost"
            >
              {t("actions.cancel")}
            </Button>
          </DialogClose>
          <Button
            aria-label="Delete selected rows"
            onClick={handleBulkDelete}
            size="sm"
            variant="destructive"
          >
            {t("actions.delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
