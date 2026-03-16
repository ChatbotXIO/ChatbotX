"use client"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@aha.chat/ui/components/ui/alert-dialog"
import { useTranslations } from "next-intl"
import { memo } from "react"

type DeleteStepDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}

export const DeleteStepDialog = memo(function DeleteStepDialog({
  open,
  onOpenChange,
  onConfirm,
}: DeleteStepDialogProps) {
  const t = useTranslations()

  return (
    <AlertDialog onOpenChange={onOpenChange} open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("sequences.confirmDeleteStep")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("messages.deleteConfirmation", {
              feature: t("sequences.step"),
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("actions.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            className="ml-auto bg-destructive hover:bg-destructive/90"
            onClick={onConfirm}
          >
            {t("actions.delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
})
