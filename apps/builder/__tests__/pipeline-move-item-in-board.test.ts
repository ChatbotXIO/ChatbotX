import { describe, expect, test } from "vitest"
import type { BoardColumn } from "../src/features/pipelines/components/board/types"
import { moveItemInBoard } from "../src/features/pipelines/lib/move-item-in-board"

const view = (id: string, stageId: string, value: number | null) =>
  ({ item: { id, stageId, value } }) as BoardColumn["items"][number]

const column = (id: string, items: BoardColumn["items"]) =>
  ({
    stage: { id },
    count: items.length,
    totalValue: items.reduce((sum, entry) => sum + (entry.item.value ?? 0), 0),
    items,
    nextCursor: null,
  }) as unknown as BoardColumn

const board = () => ({
  stages: [
    column("a", [view("1", "a", 10), view("2", "a", null)]),
    column("b", [view("3", "b", 5)]),
  ],
})

describe("moveItemInBoard", () => {
  test("moves the item to the top of the target stage and updates totals", () => {
    const next = moveItemInBoard(board(), "1", "b")

    expect(next.stages[0]?.items.map((entry) => entry.item.id)).toEqual(["2"])
    expect(next.stages[0]?.count).toBe(1)
    expect(next.stages[0]?.totalValue).toBe(0)
    expect(next.stages[1]?.items.map((entry) => entry.item.id)).toEqual([
      "1",
      "3",
    ])
    expect(next.stages[1]?.items[0]?.item.stageId).toBe("b")
    expect(next.stages[1]?.count).toBe(2)
    expect(next.stages[1]?.totalValue).toBe(15)
  })

  test("does not mutate the input board", () => {
    const original = board()

    moveItemInBoard(original, "1", "b")

    expect(original.stages[0]?.items).toHaveLength(2)
  })

  test("returns the board unchanged for an unknown item or the same stage", () => {
    const original = board()

    expect(moveItemInBoard(original, "missing", "b")).toBe(original)
    expect(moveItemInBoard(original, "1", "a")).toBe(original)
  })
})
