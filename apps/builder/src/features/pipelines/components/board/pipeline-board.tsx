"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { useCallbackRef } from "@chatbotx.io/ui/hooks/use-callback-ref"
import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useQueryStates } from "nuqs"
import { useCallback, useMemo, useState } from "react"
import { browserTimeZone } from "@/features/custom-fields/lib/field-date"
import { client } from "@/lib/orpc/orpc"
import { orpc } from "@/lib/orpc/query"
import { moveItemAction } from "../../actions/item.action"
import { appendStagePage } from "../../lib/append-stage-page"
import { itemNounKeys } from "../../lib/item-noun"
import { moveItemInBoard } from "../../lib/move-item-in-board"
import { boardSearchParsers } from "../../lib/search-params"
import { useAssigneeOptions } from "../../lib/use-assignee-options"
import { usePipelineAction } from "../../lib/use-pipeline-action"
import { usePipelineDetail } from "../../lib/use-pipeline-detail"
import { usePipelineRealtimeRefetch } from "../../lib/use-pipeline-realtime-refetch"
import {
  hiddenFeatureKeys,
  visibleCardElements,
} from "../../lib/visible-features"
import { AddItemSheet } from "../add-item/add-item-sheet"
import { AnalyticsSheet } from "../analytics/analytics-sheet"
import { DeleteItemDialog, TransferDialog } from "../item/item-dialogs"
import { ItemSheet } from "../item/item-sheet"
import { SettingsSheet } from "../settings/settings-sheet"
import { AddStage } from "./add-stage"
import { BoardSkeleton } from "./board-skeleton"
import { type BoardPanel, BoardToolbar } from "./board-toolbar"
import {
  applicableFilter,
  cleanFilter,
  countActiveFilters,
  toRequestFilter,
} from "./filter-helpers"
import { FilterSheet } from "./filter-sheet"
import { ItemCard } from "./item-card"
import { StageColumn } from "./stage-column"
import type {
  BoardFilterInput,
  BoardFilterRequest,
  BoardSortInput,
} from "./types"

type ItemDialogState = { kind: "transfer" | "delete"; itemId: string } | null

const DEFAULT_SORT: BoardSortInput = { key: "createdAt", direction: "desc" }

/** Stable empty filter, so memos keyed on it do not rerun every render. */
const NO_FILTER: BoardFilterInput = {}

export function PipelineBoard({
  workspaceId,
  pipelineId,
}: {
  workspaceId: string
  pipelineId: string
}) {
  const t = useTranslations("pipelines")
  const queryClient = useQueryClient()
  const [params, setParams] = useQueryStates(boardSearchParsers)
  const filter = params.filter ?? NO_FILTER
  const setFilter = (next: BoardFilterInput) => {
    const cleaned = cleanFilter(next)
    setParams({ filter: Object.keys(cleaned).length > 0 ? cleaned : null })
  }
  const [panel, setPanel] = useState<BoardPanel>(null)
  const [filterSession, setFilterSession] = useState(0)
  const openPanel = (next: Exclude<BoardPanel, null>) => {
    if (next === "filter") {
      setFilterSession((session) => session + 1)
    }
    setPanel(next)
  }
  const openAddItem = useCallback(() => setPanel("add"), [])
  const [openItemId, setOpenItemId] = useState<string | null>(null)
  const [itemDialog, setItemDialog] = useState<ItemDialogState>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const assigneeOptions = useAssigneeOptions(workspaceId)
  const assigneeNames = useMemo(
    () => new Map(assigneeOptions.map((option) => [option.id, option.label])),
    [assigneeOptions],
  )

  const detail = usePipelineDetail(workspaceId, pipelineId)
  const visibleFeatures = detail.data?.pipeline.settings.visibleFeatures
  // Sort keys of hidden features are not offered; a URL still using one falls back to the default.
  const hiddenSortKeys = useMemo<ReadonlySet<string>>(
    () => hiddenFeatureKeys(visibleFeatures),
    [visibleFeatures],
  )
  const sort = useMemo<BoardSortInput>(
    () =>
      hiddenSortKeys.has(params.sort)
        ? DEFAULT_SORT
        : { key: params.sort, direction: params.dir },
    [params.sort, params.dir, hiddenSortKeys],
  )
  const fieldIds = useMemo<ReadonlySet<string>>(
    () => new Set((detail.data?.fields ?? []).map((field) => field.id)),
    [detail.data?.fields],
  )
  // Only what the pipeline can still apply: a hidden feature or a deleted
  // field must not keep filtering (or make every refetch fail) unseen.
  const appliedFilter = useMemo(
    () =>
      applicableFilter(filter, { hiddenFeatures: hiddenSortKeys, fieldIds }),
    [filter, hiddenSortKeys, fieldIds],
  )
  const activeFilter = useMemo<BoardFilterRequest | undefined>(() => {
    // Relative presets resolve against today (day-edge bounds, stable all day).
    const merged = {
      ...toRequestFilter(appliedFilter, new Date(), browserTimeZone()),
      ...(params.q ? { search: params.q } : {}),
    }
    return Object.keys(merged).length > 0 ? merged : undefined
  }, [appliedFilter, params.q])

  const boardOptions = orpc.pipelinesAPI.privateGetBoardAPI.queryOptions({
    input: { workspaceId, pipelineId, filter: activeFilter, sort },
  })
  // Keep the previous board while a new search/sort/filter loads, so the toolbar stays mounted.
  const board = useQuery({ ...boardOptions, placeholderData: keepPreviousData })

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  )

  // Another member (or a flow) changed this board: refetch, debounced.
  usePipelineRealtimeRefetch((event) => event.data.pipelineId === pipelineId)

  // A move also changes the item's detail and activity, so every pipeline
  // query is invalidated; only the ones on screen refetch.
  const move = useAction(
    moveItemAction.bind(null, workspaceId),
    usePipelineAction({ errorMessage: "board.moveFailed" }),
  )

  // Stable across renders, so the memoized columns and cards skip renders
  // caused by unrelated board state (drag start, dialogs, panels).
  const boardSettings = board.data?.pipeline.settings
  const cardElements = useMemo(
    () => (boardSettings ? visibleCardElements(boardSettings) : null),
    [boardSettings],
  )
  const openItemDialog = useCallback(
    (kind: "transfer" | "delete", itemId: string) =>
      setItemDialog({ kind, itemId }),
    [],
  )
  const onMoveItem = useCallbackRef((itemId: string, toStageId: string) =>
    moveItem(itemId, toStageId),
  )
  // Only a server fetch moves `dataUpdatedAt`: local cache edits keep it, so
  // it tells a page apart from a board refetched while the page was loading.
  const boardFetchedAt = () =>
    queryClient.getQueryState(boardOptions.queryKey)?.dataUpdatedAt
  const onLoadMore = useCallbackRef(async (stageId: string, cursor: string) => {
    // The previous search/sort is still on screen: its cursor belongs to it.
    if (board.isPlaceholderData) {
      return
    }
    const fetchedAt = boardFetchedAt()
    const page = await client.pipelinesAPI.privateListStagePageAPI({
      workspaceId,
      pipelineId,
      stageId,
      filter: activeFilter,
      sort,
      cursor,
    })
    // A board refetched meanwhile already holds newer cards; a page read
    // before it could bring a moved card back, so it is dropped.
    if (boardFetchedAt() !== fetchedAt) {
      return
    }
    queryClient.setQueryData(
      boardOptions.queryKey,
      (current) =>
        current ? appendStagePage(current, stageId, cursor, page) : current,
      { updatedAt: fetchedAt },
    )
  })

  if (board.isPending || detail.isPending) {
    return <BoardSkeleton />
  }

  // A failed background refetch keeps the loaded board on screen.
  if (!(board.data && detail.data && cardElements)) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border p-10 text-center">
        <p className="text-muted-foreground text-sm">{t("board.error")}</p>
        <Button
          onClick={() => {
            board.refetch()
            detail.refetch()
          }}
          size="sm"
          variant="outline"
        >
          {t("retry")}
        </Button>
      </div>
    )
  }

  const { pipeline, stages: columns, fields } = board.data
  const { permissions } = detail.data
  const totalCount = columns.reduce((sum, column) => sum + column.count, 0)
  const totalValue = columns.reduce((sum, column) => sum + column.totalValue, 0)
  const draggedView = draggingId
    ? columns
        .flatMap((column) => column.items)
        .find((view) => view.item.id === draggingId)
    : undefined
  const closeItemDialog = () => setItemDialog(null)

  const moveItem = async (itemId: string, toStageId: string) => {
    // An in-flight refetch would otherwise overwrite the optimistic state.
    await queryClient.cancelQueries({ queryKey: boardOptions.queryKey })
    queryClient.setQueryData(
      boardOptions.queryKey,
      (current) =>
        current ? moveItemInBoard(current, itemId, toStageId) : current,
      { updatedAt: boardFetchedAt() },
    )
    move.execute({ id: pipelineId, itemId, stageId: toStageId })
  }

  const handleDragStart = (event: DragStartEvent) =>
    setDraggingId(String(event.active.id))

  const handleDragEnd = async (event: DragEndEvent) => {
    setDraggingId(null)
    const itemId = String(event.active.id)
    const toStageId = event.over ? String(event.over.id) : null
    const fromStageId = event.active.data.current?.stageId
    if (!toStageId || toStageId === fromStageId || !permissions.canEdit) {
      return
    }
    await moveItem(itemId, toStageId)
  }

  const itemDialogProps = {
    onClose: closeItemDialog,
    onDone: closeItemDialog,
    pipelineId,
    workspaceId,
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <BoardToolbar
        canEdit={permissions.canEdit}
        canManageSettings={permissions.canManageSettings}
        filterCount={countActiveFilters(appliedFilter)}
        hiddenSortKeys={hiddenSortKeys}
        onOpenPanel={openPanel}
        onQueryChange={(query) => setParams({ q: query || null })}
        onSortChange={(next) =>
          setParams({ sort: next.key, dir: next.direction })
        }
        pipeline={pipeline}
        query={params.q}
        sort={sort}
        totalCount={totalCount}
        totalValue={totalValue}
      />

      {/* A failed refetch keeps the last board on screen; say it is stale. */}
      {board.isError ? (
        <div
          className="flex items-center justify-between gap-3 rounded-md border border-destructive/40 px-3 py-2 text-sm"
          role="alert"
        >
          <span className="text-destructive">{t("board.staleError")}</span>
          <Button onClick={() => board.refetch()} size="sm" variant="outline">
            {t("retry")}
          </Button>
        </div>
      ) : null}

      <DndContext
        onDragCancel={() => setDraggingId(null)}
        onDragEnd={handleDragEnd}
        onDragStart={handleDragStart}
        sensors={sensors}
      >
        <div className="flex min-h-0 flex-1 items-stretch gap-6 overflow-x-auto pb-3">
          {columns.map((column, index) => (
            <StageColumn
              // New items land in the first stage, so its empty state offers to add one.
              addItemLabel={
                index === 0 && permissions.canEdit
                  ? t(itemNounKeys[pipeline.type].add)
                  : undefined
              }
              assigneeNames={assigneeNames}
              canDelete={permissions.canDelete}
              canDrag={permissions.canEdit}
              canManage={permissions.canManageSettings}
              column={column}
              columns={columns}
              currency={pipeline.currency}
              elements={cardElements}
              key={column.stage.id}
              onAddItem={openAddItem}
              onItemDialog={openItemDialog}
              onLoadMore={onLoadMore}
              onMoveItem={onMoveItem}
              onOpenItem={setOpenItemId}
              pipelineId={pipelineId}
              showValue={pipeline.settings.visibleFeatures.value}
              workspaceId={workspaceId}
            />
          ))}
          {permissions.canManageSettings ? (
            <AddStage pipelineId={pipelineId} workspaceId={workspaceId} />
          ) : null}
        </div>
        <DragOverlay>
          {draggedView ? (
            <ItemCard
              assigneeNames={assigneeNames}
              currency={pipeline.currency}
              elements={cardElements}
              isOverlay
              onOpen={() => undefined}
              view={draggedView}
            />
          ) : null}
        </DragOverlay>
      </DndContext>

      <FilterSheet
        fields={fields}
        filter={filter}
        onApply={setFilter}
        onOpenChange={(open) => setPanel(open ? "filter" : null)}
        open={panel === "filter"}
        pipeline={pipeline}
        session={filterSession}
        workspaceId={workspaceId}
      />
      <AnalyticsSheet
        onOpenChange={(open) => setPanel(open ? "analytics" : null)}
        open={panel === "analytics"}
        pipeline={pipeline}
        workspaceId={workspaceId}
      />
      {permissions.canManageSettings ? (
        <SettingsSheet
          fields={fields}
          grantLimits={{ held: permissions, policy: detail.data.grantPolicy }}
          onOpenChange={(open) => setPanel(open ? "settings" : null)}
          open={panel === "settings"}
          pipeline={pipeline}
          workspaceId={workspaceId}
        />
      ) : null}
      {permissions.canEdit ? (
        <AddItemSheet
          disabled={board.isError}
          fields={fields}
          onOpenChange={(open) => setPanel(open ? "add" : null)}
          open={panel === "add"}
          pipeline={pipeline}
          stages={columns.map((column) => column.stage)}
          workspaceId={workspaceId}
        />
      ) : null}
      {itemDialog?.kind === "transfer" ? (
        <TransferDialog
          itemId={itemDialog.itemId}
          key={itemDialog.itemId}
          {...itemDialogProps}
        />
      ) : null}
      {itemDialog?.kind === "delete" ? (
        <DeleteItemDialog
          itemId={itemDialog.itemId}
          key={itemDialog.itemId}
          {...itemDialogProps}
        />
      ) : null}
      <ItemSheet
        canDelete={permissions.canDelete}
        canEdit={permissions.canEdit}
        columns={columns}
        fields={fields}
        itemId={openItemId}
        onClose={() => setOpenItemId(null)}
        pipeline={pipeline}
        workspaceId={workspaceId}
      />
    </div>
  )
}
