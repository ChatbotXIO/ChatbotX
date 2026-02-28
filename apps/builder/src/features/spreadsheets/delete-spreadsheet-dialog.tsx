"use client"

import type { SpreadsheetModel } from "@aha.chat/database/types"
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
import { toast } from "sonner"
import { deleteSpreadsheetAction } from "./actions/delete-spreadsheet-action"

interface DeleteSpreadsheetsDialogProps
  extends React.ComponentPropsWithoutRef<typeof Dialog> {
  chatbotId: string
  onOpenChange: (val: boolean) => void
  onSuccess?: () => void
  showTrigger?: boolean
  spreadsheets: Row<SpreadsheetModel>["original"][]
}

export function DeleteSpreadsheetsDialog({
  chatbotId,
  spreadsheets,
  showTrigger = true,
  onSuccess,
  onOpenChange,
  ...props
}: DeleteSpreadsheetsDialogProps) {
  const t = useTranslations()

  const { execute, isPending } = useAction(
    deleteSpreadsheetAction.bind(null, chatbotId),
    {
      onSuccess: () => {
        toast.success(
          t("messages.deleteSuccess", {
            feature: t("fields.googleSheets.label"),
          }),
        )
        onOpenChange(false)
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
            {t("actions.delete")} ({spreadsheets.length})
          </Button>
        </DialogTrigger>
      ) : null}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t("messages.deleteFeature", {
              feature: t("fields.googleSheets.label"),
            })}
          </DialogTitle>
          <DialogDescription>
            {t("messages.deleteConfirmation", {
              feature: t("fields.spreadsheet.label"),
            })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:space-x-0">
          <DialogClose asChild>
            <Button
              onClick={() => onOpenChange(false)}
              size="sm"
              variant="ghost"
            >
              {t("actions.cancel")}
            </Button>
          </DialogClose>
          <Button
            aria-label="Delete selected rows"
            disabled={isPending}
            onClick={() => execute({ ids: spreadsheets.map((f) => f.id) })}
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
