import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, expect, test, vi } from "vitest"
import { useWorkspaceRealtimeEvents } from "@/features/realtime/use-workspace-realtime-events"
import { WorkspaceRealtimeProvider } from "@/features/realtime/workspace-realtime-provider"

const { capturedSocketOptions, mintToken } = vi.hoisted(() => ({
  capturedSocketOptions: {
    current: null as null | {
      getUrl: () => Promise<string>
      onMessage: (data: string) => void
      onResync: () => void
    },
  },
  mintToken: vi.fn().mockResolvedValue({ token: "token-1" }),
}))

vi.mock("@/hooks/routing", () => ({ useWorkspaceId: () => "workspace-1" }))
vi.mock("@/features/tenant", () => ({
  useTenantSettings: () => ({ publicRealtimeUrl: "wss://app.test/ws/" }),
}))
vi.mock("@/lib/orpc/orpc", () => ({
  client: {
    realtimeAPI: { mintWorkspaceConnectTokenAuthenticatedAPI: mintToken },
  },
}))
vi.mock("@/lib/log", () => ({ logger: { warn: vi.fn() } }))
vi.mock("@/features/realtime/use-realtime-socket", () => ({
  useRealtimeSocket: (options: {
    getUrl: () => Promise<string>
    onMessage: (data: string) => void
    onResync: () => void
  }) => {
    capturedSocketOptions.current = options
  },
}))

const Probe = ({ onEvent }: { onEvent: (event: unknown) => void }) => {
  useWorkspaceRealtimeEvents({ messageCreated: onEvent })
  return null
}

afterEach(() => {
  capturedSocketOptions.current = null
  mintToken.mockClear()
})

test("uses v2 batch frames and resumes from the last sequence", async () => {
  const container = document.createElement("div")
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries")
  const onEvent = vi.fn()
  const root: Root = createRoot(container)

  act(() => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <WorkspaceRealtimeProvider>
          <Probe onEvent={onEvent} />
        </WorkspaceRealtimeProvider>
      </QueryClientProvider>,
    )
  })

  const options = capturedSocketOptions.current
  expect(options).not.toBeNull()
  if (!options) {
    throw new Error("Realtime socket options were not captured")
  }

  await expect(options.getUrl()).resolves.toBe(
    "wss://app.test/ws/rt/workspaces/workspace-1?token=token-1",
  )

  act(() => {
    options.onMessage(
      JSON.stringify({
        batch: [{ data: { id: "message-1" }, eventType: "messageCreated" }],
        seq: "1-0",
      }),
    )
  })
  expect(onEvent).toHaveBeenCalledWith({
    data: { id: "message-1" },
    eventType: "messageCreated",
  })

  await expect(options.getUrl()).resolves.toContain("lastSeq=1-0")
  act(() => {
    options.onResync()
  })
  expect(invalidateQueries).toHaveBeenCalled()

  act(() => {
    root.unmount()
  })
})
