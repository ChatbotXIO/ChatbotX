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
import type { Row } from "@tanstack/react-table"
import { useTranslate } from "@tolgee/react"
import { Loader, Trash } from "lucide-react"
import { useAction } from "next-safe-action/hooks"
import type { ComponentPropsWithoutRef } from "react"
import { toast } from "sonner"
import { deleteAccountFieldsAction } from "./actions/delete-account-field.action"
import type { AccountFieldResource } from "./schemas/types"

interface DeleteAccountFieldsDialogProps
  extends ComponentPropsWithoutRef<typeof Dialog> {
  chatbotId: string
  records: Row<AccountFieldResource>["original"][]
  showTrigger?: boolean
  onSuccess?: () => void
  onOpenChange?: (val: boolean) => void
}

export function DeleteAccountFieldsDialog({
  chatbotId,
  records,
  showTrigger = true,
  onOpenChange,
  ...props
}: DeleteAccountFieldsDialogProps) {
  const { t } = useTranslate()

  const { execute, isPending } = useAction(
    deleteAccountFieldsAction.bind(null, chatbotId),
    {
      onSuccess: () => {
        toast.success(t("accountFields.deleted"))
        onOpenChange?.(false)
      },
      onError: ({ error }) => {
        error.serverError && toast.error(error.serverError)
      },
    },
  )

  return (
    <Dialog {...props}>
      {showTrigger ? (
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <Trash className="mr-2 size-4" aria-hidden="true" />
            {t("common.deleteBtn")} ({records.length})
          </Button>
        </DialogTrigger>
      ) : null}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("field.deleteDialogTitle")}</DialogTitle>
          <DialogDescription>
            {t("field.delete.confirmationText")}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:space-x-0">
          <DialogClose asChild>
            <Button variant="outline">{t("common.cancelBtn")}</Button>
          </DialogClose>
          <Button
            aria-label="Delete selected rows"
            variant="destructive"
            onClick={() => execute({ ids: records.map((f) => f.id) })}
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
