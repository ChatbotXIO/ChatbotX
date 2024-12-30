"use client"

import React from "react"
import { type Row } from "@tanstack/react-table"
import { Loader, Trash } from "lucide-react"
import { toast } from "sonner"

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

import { deleteLogAction } from "../../delete/delete-logs-queries"
import { Log } from "@prisma/client"
import { useTranslate } from "@tolgee/react"


interface DeleteLogsDialogProps
  extends React.ComponentPropsWithoutRef<typeof Dialog> {
  logs: Row<Log>["original"][]
  showTrigger?: boolean
  onSuccess?: () => void
  chatbotId: string
}

export function DeleteLogsDialog({
  logs,
  showTrigger = true,
  onSuccess,
  chatbotId,
  ...props
}: DeleteLogsDialogProps) {
  const [isDeletePending, startDeleteTransition] = React.useTransition()

    const { t } = useTranslate();

  function onDelete() {
    startDeleteTransition(async () => {
      const ids = logs.map((log) => log.id);

      await deleteLogAction({
        ids: ids,
        chatbotId,
      });

      props.onOpenChange?.(false)
      toast.success("logs deleted")
      onSuccess?.()
    })
  }

  return (
    <Dialog {...props}>
      {showTrigger ? (
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <Trash className="mr-2 size-4" aria-hidden="true" />
            {t('logs.delete.delete_button')} ({logs.length})
          </Button>
        </DialogTrigger>
      ) : null}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('logs.delete.dialog_title')}</DialogTitle>
          <DialogDescription>
            {t('logs.delete.dialog_first_desc')}{" "}
            <span className="font-medium">{logs.length}</span>
            {logs.length === 1 ? " log " : " logs "}{t('logs.delete.dialog_second_desc')}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:space-x-0">
          <DialogClose asChild>
            <Button variant="outline">{t('logs.delete.cancel_button')}</Button>
          </DialogClose>
          <Button
            aria-label="Delete selected rows"
            variant="destructive"
            onClick={onDelete}
            disabled={isDeletePending}
          >
            {isDeletePending && (
              <Loader
                className="mr-2 size-4 animate-spin"
                aria-hidden="true"
              />
            )}
            {t('logs.delete.delete_button')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
