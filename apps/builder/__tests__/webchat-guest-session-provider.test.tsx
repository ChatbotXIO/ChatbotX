import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, test, vi } from "vitest"
import {
  GuestSessionStoreProvider,
  useGuestSessionStore,
} from "@/features/integration-webchat/providers/store/guest-session-provider"

const mockExecuteAsync = vi.hoisted(() => vi.fn())

vi.mock("next-safe-action/hooks", () => ({
  useAction: () => ({ executeAsync: mockExecuteAsync }),
}))

vi.mock(
  "@/features/integration-webchat/actions/refresh-webchat-access-token.action",
  () => ({
    refreshWebchatAccessTokenAction: {},
  }),
)

vi.mock(
  "@/features/integration-webchat/providers/store/lib/guest-session",
  () => ({
    buildGuestStorageKey: (workspaceId: string, webchatId: string) =>
      `x-conversation-id:${workspaceId}:${webchatId}`,
    GUEST_CONVERSATION_ID_KEY: "conversationId",
    readLegacyGuestId: () => null,
    safeStorageGet: () => null,
    safeStorageSet: () => undefined,
  }),
)

const config = {
  id: "webchat-1",
  workspaceId: "workspace-1",
  persistentMenus: [],
} as unknown as Parameters<typeof GuestSessionStoreProvider>[0]["config"]

const ObservedState = ({
  onRender,
}: {
  onRender: (state: {
    accessToken: string | null
    accessTokenExpiresAt: number | null
  }) => void
}) => {
  const accessToken = useGuestSessionStore((state) => state.accessToken)
  const accessTokenExpiresAt = useGuestSessionStore(
    (state) => state.accessTokenExpiresAt,
  )
  onRender({ accessToken, accessTokenExpiresAt })
  return null
}

let container: HTMLDivElement | null = null
let root: Root | null = null

afterEach(() => {
  vi.useRealTimers()
  if (root) {
    act(() => {
      root?.unmount()
    })
  }
  container?.remove()
  container = null
  root = null
})

describe("GuestSessionStoreProvider", () => {
  test("refreshes the access token five minutes before expiry", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"))
    const initialExpiresAt = Math.floor(Date.now() / 1000) + 5 * 60 + 1
    const refreshedExpiresAt = initialExpiresAt + 30 * 60
    mockExecuteAsync.mockResolvedValue({
      data: {
        accessToken: "t2",
        accessTokenExpiresAt: refreshedExpiresAt,
      },
    })
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    const renders: Array<{
      accessToken: string | null
      accessTokenExpiresAt: number | null
    }> = []

    act(() => {
      root?.render(
        <GuestSessionStoreProvider
          accessToken="t1"
          accessTokenExpiresAt={initialExpiresAt}
          config={config}
          serverGuestConversationId="guest-1"
        >
          <ObservedState onRender={(state) => renders.push(state)} />
        </GuestSessionStoreProvider>,
      )
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })

    expect(mockExecuteAsync).toHaveBeenCalledWith({
      token: "t1",
      webchatId: "webchat-1",
      workspaceId: "workspace-1",
    })
    expect(renders.at(-1)).toEqual({
      accessToken: "t2",
      accessTokenExpiresAt: refreshedExpiresAt,
    })
  })

  test("retries one transient refresh failure before the grace window closes", async () => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"))
    const initialExpiresAt = Math.floor(Date.now() / 1000) + 5 * 60 + 1
    const refreshedExpiresAt = initialExpiresAt + 30 * 60
    mockExecuteAsync
      .mockRejectedValueOnce(new Error("network unavailable"))
      .mockResolvedValueOnce({
        data: {
          accessToken: "t2",
          accessTokenExpiresAt: refreshedExpiresAt,
        },
      })
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    const renders: Array<{
      accessToken: string | null
      accessTokenExpiresAt: number | null
    }> = []

    act(() => {
      root?.render(
        <GuestSessionStoreProvider
          accessToken="t1"
          accessTokenExpiresAt={initialExpiresAt}
          config={config}
          serverGuestConversationId="guest-1"
        >
          <ObservedState onRender={(state) => renders.push(state)} />
        </GuestSessionStoreProvider>,
      )
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
      await vi.advanceTimersByTimeAsync(30 * 1000)
    })

    expect(mockExecuteAsync).toHaveBeenCalledTimes(2)
    expect(renders.at(-1)).toEqual({
      accessToken: "t2",
      accessTokenExpiresAt: refreshedExpiresAt,
    })
  })

  test("does not overlap a visibility refresh with an active timer refresh", async () => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"))
    const initialExpiresAt = Math.floor(Date.now() / 1000) + 5 * 60 + 1
    mockExecuteAsync.mockImplementation(() => new Promise(() => undefined))
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    act(() => {
      root?.render(
        <GuestSessionStoreProvider
          accessToken="t1"
          accessTokenExpiresAt={initialExpiresAt}
          config={config}
          serverGuestConversationId="guest-1"
        >
          <ObservedState onRender={() => undefined} />
        </GuestSessionStoreProvider>,
      )
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
      document.dispatchEvent(new Event("visibilitychange"))
    })

    expect(mockExecuteAsync).toHaveBeenCalledTimes(1)
  })
})
