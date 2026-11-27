import type { BoardColumn } from "../components/board/types"

type StagePage = Pick<BoardColumn, "items" | "nextCursor">

/**
 * The board with one more page appended to a stage ("Load more"). A page
 * fetched with a cursor the stage no longer has (the board was refetched or
 * already advanced meanwhile) is dropped, and a card already on the board
 * (moved here optimistically while the page loaded) is not added twice.
 */
export function appendStagePage<T extends { stages: BoardColumn[] }>(
  board: T,
  stageId: string,
  requestedCursor: string,
  page: StagePage,
): T {
  const onBoard = new Set(
    board.stages.flatMap((column) => column.items.map((view) => view.item.id)),
  )
  const newItems = page.items.filter((view) => !onBoard.has(view.item.id))
  return {
    ...board,
    stages: board.stages.map((column) =>
      column.stage.id === stageId && column.nextCursor === requestedCursor
        ? {
            ...column,
            items: [...column.items, ...newItems],
            nextCursor: page.nextCursor,
          }
        : column,
    ),
  }
}
