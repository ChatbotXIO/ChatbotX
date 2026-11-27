import { type QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, useEffect } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, test, vi } from "vitest"
import type { BoardColumn } from "../src/features/pipelines/components/board/types"
import { useBoardMove } from "../src/features/pipelines/lib/use-board-move"
import { makeQueryClient } from "./query-test-utils"

/** Echoes the key back so assertions never depend on the English copy. */
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }))
vi.mock("sonner", () => ({ toast }))

const moveItemAction = vi.hoisted(() => vi.fn())
vi.mock("../src/features/pipelines/actions/item.action", () => ({
  moveItemAction,
}))

const invalidatePipelines = vi.hoisted(() => vi.fn())
vi.mock("../src/features/pipelines/lib/use-invalidate-pipelines", () => ({
  useInvalidatePipelines: () => invalidatePipelines,
}))

const BOARD_KEY = ["board"] as const

type MoveItem = ReturnType<typeof useBoardMove>

const holder: { current: MoveItem | null } = { current: null }
let container: HTMLDivElement | null = null
let root: Root | null = null
let queryClient: QueryClient | null = null

function getMove(): MoveItem {
  if (!holder.current) {
    throw new Error("useBoardMove probe has not rendered yet")
  }
  return holder.current
}

function Probe() {
  const move = useBoardMove({
    workspaceId: "w1",
    pipelineId: "p1",
    boardKey: BOARD_KEY,
  })
  useEffect(() => {
    holder.current = move
  })
  return null
}

const view = (id: string, stageId: string) =>
  ({ item: { id, stageId, value: null } }) as BoardColumn["items"][number]

const column = (id: string, items: BoardColumn["items"]) =>
  ({
    stage: { id },
    count: items.length,
    totalValue: 0,
    items,
    nextCursor: null,
  }) as unknown as BoardColumn

const initialBoard = () => ({
  stages: [
    column("a", [view("1", "a"), view("2", "a")]),
    column("b", [view("3", "b")]),
  ],
})

function renderMove(): QueryClient {
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  const client = makeQueryClient()
  queryClient = client
  client.setQueryData(BOARD_KEY, initialBoard())
  act(() => {
    root?.render(
      <QueryClientProvider client={client}>
        <Probe />
      </QueryClientProvider>,
    )
  })
  return client
}

const idsOf = (client: QueryClient, stageId: string) =>
  client
    .getQueryData<{ stages: BoardColumn[] }>(BOARD_KEY)
    ?.stages.find((entry) => entry.stage.id === stageId)
    ?.items.map((entry) => entry.item.id)

/** A move that settles when the test says so. */
function deferred<T>() {
  let resolve: (value: T) => void = () => undefined
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

afterEach(() => {
  if (root) {
    act(() => {
      root?.unmount()
    })
  }
  container?.remove()
  container = null
  root = null
  queryClient?.clear()
  queryClient = null
  holder.current = null
  toast.error.mockClear()
  invalidatePipelines.mockClear()
  moveItemAction.mockReset()
})

describe("useBoardMove", () => {
  test("writes the new order before the action settles and sends the placement", async () => {
    const client = renderMove()
    const pending = deferred<object>()
    moveItemAction.mockReturnValue(pending.promise)

    let done: Promise<void> = Promise.resolve()
    act(() => {
      done = getMove()("1", "b", { kind: "after", itemId: "3" })
    })

    expect(idsOf(client, "a")).toEqual(["2"])
    expect(idsOf(client, "b")).toEqual(["3", "1"])
    expect(moveItemAction).toHaveBeenCalledWith("w1", {
      id: "p1",
      itemId: "1",
      stageId: "b",
      afterItemId: "3",
    })

    await act(async () => {
      pending.resolve({ data: undefined })
      await done
    })
  })

  test("success keeps the optimistic board and invalidates the pipeline queries", async () => {
    const client = renderMove()
    moveItemAction.mockResolvedValue({ data: undefined })

    await act(async () => {
      await getMove()("1", "b")
    })

    expect(idsOf(client, "b")).toEqual(["1", "3"])
    expect(invalidatePipelines).toHaveBeenCalledTimes(1)
    expect(toast.error).not.toHaveBeenCalled()
  })

  test("a failure alone restores the snapshot, invalidates and toasts", async () => {
    const client = renderMove()
    moveItemAction.mockResolvedValue({ serverError: "Stage is busy" })

    await act(async () => {
      await getMove()("1", "b")
    })

    expect(idsOf(client, "a")).toEqual(["1", "2"])
    expect(idsOf(client, "b")).toEqual(["3"])
    expect(invalidatePipelines).toHaveBeenCalledTimes(1)
    expect(toast.error).toHaveBeenCalledWith("Stage is busy")
  })

  test("a rejected input counts as a failure with the fallback message", async () => {
    const client = renderMove()
    moveItemAction.mockResolvedValue({ validationErrors: { _errors: ["x"] } })

    await act(async () => {
      await getMove()("1", "b")
    })

    expect(idsOf(client, "b")).toEqual(["3"])
    expect(toast.error).toHaveBeenCalledWith("board.moveFailed")
  })

  test("a network throw behaves like a failure", async () => {
    const client = renderMove()
    moveItemAction.mockRejectedValue(new TypeError("Failed to fetch"))

    await act(async () => {
      await getMove()("1", "b")
    })

    expect(idsOf(client, "a")).toEqual(["1", "2"])
    expect(idsOf(client, "b")).toEqual(["3"])
    expect(invalidatePipelines).toHaveBeenCalledTimes(1)
    expect(toast.error).toHaveBeenCalledWith("board.moveFailed")
  })

  test("the first move failing after a second one started keeps the second's board", async () => {
    const client = renderMove()
    const first = deferred<object>()
    const second = deferred<object>()
    moveItemAction
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)

    let firstDone: Promise<void> = Promise.resolve()
    let secondDone: Promise<void> = Promise.resolve()
    act(() => {
      firstDone = getMove()("1", "b")
    })
    act(() => {
      secondDone = getMove()("2", "b")
    })
    expect(idsOf(client, "b")).toEqual(["2", "1", "3"])

    await act(async () => {
      first.resolve({ serverError: "boom" })
      await firstDone
    })

    // Not rolled back (the newer move owns the board), but still refetched.
    expect(idsOf(client, "b")).toEqual(["2", "1", "3"])
    expect(invalidatePipelines).toHaveBeenCalledTimes(1)
    expect(toast.error).toHaveBeenCalledWith("boom")

    await act(async () => {
      second.resolve({ data: undefined })
      await secondDone
    })
    expect(invalidatePipelines).toHaveBeenCalledTimes(2)
  })

  test("an earlier move that succeeds after a newer one settled still invalidates", async () => {
    renderMove()
    const first = deferred<object>()
    const second = deferred<object>()
    moveItemAction
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)

    let firstDone: Promise<void> = Promise.resolve()
    let secondDone: Promise<void> = Promise.resolve()
    act(() => {
      firstDone = getMove()("1", "b")
    })
    act(() => {
      secondDone = getMove()("2", "b")
    })

    await act(async () => {
      second.resolve({ data: undefined })
      await secondDone
    })
    expect(invalidatePipelines).toHaveBeenCalledTimes(1)

    await act(async () => {
      first.resolve({ data: undefined })
      await firstDone
    })
    expect(invalidatePipelines).toHaveBeenCalledTimes(2)
  })
})
