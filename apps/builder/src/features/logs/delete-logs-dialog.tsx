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
import type { Log } from "@ahachat.ai/database/types"
import type { Row } from "@tanstack/react-table"
import { useTranslate } from "@tolgee/react"
import { Loader, Trash } from "lucide-react"
import { useAction } from "next-safe-action/hooks"
import { toast } from "sonner"
import { deleteLogAction } from "./actions/delete-log-action"

interface DeleteLogsDialogProps
  extends React.ComponentPropsWithoutRef<typeof Dialog> {
  chatbotId: string
  logs: Row<Log>["original"][]
  logType: string
  showTrigger?: boolean
  onSuccess?: () => void
}

export function DeleteLogsDialog({
  chatbotId,
  logs,
  logType,
  showTrigger = true,
  onSuccess,
  ...props
}: DeleteLogsDialogProps) {
  const { t } = useTranslate()

  const { execute, result, isPending } = useAction(
    deleteLogAction.bind(
      null,
      chatbotId,
      (logs ?? []).map((log) => log.id),
      logType,
    ),
    {
      onSuccess: () => {
        toast.success(t("logs.deleted"))
        onSuccess?.()
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
            {t("common.deleteBtn")} ({logs.length})
          </Button>
        </DialogTrigger>
      ) : null}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("logs.delete.dialog_title")}</DialogTitle>
          <DialogDescription>
            {t("logs.delete.dialog_first_desc")}{" "}
            <span className="font-medium">{logs.length}</span>
            {logs.length === 1 ? " log " : " logs "}
            {t("logs.delete.dialog_second_desc")}
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
