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
} from "@chatbotx.io/ui/components/ui/alert-dialog"
import { Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { toast } from "sonner"
import { deleteTemplateAction } from "../actions/delete-template.action"
import { toastActionError } from "../lib/action-error-toast"
import { useInvalidateAfterTemplateChange } from "../lib/use-invalidate-template-kinds"

type DeleteTemplateDialogProps = {
  workspaceId: string
  templateId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function DeleteTemplateDialog({
  workspaceId,
  templateId,
  open,
  onOpenChange,
}: DeleteTemplateDialogProps) {
  const t = useTranslations()
  const router = useRouter()
  const { invalidateLocks } = useInvalidateAfterTemplateChange()

  const { execute, isPending } = useAction(
    deleteTemplateAction.bind(null, workspaceId, templateId),
    {
      onSuccess: () => {
        toast.success(
          t("messages.deletedSuccess", { feature: t("fields.template.label") }),
        )
        // Deleting a template releases the locks on the copies it governed.
        invalidateLocks().catch(() => undefined)
        onOpenChange(false)
        router.refresh()
      },
      onError: ({ error }) =>
        toastActionError(error, t("messages.unknownError")),
    },
  )

  return (
    <AlertDialog onOpenChange={onOpenChange} open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("messages.deleteFeature", {
              feature: t("fields.template.label"),
            })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("messages.deleteConfirmation", {
              feature: t("fields.template.label"),
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("actions.cancel")}</AlertDialogCancel>
          <AlertDialogAction disabled={isPending} onClick={() => execute()}>
            {isPending && <Loader2Icon className="me-2 h-4 w-4 animate-spin" />}
            {t("actions.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
