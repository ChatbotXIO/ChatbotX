"use client"

import type { PipelineSettings } from "@chatbotx.io/database/partials"
import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { useDroppable } from "@dnd-kit/core"
import { Loader2Icon, PlusIcon, XIcon } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { memo, useMemo, useState } from "react"
import { toast } from "sonner"
import { updateStageAction } from "../../actions/stage.action"
import { formatItemValue } from "../../lib/format-item-value"
import { usePipelineAction } from "../../lib/use-pipeline-action"
import { ItemCard, type ItemCardActions } from "./item-card"
import { StageMenu } from "./stage-menu"
import { StageName } from "./stage-name"
import type { BoardColumn } from "./types"

type StageColumnProps = {
  workspaceId: string
  pipelineId: string
  column: BoardColumn
  columns: BoardColumn[]
  currency: string
  elements: PipelineSettings["cardElements"]
  canManage: boolean
  canDrag: boolean
  canDelete: boolean
  showValue: boolean
  assigneeNames: Map<string, string>
  onMoveItem: (itemId: string, stageId: string) => void
  onItemDialog: (kind: "transfer" | "delete", itemId: string) => void
  /** Fetches the stage's next page into the board; rejects when it fails. */
  onLoadMore: (stageId: string, cursor: string) => Promise<void>
  onOpenItem: (itemId: string) => void
  /** Set when the empty column should offer to add an item (the first stage). */
  addItemLabel?: string
  onAddItem: () => void
}

export const StageColumn = memo(function StageColumn({
  workspaceId,
  pipelineId,
  column,
  columns,
  currency,
  elements,
  canManage,
  canDrag,
  canDelete,
  showValue,
  assigneeNames,
  onMoveItem,
  onItemDialog,
  onLoadMore,
  onOpenItem,
  addItemLabel,
  onAddItem,
}: StageColumnProps) {
  const t = useTranslations("pipelines")
  const locale = useLocale()
  const { stage } = column
  const { setNodeRef, isOver } = useDroppable({
    id: stage.id,
    disabled: Boolean(stage.bulkJobId),
  })
  const [isRenaming, setIsRenaming] = useState(false)

  const style = {
    color: stage.textColor ?? undefined,
    backgroundColor: stage.backgroundColor ?? undefined,
  }

  // One object for every card of the column, so memoized cards keep it.
  const cardActions = useMemo(
    () => ({
      workspaceId,
      pipelineId,
      stages: columns
        .filter((other) => !other.stage.bulkJobId)
        .map((other) => ({ id: other.stage.id, name: other.stage.name })),
      canMove: canDrag,
      canDelete,
      onMove: onMoveItem,
      onDialog: onItemDialog,
    }),
    [
      workspaceId,
      pipelineId,
      columns,
      canDrag,
      canDelete,
      onMoveItem,
      onItemDialog,
    ],
  )

  return (
    <section
      aria-label={stage.name}
      className={`flex w-[300px] shrink-0 flex-col rounded-xl border bg-muted/40 transition-colors ${
        isOver ? "border-primary bg-primary/5" : ""
      }`}
      data-testid="pipeline-stage"
    >
      <header
        className="flex min-h-12 items-center rounded-t-xl border-b px-3 py-2"
        style={style}
      >
        {isRenaming ? (
          <StageRenameInput
            onDone={() => setIsRenaming(false)}
            pipelineId={pipelineId}
            stageId={stage.id}
            stageName={stage.name}
            workspaceId={workspaceId}
          />
        ) : (
          <div className="flex w-full items-center justify-between gap-1">
            <div className="flex min-w-0 items-center gap-1.5">
              <StageName description={stage.description} name={stage.name} />
              <Badge
                aria-label={t("board.count", { count: column.count })}
                className="h-5 shrink-0 px-1.5 text-xs"
                variant="secondary"
              >
                {column.count}
              </Badge>
              {showValue && column.count > 0 ? (
                <Badge
                  className="h-5 shrink-0 px-1.5 text-xs"
                  variant="secondary"
                >
                  {formatItemValue(column.totalValue, currency, locale)}
                </Badge>
              ) : null}
            </div>
            {canManage ? (
              <StageMenu
                canDeleteItems={canDelete}
                canMoveItems={canDrag}
                column={column}
                columns={columns}
                onRename={() => setIsRenaming(true)}
                pipelineId={pipelineId}
                workspaceId={workspaceId}
              />
            ) : null}
          </div>
        )}
      </header>
      <div
        className="flex min-h-24 flex-1 flex-col gap-3 overflow-y-auto p-3"
        ref={setNodeRef}
      >
        {stage.bulkJobId ? (
          <p className="flex items-center gap-2 p-3 text-muted-foreground text-xs">
            <Loader2Icon className="size-3.5 animate-spin" />
            {t("board.processing")}
          </p>
        ) : null}
        <StageCards
          actions={cardActions}
          addItemLabel={addItemLabel}
          assigneeNames={assigneeNames}
          canDrag={canDrag}
          column={column}
          currency={currency}
          elements={elements}
          onAddItem={onAddItem}
          onLoadMore={onLoadMore}
          onOpenItem={onOpenItem}
        />
      </div>
    </section>
  )
})

type StageCardsProps = Pick<
  StageColumnProps,
  | "column"
  | "currency"
  | "elements"
  | "assigneeNames"
  | "canDrag"
  | "onOpenItem"
  | "addItemLabel"
  | "onAddItem"
  | "onLoadMore"
> & { actions: ItemCardActions }

/**
 * The cards of one stage. "Load more" pages live in the board query, so a
 * refetched board starts again from its first page.
 */
function StageCards({
  column,
  currency,
  elements,
  assigneeNames,
  canDrag,
  actions,
  onOpenItem,
  addItemLabel,
  onAddItem,
  onLoadMore,
}: StageCardsProps) {
  const t = useTranslations("pipelines")
  const { stage } = column
  const { items, nextCursor: cursor } = column
  const [isLoadingMore, setIsLoadingMore] = useState(false)

  const loadMore = async () => {
    if (!cursor) {
      return
    }
    setIsLoadingMore(true)
    try {
      await onLoadMore(stage.id, cursor)
    } catch {
      toast.error(t("board.loadMoreFailed"))
    } finally {
      setIsLoadingMore(false)
    }
  }

  return (
    <>
      {items.length === 0 && !stage.bulkJobId ? (
        <div className="m-auto flex flex-col items-center gap-3 px-3 text-center">
          <p className="text-muted-foreground text-xs">
            {t("board.emptyStage")}
          </p>
          {addItemLabel ? (
            <Button onClick={onAddItem} size="sm" variant="outline">
              <PlusIcon />
              {addItemLabel}
            </Button>
          ) : null}
        </div>
      ) : null}
      {items.map((view) => (
        <ItemCard
          actions={actions}
          assigneeNames={assigneeNames}
          canDrag={canDrag}
          currency={currency}
          elements={elements}
          key={view.item.id}
          onOpen={onOpenItem}
          view={view}
        />
      ))}
      {cursor ? (
        <Button
          disabled={isLoadingMore}
          onClick={loadMore}
          size="sm"
          variant="ghost"
        >
          {isLoadingMore ? <Loader2Icon className="animate-spin" /> : null}
          {t("board.loadMore")}
        </Button>
      ) : null}
    </>
  )
}

/** Header turned into an input: Enter saves the name, Escape or the cross cancels. */
function StageRenameInput({
  workspaceId,
  pipelineId,
  stageId,
  stageName,
  onDone,
}: {
  workspaceId: string
  pipelineId: string
  stageId: string
  stageName: string
  onDone: () => void
}) {
  const t = useTranslations("pipelines")
  const [name, setName] = useState(stageName)
  const { execute, isPending } = useAction(
    updateStageAction.bind(null, workspaceId),
    usePipelineAction({ onDone }),
  )

  const submit = () => {
    const trimmed = name.trim()
    if (!trimmed || trimmed === stageName) {
      onDone()
      return
    }
    execute({ id: pipelineId, stageId, name: trimmed })
  }

  return (
    <div className="flex items-center gap-1">
      <Input
        aria-label={t("stage.name")}
        autoFocus
        className="h-8 bg-background text-foreground"
        disabled={isPending}
        maxLength={120}
        onChange={(event) => setName(event.target.value)}
        onFocus={(event) => event.target.select()}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.nativeEvent.isComposing) {
            submit()
          }
          if (event.key === "Escape") {
            onDone()
          }
        }}
        value={name}
      />
      <Button
        aria-label={t("stage.cancel")}
        className="size-7 shrink-0"
        disabled={isPending}
        onClick={onDone}
        size="icon"
        variant="ghost"
      >
        <XIcon />
      </Button>
    </div>
  )
}
