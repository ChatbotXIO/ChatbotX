import type { BoardColumn } from "../components/board/types"

/**
 * The board with one item moved to the top of another stage (optimistic
 * drag-and-drop): column counts and totals follow. An unknown item leaves the
 * board untouched.
 */
export function moveItemInBoard<T extends { stages: BoardColumn[] }>(
  board: T,
  itemId: string,
  toStageId: string,
): T {
  const moved = board.stages
    .flatMap((column) => column.items)
    .find((view) => view.item.id === itemId)
  if (!moved || moved.item.stageId === toStageId) {
    return board
  }
  const value = moved.item.value ?? 0
  return {
    ...board,
    stages: board.stages.map((column): BoardColumn => {
      if (column.stage.id === moved.item.stageId) {
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
          items: [
            { ...moved, item: { ...moved.item, stageId: toStageId } },
            ...column.items,
          ],
        }
      }
      return column
    }),
  }
}
