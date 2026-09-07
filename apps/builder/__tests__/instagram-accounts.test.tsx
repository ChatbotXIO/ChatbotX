import type { InstagramAccount } from "@chatbotx.io/integration-instagram"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { INSTAGRAM_DIRECT_CONNECT_ROUTE } from "@/features/channel-connect/lib/registry"

/** Echoes the key back so assertions never depend on the English copy. */
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

const { mockPush, mockConnectViaApi, mockSetCoexist, mockConnectManyDialog } =
  vi.hoisted(() => ({
    mockPush: vi.fn(),
    mockConnectViaApi: vi.fn(),
    mockSetCoexist: vi.fn(),
    mockConnectManyDialog: vi.fn((_props: { items: unknown[] }) => null),
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

vi.mock("@/features/channel-connect/lib/coexist-client", () => ({
  setCoexist: mockSetCoexist,
  coexistUnavailable: (t: (key: string) => string) => ({
    ok: false,
    text: t("coexist.errors.unknown"),
    reported: false,
  }),
}))

// jsdom ships neither — Base UI's Switch measures through them.
Object.assign(globalThis, {
  ResizeObserver: class {
    observe = vi.fn()
    unobserve = vi.fn()
    disconnect = vi.fn()
  },
})
if (typeof globalThis.PointerEvent === "undefined") {
  class PointerEventPolyfill extends MouseEvent {
    constructor(type: string, params: MouseEventInit = {}) {
      super(type, params)
    }
  }
  Object.assign(globalThis, { PointerEvent: PointerEventPolyfill })
}

// `InstagramAccounts` is single-account-only and must never reach the
// multi-select batch dialog — stubbed (as `select-facebook-accounts.test.tsx`
// does) so a future regression that wires it in gets caught here, not just
// left as an unasserted absence.
vi.mock("@/features/channel-connect/components/connect-many-dialog", () => ({
  ConnectManyDialog: mockConnectManyDialog,
}))

const { InstagramAccounts } = await import(
  "@/features/integration-instagram/components/instagram-accounts"
)

const account: InstagramAccount = {
  id: "page-scoped-1",
  name: "IG Direct Account",
  username: "ig_direct",
  userId: "ig-1",
  profile_picture_url: "https://example.com/avatar.jpg",
  accessToken: "account-token-1",
}

describe("InstagramAccounts", () => {
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

  function renderAccount() {
    act(() => {
      root.render(<InstagramAccounts account={account} workspaceId="ws-1" />)
    })
  }

  const continueButton = () =>
    Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("actions.continue"),
    )

  test("renders the account card with name and @username, no batch dialog ever appears", () => {
    renderAccount()

    expect(container.textContent).toContain("IG Direct Account")
    expect(container.textContent).toContain("@ig_direct")
    expect(mockConnectManyDialog).not.toHaveBeenCalled()
  })

  test("clicking continue posts only { igId } to the instagram connect route — no token, no workspaceId, and never opens the batch dialog", async () => {
    mockConnectViaApi.mockResolvedValue({
      kind: "outcome",
      outcome: {
        sourceId: "ig-1",
        name: "IG Direct Account",
        status: "connected",
        coexistEligible: false,
      },
    })
    renderAccount()

    await act(async () => {
      continueButton()?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mockConnectViaApi).toHaveBeenCalledTimes(1)
    // Ids only, and this login's own route — no token, no workspaceId.
    expect(mockConnectViaApi.mock.calls[0]?.[0]).toMatchObject({
      // The direct-login route itself — it now carries the typed oRPC
      // procedure, so identity is what pins this login, not a URL string.
      route: INSTAGRAM_DIRECT_CONNECT_ROUTE,
      body: { igId: "ig-1" },
    })
    expect(
      Object.keys(mockConnectViaApi.mock.calls[0]?.[0]?.body ?? {}),
    ).toEqual(["igId"])
    expect(mockConnectManyDialog).not.toHaveBeenCalled()

    await act(async () => {
      await Promise.resolve()
    })
    expect(mockPush).toHaveBeenCalledWith(
      "/space/ws-1/settings/channels/instagram",
    )
  })

  test("turning the account's sync-history switch on runs the coexist call before navigating", async () => {
    mockConnectViaApi.mockResolvedValue({
      kind: "outcome",
      outcome: {
        sourceId: "ig-1",
        name: "IG Direct Account",
        status: "connected",
        coexistEligible: true,
        integrationId: "int-1",
      },
    })
    mockSetCoexist.mockResolvedValue({ ok: true })
    renderAccount()

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
    expect(mockConnectManyDialog).not.toHaveBeenCalled()

    await act(async () => {
      await Promise.resolve()
    })
    expect(mockPush).toHaveBeenCalledWith(
      "/space/ws-1/settings/channels/instagram",
    )
  })

  test("leaving the sync-history switch off never calls the coexist route", async () => {
    mockConnectViaApi.mockResolvedValue({
      kind: "outcome",
      outcome: {
        sourceId: "ig-1",
        name: "IG Direct Account",
        status: "connected",
        coexistEligible: true,
        integrationId: "int-1",
      },
    })
    renderAccount()

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
      "/space/ws-1/settings/channels/instagram",
    )
  })

  test("a sessionError outcome renders the destructive alert with the try-again link and keeps the card rendered", async () => {
    mockConnectViaApi.mockResolvedValue({
      kind: "sessionError",
      code: "sessionExpired",
    })
    renderAccount()

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
    expect(container.textContent).toContain("IG Direct Account")
    expect(mockPush).not.toHaveBeenCalled()
  })
})
