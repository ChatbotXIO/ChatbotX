"use client"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import type { Tag } from "@ahachat.ai/database/types"
import type { Row } from "@tanstack/react-table"
import { useTranslate } from "@tolgee/react"
import { Loader, Trash } from "lucide-react"
import { useAction } from "next-safe-action/hooks"
import { toast } from "sonner"
import { deleteTagAction } from "./actions/delete-tag-action"

interface DeleteTagsDialogProps
  extends React.ComponentPropsWithoutRef<typeof Dialog> {
  chatbotId: string
  tags: Row<Tag>["original"][]
  showTrigger?: boolean
  onSuccess?: () => void
  onOpenChange: (val: boolean) => void
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
    deleteTagAction.bind(
      null,
      chatbotId,
      (tags ?? []).map((tag) => tag.id),
    ),
    {
      onSuccess: () => {
        toast.success(t("tags.deleted"))
        onOpenChange(false)
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
          <Button variant="outline" size="sm">
            <Trash className="mr-2 size-4" aria-hidden="true" />
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
            variant="destructive"
            onClick={() => execute()}
            disabled={isPending}
          >
            {isPending && (
              <Loader className="mr-2 size-4 animate-spin" aria-hidden="true" />
            )}
            {t("common.deleteBtn")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
