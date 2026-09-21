// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { useInboxes, useInvalidateInboxes } from "../inbox-hook"

const { mockListInboxes } = vi.hoisted(() => ({
  mockListInboxes: vi.fn(),
}))

vi.mock("@/lib/orpc/orpc", () => ({
  client: {
    inboxesAPI: {
      listAllInboxesAuthenticatedAPI: mockListInboxes,
    },
  },
}))

const makeQueryClient = () =>
  new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

function InboxesProbe({
  workspaceId = "workspace-1",
  enabled = true,
  onData,
}: {
  workspaceId?: string
  enabled?: boolean
  onData?: (data: unknown) => void
}) {
  const inboxes = useInboxes(workspaceId, { enabled })
  onData?.(inboxes.data)
  return null
}

function InvalidateProbe({
  onReady,
  version: _version = 0,
}: {
  onReady: (fn: () => unknown) => void
  version?: number
}) {
  onReady(useInvalidateInboxes())
  return null
}

describe("inbox query hooks", () => {
  let container: HTMLDivElement
  let root: Root
  let queryClient: QueryClient

  beforeEach(() => {
    vi.clearAllMocks()
    mockListInboxes.mockResolvedValue({
      data: [{ id: "inbox-1", name: "Support" }],
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

  test("requests every inbox with integrations using the unpaginated endpoint", async () => {
    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <InboxesProbe />
        </QueryClientProvider>,
      )
    })

    await vi.waitFor(() => {
      expect(mockListInboxes).toHaveBeenCalledTimes(1)
    })
    expect(mockListInboxes).toHaveBeenCalledWith(
      {
        workspaceId: "workspace-1",
        includes: ["integration"],
      },
      expect.anything(),
    )
  })

  test("unwraps inbox response data", async () => {
    const inboxes = [{ id: "inbox-2", name: "Sales" }]
    let data: unknown
    mockListInboxes.mockResolvedValue({ data: inboxes })

    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <InboxesProbe onData={(nextData) => (data = nextData)} />
        </QueryClientProvider>,
      )
    })

    await vi.waitFor(() => {
      expect(data).toEqual(inboxes)
    })
  })

  test("does not request inboxes when disabled", () => {
    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <InboxesProbe enabled={false} />
        </QueryClientProvider>,
      )
    })

    expect(mockListInboxes).not.toHaveBeenCalled()
  })

  test("invalidates inbox readers", async () => {
    let invalidate: (() => unknown) | null = null
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries")

    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <InboxesProbe />
          <InvalidateProbe onReady={(fn) => (invalidate = fn)} />
        </QueryClientProvider>,
      )
    })

    await vi.waitFor(() => {
      expect(mockListInboxes).toHaveBeenCalledTimes(1)
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
