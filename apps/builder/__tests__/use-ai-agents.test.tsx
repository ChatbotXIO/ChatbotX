// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const { mockListAIAgentsAPI } = vi.hoisted(() => ({
  mockListAIAgentsAPI: vi.fn(),
}))

vi.mock("@/lib/orpc/orpc", () => ({
  client: {
    aiAgentsAPI: {
      listAIAgentsAPI: mockListAIAgentsAPI,
    },
  },
}))

const { useAIAgents, useAIAgentSelectOptions, useInvalidateAIAgents } =
  await import("../src/features/ai-agents/hooks/use-ai-agents")

const makeQueryClient = () =>
  new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

const makeAgent = (id: string, name: string) => ({
  id,
  name,
  workspaceId: "ws1",
})

function AIAgentsProbe({ onRender }: { onRender: (data: unknown) => void }) {
  const { data } = useAIAgents("ws1")
  onRender(data)
  return null
}

function SelectOptionsProbe({
  onRender,
}: {
  onRender: (options: unknown) => void
}) {
  const options = useAIAgentSelectOptions("ws1")
  onRender(options)
  return null
}

function InvalidateProbe({ onReady }: { onReady: (fn: () => void) => void }) {
  onReady(useInvalidateAIAgents())
  return null
}

describe("useAIAgents", () => {
  let container: HTMLDivElement
  let root: Root
  let queryClient: QueryClient

  beforeEach(() => {
    vi.clearAllMocks()
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
  })

  test("dedupes across two components sharing one QueryClient", async () => {
    mockListAIAgentsAPI.mockResolvedValue({
      data: [makeAgent("1", "Agent One")],
      pageCount: 1,
    })

    const renders: unknown[] = []
    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <AIAgentsProbe onRender={(data) => renders.push(data)} />
          <AIAgentsProbe onRender={(data) => renders.push(data)} />
        </QueryClientProvider>,
      )
    })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(mockListAIAgentsAPI).toHaveBeenCalledTimes(1)
  })

  test("does not call the API when workspaceId is undefined", () => {
    function UndefinedWorkspaceProbe() {
      useAIAgents(undefined)
      return null
    }

    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <UndefinedWorkspaceProbe />
        </QueryClientProvider>,
      )
    })

    expect(mockListAIAgentsAPI).not.toHaveBeenCalled()
  })

  test("surfaces a rejected request as an error without throwing", async () => {
    mockListAIAgentsAPI.mockRejectedValue(new Error("boom"))

    let latestData: unknown = "unset"
    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <AIAgentsProbe onRender={(data) => (latestData = data)} />
        </QueryClientProvider>,
      )
    })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(latestData).toBeUndefined()
  })

  test("useInvalidateAIAgents triggers a second fetch", async () => {
    mockListAIAgentsAPI.mockResolvedValue({
      data: [makeAgent("1", "Agent One")],
      pageCount: 1,
    })

    let invalidate: (() => void) | null = null
    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <AIAgentsProbe onRender={() => undefined} />
          <InvalidateProbe onReady={(fn) => (invalidate = fn)} />
        </QueryClientProvider>,
      )
    })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(mockListAIAgentsAPI).toHaveBeenCalledTimes(1)

    await act(async () => {
      invalidate?.()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(mockListAIAgentsAPI).toHaveBeenCalledTimes(2)
  })

  test("useAIAgentSelectOptions maps {id,name} to {value,label}", async () => {
    mockListAIAgentsAPI.mockResolvedValue({
      data: [makeAgent("1", "Agent One"), makeAgent("2", "Agent Two")],
      pageCount: 1,
    })

    let latestOptions: unknown = []
    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <SelectOptionsProbe
            onRender={(options) => (latestOptions = options)}
          />
        </QueryClientProvider>,
      )
    })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(latestOptions).toEqual([
      { value: "1", label: "Agent One" },
      { value: "2", label: "Agent Two" },
    ])
  })
})
