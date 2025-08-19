"use client"

import type { FolderModel } from "@aha.chat/database/types"
import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@aha.chat/ui/components/ui/dialog"
import { useTranslate } from "@tolgee/react"
import { Loader2Icon } from "lucide-react"
import { useAction } from "next-safe-action/hooks"
import { toast } from "sonner"
import { deleteFolderAction } from "@/features/folders/actions/delete-folder-action"

export function DeleteFolderDialog({
  open,
  onOpenChange,
  chatbotId,
  folder,
}: {
  open: boolean
  onOpenChange: (val: boolean) => void
  chatbotId: string
  folder: FolderModel | null
}) {
  const { t } = useTranslate()

  const { execute, isPending } = useAction(
    deleteFolderAction.bind(null, chatbotId),
    {
      onSuccess: () => {
        toast.success(t("folders.deleteAction.successMessage"))
        onOpenChange(false)
      },
      onError: ({ error }) => {
        error.serverError && toast.error(error.serverError)
      },
    },
  )

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("folders.deleteAction.title")}</DialogTitle>
          <DialogDescription />
        </DialogHeader>

        <div>{t("folders.deleteAction.content")}</div>

        <div className="flex justify-end gap-4">
          <Button
            onClick={() => onOpenChange(false)}
            type="button"
            variant="ghost"
          >
            {t("common.cancelBtn")}
          </Button>
          <Button
            disabled={isPending}
            onClick={() => execute({ ids: [folder?.id ?? ""] })}
            type="submit"
            variant={"destructive"}
          >
            {isPending && <Loader2Icon className="animate-spin" />}
            {t("common.deleteBtn")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
