import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import type { ConnectPickerItem } from "@/features/channel-connect/lib/picker-items"
import { CONNECT_CHANNEL_REGISTRY } from "@/features/channel-connect/lib/registry"

/** Echoes the key back so assertions never depend on the English copy. */
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

const { mockPush, mockConnectViaApi, mockConnectManyDialog, mockSetCoexist } =
  vi.hoisted(() => ({
    mockPush: vi.fn(),
    mockConnectViaApi: vi.fn(),
    mockConnectManyDialog: vi.fn((_props: { items: unknown[] }) => null),
    mockSetCoexist: vi.fn(),
  }))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}))

// The real action module is a "use server" file that imports the database
// client and business services — unnecessary (and unsafe) to load for a
// component test. Mocked as a direct next-safe-action-style call: resolves
// to `{ data }` / `{ serverError }`, never rejects.
vi.mock("@/features/channel-connect/lib/connect-client", () => ({
  connectViaApi: mockConnectViaApi,
}))

// The batch dialog and the coexist popup are unit-tested at the shared
// `channel-connect` level (`connect-many-dialog.test.tsx`,
// `use-connect-flow.test.tsx`) — here they're capture stubs so this file can
// assert MessengerPages hands them exactly the right props without
// re-rendering their (heavy) internals.
vi.mock("@/features/channel-connect/components/connect-many-dialog", () => ({
  ConnectManyDialog: mockConnectManyDialog,
}))
vi.mock("@/features/channel-connect/lib/coexist-client", () => ({
  setCoexist: mockSetCoexist,
  coexistUnavailable: (t: (key: string) => string) => ({
    ok: false,
    text: t("coexist.errors.unknown"),
    reported: false,
  }),
}))

// jsdom ships no ResizeObserver/PointerEvent constructors; Base UI's
// checkbox measures/dispatches through them even when nothing is clicked.
if (typeof globalThis.PointerEvent === "undefined") {
  class PointerEventPolyfill extends MouseEvent {
    constructor(type: string, params: MouseEventInit = {}) {
      super(type, params)
    }
  }
  Object.assign(globalThis, { PointerEvent: PointerEventPolyfill })
}
Object.assign(globalThis, {
  ResizeObserver: class {
    observe = vi.fn()
    unobserve = vi.fn()
    disconnect = vi.fn()
  },
})

const { MessengerPages } = await import(
  "@/features/integration-messenger/components/messenger-pages"
)

const selectableItem: ConnectPickerItem = {
  id: "page-selectable",
  name: "Selectable Page",
  secondary: "page-selectable",
}

// A generic disabled row — Messenger's `listCandidates` drops non-admin
// pages before they ever become a session target, so this stands in for any
// disabled row (e.g. already connected elsewhere), not a not-admin-specific
// case the UI no longer renders.
const disabledItem: ConnectPickerItem = {
  id: "page-disabled",
  name: "Disabled Page",
  secondary: "page-disabled",
  disabled: true,
  disabledReason: "messenger.selectPage.alreadyConnectedNote",
}

describe("MessengerPages", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.clearAllMocks()
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  function renderPages(items: ConnectPickerItem[]) {
    act(() => {
      root.render(
        <MessengerPages
          items={items}
          sessionId="session-1"
          workspaceId="ws-1"
        />,
      )
    })
  }

  const checkboxes = () =>
    Array.from(container.querySelectorAll<HTMLElement>('[role="checkbox"]'))
  const continueButton = () =>
    Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("actions.continue"),
    )

  const tryAgainLink = () =>
    Array.from(container.querySelectorAll("a")).find(
      (link) => link.textContent === "messenger.selectPage.tryAgain",
    )

  test("renders a disabled checkbox for a disabled row alongside an enabled one", () => {
    renderPages([selectableItem, disabledItem])

    // First checkbox is the shared select-all header; row checkboxes follow.
    const rows = checkboxes().slice(1)
    expect(rows).toHaveLength(2)
    const isDisabled = (element?: HTMLElement) =>
      element?.hasAttribute("disabled") ||
      element?.getAttribute("aria-disabled") === "true"
    expect(isDisabled(rows[0])).toBe(false)
    expect(isDisabled(rows[1])).toBe(true)
    expect(container.textContent).toContain(
      "messenger.selectPage.alreadyConnectedNote",
    )
  })

  test("empty picker retry preserves workspace ID", () => {
    renderPages([])

    const retryLink = tryAgainLink()
    expect(retryLink?.getAttribute("href")).toBe(
      "/channels/create?workspaceId=ws-1",
    )
  })

  test("renders the no-pages alert with no checkboxes when there are zero items", () => {
    renderPages([])

    expect(container.textContent).toContain("messenger.selectPage.noPagesTitle")
    expect(checkboxes()).toHaveLength(0)
  })

  test("submitting a single selected item posts only { sessionId, pageId } to the messenger connect route — no token, no workspaceId", async () => {
    mockConnectViaApi.mockResolvedValue({
      kind: "outcome",
      outcome: {
        sourceId: "page-selectable",
        name: "Selectable Page",
        status: "connected",
        coexistEligible: false,
      },
    })
    renderPages([selectableItem, disabledItem])

    const [, firstRow] = checkboxes()
    await act(async () => {
      firstRow?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await Promise.resolve()
    })
    await act(async () => {
      continueButton()?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mockConnectViaApi).toHaveBeenCalledTimes(1)
    // Session and page IDs only, and the channel's own route — no token or workspaceId.
    expect(mockConnectViaApi.mock.calls[0]?.[0]).toMatchObject({
      // The registry entry itself — it now carries the typed oRPC procedure,
      // so identity is what pins the channel, not a URL string.
      route: CONNECT_CHANNEL_REGISTRY.messenger.connectRoute,
      body: { sessionId: "session-1", pageId: "page-selectable" },
    })
    expect(
      Object.keys(mockConnectViaApi.mock.calls[0]?.[0]?.body ?? {}),
    ).toEqual(["sessionId", "pageId"])

    await act(async () => {
      await Promise.resolve()
    })
    expect(mockPush).toHaveBeenCalledWith(
      "/space/ws-1/settings/channels/messenger",
    )
  })

  test("a disabled page renders no coexist switch, only the selectable one does", () => {
    renderPages([selectableItem, disabledItem])

    const switches = Array.from(
      container.querySelectorAll<HTMLElement>('[role="switch"]'),
    )
    expect(switches).toHaveLength(1)
    expect(switches[0]?.getAttribute("aria-label")).toBe(
      "channels.connectMany.stepCoexist — Selectable Page",
    )
  })

  test("a single row whose sync-history switch is on runs the coexist call before navigating", async () => {
    mockConnectViaApi.mockResolvedValue({
      kind: "outcome",
      outcome: {
        sourceId: "page-selectable",
        name: "Selectable Page",
        status: "connected",
        coexistEligible: true,
        integrationId: "int-1",
      },
    })
    mockSetCoexist.mockResolvedValue({ ok: true })
    renderPages([selectableItem, disabledItem])

    const [, firstRow] = checkboxes()
    await act(async () => {
      firstRow?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await Promise.resolve()
    })
    const rowSwitch = container.querySelector<HTMLElement>('[role="switch"]')
    await act(async () => {
      rowSwitch?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await Promise.resolve()
    })
    await act(async () => {
      continueButton()?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mockSetCoexist).toHaveBeenCalledTimes(1)
    expect(mockSetCoexist.mock.calls[0]?.[0]).toMatchObject({
      workspaceId: "ws-1",
      channel: "messenger",
      integrationId: "int-1",
      enabled: true,
      aiReadsSyncedHistory: false,
    })

    await act(async () => {
      await Promise.resolve()
    })
    expect(mockPush).toHaveBeenCalledWith(
      "/space/ws-1/settings/channels/messenger",
    )
  })

  test("a single row left with its sync-history switch off never calls the coexist route", async () => {
    mockConnectViaApi.mockResolvedValue({
      kind: "outcome",
      outcome: {
        sourceId: "page-selectable",
        name: "Selectable Page",
        status: "connected",
        coexistEligible: true,
        integrationId: "int-1",
      },
    })
    renderPages([selectableItem, disabledItem])

    const [, firstRow] = checkboxes()
    await act(async () => {
      firstRow?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await Promise.resolve()
    })
    await act(async () => {
      continueButton()?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mockSetCoexist).not.toHaveBeenCalled()
    await act(async () => {
      await Promise.resolve()
    })
    expect(mockPush).toHaveBeenCalledWith(
      "/space/ws-1/settings/channels/messenger",
    )
  })

  test("a sessionError outcome renders the destructive alert with the try-again link and keeps the form rendered", async () => {
    mockConnectViaApi.mockResolvedValue({
      kind: "sessionError",
      code: "sessionExpired",
    })
    renderPages([selectableItem, disabledItem])

    const [, firstRow] = checkboxes()
    await act(async () => {
      firstRow?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await Promise.resolve()
    })
    await act(async () => {
      continueButton()?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(container.textContent).toContain(
      "channels.connectMany.sessionError.sessionExpired",
    )
    expect(tryAgainLink()).not.toBeUndefined()
    expect(tryAgainLink()?.getAttribute("href")).toBe(
      "/channels/create?workspaceId=ws-1",
    )
    // The form (and its checkboxes) stays mounted — the operator can still
    // retry the selection instead of being dead-ended.
    expect(checkboxes().length).toBeGreaterThan(0)
    expect(mockPush).not.toHaveBeenCalled()
  })

  test("submitting 2+ selected items opens the batch dialog with exactly the selected items (as a set, no duplicates)", async () => {
    const secondSelectable: ConnectPickerItem = {
      ...selectableItem,
      id: "page-selectable-2",
      name: "Selectable Page 2",
    }
    renderPages([selectableItem, secondSelectable, disabledItem])

    const [, first, second] = checkboxes()
    await act(async () => {
      first?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      second?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await Promise.resolve()
    })
    await act(async () => {
      continueButton()?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mockConnectViaApi).not.toHaveBeenCalled()
    expect(mockConnectManyDialog).toHaveBeenCalled()
    const dialogProps = mockConnectManyDialog.mock.calls.at(-1)?.[0] as {
      items: ConnectPickerItem[]
    }
    expect(dialogProps.items.map((item) => item.id)).toEqual([
      "page-selectable",
      "page-selectable-2",
    ])
  })
})
