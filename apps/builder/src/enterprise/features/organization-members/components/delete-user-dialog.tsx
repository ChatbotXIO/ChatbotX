"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { toast } from "sonner"
import { deleteOrganizationUserAction } from "../actions/delete-organization-user.action"

type DeleteUserDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: { id: string; name: string; email: string } | null
  onSuccess?: () => void
}

export function DeleteUserDialog({
  open,
  onOpenChange,
  user,
  onSuccess,
}: DeleteUserDialogProps) {
  const t = useTranslations()
  const tActions = useTranslations("actions")

  const { execute, isExecuting } = useAction(deleteOrganizationUserAction, {
    onSuccess: () => {
      toast.success(t("organizationUsers.deleted"))
      onSuccess?.()
      onOpenChange(false)
    },
    onError: ({ error }) => {
      if (error.serverError) {
        toast.error(error.serverError)
      }
    },
  })

  if (!user) {
    return null
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("organizationUsers.deleteTitle")}</DialogTitle>
          <DialogDescription>
            {t("organizationUsers.deleteConfirm", { name: user.name })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            onClick={() => onOpenChange(false)}
            type="button"
            variant="ghost"
          >
            {tActions("cancel")}
          </Button>
          <Button
            disabled={isExecuting}
            onClick={() => execute({ userId: user.id })}
            type="button"
            variant="destructive"
          >
            {isExecuting && <Loader2Icon className="size-4 animate-spin" />}
            {t("organizationUsers.deleteSubmit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
