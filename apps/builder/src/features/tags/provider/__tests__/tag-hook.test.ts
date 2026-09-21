// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { useInvalidateTags, useTags } from "../tag-hook"

const { mockListTags } = vi.hoisted(() => ({
  mockListTags: vi.fn(),
}))

vi.mock("@/lib/orpc/orpc", () => ({
  client: {
    tagsAPI: {
      privateListWorkspaceTagsAPI: mockListTags,
    },
  },
}))

const makeQueryClient = () =>
  new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

function TagsProbe({
  workspaceId = "workspace-1",
  onData,
}: {
  workspaceId?: string
  onData?: (data: unknown) => void
}) {
  const tags = useTags(workspaceId)
  onData?.(tags.data)
  return null
}

function InvalidateProbe({
  onReady,
  version: _version = 0,
}: {
  onReady: (fn: () => unknown) => void
  version?: number
}) {
  onReady(useInvalidateTags())
  return null
}

describe("tag query hooks", () => {
  let container: HTMLDivElement
  let root: Root
  let queryClient: QueryClient

  beforeEach(() => {
    vi.clearAllMocks()
    mockListTags.mockResolvedValue({ data: [] })
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

  test("requests tags with the store-compatible input", async () => {
    act(() => {
      root.render(
        createElement(
          QueryClientProvider,
          { client: queryClient },
          createElement(TagsProbe),
        ),
      )
    })

    await vi.waitFor(() => {
      expect(mockListTags).toHaveBeenCalledTimes(1)
    })
    expect(mockListTags).toHaveBeenCalledWith(
      {
        workspaceId: "workspace-1",
        perPage: 999_999_999,
      },
      expect.anything(),
    )
  })

  test("unwraps tag response data", async () => {
    const tags = [{ id: "tag-1", name: "VIP" }]
    let data: unknown
    mockListTags.mockResolvedValue({ data: tags })

    act(() => {
      root.render(
        createElement(
          QueryClientProvider,
          { client: queryClient },
          createElement(TagsProbe, { onData: (nextData) => (data = nextData) }),
        ),
      )
    })

    await vi.waitFor(() => {
      expect(data).toEqual(tags)
    })
  })

  test("keeps the invalidator stable across renders", () => {
    const invalidators: (() => unknown)[] = []

    act(() => {
      root.render(
        createElement(
          QueryClientProvider,
          { client: queryClient },
          createElement(InvalidateProbe, {
            onReady: (fn: () => void) => invalidators.push(fn),
            version: 1,
          }),
        ),
      )
    })
    act(() => {
      root.render(
        createElement(
          QueryClientProvider,
          { client: queryClient },
          createElement(InvalidateProbe, {
            onReady: (fn: () => void) => invalidators.push(fn),
            version: 2,
          }),
        ),
      )
    })

    expect(invalidators).toHaveLength(2)
    expect(invalidators[1]).toBe(invalidators[0])
  })
})
