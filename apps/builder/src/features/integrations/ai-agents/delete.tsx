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
import { deleteAiAgentAction } from "@/features/integrations/ai-agents/actions/delete.action"
import type { AiAgent } from "@ahachat.ai/database"
import type { Row } from "@tanstack/react-table"
import { useTranslate } from "@tolgee/react"
import { Loader, Trash } from "lucide-react"
import { useAction } from "next-safe-action/hooks"
import { useRouter } from "next/navigation"
import { type ComponentPropsWithoutRef, useTransition } from "react"
import { toast } from "sonner"

interface DeleteAiAgentsDialogProps
  extends ComponentPropsWithoutRef<typeof Dialog> {
  chatbotId: string
  agents: Row<AiAgent>["original"][]
  showTrigger?: boolean
  onSuccess?: () => void
  onOpenChange: (val: boolean) => void
}

export function DeleteAiAgentsDialog({
  chatbotId,
  agents,
  showTrigger = true,
  onSuccess,
  onOpenChange,
  ...props
}: DeleteAiAgentsDialogProps) {
  const { t } = useTranslate()
  const router = useRouter()

  const { execute, result } = useAction(
    deleteAiAgentAction.bind(
      null,
      chatbotId,
      (agents ?? []).map((agent) => agent.id as string),
    ),
  )

  const [isDeletePending, startDeleteTransition] = useTransition()
  const onDelete = () => {
    if (!agents || agents.length === 0) {
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
            {t("common.deleteBtn")} ({agents.length})
          </Button>
        </DialogTrigger>
      ) : null}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("aiAgents.delete.dialog_title")}</DialogTitle>
          <DialogDescription>
            {t("aiAgents.confirmDeleteDesc")}{" "}
            <span className="font-medium">{agents.length}</span>
            {agents.length === 1 ? " log " : " agents "}
            {t("aiAgents.confirmDeleteDesc")}
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
