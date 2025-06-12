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
import { deleteAIAgentAction } from "@/features/integrations/ai-agents/actions/delete.action"
import type { AIAgent } from "@ahachat.ai/database/types"
import type { Row } from "@tanstack/react-table"
import { useTranslate } from "@tolgee/react"
import { Loader, Trash } from "lucide-react"
import { useAction } from "next-safe-action/hooks"
import { useRouter } from "next/navigation"
import type { ComponentPropsWithoutRef } from "react"
import { toast } from "sonner"

interface DeleteAIAgentsDialogProps
  extends ComponentPropsWithoutRef<typeof Dialog> {
  chatbotId: string
  agents: Row<AIAgent>["original"][]
  showTrigger?: boolean
  onSuccess?: () => void
  onOpenChange: (val: boolean) => void
}

export function DeleteAIAgentsDialog({
  chatbotId,
  agents,
  showTrigger = true,
  onSuccess,
  onOpenChange,
  ...props
}: DeleteAIAgentsDialogProps) {
  const { t } = useTranslate()
  const router = useRouter()

  const { execute, isExecuting } = useAction(
    deleteAIAgentAction.bind(null, chatbotId),
    {
      onSuccess: () => {
        toast.success(t("aiAgents.deleted"))
        onOpenChange(false)
        router.refresh()
      },
      onError: ({ error }) => {
        error.serverError && toast.error(error.serverError)
      },
    },
  )

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
          <DialogTitle>{t("aiAgents.deleteAction.title")}</DialogTitle>
          <DialogDescription>
            {t("aiAgents.deleteAction")}{" "}
            <span className="font-medium">{agents.length}</span>
            {agents.length === 1 ? " agent " : " agents "}
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
            onClick={() =>
              execute({ ids: (agents ?? []).map((agent) => agent.id) })
            }
            disabled={isExecuting}
          >
            {isExecuting && (
              <Loader className="mr-2 size-4 animate-spin" aria-hidden="true" />
            )}
            {t("common.deleteBtn")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
