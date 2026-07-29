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
import { Loader2Icon, Trash2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { toast } from "sonner"
import { deleteQuestionnaireSubmissionsAction } from "../actions/delete-questionnaire-submissions.action"

type Props = {
  workspaceId: string
  questionnaireId: string
  submissionIds: string[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function DeleteApplicantSubmissionsDialog({
  workspaceId,
  questionnaireId,
  submissionIds,
  open,
  onOpenChange,
  onSuccess,
}: Props) {
  const t = useTranslations()
  const router = useRouter()
  const { execute, isPending } = useAction(
    deleteQuestionnaireSubmissionsAction.bind(null, workspaceId),
    {
      onSuccess: () => {
        toast.success(
          t("messages.deletedSuccess", {
            feature: t("questionnaires.submission"),
          }),
        )
        onOpenChange(false)
        router.refresh()
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
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t("messages.deleteFeature", {
              feature: t("questionnaires.submission"),
            })}
          </DialogTitle>
          <DialogDescription>
            {t("messages.deleteConfirmation", {
              feature: t("questionnaires.submission"),
            })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} variant="ghost">
            {t("actions.cancel")}
          </Button>
          <Button
            disabled={isPending || submissionIds.length === 0}
            onClick={() => execute({ questionnaireId, submissionIds })}
            variant="destructive"
          >
            {isPending ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <Trash2Icon className="size-4" />
            )}
            {t("actions.delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
