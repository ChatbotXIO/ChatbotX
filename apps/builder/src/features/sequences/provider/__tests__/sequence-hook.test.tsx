// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { useInvalidateSequences, useSequences } from "../sequence-hook"

const { mockListSequences } = vi.hoisted(() => ({
  mockListSequences: vi.fn(),
}))

vi.mock("@/lib/orpc/orpc", () => ({
  client: {
    sequencesAPI: {
      listSequencesWorkspaceAuthAPI: mockListSequences,
    },
  },
}))

const makeQueryClient = () =>
  new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

function SequencesProbe({
  workspaceId = "workspace-1",
  enabled = true,
  onData,
  onState,
}: {
  workspaceId?: string
  enabled?: boolean
  onData?: (data: unknown) => void
  onState?: (state: { isError: boolean; error: unknown }) => void
}) {
  const sequences = useSequences(workspaceId, { enabled })
  onData?.(sequences.data)
  onState?.({ isError: sequences.isError, error: sequences.error })
  return null
}

function InvalidateProbe({
  onReady,
  version: _version = 0,
}: {
  onReady: (fn: () => unknown) => void
  version?: number
}) {
  onReady(useInvalidateSequences())
  return null
}

describe("sequence query hooks", () => {
  let container: HTMLDivElement
  let root: Root
  let queryClient: QueryClient

  beforeEach(() => {
    vi.clearAllMocks()
    mockListSequences.mockResolvedValue({
      data: [{ id: "1", name: "Welcome" }],
    })
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
    queryClient = makeQueryClient()
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    queryClient.clear()
  })

  test("requests active sequences with maxPerPage", async () => {
    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <SequencesProbe />
        </QueryClientProvider>,
      )
    })

    await vi.waitFor(() => {
      expect(mockListSequences).toHaveBeenCalledTimes(1)
    })
    expect(mockListSequences).toHaveBeenCalledWith(
      {
        workspaceId: "workspace-1",
        perPage: 999_999_999,
        active: true,
      },
      expect.anything(),
    )
  })

  test("unwraps sequence response data", async () => {
    const sequences = [{ id: "sequence-1", name: "Welcome" }]
    let data: unknown
    mockListSequences.mockResolvedValue({ data: sequences })

    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <SequencesProbe onData={(nextData) => (data = nextData)} />
        </QueryClientProvider>,
      )
    })

    await vi.waitFor(() => {
      expect(data).toEqual(sequences)
    })
  })

  test("does not request sequences when disabled", () => {
    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <SequencesProbe enabled={false} />
        </QueryClientProvider>,
      )
    })

    expect(mockListSequences).not.toHaveBeenCalled()
  })

  test("surfaces isError and the rejection when the request fails", async () => {
    mockListSequences.mockRejectedValue(new Error("sequences failed"))
    let state: { isError: boolean; error: unknown } | undefined

    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <SequencesProbe onState={(nextState) => (state = nextState)} />
        </QueryClientProvider>,
      )
    })

    await vi.waitFor(() => {
      expect(state?.isError).toBe(true)
    })
    expect(state?.error).toBeInstanceOf(Error)
  })

  test("invalidates sequence readers, and a refetch returns fresh data", async () => {
    let invalidate: (() => unknown) | null = null
    let data: unknown
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries")

    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <SequencesProbe onData={(nextData) => (data = nextData)} />
          <InvalidateProbe onReady={(fn) => (invalidate = fn)} />
        </QueryClientProvider>,
      )
    })

    await vi.waitFor(() => {
      expect(data).toEqual([{ id: "1", name: "Welcome" }])
    })

    // A wrong query key on the invalidator would leave `data` stuck on the
    // stale value forever, timing the final `waitFor` out below.
    mockListSequences.mockResolvedValue({
      data: [{ id: "sequence-2", name: "Refreshed" }],
    })

    await act(async () => {
      await invalidate?.()
    })

    expect(invalidateQueries).toHaveBeenCalledTimes(1)
    await vi.waitFor(() => {
      expect(data).toEqual([{ id: "sequence-2", name: "Refreshed" }])
    })
  })

  test("keeps the invalidator stable across renders", () => {
    const invalidators: (() => unknown)[] = []

    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <InvalidateProbe
            onReady={(fn) => invalidators.push(fn)}
            version={1}
          />
        </QueryClientProvider>,
      )
    })
    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <InvalidateProbe
            onReady={(fn) => invalidators.push(fn)}
            version={2}
          />
        </QueryClientProvider>,
      )
    })

    expect(invalidators).toHaveLength(2)
    expect(invalidators[1]).toBe(invalidators[0])
  })
})
