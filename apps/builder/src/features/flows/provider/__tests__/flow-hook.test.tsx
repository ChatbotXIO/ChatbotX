// @vitest-environment jsdom

import { type QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { makeQueryClient } from "../../../../../__tests__/query-test-utils"
import { useFlows, useInvalidateFlows } from "../flow-hook"

const { mockPrivateListFlows } = vi.hoisted(() => ({
  mockPrivateListFlows: vi.fn(),
}))

vi.mock("@/lib/orpc/orpc", () => ({
  client: {
    flowsAPI: {
      privateListFlowsAPI: mockPrivateListFlows,
    },
  },
}))

function FlowsProbe({
  enabled = true,
  onError,
  onRender,
  onState,
}: {
  enabled?: boolean
  onError?: (isError: boolean) => void
  onRender: (data: unknown) => void
  onState?: (state: { isError: boolean; error: unknown }) => void
}) {
  const query = useFlows("workspace-1", {
    enabled,
    filter: {
      integrationWhatsappIds: ["whatsapp-1"],
      startType: "sendWaTemplateMessage",
    },
  })

  onRender(query.data)
  onState?.({ isError: query.isError, error: query.error })
  return null
}

function InvalidateProbe({
  onReady,
}: {
  onReady: (invalidate: () => unknown) => void
}) {
  onReady(useInvalidateFlows())
  return null
}

describe("flow query hooks", () => {
  let container: HTMLDivElement
  let root: Root
  let queryClient: QueryClient

  beforeEach(() => {
    vi.clearAllMocks()
    mockPrivateListFlows.mockResolvedValue({
      data: [{ id: "flow-1", name: "Welcome" }],
      pageCount: 1,
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

  test("requests active flows with the supplied filter and unwraps response data", async () => {
    let latestData: unknown

    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <FlowsProbe onRender={(data) => (latestData = data)} />
        </QueryClientProvider>,
      )
    })

    await vi.waitFor(() => {
      expect(mockPrivateListFlows).toHaveBeenCalledWith(
        {
          workspaceId: "workspace-1",
          perPage: 999_999_999,
          active: true,
          integrationWhatsappIds: ["whatsapp-1"],
          startType: "sendWaTemplateMessage",
        },
        expect.anything(),
      )
      expect(latestData).toEqual([{ id: "flow-1", name: "Welcome" }])
    })
  })

  test("does not request flows when disabled", () => {
    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <FlowsProbe enabled={false} onRender={() => undefined} />
        </QueryClientProvider>,
      )
    })

    expect(mockPrivateListFlows).not.toHaveBeenCalled()
  })

  test("surfaces isError and the rejection when the request fails", async () => {
    mockPrivateListFlows.mockRejectedValue(new Error("flows failed"))
    let state: { isError: boolean; error: unknown } | undefined

    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <FlowsProbe
            onRender={() => undefined}
            onState={(nextState) => (state = nextState)}
          />
        </QueryClientProvider>,
      )
    })

    await vi.waitFor(() => {
      expect(state?.isError).toBe(true)
    })
    expect(state?.error).toBeInstanceOf(Error)
  })

  test("invalidates the flows query key with a stable callback", async () => {
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries")
    const invalidators: Array<() => unknown> = []

    const render = () =>
      root.render(
        <QueryClientProvider client={queryClient}>
          <InvalidateProbe
            onReady={(invalidate) => invalidators.push(invalidate)}
          />
        </QueryClientProvider>,
      )

    act(render)
    act(render)

    expect(invalidators).toHaveLength(2)
    expect(invalidators[0]).toBe(invalidators[1])

    await act(async () => {
      await invalidators[0]?.()
    })

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: [["flowsAPI", "privateListFlowsAPI"], {}],
    })
  })

  test("a refetch after invalidation returns the flows query's fresh data", async () => {
    let latestData: unknown
    let invalidate: (() => unknown) | null = null

    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <FlowsProbe onRender={(data) => (latestData = data)} />
          <InvalidateProbe onReady={(fn) => (invalidate = fn)} />
        </QueryClientProvider>,
      )
    })

    await vi.waitFor(() => {
      expect(latestData).toEqual([{ id: "flow-1", name: "Welcome" }])
    })

    // A wrong query key on the invalidator would leave this probe stuck on
    // the stale data forever, timing this `waitFor` out below.
    mockPrivateListFlows.mockResolvedValue({
      data: [{ id: "flow-2", name: "Refreshed" }],
      pageCount: 1,
    })

    await act(async () => {
      await invalidate?.()
    })

    await vi.waitFor(() => {
      expect(latestData).toEqual([{ id: "flow-2", name: "Refreshed" }])
    })
  })
})
