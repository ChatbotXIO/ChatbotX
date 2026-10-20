import { RealtimeFatalError } from "@chatbotx.io/realtime-protocol"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, expect, test, vi } from "vitest"
import {
  reloadGuestSessionAfterFatalRealtimeError,
  WebchatRealtime,
} from "@/features/integration-webchat/webchat-realtime"

const { capturedSocketOptions, loggerWarn } = vi.hoisted(() => ({
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
}))

vi.mock("@/features/tenant", () => ({
  useTenantSettings: () => ({ publicRealtimeUrl: "wss://app.test/ws/" }),
}))
vi.mock("@/lib/log", () => ({ logger: { warn: loggerWarn } }))
vi.mock(
  "@/features/integration-webchat/providers/store/guest-session-provider",
  () => ({
    useGuestSessionStore: (selector: (state: unknown) => unknown) =>
      selector({
        handleNewMessage: vi.fn(),
        setIsTyping: vi.fn(),
      }),
  }),
)
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

afterEach(() => {
  capturedSocketOptions.current = null
  loggerWarn.mockClear()
  vi.unstubAllGlobals()
})

test("reloads the guest session after an expired access token fails a reconnect", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(null, { status: 403 })),
  )

  const container = document.createElement("div")
  const root: Root = createRoot(container)
  act(() => {
    root.render(
      <WebchatRealtime
        accessToken="access-token-1"
        guestConversationId="workspace-1:guest-1"
        parentOrigin="https://example.com"
        webchatId="webchat-1"
        workspaceId="workspace-1"
      />,
    )
  })

  const options = capturedSocketOptions.current
  expect(options).not.toBeNull()
  if (!options) {
    throw new Error("Realtime socket options were not captured")
  }

  await expect(options.getUrl()).rejects.toBeInstanceOf(RealtimeFatalError)

  const reload = vi.fn()
  expect(
    reloadGuestSessionAfterFatalRealtimeError({
      error: new RealtimeFatalError("expired"),
      hasOpened: false,
      reload,
    }),
  ).toBe(false)
  expect(
    reloadGuestSessionAfterFatalRealtimeError({
      error: new RealtimeFatalError("expired"),
      hasOpened: true,
      reload,
    }),
  ).toBe(true)
  expect(reload).toHaveBeenCalledOnce()

  act(() => {
    options.onError(new RealtimeFatalError("realtime access revoked"))
  })
  expect(loggerWarn).toHaveBeenCalledWith(
    { err: expect.any(RealtimeFatalError), suppressed: false },
    "Webchat realtime: socket connection failed",
  )

  act(() => {
    root.unmount()
  })
})

test("keeps guest conversation ids unescaped in the proxied realtime route", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(Response.json({ token: "realtime-token" })),
  )

  const container = document.createElement("div")
  const root: Root = createRoot(container)
  act(() => {
    root.render(
      <WebchatRealtime
        accessToken="access-token-1"
        guestConversationId="workspace-1:guest-1"
        webchatId="webchat-1"
        workspaceId="workspace-1"
      />,
    )
  })

  const options = capturedSocketOptions.current
  expect(options).not.toBeNull()
  if (!options) {
    throw new Error("Realtime socket options were not captured")
  }

  const socketUrl = new URL(await options.getUrl())
  expect(socketUrl.pathname).toBe("/ws/rt/guests/workspace-1:guest-1")
  expect(socketUrl.searchParams.get("token")).toBe("realtime-token")

  act(() => {
    root.unmount()
  })
})
