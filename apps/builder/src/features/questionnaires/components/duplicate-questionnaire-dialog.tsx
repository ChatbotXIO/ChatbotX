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
import { CopyPlusIcon, Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { toast } from "sonner"
import { duplicateQuestionnaireAction } from "../actions/duplicate-questionnaire.action"
import type { QuestionnaireListItem } from "../schemas/resource"

type Props = {
  workspaceId: string
  questionnaire: QuestionnaireListItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function DuplicateQuestionnaireDialog({
  workspaceId,
  questionnaire,
  open,
  onOpenChange,
}: Props) {
  const t = useTranslations()
  const router = useRouter()
  const { execute, isPending } = useAction(
    duplicateQuestionnaireAction.bind(
      null,
      workspaceId,
      questionnaire?.id ?? "",
    ),
    {
      onSuccess: ({ data }) => {
        toast.success(
          t("messages.duplicatedSuccess", {
            feature: t("questionnaires.singular"),
          }),
        )
        onOpenChange(false)
        if (data?.id) {
          router.push(`/space/${workspaceId}/questionnaires/${data.id}/edit`)
        }
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
            {t("messages.duplicateFeature", {
              feature: t("questionnaires.singular"),
            })}
          </DialogTitle>
          <DialogDescription>
            {t("messages.duplicateConfirmation", {
              feature: t("questionnaires.singular"),
            })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} variant="ghost">
            {t("actions.cancel")}
          </Button>
          <Button
            disabled={isPending || !questionnaire}
            onClick={() => execute()}
          >
            {isPending ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <CopyPlusIcon className="size-4" />
            )}
            {t("actions.duplicate")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
