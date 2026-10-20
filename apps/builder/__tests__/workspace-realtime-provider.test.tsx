import { RealtimeFatalError } from "@chatbotx.io/realtime-protocol"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, expect, test, vi } from "vitest"
import { resetRealtimeWarnLimiterForTests } from "@/features/realtime/realtime-warn-limiter"
import { useWorkspaceRealtimeEvents } from "@/features/realtime/use-workspace-realtime-events"
import {
  useWorkspaceRealtimeContext,
  WorkspaceRealtimeProvider,
} from "@/features/realtime/workspace-realtime-provider"

const { capturedSocketOptions, loggerWarn, mintToken } = vi.hoisted(() => ({
  capturedSocketOptions: {
    current: null as null | {
      getUrl: () => Promise<string>
      onError: (error: unknown) => void
      onMessage: (data: string) => void
      onOpen: () => void
      onResync: () => void
    },
  },
  loggerWarn: vi.fn(),
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
vi.mock("@/lib/log", () => ({ logger: { warn: loggerWarn } }))
vi.mock("@/features/realtime/use-realtime-socket", () => ({
  useRealtimeSocket: (options: {
    getUrl: () => Promise<string>
    onError: (error: unknown) => void
    onMessage: (data: string) => void
    onOpen: () => void
    onResync: () => void
  }) => {
    capturedSocketOptions.current = options
  },
}))

const Probe = ({
  onConnection,
  onEvent,
  onStatus,
}: {
  onConnection?: (connection: {
    reconnectCount: number
    status: string
  }) => void
  onEvent: (event: unknown) => void
  onStatus?: (status: string) => void
}) => {
  const { reconnectCount, status } = useWorkspaceRealtimeContext()
  useWorkspaceRealtimeEvents({ messageCreated: onEvent })
  onConnection?.({ reconnectCount, status })
  onStatus?.(status)
  return null
}

afterEach(() => {
  capturedSocketOptions.current = null
  loggerWarn.mockClear()
  mintToken.mockClear()
  resetRealtimeWarnLimiterForTests()
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
  await expect(options.getUrl()).resolves.not.toContain("lastSeq")

  act(() => {
    root.unmount()
    options.onMessage(
      JSON.stringify({
        batch: [{ data: { id: "message-2" }, eventType: "messageCreated" }],
        seq: "2-0",
      }),
    )
  })
  expect(onEvent).toHaveBeenCalledOnce()
})

test("stops retries for unauthorized token mints and reports socket errors", async () => {
  const container = document.createElement("div")
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const onStatus = vi.fn()
  const root: Root = createRoot(container)
  mintToken.mockRejectedValueOnce({ status: 401 })

  act(() => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <WorkspaceRealtimeProvider>
          <Probe onEvent={vi.fn()} onStatus={onStatus} />
        </WorkspaceRealtimeProvider>
      </QueryClientProvider>,
    )
  })

  const options = capturedSocketOptions.current
  expect(options).not.toBeNull()
  if (!options) {
    throw new Error("Realtime socket options were not captured")
  }

  await expect(options.getUrl()).rejects.toBeInstanceOf(RealtimeFatalError)

  act(() => {
    options.onError(new RealtimeFatalError("unauthorized"))
  })

  expect(onStatus).toHaveBeenLastCalledWith("revoked")
  expect(loggerWarn).toHaveBeenCalledWith(
    { err: expect.any(RealtimeFatalError), suppressed: false },
    "Workspace realtime: socket connection failed",
  )

  act(() => {
    root.unmount()
  })
})

test("isolates listener failures and increments reconnects only after the first open", () => {
  const container = document.createElement("div")
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const listenerError = new Error("listener failed")
  const onConnection = vi.fn()
  const receivingListener = vi.fn()
  const root: Root = createRoot(container)

  act(() => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <WorkspaceRealtimeProvider>
          <Probe
            onConnection={onConnection}
            onEvent={() => {
              throw listenerError
            }}
          />
          <Probe onEvent={receivingListener} />
        </WorkspaceRealtimeProvider>
      </QueryClientProvider>,
    )
  })

  const options = capturedSocketOptions.current
  expect(options).not.toBeNull()
  if (!options) {
    throw new Error("Realtime socket options were not captured")
  }

  act(() => {
    options.onOpen()
    options.onOpen()
    options.onMessage(
      JSON.stringify({
        batch: [{ data: { id: "message-1" }, eventType: "messageCreated" }],
        seq: "1-0",
      }),
    )
  })

  expect(onConnection).toHaveBeenLastCalledWith({
    reconnectCount: 1,
    status: "open",
  })
  expect(receivingListener).toHaveBeenCalledOnce()
  expect(loggerWarn).toHaveBeenCalledWith(
    {
      err: listenerError,
      eventType: "messageCreated",
      suppressed: false,
    },
    "Workspace realtime: a listener threw while handling an event",
  )

  act(() => {
    root.unmount()
  })
})

test("drops invalid event data and requests a cache resync", () => {
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

  act(() => {
    options.onMessage(
      JSON.stringify({
        batch: [
          { data: {}, eventType: "whatsappCallTransportIncoming" },
          { data: { id: "message-1" }, eventType: "messageCreated" },
        ],
        seq: "1-0",
      }),
    )
  })

  expect(onEvent).toHaveBeenCalledWith({
    data: { id: "message-1" },
    eventType: "messageCreated",
  })
  expect(invalidateQueries).toHaveBeenCalled()
  expect(loggerWarn).toHaveBeenCalledWith(
    {
      err: expect.any(Error),
      eventType: "whatsappCallTransportIncoming",
      suppressed: false,
    },
    "Workspace realtime: event failed schema validation",
  )

  act(() => {
    root.unmount()
  })
})
