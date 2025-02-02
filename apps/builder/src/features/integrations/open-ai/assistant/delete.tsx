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
import { deleteAssistantAction } from "@/features/integrations/open-ai/actions/assistant.action"
import type { Row } from "@tanstack/react-table"
import { useTranslate } from "@tolgee/react"
import { Loader, Trash } from "lucide-react"
import { useAction } from "next-safe-action/hooks"
import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { toast } from "sonner"

interface DeleteAgentsDialogProps
  extends React.ComponentPropsWithoutRef<typeof Dialog> {
  chatbotId: string
  assistant: Row<Record<string, string>>["original"][]
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
}: DeleteAgentsDialogProps) {
  const { t } = useTranslate()
  const router = useRouter()

  const { execute, result } = useAction(
    deleteAssistantAction.bind(
      null,
      chatbotId,
      (assistant ?? []).map((item) => item.id as string),
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
        toast.success(t("agents.deleted"))
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
          <DialogTitle>{t("assistant.delete.dialog_title")}</DialogTitle>
          <DialogDescription>
            {t("assistant.confirmDeleteDesc")}{" "}
            <span className="font-medium">{assistant.length}</span>
            {assistant.length === 1 ? " log " : " assistant "}
            {t("assistant.confirmDeleteDesc")}
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
