import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { CONNECT_CHANNEL_REGISTRY } from "@/features/channel-connect/lib/registry"
import type { MessengerPickerItem } from "@/features/integration-messenger/components/messenger-pages"

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

const selectableItem: MessengerPickerItem = {
  id: "page-selectable",
  name: "Selectable Page",
  secondary: "page-selectable",
  isConnectable: true,
  isAlreadyConnected: false,
}

const notAdminItem: MessengerPickerItem = {
  id: "page-not-admin",
  name: "Not Admin Page",
  secondary: "page-not-admin",
  disabled: true,
  disabledReason: "messenger.selectPage.notAdminNote",
  isConnectable: false,
  isAlreadyConnected: false,
}

const connectedItem: MessengerPickerItem = {
  id: "page-connected",
  name: "Connected Page",
  secondary: "page-connected",
  disabled: true,
  disabledReason: "messenger.selectPage.alreadyConnectedNote",
  isConnectable: false,
  isAlreadyConnected: true,
}

const connectableButConnectedItem: MessengerPickerItem = {
  id: "page-connectable-but-connected",
  name: "Connectable But Connected Page",
  secondary: "page-connectable-but-connected",
  disabled: true,
  disabledReason: "messenger.selectPage.alreadyConnectedNote",
  isConnectable: true,
  isAlreadyConnected: true,
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

  function renderPages(items: MessengerPickerItem[]) {
    act(() => {
      root.render(<MessengerPages items={items} workspaceId="ws-1" />)
    })
  }

  const checkboxes = () =>
    Array.from(container.querySelectorAll<HTMLElement>('[role="checkbox"]'))
  const continueButton = () =>
    Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("actions.continue"),
    )

  test("renders a disabled checkbox with the notAdminNote description for a non-admin page", () => {
    renderPages([selectableItem, notAdminItem])

    // First checkbox is the shared select-all header; row checkboxes follow.
    const rows = checkboxes().slice(1)
    expect(rows).toHaveLength(2)
    const isDisabled = (element?: HTMLElement) =>
      element?.hasAttribute("disabled") ||
      element?.getAttribute("aria-disabled") === "true"
    expect(isDisabled(rows[0])).toBe(false)
    expect(isDisabled(rows[1])).toBe(true)
    expect(container.textContent).toContain("messenger.selectPage.notAdminNote")
  })

  test("shows the no-connectable-pages warning when nothing is selectable due to a not-admin page", () => {
    renderPages([notAdminItem, connectedItem])

    expect(container.textContent).toContain(
      "messenger.selectPage.noConnectablePagesTitle",
    )
    expect(container.textContent).toContain(
      "messenger.selectPage.noConnectablePagesDescription",
    )
  })

  test("does not show the not-admin warning when every page is merely already connected", () => {
    renderPages([connectedItem, connectableButConnectedItem])

    expect(container.textContent).not.toContain(
      "messenger.selectPage.noConnectablePagesTitle",
    )
  })

  test("does not show the no-connectable-pages warning when at least one page is selectable", () => {
    renderPages([selectableItem, notAdminItem])

    expect(container.textContent).not.toContain(
      "messenger.selectPage.noConnectablePagesTitle",
    )
  })

  test("renders the no-pages alert with no checkboxes when there are zero items", () => {
    renderPages([])

    expect(container.textContent).toContain("messenger.selectPage.noPagesTitle")
    expect(checkboxes()).toHaveLength(0)
  })

  test("submitting a single selected item posts only { pageId } to the messenger connect route — no token, no workspaceId", async () => {
    mockConnectViaApi.mockResolvedValue({
      kind: "outcome",
      outcome: {
        sourceId: "page-selectable",
        name: "Selectable Page",
        status: "connected",
        coexistEligible: false,
      },
    })
    renderPages([selectableItem, notAdminItem])

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
    // Ids only, and the channel's own route — no token, no workspaceId.
    expect(mockConnectViaApi.mock.calls[0]?.[0]).toMatchObject({
      // The registry entry itself — it now carries the typed oRPC procedure,
      // so identity is what pins the channel, not a URL string.
      route: CONNECT_CHANNEL_REGISTRY.messenger.connectRoute,
      body: { pageId: "page-selectable" },
    })
    expect(
      Object.keys(mockConnectViaApi.mock.calls[0]?.[0]?.body ?? {}),
    ).toEqual(["pageId"])

    await act(async () => {
      await Promise.resolve()
    })
    expect(mockPush).toHaveBeenCalledWith(
      "/space/ws-1/settings/channels/messenger",
    )
  })

  test("a not-admin or already-connected page renders no coexist switch, only the selectable one does", () => {
    renderPages([selectableItem, notAdminItem, connectedItem])

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
    renderPages([selectableItem, notAdminItem])

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
    renderPages([selectableItem, notAdminItem])

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
    renderPages([selectableItem, notAdminItem])

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
    const tryAgainLink = Array.from(container.querySelectorAll("a")).find(
      (link) => link.textContent === "messenger.selectPage.tryAgain",
    )
    expect(tryAgainLink).not.toBeUndefined()
    // The form (and its checkboxes) stays mounted — the operator can still
    // retry the selection instead of being dead-ended.
    expect(checkboxes().length).toBeGreaterThan(0)
    expect(mockPush).not.toHaveBeenCalled()
  })

  test("submitting 2+ selected items opens the batch dialog with exactly the selected items (as a set, no duplicates)", async () => {
    const secondSelectable: MessengerPickerItem = {
      ...selectableItem,
      id: "page-selectable-2",
      name: "Selectable Page 2",
    }
    renderPages([selectableItem, secondSelectable, notAdminItem])

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
      items: MessengerPickerItem[]
    }
    expect(dialogProps.items.map((item) => item.id)).toEqual([
      "page-selectable",
      "page-selectable-2",
    ])
  })
})
