// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, useEffect } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, expect, test, vi } from "vitest"
import {
  FlowStoreProvider,
  useFlowStore,
} from "@/features/flows/provider/flow-store-context"

const { mockListFlows } = vi.hoisted(() => ({
  mockListFlows: vi.fn(),
}))

vi.mock("@/hooks/routing", () => ({
  useWorkspaceId: () => "ws-1",
}))

vi.mock("@/lib/orpc/query", () => ({
  orpc: {
    flowsAPI: {
      privateListFlowsAPI: {
        key: () => ["flows"],
        queryOptions: ({ input }: { input: Record<string, unknown> }) => ({
          queryKey: ["flows", input],
          queryFn: mockListFlows,
        }),
      },
    },
  },
}))

let container: HTMLDivElement | null = null
let root: Root | null = null

const BroadcastEffectProbe = ({ onEffect }: { onEffect: () => void }) => {
  const { appendFilter, getAllActiveFlows, resetFilter } = useFlowStore(
    (state) => state,
  )

  useEffect(() => {
    onEffect()
    appendFilter({ startType: "sendWaTemplateMessage" })
    getAllActiveFlows()
    resetFilter()
  }, [appendFilter, getAllActiveFlows, onEffect, resetFilter])

  return null
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
})

test("does not rerun broadcast filter effects after the flow query settles", async () => {
  mockListFlows.mockResolvedValue({ data: [] })
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  let effectRuns = 0

  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)

  act(() => {
    root?.render(
      <QueryClientProvider client={queryClient}>
        <FlowStoreProvider>
          <BroadcastEffectProbe onEffect={() => effectRuns++} />
        </FlowStoreProvider>
      </QueryClientProvider>,
    )
  })

  await vi.waitFor(() => {
    expect(mockListFlows).toHaveBeenCalled()
  })
  await act(async () => {
    const { promise, resolve } = Promise.withResolvers<void>()
    setTimeout(resolve, 0)
    await promise
  })

  expect(effectRuns).toBe(1)
})
