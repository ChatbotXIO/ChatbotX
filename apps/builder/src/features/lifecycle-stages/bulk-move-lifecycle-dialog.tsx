"use client"

import type { LifecycleStageModel } from "@chatbotx.io/database/types"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@chatbotx.io/ui/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@chatbotx.io/ui/components/ui/select"
import { Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useState } from "react"
import { toast } from "sonner"
import { useWorkspaceId } from "@/hooks/routing"
import { bulkUpdateContactLifecycleAction } from "./actions/bulk-update-contact-lifecycle-action"

type BulkMoveLifecycleDialogProps = {
  contactIds: string[]
  stages: LifecycleStageModel[]
  trigger: React.ReactNode
}

export function BulkMoveLifecycleDialog({
  contactIds,
  stages,
  trigger,
}: BulkMoveLifecycleDialogProps) {
  const t = useTranslations()
  const router = useRouter()
  const workspaceId = useWorkspaceId()
  const [open, setOpen] = useState(false)
  const [targetStageId, setTargetStageId] = useState<string>("__none__")

  const activeStages = stages.filter((s) => !s.isLost)
  const lostStages = stages.filter((s) => s.isLost)

  const { execute, isExecuting } = useAction(
    bulkUpdateContactLifecycleAction.bind(null, workspaceId),
    {
      onSuccess: ({ data }) => {
        toast.success(
          t("lifecycle.bulkMoved", {
            count: data?.updated ?? contactIds.length,
          }),
        )
        setOpen(false)
        router.refresh()
      },
      onError: ({ error }) => {
        toast.error(error.serverError ?? t("lifecycle.contactUpdateError"))
      },
    },
  )

  const handleConfirm = () => {
    const stageId = targetStageId === "__none__" ? null : targetStageId
    execute({ contactIds, lifecycleStageId: stageId })
  }

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("lifecycle.bulkMove")}</DialogTitle>
          <DialogDescription>
            {t("lifecycle.bulkMoved", { count: contactIds.length })}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <Select onValueChange={setTargetStageId} value={targetStageId}>
            <SelectTrigger>
              <SelectValue placeholder={t("lifecycle.selectPlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">
                <span className="text-muted-foreground">
                  {t("lifecycle.noStage")}
                </span>
              </SelectItem>
              {activeStages.map((stage) => (
                <SelectItem key={stage.id} value={stage.id}>
                  <span className="mr-2">{stage.icon ?? "•"}</span>
                  {stage.name}
                </SelectItem>
              ))}
              {lostStages.map((stage) => (
                <SelectItem key={stage.id} value={stage.id}>
                  <span className="mr-2">{stage.icon ?? "•"}</span>
                  {stage.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <DialogFooter>
          <Button
            disabled={isExecuting}
            onClick={() => setOpen(false)}
            variant="outline"
          >
            {t("actions.cancel")}
          </Button>
          <Button
            disabled={isExecuting || contactIds.length === 0}
            onClick={handleConfirm}
          >
            {isExecuting && <Loader2Icon className="size-3.5 animate-spin" />}
            {t("actions.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
