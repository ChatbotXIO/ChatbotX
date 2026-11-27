import type { z } from "zod"
import type { BoardColumn, BoardItemView } from "../components/board/types"
import type { moveItemPublicRequest } from "../schema/public"

/** Where a card lands in its target stage, as the board can express it. */
export type CardPlacement =
  | { kind: "top" }
  | { kind: "before"; itemId: string }
  | { kind: "after"; itemId: string }

/** The placement fields of `pipelines.moveItem` (at most one is set). */
type MovePlacementFields = Pick<
  z.infer<typeof moveItemPublicRequest>,
  "beforeItemId" | "afterItemId" | "placement"
>

/** The `moveItem` request fields for a placement; none for a plain stage change. */
export function toPlacementRequest(
  placement: CardPlacement | null,
): MovePlacementFields {
  switch (placement?.kind) {
    case "top":
      return { placement: "top" }
    case "before":
      return { beforeItemId: placement.itemId }
    case "after":
      return { afterItemId: placement.itemId }
    default:
      return {}
  }
}

/** Index a placement takes in a list that no longer holds the moved card. */
function placementIndex(
  items: readonly BoardItemView[],
  placement: CardPlacement,
): number {
  if (placement.kind === "top") {
    return 0
  }
  const anchorIndex = items.findIndex(
    (view) => view.item.id === placement.itemId,
  )
  if (anchorIndex === -1) {
    return 0
  }
  return placement.kind === "before" ? anchorIndex : anchorIndex + 1
}

function insertAt<T>(items: readonly T[], index: number, entry: T): T[] {
  return [...items.slice(0, index), entry, ...items.slice(index)]
}

/**
 * The board with one item moved (optimistic drag-and-drop): to the top of
 * another stage by default, or at `placement` within the target stage (the
 * stage it is already in, too). Column counts and totals follow. An unknown
 * item, or a same-stage move that changes nothing, leaves the board untouched.
 */
export function moveItemInBoard<T extends { stages: BoardColumn[] }>(
  board: T,
  itemId: string,
  toStageId: string,
  placement: CardPlacement | null = null,
): T {
  const moved = board.stages
    .flatMap((column) => column.items)
    .find((view) => view.item.id === itemId)
  if (!moved) {
    return board
  }
  const fromStageId = moved.item.stageId
  if (fromStageId === toStageId) {
    // No placement within the stage is a no-op on the server, so here too.
    return placement ? reorderInStage(board, moved, placement) : board
  }
  const target: CardPlacement = placement ?? { kind: "top" }
  const value = moved.item.value ?? 0
  return {
    ...board,
    stages: board.stages.map((column): BoardColumn => {
      if (column.stage.id === fromStageId) {
        return {
          ...column,
          count: column.count - 1,
          totalValue: column.totalValue - value,
          items: column.items.filter((view) => view.item.id !== itemId),
        }
      }
      if (column.stage.id === toStageId) {
        return {
          ...column,
          count: column.count + 1,
          totalValue: column.totalValue + value,
          items: insertAt(column.items, placementIndex(column.items, target), {
            ...moved,
            item: { ...moved.item, stageId: toStageId },
          }),
        }
      }
      return column
    }),
  }
}

function reorderInStage<T extends { stages: BoardColumn[] }>(
  board: T,
  moved: BoardItemView,
  placement: CardPlacement,
): T {
  const itemId = moved.item.id
  let changed = false
  const stages = board.stages.map((column): BoardColumn => {
    if (column.stage.id !== moved.item.stageId) {
      return column
    }
    const without = column.items.filter((view) => view.item.id !== itemId)
    const items = insertAt(without, placementIndex(without, placement), moved)
    changed = items.some((view, index) => view !== column.items[index])
    return changed ? { ...column, items } : column
  })
  return changed ? { ...board, stages } : board
}

/** A card's vertical extent on screen, as dnd-kit measures it. */
export type CardDropRect = { top: number; height: number }

/** The dragged card at drop time; `rect` is where it was released. */
export type CardDropSource = {
  itemId: string
  stageId: string
  rect: CardDropRect | null
}

/** What the card was released over: another card or a stage column. */
type CardDropTarget = { id: string; rect: CardDropRect | null }

/** What a card drop asks the board to do. */
export type CardDrop =
  | { kind: "ignore" }
  | { kind: "needs-manual-sort" }
  | { kind: "move"; stageId: string; placement: CardPlacement | null }

const IGNORE: CardDrop = { kind: "ignore" }
const NEEDS_MANUAL_SORT: CardDrop = { kind: "needs-manual-sort" }

const verticalCentre = (rect: CardDropRect) => rect.top + rect.height / 2

/**
 * Turns a drop into a stage and a placement. Anchors and indexes come from the
 * target list with the dragged card removed, so a card is never anchored to
 * itself. Outside manual sort the board has no order to write: a cross-stage
 * drop only changes the stage and a same-stage drop is refused.
 */
export function resolveCardDrop(
  columns: readonly BoardColumn[],
  active: CardDropSource,
  over: CardDropTarget | null,
  isManualSort: boolean,
): CardDrop {
  if (!over || over.id === active.itemId) {
    return IGNORE
  }
  const overCard = columns
    .flatMap((column) => column.items)
    .find((view) => view.item.id === over.id)
  const targetStageId = overCard ? overCard.item.stageId : over.id
  const target = columns.find((column) => column.stage.id === targetStageId)
  if (!target || target.stage.bulkJobId) {
    return IGNORE
  }
  const isSameStage = targetStageId === active.stageId
  if (!isManualSort) {
    return isSameStage
      ? NEEDS_MANUAL_SORT
      : { kind: "move", stageId: targetStageId, placement: null }
  }

  const without = target.items.filter((view) => view.item.id !== active.itemId)
  const placement = overCard
    ? placementOverCard(
        target.items,
        active,
        overCard.item.id,
        over,
        isSameStage,
      )
    : placementOverColumn(without)
  if (isSameStage && isUnchangedInStage(target.items, active, placement)) {
    return IGNORE
  }
  return { kind: "move", stageId: targetStageId, placement }
}

function placementOverColumn(without: readonly BoardItemView[]): CardPlacement {
  const last = without.at(-1)
  return last ? { kind: "after", itemId: last.item.id } : { kind: "top" }
}

function placementOverCard(
  targetItems: readonly BoardItemView[],
  active: CardDropSource,
  overId: string,
  over: CardDropTarget,
  isSameStage: boolean,
): CardPlacement {
  if (isSameStage) {
    const activeIndex = targetItems.findIndex(
      (view) => view.item.id === active.itemId,
    )
    const overIndex = targetItems.findIndex((view) => view.item.id === overId)
    return activeIndex < overIndex
      ? { kind: "after", itemId: overId }
      : { kind: "before", itemId: overId }
  }
  const isBelowMidpoint =
    active.rect !== null &&
    over.rect !== null &&
    verticalCentre(active.rect) > verticalCentre(over.rect)
  return isBelowMidpoint
    ? { kind: "after", itemId: overId }
    : { kind: "before", itemId: overId }
}

function isUnchangedInStage(
  targetItems: readonly BoardItemView[],
  active: CardDropSource,
  placement: CardPlacement,
): boolean {
  const activeIndex = targetItems.findIndex(
    (view) => view.item.id === active.itemId,
  )
  const without = targetItems.filter((view) => view.item.id !== active.itemId)
  return activeIndex === placementIndex(without, placement)
}
