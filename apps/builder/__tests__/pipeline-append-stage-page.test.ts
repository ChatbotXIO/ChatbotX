import { describe, expect, test } from "vitest"
import type { BoardColumn } from "../src/features/pipelines/components/board/types"
import { appendStagePage } from "../src/features/pipelines/lib/append-stage-page"
import { moveItemInBoard } from "../src/features/pipelines/lib/move-item-in-board"

const view = (id: string, stageId: string) =>
  ({ item: { id, stageId, value: 1 } }) as BoardColumn["items"][number]

const column = (
  id: string,
  items: BoardColumn["items"],
  nextCursor: string | null,
) =>
  ({
    stage: { id },
    count: 3,
    totalValue: 3,
    items,
    nextCursor,
  }) as unknown as BoardColumn

const board = () => ({
  stages: [column("a", [view("1", "a")], "cursor-1"), column("b", [], null)],
})

describe("appendStagePage", () => {
  test("appends the page to its stage and advances the cursor", () => {
    const next = appendStagePage(board(), "a", "cursor-1", {
      items: [view("2", "a")],
      nextCursor: "cursor-2",
    })

    expect(next.stages[0]?.items.map((entry) => entry.item.id)).toEqual([
      "1",
      "2",
    ])
    expect(next.stages[0]?.nextCursor).toBe("cursor-2")
  })

  test("drops a page fetched with a cursor the stage no longer has", () => {
    const original = board()

    const next = appendStagePage(original, "a", "stale-cursor", {
      items: [view("2", "a")],
      nextCursor: null,
    })

    expect(next.stages[0]).toBe(original.stages[0])
  })

  test("a card from a later page can be moved like a first-page card", () => {
    const loaded = appendStagePage(board(), "a", "cursor-1", {
      items: [view("2", "a")],
      nextCursor: null,
    })

    const moved = moveItemInBoard(loaded, "2", "b")

    expect(moved.stages[0]?.items.map((entry) => entry.item.id)).toEqual(["1"])
    expect(moved.stages[1]?.items.map((entry) => entry.item.id)).toEqual(["2"])
  })

  test("a card already on the board (moved here while the page loaded) is not added twice", () => {
    const moved = moveItemInBoard(
      appendStagePage(board(), "a", "cursor-1", {
        items: [view("2", "a")],
        nextCursor: null,
      }),
      "2",
      "b",
    )
    const withB = {
      ...moved,
      stages: moved.stages.map((entry) =>
        entry.stage.id === "b" ? { ...entry, nextCursor: "cursor-b" } : entry,
      ),
    }

    const next = appendStagePage(withB, "b", "cursor-b", {
      items: [view("2", "b"), view("4", "b")],
      nextCursor: null,
    })

    expect(next.stages[1]?.items.map((entry) => entry.item.id)).toEqual([
      "2",
      "4",
    ])
  })
})
