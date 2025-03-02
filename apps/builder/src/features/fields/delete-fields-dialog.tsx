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
import type { Field, FieldType } from "@ahachat.ai/database/browser"
import type { Row } from "@tanstack/react-table"
import { useTranslate } from "@tolgee/react"
import { Loader, Trash } from "lucide-react"
import { useAction } from "next-safe-action/hooks"
import { useRouter } from "next/navigation"
import { type ComponentPropsWithoutRef, useTransition } from "react"
import { toast } from "sonner"
import { deleteFieldsAction } from "./actions/delete-field-action"

interface DeleteFieldsDialogProps
  extends ComponentPropsWithoutRef<typeof Dialog> {
  chatbotId: string
  fields: Row<Field>["original"][]
  showTrigger?: boolean
  onSuccess?: () => void
  onOpenChange: (val: boolean) => void
  fieldType: FieldType
}

export function DeleteFieldsDialog({
  chatbotId,
  fields,
  showTrigger = true,
  fieldType,
  onSuccess,
  onOpenChange,
  ...props
}: DeleteFieldsDialogProps) {
  const { t } = useTranslate()
  const router = useRouter()

  const { execute, result } = useAction(
    deleteFieldsAction.bind(
      null,
      chatbotId,
      fieldType,
      (fields ?? []).map((field) => field.id),
    ),
  )

  const [isDeleting, startDeleteTransition] = useTransition()
  const onDelete = () => {
    if (!fields || fields.length === 0) {
      return
    }

    startDeleteTransition(async () => {
      await execute()

      if (result.serverError) {
        toast.error(result.serverError.message ?? result.serverError)
      } else {
        toast.success(t("field.deleted"))
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
            {t("common.deleteBtn")} ({fields.length})
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
            onClick={onDelete}
            disabled={isDeleting}
          >
            {isDeleting && (
              <Loader className="mr-2 size-4 animate-spin" aria-hidden="true" />
            )}
            {t("common.deleteBtn")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
