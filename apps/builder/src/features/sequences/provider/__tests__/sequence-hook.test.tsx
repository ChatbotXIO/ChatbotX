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
}: {
  workspaceId?: string
  enabled?: boolean
}) {
  useSequences(workspaceId, { enabled })
  return null
}

function InvalidateProbe({
  onReady,
}: {
  onReady: (fn: () => unknown) => void
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
})
