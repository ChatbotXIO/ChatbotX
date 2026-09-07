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
// `channel-connect` level — here they're capture stubs so this file can
// assert SelectFacebookAccounts hands them exactly the right props without
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

const { SelectFacebookAccounts } = await import(
  "@/features/integration-instagram/components/select-facebook-accounts"
)

const selectableItem: ConnectPickerItem = {
  id: "ig-selectable",
  name: "Selectable Account",
  secondary: "@selectable",
}

const connectedItem: ConnectPickerItem = {
  id: "ig-connected",
  name: "Connected Account",
  secondary: "@connected",
  disabled: true,
  disabledReason: "instagram.selectPage.alreadyConnectedNote",
}

describe("SelectFacebookAccounts", () => {
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

  function renderAccounts(items: ConnectPickerItem[]) {
    act(() => {
      root.render(<SelectFacebookAccounts items={items} workspaceId="ws-1" />)
    })
  }

  const checkboxes = () =>
    Array.from(container.querySelectorAll<HTMLElement>('[role="checkbox"]'))
  const continueButton = () =>
    Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("actions.continue"),
    )

  test("renders the no-accounts alert with no checkboxes when there are zero items", () => {
    renderAccounts([])

    expect(container.textContent).toContain(
      "instagram.selectPage.noAccountsTitle",
    )
    expect(checkboxes()).toHaveLength(0)
  })

  test("renders a disabled checkbox with the already-connected note for a connected account", () => {
    renderAccounts([selectableItem, connectedItem])

    // First checkbox is the shared select-all header; row checkboxes follow.
    const rows = checkboxes().slice(1)
    expect(rows).toHaveLength(2)
    const isDisabled = (element?: HTMLElement) =>
      element?.hasAttribute("disabled") ||
      element?.getAttribute("aria-disabled") === "true"
    expect(isDisabled(rows[0])).toBe(false)
    expect(isDisabled(rows[1])).toBe(true)
    expect(container.textContent).toContain(
      "instagram.selectPage.alreadyConnectedNote",
    )
  })

  test("submitting a single selected item posts only { igId } to the instagram-via-facebook connect route — no token, no workspaceId", async () => {
    mockConnectViaApi.mockResolvedValue({
      kind: "outcome",
      outcome: {
        sourceId: "ig-selectable",
        name: "Selectable Account",
        status: "connected",
        coexistEligible: false,
      },
    })
    renderAccounts([selectableItem, connectedItem])

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
      route: CONNECT_CHANNEL_REGISTRY.instagram.connectRoute,
      body: { igId: "ig-selectable" },
    })
    expect(
      Object.keys(mockConnectViaApi.mock.calls[0]?.[0]?.body ?? {}),
    ).toEqual(["igId"])

    await act(async () => {
      await Promise.resolve()
    })
    expect(mockPush).toHaveBeenCalledWith(
      "/space/ws-1/settings/channels/instagram",
    )
  })

  test("an already-connected account renders no coexist switch, only the selectable one does", () => {
    renderAccounts([selectableItem, connectedItem])

    const switches = Array.from(
      container.querySelectorAll<HTMLElement>('[role="switch"]'),
    )
    expect(switches).toHaveLength(1)
    expect(switches[0]?.getAttribute("aria-label")).toBe(
      "channels.connectMany.stepCoexist — Selectable Account",
    )
  })

  test("a single row whose sync-history switch is on runs the coexist call before navigating", async () => {
    mockConnectViaApi.mockResolvedValue({
      kind: "outcome",
      outcome: {
        sourceId: "ig-selectable",
        name: "Selectable Account",
        status: "connected",
        coexistEligible: true,
        integrationId: "int-1",
      },
    })
    mockSetCoexist.mockResolvedValue({ ok: true })
    renderAccounts([selectableItem, connectedItem])

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
      channel: "instagram",
      integrationId: "int-1",
      enabled: true,
    })

    await act(async () => {
      await Promise.resolve()
    })
    expect(mockPush).toHaveBeenCalledWith(
      "/space/ws-1/settings/channels/instagram",
    )
  })

  test("a sessionError outcome renders the destructive alert with the try-again link and keeps the form rendered", async () => {
    mockConnectViaApi.mockResolvedValue({
      kind: "sessionError",
      code: "sessionExpired",
    })
    renderAccounts([selectableItem, connectedItem])

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
      (link) => link.textContent === "instagram.selectPage.tryAgain",
    )
    expect(tryAgainLink).not.toBeUndefined()
    expect(checkboxes().length).toBeGreaterThan(0)
    expect(mockPush).not.toHaveBeenCalled()
  })

  test("submitting 2+ selected items opens the batch dialog with exactly the selected items (as a set, no duplicates)", async () => {
    const secondSelectable: ConnectPickerItem = {
      ...selectableItem,
      id: "ig-selectable-2",
      name: "Selectable Account 2",
    }
    renderAccounts([selectableItem, secondSelectable, connectedItem])

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
      "ig-selectable",
      "ig-selectable-2",
    ])
  })
})
