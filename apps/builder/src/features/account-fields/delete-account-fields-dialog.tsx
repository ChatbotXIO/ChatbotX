"use client"

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
import { deleteAccountFieldsAction } from "./actions/delete-account-field.action"
import type { AccountFieldResource } from "./schemas/resource"

type DeleteAccountFieldsDialogProps = ComponentPropsWithoutRef<
  typeof Dialog
> & {
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
  onSuccess,
  ...props
}: DeleteAccountFieldsDialogProps) {
  const t = useTranslations()

  const { execute, isPending } = useAction(
    deleteAccountFieldsAction.bind(null, chatbotId),
    {
      onSuccess: () => {
        toast.success(
          t("messages.deletedSuccess", {
            feature: t("fields.accountField.label"),
          }),
        )
        onOpenChange?.(false)
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
    <Dialog {...props} onOpenChange={onOpenChange}>
      {showTrigger ? (
        <DialogTrigger asChild>
          <Button size="sm" variant="outline">
            <Trash aria-hidden="true" className="mr-2 size-4" />
            {t("actions.delete")} ({records.length})
          </Button>
        </DialogTrigger>
      ) : null}
      <DialogContent className={"max-h-screen max-w-xl overflow-y-scroll"}>
        <DialogHeader>
          <DialogTitle>
            {t("messages.deleteFeature", {
              feature: t("fields.accountField.label"),
            })}
          </DialogTitle>
          <DialogDescription className="whitespace-pre-wrap text-sm/6">
            {t("messages.deleteConfirmation", {
              feature: t("fields.accountField.label"),
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
            onClick={() => execute({ ids: records.map((f) => f.id) })}
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
