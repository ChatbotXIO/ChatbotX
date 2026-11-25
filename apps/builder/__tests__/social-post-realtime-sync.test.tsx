import { QueryClientProvider } from "@tanstack/react-query"
import { act } from "react"
import { createRoot } from "react-dom/client"
import { describe, expect, test, vi } from "vitest"
import { useSocialPostRealtimeSync } from "@/features/social-posts/hooks/use-social-post-realtime-sync"
import { orpc } from "@/lib/orpc/query"
import { makeQueryClient } from "./query-test-utils"

type Handler = (event: {
  data: { socialPostId: string; status: string; targetId?: string }
}) => void

const realtime = vi.hoisted(() => ({ handler: null as Handler | null }))
vi.mock("@/features/realtime/use-workspace-realtime-events", () => ({
  useWorkspaceRealtimeEvents: (handlers: { socialPostChanged: Handler }) => {
    realtime.handler = handlers.socialPostChanged
  },
}))
vi.mock("@chatbotx.io/ui/hooks/use-debounced-callback", () => ({
  useDebouncedCallback: (callback: () => void) => callback,
}))

function Probe() {
  useSocialPostRealtimeSync()
  return null
}

describe("useSocialPostRealtimeSync", () => {
  test("a socialPostChanged event refetches the list, its counts, the calendar's pages, the post detail and the channel post list", () => {
    const queryClient = makeQueryClient()
    const invalidate = vi.spyOn(queryClient, "invalidateQueries")
    const root = createRoot(document.createElement("div"))
    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <Probe />
        </QueryClientProvider>,
      )
    })

    realtime.handler?.({
      data: { socialPostId: "p1", status: "failed", targetId: "t1" },
    })

    const keys = invalidate.mock.calls.map(([filters]) =>
      JSON.stringify(filters?.queryKey),
    )
    expect(keys).toEqual([
      JSON.stringify(orpc.socialPostsAPIs.privateListSocialPostsAPI.key()),
      JSON.stringify(orpc.socialPostsAPIs.privateCountSocialPostsAPI.key()),
      JSON.stringify(orpc.socialPostsAPIs.privateGetSocialPostAPI.key()),
      JSON.stringify(
        orpc.channelPostManagementAPIs.privateListManagedChannelPostsAPI.key(),
      ),
    ])
    root.unmount()
  })
})
