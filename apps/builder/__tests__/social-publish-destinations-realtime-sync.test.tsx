import { QueryClientProvider } from "@tanstack/react-query"
import { act } from "react"
import { createRoot } from "react-dom/client"
import { describe, expect, test, vi } from "vitest"
import { usePublishDestinationsRealtimeSync } from "@/features/social-accounts/hooks/use-publish-destinations-realtime-sync"
import { orpc } from "@/lib/orpc/query"
import { makeQueryClient } from "./query-test-utils"

type Handler = (event: {
  data: { socialPostId: string; status: string }
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
  usePublishDestinationsRealtimeSync()
  return null
}

const mountAndEmit = (status: string) => {
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
  realtime.handler?.({ data: { socialPostId: "", status } })
  root.unmount()
  return invalidate.mock.calls.map(([filters]) =>
    JSON.stringify(filters?.queryKey),
  )
}

describe("usePublishDestinationsRealtimeSync", () => {
  test.each([
    "scopesRechecked",
    "failed",
  ])("a %s event refetches the destinations", (status) => {
    expect(mountAndEmit(status)).toEqual([
      JSON.stringify(orpc.publishDestinationsAPIs.key()),
    ])
  })

  test.each([
    "processing",
    "published",
    "pending",
    "scheduled",
    "draft",
    "deleted",
    "metricsRefreshed",
  ])("a %s event does not refetch the destinations", (status) => {
    expect(mountAndEmit(status)).toEqual([])
  })
})
