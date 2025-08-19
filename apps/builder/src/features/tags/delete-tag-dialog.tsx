"use client"

import type { TagModel } from "@aha.chat/database/types"
import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@aha.chat/ui/components/ui/dialog"
import type { Row } from "@tanstack/react-table"
import { useTranslate } from "@tolgee/react"
import { Loader, Trash } from "lucide-react"
import { useAction } from "next-safe-action/hooks"
import type { ComponentPropsWithoutRef } from "react"
import { toast } from "sonner"
import { deleteTagAction } from "./actions/delete-tag-action"

type DeleteTagsDialogProps = ComponentPropsWithoutRef<typeof Dialog> & {
  chatbotId: string
  tags: Row<TagModel>["original"][]
  showTrigger?: boolean
  onSuccess?: () => void
  onOpenChange?: (val: boolean) => void
}

export function DeleteTagsDialog({
  chatbotId,
  tags,
  showTrigger = true,
  onSuccess,
  onOpenChange,
  ...props
}: DeleteTagsDialogProps) {
  const { t } = useTranslate()

  const { execute, result, isPending } = useAction(
    deleteTagAction.bind(null, chatbotId),
    {
      onSuccess: () => {
        toast.success(t("tags.deleted"))
        onOpenChange?.(false)
      },
      onError: ({ error }) => {
        error.serverError && toast.error(result.serverError)
      },
    },
  )

  return (
    <Dialog {...props}>
      {showTrigger ? (
        <DialogTrigger asChild>
          <Button size="sm" variant="outline">
            <Trash aria-hidden="true" className="mr-2 size-4" />
            {t("common.deleteBtn")} ({tags.length})
          </Button>
        </DialogTrigger>
      ) : null}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("tags.delete.dialog_title")}</DialogTitle>
          <DialogDescription>
            {t("tags.confirmDeleteDesc")}{" "}
            <span className="font-medium">{tags.length}</span>
            {tags.length === 1 ? " log " : " tags "}
            {t("tags.confirmDeleteDesc")}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:space-x-0">
          <DialogClose asChild>
            <Button variant="outline">{t("common.cancelBtn")}</Button>
          </DialogClose>
          <Button
            aria-label="Delete selected rows"
            disabled={isPending}
            onClick={() =>
              execute({
                ids: (tags ?? []).map((tag) => tag.id),
              })
            }
            variant="destructive"
          >
            {isPending && (
              <Loader aria-hidden="true" className="mr-2 size-4 animate-spin" />
            )}
            {t("common.deleteBtn")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
