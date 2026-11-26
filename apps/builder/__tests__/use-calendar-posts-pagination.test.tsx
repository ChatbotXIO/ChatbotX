import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, describe, expect, test, vi } from "vitest"

const query = vi.hoisted(() => ({
  result: {} as Record<string, unknown>,
  fetchNextPage: vi.fn(),
}))
vi.mock("@tanstack/react-query", () => ({
  useInfiniteQuery: () => ({
    fetchNextPage: query.fetchNextPage,
    ...query.result,
  }),
  useQuery: vi.fn(),
}))
vi.mock("@/lib/orpc/query", () => ({
  orpc: {
    socialPostsAPIs: {
      privateListSocialPostsAPI: {
        infiniteOptions: (options: unknown) => options,
      },
    },
  },
}))

const { usePostsQuery } = await import(
  "../src/features/social-posts/hooks/use-calendar-posts"
)

const WINDOW = { from: new Date("2026-10-01"), to: new Date("2026-11-01") }
const page = { items: [], nextCursor: { id: "c" } }
let latest: ReturnType<typeof usePostsQuery> | null = null

const Probe = () => {
  latest = usePostsQuery(
    "ws",
    { destinationId: null, provider: null },
    { bucket: undefined, window: WINDOW },
  )
  return null
}

const mount = () => {
  const container = document.createElement("div")
  const root = createRoot(container)
  act(() => {
    root.render(<Probe />)
  })
  return root
}

afterEach(() => {
  query.fetchNextPage.mockReset()
  latest = null
})

describe("usePostsQuery pagination", () => {
  test("keeps loading further pages while they succeed", () => {
    query.result = {
      data: { pages: [page] },
      hasNextPage: true,
      isFetchNextPageError: false,
      isFetchingNextPage: false,
    }
    const root = mount()

    expect(query.fetchNextPage).toHaveBeenCalled()
    expect(latest?.isLoading).toBe(true)
    act(() => root.unmount())
  })

  test("stops auto-loading after a failed next page and lets the member retry", () => {
    query.result = {
      data: { pages: [page] },
      hasNextPage: true,
      isFetchNextPageError: true,
      isFetchingNextPage: false,
    }
    const root = mount()

    expect(query.fetchNextPage).not.toHaveBeenCalled()
    expect(latest?.isLoading).toBe(false)
    expect(latest?.isLoadMoreError).toBe(true)

    latest?.loadMore()
    expect(query.fetchNextPage).toHaveBeenCalledTimes(1)
    act(() => root.unmount())
  })
})
