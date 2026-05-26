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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@chatbotx.io/ui/components/ui/select"
import { Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { useWorkspaceId } from "@/hooks/routing"
import {
  countContactsByStageAction,
  deleteLifecycleStageWithReassignAction,
} from "./actions/delete-lifecycle-stage-action"

type Stage = {
  id: string
  name: string
  icon: string | null
  isLost: boolean
}

type DeleteStageDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  stage: Stage | null
  allStages: Stage[]
  onDeleted: () => void
}

export function DeleteStageDialog({
  open,
  onOpenChange,
  stage,
  allStages,
  onDeleted,
}: DeleteStageDialogProps) {
  const t = useTranslations()
  const workspaceId = useWorkspaceId()
  const [count, setCount] = useState<number | null>(null)
  const [reassignTo, setReassignTo] = useState<string>("__none__")

  const candidates = allStages.filter(
    (s) => s.id !== stage?.id && s.isLost === stage?.isLost,
  )

  const { execute: fetchCount } = useAction(
    countContactsByStageAction.bind(null, workspaceId),
    {
      onSuccess: ({ data }) => {
        setCount(data?.count ?? 0)
      },
    },
  )

  const { execute: doDelete, isExecuting: deleting } = useAction(
    deleteLifecycleStageWithReassignAction.bind(null, workspaceId),
    {
      onSuccess: ({ data }) => {
        toast.success(t("lifecycle.bulkMoved", { count: data?.moved ?? 0 }))
        onOpenChange(false)
        onDeleted()
      },
      onError: ({ error }) => {
        toast.error(error.serverError ?? t("lifecycle.saveError"))
      },
    },
  )

  useEffect(() => {
    if (open && stage) {
      setCount(null)
      setReassignTo("__none__")
      fetchCount({ stageId: stage.id })
    }
  }, [open, stage, fetchCount])

  if (!stage) {
    return null
  }

  const hasContacts = count !== null && count > 0

  const handleConfirm = () => {
    const reassignToStageId = reassignTo === "__none__" ? null : reassignTo
    doDelete({ stageId: stage.id, reassignToStageId })
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t("lifecycle.deleteModalTitle", { name: stage.name })}
          </DialogTitle>
          <DialogDescription>
            {(() => {
              if (count === null) {
                return (
                  <span className="flex items-center gap-2">
                    <Loader2Icon className="size-3.5 animate-spin" />
                    ...
                  </span>
                )
              }
              if (hasContacts) {
                return t("lifecycle.deleteModalDescription", { count })
              }
              return t("lifecycle.deleteModalNoContacts")
            })()}
          </DialogDescription>
        </DialogHeader>

        {hasContacts && (
          <div className="flex flex-col gap-2">
            <label
              className="font-medium text-sm"
              htmlFor="reassign-stage-select"
            >
              {t("lifecycle.deleteModalReassignTo")}
            </label>
            <Select onValueChange={setReassignTo} value={reassignTo}>
              <SelectTrigger id="reassign-stage-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">
                  <span className="text-muted-foreground">
                    {t("lifecycle.deleteModalNoTarget")}
                  </span>
                </SelectItem>
                {candidates.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    <span className="mr-2">{s.icon ?? "•"}</span>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <DialogFooter>
          <Button
            disabled={deleting}
            onClick={() => onOpenChange(false)}
            variant="outline"
          >
            {t("lifecycle.deleteModalCancel")}
          </Button>
          <Button
            disabled={deleting || count === null}
            onClick={handleConfirm}
            variant="destructive"
          >
            {deleting && <Loader2Icon className="size-3.5 animate-spin" />}
            {t("lifecycle.deleteModalConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
