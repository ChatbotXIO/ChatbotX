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
import type { Tag } from "@ahachat.ai/database/browser"
import type { Row } from "@tanstack/react-table"
import { useTranslate } from "@tolgee/react"
import { Loader, Trash } from "lucide-react"
import { useAction } from "next-safe-action/hooks"
import { useRouter } from "next/navigation"
import { useTransition } from "react"
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
  const router = useRouter()

  const { execute, result } = useAction(
    deleteTagAction.bind(
      null,
      chatbotId,
      (tags ?? []).map((tag) => tag.id),
    ),
  )

  const [isDeletePending, startDeleteTransition] = useTransition()
  const onDelete = () => {
    if (!tags || tags.length === 0) {
      return
    }

    startDeleteTransition(async () => {
      await execute()

      if (result.serverError) {
        toast.error(result.serverError.message ?? result.serverError)
      } else {
        toast.success(t("tags.deleted"))
        onOpenChange(false)
        router.refresh()
      }
    })
  }

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
            onClick={onDelete}
            disabled={isDeletePending}
          >
            {isDeletePending && (
              <Loader className="mr-2 size-4 animate-spin" aria-hidden="true" />
            )}
            {t("common.deleteBtn")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
