import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, test, vi } from "vitest"
import {
  GuestSessionStoreProvider,
  useGuestSessionStore,
} from "@/features/integration-webchat/providers/store/guest-session-provider"

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
    embeddingOrigin: string | null
    accessToken: string | null
  }) => void
}) => {
  const embeddingOrigin = useGuestSessionStore((s) => s.embeddingOrigin)
  const accessToken = useGuestSessionStore((s) => s.accessToken)
  onRender({ embeddingOrigin, accessToken })
  return null
}

let container: HTMLDivElement | null = null
let root: Root | null = null

afterEach(() => {
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
  test("freezes accessToken and embeddingOrigin at first render, ignoring later prop changes (RSC refresh)", () => {
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    const renders: Array<{
      embeddingOrigin: string | null
      accessToken: string | null
    }> = []
    const onRender = (state: {
      embeddingOrigin: string | null
      accessToken: string | null
    }) => renders.push(state)

    act(() => {
      root?.render(
        <GuestSessionStoreProvider
          accessToken="t1"
          config={config}
          embeddingOrigin="https://www.example.com"
          serverGuestConversationId="guest-1"
        >
          <ObservedState onRender={onRender} />
        </GuestSessionStoreProvider>,
      )
    })

    // Simulates the RSC refresh after the guest-init server action: the
    // referer is now the iframe's own URL, so the server mints a different
    // token bound to a different origin — both must be ignored, since the
    // store's useRef guard only seeds state from the first render.
    act(() => {
      root?.render(
        <GuestSessionStoreProvider
          accessToken="t2"
          config={config}
          embeddingOrigin="https://chat.example.com/webchat?x"
          serverGuestConversationId="guest-1"
        >
          <ObservedState onRender={onRender} />
        </GuestSessionStoreProvider>,
      )
    })

    expect(renders.at(-1)).toEqual({
      embeddingOrigin: "https://www.example.com",
      accessToken: "t1",
    })
  })
})
