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
import { Field, FieldType } from "@ahachat.ai/database"
import { type Row } from "@tanstack/react-table"
import { useTranslate } from "@tolgee/react"
import { Loader, Trash } from "lucide-react"
import { useAction } from "next-safe-action/hooks"
import { useTransition } from "react"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { deleteFieldsAction } from "./actions/delete-field-action"

interface DeleteFieldsDialogProps
  extends React.ComponentPropsWithoutRef<typeof Dialog> {
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
  onSuccess,
  onOpenChange,
  fieldType,
  ...props
}: DeleteFieldsDialogProps) {
  const { t } = useTranslate();
  const router = useRouter()

  const { execute, result } = useAction(deleteFieldsAction.bind(null, chatbotId, (fields ?? []).map(field => field.id), fieldType))

  const [isDeletePending, startDeleteTransition] = useTransition()
  const onDelete = () => {
    if (!fields || fields.length == 0) {
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
            {t('common.deleteBtn')} ({fields.length})
          </Button>
        </DialogTrigger>
      ) : null}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('field.delete.dialog_title')}</DialogTitle>
          <DialogDescription>
            {t('field.confirmDeleteDesc')}{" "}
            <span className="font-medium">{fields.length}</span>
            {fields.length === 1 ? " log " : " field "}{t('field.confirmDeleteDesc')}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:space-x-0">
          <DialogClose asChild>
            <Button variant="outline">{t('common.cancelBtn')}</Button>
          </DialogClose>
          <Button
            aria-label="Delete selected rows"
            variant="destructive"
            onClick={onDelete}
            disabled={isDeletePending}
          >
            {isDeletePending && (
              <Loader className="mr-2 size-4 animate-spin" aria-hidden="true" />
            )}
            {t('common.deleteBtn')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
