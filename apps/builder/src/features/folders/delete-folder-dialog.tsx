"use client"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { deleteFolderAction } from "@/features/folders/actions/delete-folder-action"
import type { Folder } from "@ahachat.ai/database/types"
import { useTranslate } from "@tolgee/react"
import { Loader2Icon } from "lucide-react"
import { useAction } from "next-safe-action/hooks"
import { toast } from "sonner"

export function DeleteFolderDialog({
  open,
  onOpenChange,
  chatbotId,
  folder,
}: {
  open: boolean
  onOpenChange: (val: boolean) => void
  chatbotId: string
  folder: Folder | null
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("folders.deleteAction.title")}</DialogTitle>
          <DialogDescription />
        </DialogHeader>

        <div>{t("folders.deleteAction.content")}</div>

        <div className="flex justify-end gap-4">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
          >
            {t("common.cancelBtn")}
          </Button>
          <Button
            type="submit"
            variant={"destructive"}
            disabled={isPending}
            onClick={() => execute({ ids: [folder?.id ?? ""] })}
          >
            {isPending && <Loader2Icon className="animate-spin" />}
            {t("common.deleteBtn")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
