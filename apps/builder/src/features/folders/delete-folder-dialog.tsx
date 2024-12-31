"use client"

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { deleteFolderAction } from "@/features/folders/actions/delete-folder-action";
import { Folder } from "@ahachat.ai/database";
import { useTranslate } from '@tolgee/react';
import { Loader2 } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { useTransition } from "react";
import { toast } from "sonner";

export function DeleteFolderDialog({
  open,
  onOpenChange,
  chatbotId,
  folder,
  // onClose,
}: {
  open: boolean,
  onOpenChange: (val: boolean) => void,
  chatbotId: string,
  folder: Folder | null,
}) {
  const { t } = useTranslate();

  const { execute, result } = useAction(deleteFolderAction.bind(null, chatbotId, folder?.id ?? ''))

  const [isDeletePending, startDeleteTransition] = useTransition()
  const onDelete = () => {
    console.log("folderdddddd", folder)
    if (!folder) {
      return
    }

    startDeleteTransition(async () => {
      await execute()

      if (result.serverError) {
        toast.error(result.serverError.message ?? result.serverError)
      } else {
        toast.success(t("folders.deleted"))
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('folders.delete.title')}</DialogTitle>
          <DialogDescription>{t('folders.delete.desc')}</DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-4">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>{t('common.cancel-btn')}</Button>
          <Button type="submit" disabled={isDeletePending} onClick={() => onDelete()}>
            {isDeletePending && <Loader2 className="animate-spin" />}
            {t('common.deleteBtn')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
