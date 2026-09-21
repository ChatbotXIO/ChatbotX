// @vitest-environment jsdom

import { type QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { makeQueryClient } from "../../../../../__tests__/query-test-utils"
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

function SequencesProbe({
  workspaceId = "workspace-1",
  enabled = true,
  onData,
  onError,
}: {
  workspaceId?: string
  enabled?: boolean
  onData?: (data: unknown) => void
  onError?: (isError: boolean) => void
}) {
  const sequences = useSequences(workspaceId, { enabled })
  onData?.(sequences.data)
  onError?.(sequences.isError)
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

  test("surfaces a failed sequence request", async () => {
    let isError = false
    mockListSequences.mockRejectedValue(new Error("sequences failed"))

    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <SequencesProbe onError={(nextIsError) => (isError = nextIsError)} />
        </QueryClientProvider>,
      )
    })

    await vi.waitFor(() => {
      expect(isError).toBe(true)
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

  test("invalidates sequence readers", async () => {
    let invalidate: (() => unknown) | null = null
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries")

    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <SequencesProbe />
          <InvalidateProbe onReady={(fn) => (invalidate = fn)} />
        </QueryClientProvider>,
      )
    })

    await vi.waitFor(() => {
      expect(mockListSequences).toHaveBeenCalledTimes(1)
    })

    await act(async () => {
      await invalidate?.()
    })

    expect(invalidateQueries).toHaveBeenCalledTimes(1)
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
