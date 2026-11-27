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
import { useQuery } from "@tanstack/react-query"
import { Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useState } from "react"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { orpc } from "@/lib/orpc/query"
import { deleteItemAction, transferItemAction } from "../../actions/item.action"
import { usePipelineAction } from "../../lib/use-pipeline-action"
import { usePipelineDetail } from "../../lib/use-pipeline-detail"
import { OptionSelect } from "../shared/option-select"

/**
 * Mounted only while shown: `onClose` dismisses it, `onDone` (default
 * `onClose`) runs after success. `disabled` blocks a new submit (the item is
 * gone) without unmounting, so a request already in flight still completes.
 */
export type DialogProps = {
  workspaceId: string
  pipelineId: string
  itemId: string
  onClose: () => void
  onDone?: () => void
  disabled?: boolean
}

export function TransferDialog({
  workspaceId,
  pipelineId,
  itemId,
  onClose,
  onDone = onClose,
  disabled = false,
}: DialogProps) {
  const t = useTranslations("pipelines")
  const [destinationId, setDestinationId] = useState("")
  const [stageId, setStageId] = useState("")
  const list = useQuery(
    orpc.pipelinesAPI.privateListPipelinesAPI.queryOptions({
      input: { workspaceId },
    }),
  )
  const destination = usePipelineDetail(workspaceId, destinationId, {
    enabled: Boolean(destinationId),
  })
  const { execute, isPending } = useAction(
    transferItemAction.bind(null, workspaceId),
    usePipelineAction({ successMessage: "item.transferred", onDone }),
  )
  // Only pipelines the viewer can edit accept a transfer.
  const others = (list.data ?? []).filter(
    (entry) => entry.pipeline.id !== pipelineId && entry.permissions.canEdit,
  )
  // Stages running a bulk job cannot receive items.
  const freeStages = (destination.data?.stages ?? []).filter(
    (stage) => !stage.bulkJobId,
  )

  return (
    <Dialog onOpenChange={(next) => !next && onClose()} open>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("item.transferTitle")}</DialogTitle>
          <DialogDescription>{t("item.transferDescription")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 text-sm">
          <label className="grid gap-1.5" htmlFor="transfer-pipeline">
            {t("item.destinationPipeline")}
            <OptionSelect
              emptyLabel={t("item.choose")}
              id="transfer-pipeline"
              onValueChange={(next) => {
                setDestinationId(next)
                setStageId("")
              }}
              options={others.map((entry) => ({
                value: entry.pipeline.id,
                label: entry.pipeline.name,
              }))}
              value={destinationId}
            />
          </label>
          {destination.data ? (
            <label className="grid gap-1.5" htmlFor="transfer-stage">
              {t("item.destinationStage")}
              <OptionSelect
                emptyLabel={t("item.firstStage")}
                id="transfer-stage"
                onValueChange={setStageId}
                options={freeStages.map((stage) => ({
                  value: stage.id,
                  label: stage.name,
                }))}
                value={stageId}
              />
            </label>
          ) : null}
        </div>
        <DialogFooter>
          <Button
            disabled={isPending || disabled || !destinationId}
            onClick={() =>
              execute({
                id: pipelineId,
                itemId,
                destinationPipelineId: destinationId,
                destinationStageId: stageId || freeStages[0]?.id,
              })
            }
          >
            {isPending ? <Loader2Icon className="animate-spin" /> : null}
            {t("item.transfer")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function DeleteItemDialog({
  workspaceId,
  pipelineId,
  itemId,
  onClose,
  onDone = onClose,
  disabled = false,
}: DialogProps) {
  const t = useTranslations("pipelines")
  const { execute, isPending } = useAction(
    deleteItemAction.bind(null, workspaceId),
    usePipelineAction({ successMessage: "item.deleted", onDone }),
  )

  return (
    <ConfirmDialog
      confirmDisabled={disabled}
      confirmLabel={t("item.delete")}
      description={t("item.deleteDescription")}
      destructive
      isPending={isPending}
      onConfirm={() => execute({ id: pipelineId, itemId })}
      onOpenChange={(next) => !next && onClose()}
      open
      title={t("item.delete")}
    />
  )
}
