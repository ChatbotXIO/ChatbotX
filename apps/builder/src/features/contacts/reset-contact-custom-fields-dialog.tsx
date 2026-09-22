"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@chatbotx.io/ui/components/ui/dialog"
import { ListRestartIcon, Loader } from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useState } from "react"
import { toast } from "sonner"
import { resetContactCustomFieldsAction } from "./actions/reset-contact-custom-fields.action"

type ResetContactCustomFieldsDialogProps = {
  workspaceId: string
  contactId: string
  disabled?: boolean
  onSuccess?: () => void
}

export function ResetContactCustomFieldsDialog({
  workspaceId,
  contactId,
  disabled,
  onSuccess,
}: ResetContactCustomFieldsDialogProps) {
  const t = useTranslations()
  const [open, setOpen] = useState(false)

  const { execute, isPending } = useAction(
    resetContactCustomFieldsAction.bind(null, workspaceId),
    {
      onSuccess: () => {
        toast.success(
          t("messages.resetSuccess", {
            feature: t("fields.customField.groupCustomFields"),
          }),
        )
        setOpen(false)
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
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger
        render={
          <Button
            className="flex cursor-pointer justify-start px-0! text-destructive hover:text-destructive/80"
            disabled={disabled}
            type="button"
            variant="link"
          >
            <ListRestartIcon />
            {t("actions.reset")}
          </Button>
        }
      />
      <DialogContent className="max-h-screen max-w-xl overflow-y-scroll">
        <DialogHeader>
          <DialogTitle>
            {t("messages.resetFeature", {
              feature: t("fields.customField.groupCustomFields"),
            })}
          </DialogTitle>
          <DialogDescription className="whitespace-pre-wrap text-sm/6">
            {t("messages.resetAllConfirmation", {
              feature: t("fields.customField.groupCustomFields"),
            })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:space-x-0">
          <DialogClose
            render={
              <Button size="sm" type="button" variant="ghost">
                {t("actions.cancel")}
              </Button>
            }
          />
          <Button
            aria-label={t("actions.reset")}
            disabled={isPending}
            onClick={() => execute({ contactId })}
            size="sm"
            type="button"
            variant="destructive"
          >
            {isPending && (
              <Loader aria-hidden="true" className="me-2 size-4 animate-spin" />
            )}
            {t("actions.reset")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
