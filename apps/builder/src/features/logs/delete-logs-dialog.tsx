"use client"

import type { LogModel, LogType } from "@aha.chat/database/types"
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
import { Loader, Trash } from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import type { ComponentPropsWithoutRef } from "react"
import { toast } from "sonner"
import { deleteLogAction } from "./actions/delete-log-action"

type DeleteLogsDialogProps = ComponentPropsWithoutRef<typeof Dialog> & {
  chatbotId: string
  logs: Row<LogModel>["original"][]
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
  const t = useTranslations()

  const { execute, isPending } = useAction(
    deleteLogAction.bind(null, chatbotId),
    {
      onSuccess: () => {
        toast.success(
          t("messages.deletedSuccessfully", {
            feature: t("fields.log.label"),
          }),
        )
        onSuccess?.()
      },
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
    },
  )

  return (
    <Dialog {...props}>
      {showTrigger ? (
        <DialogTrigger asChild>
          <Button size="sm" variant="outline">
            <Trash aria-hidden="true" className="mr-2 size-4" />
            {t("actions.delete")} ({logs.length})
          </Button>
        </DialogTrigger>
      ) : null}
      <DialogContent className={"max-h-screen max-w-xl overflow-y-scroll"}>
        <DialogHeader>
          <DialogTitle>
            {t("messages.deleteFeature", { feature: t("fields.log.label") })}
          </DialogTitle>
          <DialogDescription className="whitespace-pre-wrap text-sm/6">
            {t("dialog.deleteConfirmation", {
              feature: t("fields.log.label"),
            })}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="gap-2 sm:space-x-0">
          <DialogClose asChild>
            <Button size="sm" variant="ghost">
              {t("actions.cancel")}
            </Button>
          </DialogClose>
          <Button
            aria-label="Delete selected rows"
            disabled={isPending}
            onClick={() =>
              execute({
                ids: (logs ?? []).map((log) => log.id),
                logType: logType as LogType,
              })
            }
            size="sm"
            variant="destructive"
          >
            {isPending && (
              <Loader aria-hidden="true" className="mr-2 size-4 animate-spin" />
            )}
            {t("actions.delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
