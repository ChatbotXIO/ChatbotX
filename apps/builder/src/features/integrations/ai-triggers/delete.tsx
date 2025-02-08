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
import { deleteAiTriggerAction } from "@/features/integrations/ai-triggers/actions/delete.action"
import type { AiTrigger } from "@ahachat.ai/database"
import type { Row } from "@tanstack/react-table"
import { useTranslate } from "@tolgee/react"
import { Loader, Trash } from "lucide-react"
import { useAction } from "next-safe-action/hooks"
import { useRouter } from "next/navigation"
import { type ComponentPropsWithoutRef, useTransition } from "react"
import { toast } from "sonner"

interface DeleteAiTriggerDialogProps
  extends ComponentPropsWithoutRef<typeof Dialog> {
  chatbotId: string
  trigger: Row<AiTrigger>["original"][]
  showTrigger?: boolean
  onSuccess?: () => void
  onOpenChange: (val: boolean) => void
}

export function DeleteAiTriggerDialog({
  chatbotId,
  trigger,
  showTrigger = true,
  onSuccess,
  onOpenChange,
  ...props
}: DeleteAiTriggerDialogProps) {
  const { t } = useTranslate()
  const router = useRouter()

  const { execute, result } = useAction(
    deleteAiTriggerAction.bind(
      null,
      chatbotId,
      (trigger ?? []).map((item: AiTrigger) => item.id),
    ),
  )

  const [isDeletePending, startDeleteTransition] = useTransition()
  const onDelete = () => {
    if (!trigger || trigger.length === 0) {
      return
    }

    startDeleteTransition(async () => {
      await execute()

      if (result.serverError) {
        toast.error(result.serverError.message ?? result.serverError)
      } else {
        toast.success(t("aiTriggers.deleted"))
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
            {t("common.deleteBtn")} ({trigger.length})
          </Button>
        </DialogTrigger>
      ) : null}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("aiTriggers.delete.dialog_title")}</DialogTitle>
          <DialogDescription>
            {t("aiTriggers.confirmDeleteDesc")}{" "}
            <span className="font-medium">{trigger.length}</span>
            {trigger.length === 1 ? " log " : " assistant "}
            {t("aiTriggers.confirmDeleteDesc")}
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
