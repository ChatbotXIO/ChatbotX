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
import type {
  CommentAutomationRow,
  CommentAutomationTranslationNamespace,
} from "./types"

type BulkDeleteCommentAutomationsDialogProps<
  TItem extends Pick<CommentAutomationRow, "id" | "workspaceId">,
> = ComponentPropsWithoutRef<typeof Dialog> & {
  items: TItem[]
  translationNamespace: CommentAutomationTranslationNamespace
  deleteAction: (workspaceId: string, id: string) => Promise<unknown>
  showTrigger?: boolean
  onSuccess?: () => void
  onOpenChange: (val: boolean) => void
}

export function BulkDeleteCommentAutomationsDialog<
  TItem extends Pick<CommentAutomationRow, "id" | "workspaceId">,
>({
  items,
  translationNamespace,
  deleteAction,
  showTrigger = true,
  onSuccess,
  onOpenChange,
  ...props
}: BulkDeleteCommentAutomationsDialogProps<TItem>) {
  const t = useTranslations()

  const handleBulkDelete = async () => {
    try {
      await Promise.all(
        items.map((item) => deleteAction(item.workspaceId, item.id)),
      )
      toast.success(
        t("messages.deletedSuccess", {
          feature: t(`${translationNamespace}.title`),
        }),
      )
      onOpenChange(false)
      onSuccess?.()
    } catch (error) {
      console.error("Error deleting comment automations:", error)
      toast.error(t("messages.unknownError"))
    }
  }

  return (
    <Dialog onOpenChange={onOpenChange} {...props}>
      {showTrigger ? (
        <DialogTrigger
          render={
            <Button size="sm" variant="outline">
              <Trash aria-hidden="true" className="me-2 size-4" />
              {t("actions.delete")} ({items.length})
            </Button>
          }
        />
      ) : null}
      <DialogContent className="max-h-screen max-w-lg overflow-y-scroll">
        <DialogHeader>
          <DialogTitle>
            {t("messages.deleteFeature", {
              feature: t(`${translationNamespace}.title`),
            })}
          </DialogTitle>
          <DialogDescription className="whitespace-pre-wrap text-sm/6">
            {t("dialog.deleteConfirmation", {
              feature: t(`${translationNamespace}.title`),
            })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:space-x-0">
          <DialogClose
            render={
              <Button
                onClick={() => onOpenChange(false)}
                size="sm"
                variant="ghost"
              >
                {t("actions.cancel")}
              </Button>
            }
          />
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
