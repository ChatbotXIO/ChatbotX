// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, test, vi } from "vitest"
import { SharePostPicker } from "@/features/channel-posts/components/share-post-picker"

const mockUseInfiniteQuery = vi.fn()
const mockDebounced = vi.fn()

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))
vi.mock("@tanstack/react-query", () => ({
  useInfiniteQuery: (...args: unknown[]) => mockUseInfiniteQuery(...args),
}))
vi.mock("@/hooks/routing", () => ({ useWorkspaceId: () => "ws-1" }))
vi.mock("@/hooks/use-debounced-value", () => ({
  useDebouncedValue: (value: string) => mockDebounced(value),
}))
vi.mock("@/lib/orpc/query", () => ({
  orpc: {
    channelPostManagementAPIs: {
      privateListPickerChannelPostsAPI: { infiniteOptions: () => ({}) },
    },
  },
}))

let root: Root | undefined
let container: HTMLDivElement | undefined

const render = () => {
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
  act(() => {
    root?.render(
      <SharePostPicker inboxId="i1" onSelect={vi.fn()} selectedId={null} />,
    )
  })
  return container
}

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  vi.clearAllMocks()
})

const emptyResult = {
  data: { pages: [{ items: [] }] },
  hasNextPage: false,
  isError: false,
  isPending: false,
}

describe("SharePostPicker empty states", () => {
  test("no posts and no search: the inbox has no posts yet", () => {
    mockUseInfiniteQuery.mockReturnValue(emptyResult)
    mockDebounced.mockReturnValue("")
    expect(render().textContent).toContain("flows.sendChannelPost.empty")
  })

  test("a search with no results: nothing matches the search", () => {
    mockUseInfiniteQuery.mockReturnValue(emptyResult)
    mockDebounced.mockReturnValue("summer")
    const text = render().textContent
    expect(text).toContain("flows.sendChannelPost.noMatch")
    expect(text).not.toContain("flows.sendChannelPost.empty")
  })
})
