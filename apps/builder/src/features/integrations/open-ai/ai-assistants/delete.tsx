"use client"

import type { AiAssistant } from "@ahachat.ai/database"
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
import { deleteAiAssistantsAction } from "@/features/integrations/open-ai/actions/ai-assistants.action"
import type { Row } from "@tanstack/react-table"
import { useTranslate } from "@tolgee/react"
import { Loader, Trash } from "lucide-react"
import { useAction } from "next-safe-action/hooks"
import { useRouter } from "next/navigation"
import { useTransition, type ComponentPropsWithoutRef } from "react"
import { toast } from "sonner"

interface DeleteAiAgentsDialogProps
  extends ComponentPropsWithoutRef<typeof Dialog> {
  chatbotId: string
  assistant: Row<AiAssistant>["original"][]
  showTrigger?: boolean
  onSuccess?: () => void
  onOpenChange: (val: boolean) => void
}

export function DeleteAssistantDialog({
  chatbotId,
  assistant,
  showTrigger = true,
  onSuccess,
  onOpenChange,
  ...props
}: DeleteAiAgentsDialogProps) {
  const { t } = useTranslate()
  const router = useRouter()

  const { execute, result } = useAction(
    deleteAiAssistantsAction.bind(
      null,
      chatbotId,
      (assistant ?? []).map((item: AiAssistant) => item.id),
    ),
  )

  const [isDeletePending, startDeleteTransition] = useTransition()
  const onDelete = () => {
    if (!assistant || assistant.length === 0) {
      return
    }

    startDeleteTransition(async () => {
      await execute()

      if (result.serverError) {
        toast.error(result.serverError.message ?? result.serverError)
      } else {
        toast.success(t("aiAgents.deleted"))
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
            {t("common.deleteBtn")} ({assistant.length})
          </Button>
        </DialogTrigger>
      ) : null}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("aiAssistants.delete.dialog_title")}</DialogTitle>
          <DialogDescription>
            {t("aiAssistants.confirmDeleteDesc")}{" "}
            <span className="font-medium">{assistant.length}</span>
            {assistant.length === 1 ? " log " : " assistant "}
            {t("aiAssistants.confirmDeleteDesc")}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:space-x-0">
          <DialogClose asChild>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t("common.cancelBtn")}
            </Button>
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
            {t("common.deleteBtn")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
