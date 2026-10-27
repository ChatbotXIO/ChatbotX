"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@chatbotx.io/ui/components/ui/dropdown-menu"
import {
  MoreVerticalIcon,
  PencilIcon,
  SettingsIcon,
  Trash2Icon,
} from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useState } from "react"
import { toast } from "sonner"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { toastActionError } from "@/lib/errors/safe-action-error-handler"
import {
  deleteStageAction,
  deleteStageMovingItemsAction,
} from "../../actions/stage.action"
import { moveTargetStages } from "../../lib/move-targets"
import { useInvalidatePipelines } from "../../lib/use-invalidate-pipelines"
import { OptionSelect } from "../shared/option-select"
import { StageSettingsSheet } from "./stage-settings-sheet"
import type { BoardColumn } from "./types"

type StageMenuProps = {
  workspaceId: string
  pipelineId: string
  column: BoardColumn
  columns: BoardColumn[]
  onRename: () => void
  /** What may happen to the stage's items when it is deleted. */
  canDeleteItems: boolean
  canMoveItems: boolean
}

export function StageMenu({
  workspaceId,
  pipelineId,
  column,
  columns,
  onRename,
  canDeleteItems,
  canMoveItems,
}: StageMenuProps) {
  const t = useTranslations("pipelines")
  const [dialog, setDialog] = useState<"settings" | "delete" | null>(null)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              aria-label={t("stage.menu")}
              className="size-7"
              size="icon"
              variant="ghost"
            >
              <MoreVerticalIcon />
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={onRename}>
            <PencilIcon />
            {t("stage.rename")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setDialog("settings")}>
            <SettingsIcon />
            {t("stage.settings")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={columns.length <= 1}
            onClick={() => setDialog("delete")}
            variant="destructive"
          >
            <Trash2Icon />
            {t("stage.delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <StageSettingsSheet
        column={column}
        onClose={() => setDialog(null)}
        open={dialog === "settings"}
        pipelineId={pipelineId}
        workspaceId={workspaceId}
      />
      {/* Mounted only while shown, so a cancelled move-to choice never carries over. */}
      {dialog === "delete" ? (
        <DeleteStageDialog
          canDeleteItems={canDeleteItems}
          canMoveItems={canMoveItems}
          column={column}
          columns={columns}
          onClose={() => setDialog(null)}
          open
          pipelineId={pipelineId}
          workspaceId={workspaceId}
        />
      ) : null}
    </>
  )
}

function DeleteStageDialog({
  workspaceId,
  pipelineId,
  column,
  columns,
  open,
  onClose,
  canDeleteItems,
  canMoveItems,
}: {
  workspaceId: string
  pipelineId: string
  column: BoardColumn
  columns: BoardColumn[]
  open: boolean
  onClose: () => void
  canDeleteItems: boolean
  canMoveItems: boolean
}) {
  const t = useTranslations("pipelines")
  const invalidate = useInvalidatePipelines()
  // Moving items needs edit, deleting them needs delete (the server enforces
  // both); offer only what this member may do.
  const others = canMoveItems ? moveTargetStages(columns, column.stage.id) : []
  const [moveTo, setMoveTo] = useState<string>(
    canDeleteItems ? "" : (others[0]?.stage.id ?? ""),
  )
  const moveTarget = others.find((other) => other.stage.id === moveTo)

  const handlers = {
    onSuccess: ({ data }: { data?: { queued: boolean } }) => {
      invalidate()
      toast.success(data?.queued ? t("stage.queued") : t("stage.deleted"))
      onClose()
    },
    onError: toastActionError(t("saveFailed")),
  }
  const deleteWithItems = useAction(
    deleteStageAction.bind(null, workspaceId),
    handlers,
  )
  const moveThenDelete = useAction(
    deleteStageMovingItemsAction.bind(null, workspaceId),
    handlers,
  )
  // `column.count` follows the active board filter, so it cannot prove the stage is empty:
  // the move picker is offered whenever another stage exists.

  return (
    <ConfirmDialog
      confirmLabel={t("stage.delete")}
      description={
        moveTarget
          ? t("stage.deleteMoveDescription", {
              name: column.stage.name,
              target: moveTarget.stage.name,
            })
          : t("stage.deleteDescription", { name: column.stage.name })
      }
      destructive
      isPending={deleteWithItems.isPending || moveThenDelete.isPending}
      onConfirm={() =>
        // The confirmed action always matches the description shown above it.
        moveTarget
          ? moveThenDelete.execute({
              id: pipelineId,
              stageId: column.stage.id,
              moveItemsToStageId: moveTarget.stage.id,
            })
          : deleteWithItems.execute({
              id: pipelineId,
              stageId: column.stage.id,
            })
      }
      onOpenChange={(next) => !next && onClose()}
      open={open}
      title={t("stage.deleteTitle")}
    >
      {others.length > 0 ? (
        <label className="grid gap-1.5 text-sm" htmlFor="stage-move-to">
          {t("stage.moveItemsTo")}
          <OptionSelect
            emptyLabel={canDeleteItems ? t("stage.deleteItemsToo") : undefined}
            id="stage-move-to"
            onValueChange={setMoveTo}
            options={others.map((other) => ({
              value: other.stage.id,
              label: other.stage.name,
            }))}
            value={moveTo}
          />
        </label>
      ) : null}
    </ConfirmDialog>
  )
}
