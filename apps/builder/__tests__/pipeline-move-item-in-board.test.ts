import { describe, expect, test } from "vitest"
import type { BoardColumn } from "../src/features/pipelines/components/board/types"
import {
  type CardDropRect,
  type CardDropSource,
  moveItemInBoard,
  resolveCardDrop,
  toPlacementRequest,
} from "../src/features/pipelines/lib/move-item-in-board"

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

const ids = (next: { stages: BoardColumn[] }, stageId: string) =>
  next.stages
    .find((entry) => entry.stage.id === stageId)
    ?.items.map((entry) => entry.item.id)

const wideBoard = () => ({
  stages: [
    column("a", [view("1", "a", 10), view("2", "a", 20), view("3", "a", 30)]),
    column("b", [view("4", "b", 5), view("5", "b", 6)]),
    column("c", []),
  ],
})

describe("moveItemInBoard placement", () => {
  test("moves a card above another card of the same stage", () => {
    const next = moveItemInBoard(wideBoard(), "3", "a", {
      kind: "before",
      itemId: "1",
    })

    expect(ids(next, "a")).toEqual(["3", "1", "2"])
    expect(next.stages[0]?.count).toBe(3)
    expect(next.stages[0]?.totalValue).toBe(60)
  })

  test("moves a card below another card of the same stage", () => {
    const next = moveItemInBoard(wideBoard(), "1", "a", {
      kind: "after",
      itemId: "2",
    })

    expect(ids(next, "a")).toEqual(["2", "1", "3"])
  })

  test("a same-stage drop that changes nothing keeps the board reference", () => {
    const original = wideBoard()

    expect(
      moveItemInBoard(original, "2", "a", { kind: "after", itemId: "1" }),
    ).toBe(original)
    expect(moveItemInBoard(original, "1", "a", { kind: "top" })).toBe(original)
  })

  test("inserts before and after an anchor of another stage", () => {
    const before = moveItemInBoard(wideBoard(), "1", "b", {
      kind: "before",
      itemId: "5",
    })
    const after = moveItemInBoard(wideBoard(), "1", "b", {
      kind: "after",
      itemId: "5",
    })

    expect(ids(before, "b")).toEqual(["4", "1", "5"])
    expect(ids(after, "b")).toEqual(["4", "5", "1"])
    expect(before.stages[1]?.count).toBe(3)
    expect(before.stages[1]?.totalValue).toBe(21)
    expect(before.stages[0]?.count).toBe(2)
    expect(ids(before, "a")).toEqual(["2", "3"])
  })

  test("puts a card on top of an empty stage", () => {
    const next = moveItemInBoard(wideBoard(), "1", "c", { kind: "top" })

    expect(ids(next, "c")).toEqual(["1"])
    expect(next.stages[2]?.count).toBe(1)
  })

  test("falls back to the top when the anchor is not loaded", () => {
    const next = moveItemInBoard(wideBoard(), "1", "b", {
      kind: "after",
      itemId: "missing",
    })

    expect(ids(next, "b")).toEqual(["1", "4", "5"])
  })

  test("a same-stage move without a placement leaves the board unchanged", () => {
    const original = wideBoard()

    expect(moveItemInBoard(original, "2", "a")).toBe(original)
  })

  test("returns the board unchanged for an unknown item with a placement", () => {
    const original = wideBoard()

    expect(moveItemInBoard(original, "missing", "b", { kind: "top" })).toBe(
      original,
    )
  })

  test("does not mutate the input board when placing", () => {
    const original = wideBoard()

    moveItemInBoard(original, "3", "a", { kind: "before", itemId: "1" })
    moveItemInBoard(original, "1", "b", { kind: "after", itemId: "5" })

    expect(ids(original, "a")).toEqual(["1", "2", "3"])
    expect(ids(original, "b")).toEqual(["4", "5"])
  })
})

describe("toPlacementRequest", () => {
  test("maps each placement to the moveItem field it sends", () => {
    expect(toPlacementRequest(null)).toEqual({})
    expect(toPlacementRequest({ kind: "top" })).toEqual({ placement: "top" })
    expect(toPlacementRequest({ kind: "before", itemId: "7" })).toEqual({
      beforeItemId: "7",
    })
    expect(toPlacementRequest({ kind: "after", itemId: "7" })).toEqual({
      afterItemId: "7",
    })
  })
})

const rect = (top: number, height = 100): CardDropRect => ({ top, height })
const source = (
  itemId: string,
  stageId: string,
  activeRect: CardDropRect | null = null,
): CardDropSource => ({ itemId, stageId, rect: activeRect })

describe("resolveCardDrop", () => {
  const columns = () => wideBoard().stages

  test("ignores a drop outside any target or onto the card itself", () => {
    expect(resolveCardDrop(columns(), source("1", "a"), null, true)).toEqual({
      kind: "ignore",
    })
    expect(
      resolveCardDrop(
        columns(),
        source("1", "a"),
        { id: "1", rect: null },
        true,
      ),
    ).toEqual({ kind: "ignore" })
    expect(
      resolveCardDrop(
        columns(),
        source("1", "a"),
        { id: "nowhere", rect: null },
        true,
      ),
    ).toEqual({ kind: "ignore" })
  })

  test("same stage, dragged down: after the card it is over", () => {
    expect(
      resolveCardDrop(
        columns(),
        source("1", "a"),
        { id: "3", rect: null },
        true,
      ),
    ).toEqual({
      kind: "move",
      stageId: "a",
      placement: { kind: "after", itemId: "3" },
    })
  })

  test("same stage, dragged up: before the card it is over", () => {
    expect(
      resolveCardDrop(
        columns(),
        source("3", "a"),
        { id: "1", rect: null },
        true,
      ),
    ).toEqual({
      kind: "move",
      stageId: "a",
      placement: { kind: "before", itemId: "1" },
    })
  })

  test("same stage, first and last card as targets", () => {
    expect(
      resolveCardDrop(
        columns(),
        source("2", "a"),
        { id: "1", rect: null },
        true,
      ),
    ).toMatchObject({ placement: { kind: "before", itemId: "1" } })
    expect(
      resolveCardDrop(
        columns(),
        source("2", "a"),
        { id: "3", rect: null },
        true,
      ),
    ).toMatchObject({ placement: { kind: "after", itemId: "3" } })
  })

  test("cross stage: above the midpoint goes before, below goes after", () => {
    const over = { id: "4", rect: rect(100) }

    expect(
      resolveCardDrop(columns(), source("1", "a", rect(60)), over, true),
    ).toEqual({
      kind: "move",
      stageId: "b",
      placement: { kind: "before", itemId: "4" },
    })
    expect(
      resolveCardDrop(columns(), source("1", "a", rect(120)), over, true),
    ).toEqual({
      kind: "move",
      stageId: "b",
      placement: { kind: "after", itemId: "4" },
    })
  })

  test("cross stage without measured rects goes before the card", () => {
    expect(
      resolveCardDrop(
        columns(),
        source("1", "a"),
        { id: "5", rect: null },
        true,
      ),
    ).toMatchObject({ placement: { kind: "before", itemId: "5" } })
  })

  test("an empty column takes the card on top", () => {
    expect(
      resolveCardDrop(
        columns(),
        source("1", "a"),
        { id: "c", rect: null },
        true,
      ),
    ).toEqual({ kind: "move", stageId: "c", placement: { kind: "top" } })
  })

  test("a column with cards puts the card after the last loaded one", () => {
    const partial = columns().map((entry) =>
      entry.stage.id === "b" ? { ...entry, nextCursor: "more" } : entry,
    ) as BoardColumn[]

    expect(
      resolveCardDrop(partial, source("1", "a"), { id: "b", rect: null }, true),
    ).toEqual({
      kind: "move",
      stageId: "b",
      placement: { kind: "after", itemId: "5" },
    })
  })

  test("dropping on its own column anchors to the last other card, never itself", () => {
    expect(
      resolveCardDrop(
        columns(),
        source("3", "a"),
        { id: "a", rect: null },
        true,
      ),
    ).toEqual({ kind: "ignore" })
    expect(
      resolveCardDrop(
        columns(),
        source("1", "a"),
        { id: "a", rect: null },
        true,
      ),
    ).toEqual({
      kind: "move",
      stageId: "a",
      placement: { kind: "after", itemId: "3" },
    })
  })

  test("dropping the only card on its own column is ignored", () => {
    const lone = [column("a", [view("1", "a", 1)])]

    expect(
      resolveCardDrop(lone, source("1", "a"), { id: "a", rect: null }, true),
    ).toEqual({ kind: "ignore" })
  })

  test("outside manual sort a cross-stage drop only changes the stage", () => {
    expect(
      resolveCardDrop(
        columns(),
        source("1", "a"),
        { id: "4", rect: null },
        false,
      ),
    ).toEqual({ kind: "move", stageId: "b", placement: null })
    expect(
      resolveCardDrop(
        columns(),
        source("1", "a"),
        { id: "c", rect: null },
        false,
      ),
    ).toEqual({ kind: "move", stageId: "c", placement: null })
  })

  test("outside manual sort a same-stage drop asks for the manual order", () => {
    expect(
      resolveCardDrop(
        columns(),
        source("1", "a"),
        { id: "a", rect: null },
        false,
      ),
    ).toEqual({ kind: "needs-manual-sort" })
    expect(
      resolveCardDrop(
        columns(),
        source("1", "a"),
        { id: "3", rect: null },
        false,
      ),
    ).toEqual({ kind: "needs-manual-sort" })
  })

  test("a stage running a bulk job takes no drops", () => {
    const busy = columns().map((entry) =>
      entry.stage.id === "b"
        ? { ...entry, stage: { ...entry.stage, bulkJobId: "job" } }
        : entry,
    ) as BoardColumn[]

    expect(
      resolveCardDrop(busy, source("1", "a"), { id: "b", rect: null }, true),
    ).toEqual({ kind: "ignore" })
    expect(
      resolveCardDrop(busy, source("1", "a"), { id: "4", rect: null }, false),
    ).toEqual({ kind: "ignore" })
  })
})
