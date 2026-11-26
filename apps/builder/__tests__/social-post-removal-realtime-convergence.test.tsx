// @vitest-environment jsdom
import { QueryClientProvider, useQuery } from "@tanstack/react-query"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { useSocialPostRealtimeSync } from "@/features/social-posts/hooks/use-social-post-realtime-sync"
import { orpc } from "@/lib/orpc/query"
import { makeQueryClient } from "./query-test-utils"

type Handler = () => void
type RemovedMap = Record<string, boolean>

const realtime = vi.hoisted(() => ({ handler: null as Handler | null }))
vi.mock("@/features/realtime/use-workspace-realtime-events", () => ({
  useWorkspaceRealtimeEvents: (handlers: { socialPostChanged: Handler }) => {
    realtime.handler = handlers.socialPostChanged
  },
}))

const FETCH_LATENCY_MS = 1000
const POST_INPUT = { id: "p1", workspaceId: "ws-1" }

/** Two removal jobs finish `gapMs` apart; each commits its row, then announces it (the order `markRemoved` uses). */
const setup = (seen: RemovedMap[]) => {
  const server: RemovedMap = { t1: false, t2: false }
  const queryClient = makeQueryClient()
  const baseOptions = orpc.socialPostsAPIs.privateGetSocialPostAPI.queryOptions(
    { input: POST_INPUT },
  )
  function Probe() {
    useSocialPostRealtimeSync()
    useQuery({
      ...baseOptions,
      queryFn: async () => {
        // The database is read when the request starts; the answer comes later.
        const snapshot = { ...server }
        await new Promise((resolve) => setTimeout(resolve, FETCH_LATENCY_MS))
        seen.push(snapshot)
        return snapshot as never
      },
    })
    return null
  }
  const root = createRoot(document.createElement("div"))
  act(() => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <Probe />
      </QueryClientProvider>,
    )
  })
  const finish = (targetId: string) => {
    server[targetId] = true
    realtime.handler?.()
  }
  return { finish, root }
}

describe("two removal events close together (docs/posts.md, Removing a post)", () => {
  let root: Root | null = null
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    act(() => root?.unmount())
    vi.useRealTimers()
  })

  test.each([
    ["inside one debounce window", 100],
    ["while the first refetch is in flight", 600],
    ["just after the first refetch answered", 1500],
    ["at the max-wait edge", 1900],
  ])("the last fetch sees both rows removed: second event %s (+%ims)", async (_name, gapMs) => {
    const seen: RemovedMap[] = []
    const harness = setup(seen)
    root = harness.root
    await act(async () => {
      await vi.advanceTimersByTimeAsync(FETCH_LATENCY_MS)
    })
    seen.length = 0

    harness.finish("t1")
    await act(async () => {
      await vi.advanceTimersByTimeAsync(gapMs)
    })
    harness.finish("t2")
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })

    expect(seen.at(-1)).toEqual({ t1: true, t2: true })
  })
})
