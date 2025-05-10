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
import type { FieldType } from "@ahachat.ai/database/types"
import type { Row } from "@tanstack/react-table"
import { useTranslate } from "@tolgee/react"
import { Loader, Trash } from "lucide-react"
import { useAction } from "next-safe-action/hooks"
import type { ComponentPropsWithoutRef } from "react"
import { toast } from "sonner"
import { deleteFieldsAction } from "./actions/delete-field-action"
import type { CustomFieldResource } from "./schemas/types"

interface DeleteFieldsDialogProps
  extends ComponentPropsWithoutRef<typeof Dialog> {
  chatbotId: string
  records: Row<CustomFieldResource>["original"][]
  showTrigger?: boolean
  onSuccess?: () => void
  onOpenChange: (val: boolean) => void
  fieldType: FieldType
}

export function DeleteFieldsDialog({
  chatbotId,
  records,
  showTrigger = true,
  fieldType,
  onSuccess,
  onOpenChange,
  ...props
}: DeleteFieldsDialogProps) {
  const { t } = useTranslate()

  const { execute, isPending } = useAction(
    deleteFieldsAction.bind(null, chatbotId),
    {
      onSuccess: () => {
        toast.success(t("field.deleted"))
        onOpenChange(false)
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
            onClick={() => execute({ ids: records.map((r) => r.id) })}
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
