// @vitest-environment jsdom

import { QueryClientProvider } from "@tanstack/react-query"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { makeQueryClient } from "../../../../__tests__/query-test-utils"

const mintToken = vi.fn().mockResolvedValue({ token: "tok_123" })

vi.mock("@/lib/orpc/orpc", () => ({
  client: {
    realtimeAPI: {
      mintWorkspaceConnectTokenAuthenticatedAPI: mintToken,
    },
  },
}))

vi.mock("@/hooks/routing", () => ({
  useWorkspaceId: () => "ws_123",
}))

vi.mock("@/features/tenant", () => ({
  useTenantSettings: () => ({ publicRealtimeUrl: "https://realtime.test" }),
}))

type CapturedSocketOptions = {
  getUrl: () => Promise<string>
  onClose?: (event: { code: number; reason: string }) => void
  onOpen?: () => void
  onResync?: () => void
}

const capturedOptions: { current: CapturedSocketOptions | null } = {
  current: null,
}

vi.mock("@chatbotx.io/realtime-protocol", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@chatbotx.io/realtime-protocol")>()
  return {
    ...actual,
    RealtimeSocket: class {
      connect = vi.fn()
      close = vi.fn()
      reconnectNow = vi.fn()
      constructor(options: CapturedSocketOptions) {
        capturedOptions.current = options
      }
    },
  }
})

describe("WorkspaceRealtimeProvider resync lastSeq handling", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
    capturedOptions.current = null
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.clearAllMocks()
  })

  it("omits lastSeq after a resync instead of sending the stale 0-0 cursor", async () => {
    const { WorkspaceRealtimeProvider } = await import(
      "../workspace-realtime-provider"
    )
    const queryClient = makeQueryClient()

    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <WorkspaceRealtimeProvider>
            <div />
          </WorkspaceRealtimeProvider>
        </QueryClientProvider>,
      )
    })

    const options = capturedOptions.current
    if (!options) {
      throw new Error("RealtimeSocket was not constructed")
    }

    // Brand-new connection: no cursor yet, no "0-0" sent either.
    const firstUrl = new URL(await options.getUrl())
    expect(firstUrl.searchParams.has("lastSeq")).toBe(false)

    // Once connected, a later reconnect with no batch processed must fall
    // back to the known-ancient "0-0" cursor so the server can decide
    // whether to resync us.
    act(() => {
      options.onOpen?.()
    })
    const secondUrl = new URL(await options.getUrl())
    expect(secondUrl.searchParams.get("lastSeq")).toBe("0-0")

    // A resync must clear the "has ever connected" flag along with the
    // cursor — otherwise the very next getUrl() sends "0-0" again, the
    // server replies replay-window-expired, and the client loops forever
    // (PR #1349 finding #1).
    act(() => {
      options.onResync?.()
    })
    const thirdUrl = new URL(await options.getUrl())
    expect(thirdUrl.searchParams.has("lastSeq")).toBe(false)
  })
})
