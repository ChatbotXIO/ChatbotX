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
import { permanentDeleteFlowAction } from "@/features/flows/actions/permanent-delete-flow-action"
import type { Flow } from "@ahachat.ai/database"
import type { Row } from "@tanstack/react-table"
import { useTranslate } from "@tolgee/react"
import { Loader, Trash } from "lucide-react"
import { useAction } from "next-safe-action/hooks"
import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { toast } from "sonner"
import { deleteFlowAction } from "./actions/delete-flow-action"

interface DeleteFlowsDialogProps
  extends React.ComponentPropsWithoutRef<typeof Dialog> {
  chatbotId: string
  flows: Row<Flow>["original"][]
  permanent: boolean
  showTrigger?: boolean
  onSuccess?: () => void
  onOpenChange: (val: boolean) => void
}

export function DeleteFlowsDialog({
  chatbotId,
  flows,
  permanent,
  showTrigger = true,
  onSuccess,
  onOpenChange,
  ...props
}: DeleteFlowsDialogProps) {
  const { t } = useTranslate()
  const router = useRouter()

  const { execute: executePermanentDelete } = useAction(
    permanentDeleteFlowAction.bind(
      null,
      chatbotId,
      (flows ?? []).map((flow) => flow.id),
    ),
    {
      onSuccess: () => {
        toast.success(t("flows.deleted"))
        onOpenChange(false)
        router.refresh()
      },
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError.message ?? error.serverError)
        }
      },
    },
  )

  const { execute: executeDelete } = useAction(
    deleteFlowAction.bind(
      null,
      chatbotId,
      (flows ?? []).map((flow) => flow.id),
    ),
    {
      onSuccess: () => {
        toast.success(t("flows.deleted"))
        onOpenChange(false)
        router.refresh()
      },
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError.message ?? error.serverError)
        }
      },
    },
  )

  const [isDeletePending, startDeleteTransition] = useTransition()
  const onDelete = () => {
    if (!flows || flows.length === 0) {
      return
    }

    startDeleteTransition(async () => {
      permanent ? executePermanentDelete() : executeDelete()
    })
  }

  return (
    <Dialog {...props}>
      {showTrigger ? (
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <Trash className="mr-2 size-4" aria-hidden="true" />
            {t("common.deleteBtn")} ({flows.length})
          </Button>
        </DialogTrigger>
      ) : null}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("flows.delete.dialog_title")}</DialogTitle>
          <DialogDescription>
            {t("flows.confirmDeleteDesc")}{" "}
            <span className="font-medium">{flows.length}</span>
            {flows.length === 1 ? " log " : " flows "}
            {t("flows.confirmDeleteDesc")}
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
