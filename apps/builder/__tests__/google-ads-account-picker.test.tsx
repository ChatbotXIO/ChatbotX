// @vitest-environment jsdom
import { act } from "react"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  queries: [] as unknown[],
  inFlight: vi.fn(),
  session: vi.fn(),
  sessionOptions: undefined as
    | { refetchInterval?: unknown; input?: { id: string } }
    | undefined,
  actions: {} as Record<string, ReturnType<typeof vi.fn>>,
  actionOptions: {} as Record<
    string,
    {
      onSuccess?: () => Promise<void> | void
      onSettled?: () => unknown
      onError?: (args: { error: { serverError?: string } }) => void
    }
  >,
  calls: [] as string[],
  refresh: vi.fn(),
}))

vi.mock("next-intl", async () =>
  (await import("./helpers/google-ads-ui")).nextIntlMock(),
)
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: () => mocks.calls.push("refresh"),
    replace: (url: string) => mocks.calls.push(`replace:${url}`),
  }),
}))
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }))
vi.mock("@/lib/orpc/query", () => ({
  orpc: {
    googleAdsAPI: {
      getInFlightConnectSession: {
        queryOptions: (o: unknown) => ({ k: "inflight", o }),
      },
    },
    connectSessionsAPI: {
      getConnectSessionAPI: {
        queryOptions: (o: {
          refetchInterval?: unknown
          input?: { id: string }
        }) => {
          mocks.sessionOptions = o
          return { k: "session", o }
        },
      },
    },
  },
}))
vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: { k: string }) =>
    options.k === "inflight" ? mocks.inFlight() : mocks.session(),
}))
vi.mock(
  "@/features/integration-google-ads/hooks/use-invalidate-google-ads",
  () => ({
    useInvalidateGoogleAds: () => () => {
      mocks.calls.push("invalidate")
      return Promise.resolve()
    },
  }),
)
for (const [path, name, id] of [
  ["pick-account", "pickGoogleAdsAccountAction", "pick"],
  ["cancel-connect", "cancelGoogleAdsConnectAction", "cancel"],
  ["start-connect", "startGoogleAdsConnectAction", "connect"],
  ["start-reconnect", "startGoogleAdsReconnectAction", "reconnect"],
  ["sync-conversion-actions", "syncGoogleAdsConversionActionsAction", "sync"],
] as const) {
  vi.doMock(`@/features/integration-google-ads/actions/${path}.action`, () => ({
    [name]: { bind: () => id },
  }))
}
vi.mock("next-safe-action/hooks", () => ({
  useAction: (id: string, options: (typeof mocks.actionOptions)[string]) => {
    mocks.actions[id] ??= vi.fn()
    mocks.actionOptions[id] = options
    return { execute: mocks.actions[id], isPending: false }
  },
}))

import {
  buttonByText,
  click,
  type Mounted,
  mount,
} from "./helpers/google-ads-ui"

let ui: Mounted
beforeEach(() => {
  ui = mount()
  mocks.calls.length = 0
  mocks.actions = {}
  mocks.inFlight.mockReturnValue({ isPending: false, data: { session: null } })
  mocks.session.mockReturnValue({ isPending: true, data: undefined })
})
afterEach(() => ui.unmount())

const sessionData = (overrides: Record<string, unknown>) => ({
  id: "s1",
  status: "awaiting_selection",
  errorCode: null,
  targets: [],
  ...overrides,
})

const WORKSPACE_SETTINGS = "/space/ws-1/settings/integrations/google-ads"
const POLL_TIMEOUT_MS = 20_000

const renderPicker = async (
  initial: { id: string; status: string } | null = {
    id: "s1",
    status: "pending",
  },
) => {
  const { AccountPicker } = await import(
    "@/features/integration-google-ads/components/account-picker"
  )
  ui.render(<AccountPicker initialSession={initial} workspaceId="ws-1" />)
}

describe("AccountPicker", () => {
  test("renders nothing without an in-flight session", async () => {
    await renderPicker(null)
    expect(ui.container.textContent).toBe("")
  })

  test("polls every 2s only while pending or authorized", async () => {
    mocks.session.mockReturnValue({
      isPending: false,
      data: sessionData({ status: "pending" }),
    })
    await renderPicker()
    const interval = mocks.sessionOptions?.refetchInterval as (
      q: unknown,
    ) => unknown
    const stateOf = (status: string) => ({ state: { data: { status } } })
    expect(interval(stateOf("pending"))).toBe(2000)
    expect(interval(stateOf("authorized"))).toBe(2000)
    expect(interval(stateOf("awaiting_selection"))).toBe(false)
    expect(interval(stateOf("failed"))).toBe(false)
    expect(ui.container.querySelector("[role=status]")?.textContent).toContain(
      "googleAds.picker.waiting",
    )
  })

  test("cancel calls the cancel action with the session id", async () => {
    mocks.session.mockReturnValue({
      isPending: false,
      data: sessionData({ status: "pending" }),
    })
    await renderPicker()
    click(buttonByText(ui.container, "actions.cancel"))
    expect(mocks.actions.cancel).toHaveBeenCalledWith({ sessionId: "s1" })
  })

  test("lists targets and disables already-connected ones with a reason", async () => {
    mocks.session.mockReturnValue({
      isPending: false,
      data: sessionData({
        targets: [
          { id: "1112223333", name: "Acme", selectable: true },
          {
            id: "4445556666",
            name: "Other",
            selectable: false,
            alreadyConnected: "other_workspace",
          },
          {
            id: "7778889999",
            name: "Mine",
            selectable: false,
            alreadyConnected: "this_workspace",
          },
        ],
      }),
    })
    await renderPicker()
    const radios = Array.from(
      ui.container.querySelectorAll<HTMLInputElement>("input[type=radio]"),
    )
    expect(radios.map((radio) => radio.disabled)).toEqual([false, true, true])
    expect(ui.container.textContent).toContain(
      "googleAds.picker.alreadyOtherWorkspace",
    )
    expect(ui.container.textContent).toContain(
      "googleAds.picker.alreadyThisWorkspace",
    )

    const connect = buttonByText(
      ui.container,
      "googleAds.picker.connectSelected",
    )
    expect(connect?.disabled).toBe(true)
    click(radios[0])
    expect(connect?.disabled).toBe(false)
    click(connect)
    expect(mocks.actions.pick).toHaveBeenCalledWith({
      sessionId: "s1",
      customerId: "1112223333",
    })
  })

  test("invalidates before refreshing after a pick", async () => {
    mocks.session.mockReturnValue({ isPending: false, data: sessionData({}) })
    await renderPicker()
    await act(async () => {
      await mocks.actionOptions.pick.onSuccess?.()
    })
    expect(mocks.calls).toEqual(["invalidate", "refresh"])
  })

  test("a session that completes without a pick (reconnect) re-syncs the setup once, then invalidates and refreshes", async () => {
    mocks.session.mockReturnValue({
      isPending: false,
      data: sessionData({ status: "completed" }),
    })
    await renderPicker({ id: "s1", status: "completed" })
    expect(mocks.actions.sync).toHaveBeenCalledTimes(1)
    expect(mocks.calls).toEqual([])
    await act(async () => {
      await mocks.actionOptions.sync.onSettled?.()
    })
    expect(mocks.calls).toEqual(["invalidate", "refresh"])
  })

  test("a session completed by a pick does not sync a second time", async () => {
    mocks.session.mockReturnValue({
      isPending: false,
      data: sessionData({
        targets: [
          {
            id: "1112223333",
            name: "Acme",
            selectable: true,
            alreadyConnected: null,
          },
        ],
      }),
    })
    await renderPicker()
    click(
      ui.container.querySelectorAll<HTMLInputElement>("input[type=radio]")[0],
    )
    click(buttonByText(ui.container, "googleAds.picker.connectSelected"))

    mocks.session.mockReturnValue({
      isPending: false,
      data: sessionData({ status: "completed" }),
    })
    await renderPicker()
    await act(() => Promise.resolve())

    expect(mocks.actions.sync).not.toHaveBeenCalled()
    expect(mocks.calls).toEqual(["invalidate", "refresh"])
  })

  test.each([
    [
      "failed",
      "googleAds.picker.errors.providerDenied",
      { errorCode: "provider_denied" },
    ],
    ["expired", "googleAds.picker.sessionExpired", {}],
    ["cancelled", "googleAds.picker.sessionCancelled", {}],
  ])("%s session shows a message and only a dismiss button", async (status, message, extra) => {
    mocks.session.mockReturnValue({
      isPending: false,
      data: sessionData({ status, ...extra }),
    })
    await renderPicker()
    expect(ui.container.textContent).toContain(message)
    expect(ui.container.textContent).not.toContain(
      "googleAds.picker.connectAgain",
    )
    expect(ui.container.textContent).not.toContain("googleAds.picker.tryAgain")
    const buttons = Array.from(ui.container.querySelectorAll("button"))
    expect(buttons.map((b) => b.getAttribute("aria-label"))).toEqual([
      "googleAds.picker.dismiss",
    ])
    click(buttons[0])
    expect(ui.container.querySelector('[role="alert"]')).toBeNull()
    expect(mocks.actions.connect).toBeUndefined()
  })

  test("keeps showing the failed session the page was opened for when another is in flight", async () => {
    mocks.inFlight.mockReturnValue({
      isPending: false,
      data: { session: { id: "s2", status: "pending" } },
    })
    mocks.session.mockReturnValue({
      isPending: false,
      data: sessionData({ status: "failed", errorCode: "provider_denied" }),
    })
    await renderPicker({ id: "s1", status: "failed" })
    expect(mocks.sessionOptions?.input?.id).toBe("s1")
    expect(ui.container.textContent).toContain(
      "googleAds.picker.errors.providerDenied",
    )
  })

  test("adopts the in-flight session when the page was opened without one", async () => {
    mocks.inFlight.mockReturnValue({
      isPending: false,
      data: { session: { id: "s2", status: "pending" } },
    })
    mocks.session.mockReturnValue({
      isPending: false,
      data: sessionData({ id: "s2", status: "pending" }),
    })
    await renderPicker(null)
    expect(mocks.sessionOptions?.input?.id).toBe("s2")
  })

  test("shows a retryable error when the session cannot be loaded", async () => {
    const refetch = vi.fn()
    mocks.session.mockReturnValue({
      isPending: false,
      isError: true,
      data: undefined,
      refetch,
    })
    await renderPicker()
    click(buttonByText(ui.container, "actions.retry"))
    expect(refetch).toHaveBeenCalled()
  })

  describe("stalled pending session", () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    const pendingSession = () =>
      mocks.session.mockReturnValue({
        isPending: false,
        data: sessionData({ status: "pending" }),
      })
    const intervalFor = (status: string) =>
      (mocks.sessionOptions?.refetchInterval as (q: unknown) => unknown)({
        state: { data: { status } },
      })

    test("keeps waiting before the timeout", async () => {
      pendingSession()
      await renderPicker()
      act(() => {
        vi.advanceTimersByTime(POLL_TIMEOUT_MS - 1)
      })
      expect(ui.container.textContent).toContain("googleAds.picker.waiting")
      expect(intervalFor("pending")).toBe(2000)
    })

    test("stops polling and shows retry/dismiss after the timeout", async () => {
      pendingSession()
      await renderPicker()
      act(() => {
        vi.advanceTimersByTime(POLL_TIMEOUT_MS)
      })
      expect(ui.container.textContent).toContain("googleAds.picker.stalled")
      expect(ui.container.textContent).not.toContain("googleAds.picker.waiting")
      expect(ui.container.textContent).not.toContain(
        "googleAds.picker.tryAgain",
      )
      expect(
        buttonByText(ui.container, "googleAds.picker.dismiss"),
      ).toBeTruthy()
      expect(intervalFor("pending")).toBe(false)
    })

    test("a session that leaves pending in time never times out", async () => {
      pendingSession()
      await renderPicker()
      mocks.session.mockReturnValue({
        isPending: false,
        data: sessionData({ status: "awaiting_selection" }),
      })
      await renderPicker()
      act(() => {
        vi.advanceTimersByTime(POLL_TIMEOUT_MS * 2)
      })
      expect(ui.container.textContent).not.toContain("googleAds.picker.stalled")
    })

    test("authorized sessions keep polling inside the bound", async () => {
      mocks.session.mockReturnValue({
        isPending: false,
        data: sessionData({ status: "authorized" }),
      })
      await renderPicker({ id: "s1", status: "authorized" })
      act(() => {
        vi.advanceTimersByTime(POLL_TIMEOUT_MS - 1)
      })
      expect(ui.container.textContent).toContain("googleAds.picker.waiting")
      expect(intervalFor("authorized")).toBe(2000)
    })

    test("an authorized session that never reaches the account list stalls after the same bound instead of spinning forever", async () => {
      mocks.session.mockReturnValue({
        isPending: false,
        data: sessionData({ status: "authorized" }),
      })
      await renderPicker({ id: "s1", status: "authorized" })
      act(() => {
        vi.advanceTimersByTime(POLL_TIMEOUT_MS)
      })
      expect(ui.container.textContent).toContain("googleAds.picker.stalled")
      expect(ui.container.textContent).not.toContain("googleAds.picker.waiting")
      expect(ui.container.textContent).not.toContain(
        "googleAds.picker.tryAgain",
      )
      expect(intervalFor("authorized")).toBe(false)
    })

    test("with a connect_error alert on the page, a waiting session renders neither a spinner nor a stalled card", async () => {
      mocks.session.mockReturnValue({
        isPending: false,
        data: sessionData({ status: "authorized" }),
      })
      const { AccountPicker } = await import(
        "@/features/integration-google-ads/components/account-picker"
      )
      ui.render(
        <AccountPicker
          hasConnectError
          initialSession={{ id: "s1", status: "authorized" }}
          workspaceId="ws-1"
        />,
      )
      expect(ui.container.textContent).toBe("")
      act(() => {
        vi.advanceTimersByTime(POLL_TIMEOUT_MS * 2)
      })
      expect(ui.container.textContent).toBe("")
    })

    test("with a connect_error alert, a failed session does not repeat a second failure message", async () => {
      mocks.session.mockReturnValue({
        isPending: false,
        data: sessionData({ status: "failed", errorCode: "provider_error" }),
      })
      const { AccountPicker } = await import(
        "@/features/integration-google-ads/components/account-picker"
      )
      ui.render(
        <AccountPicker
          hasConnectError
          initialSession={{ id: "s1", status: "failed" }}
          workspaceId="ws-1"
        />,
      )
      expect(ui.container.textContent).toBe("")
    })

    test("Dismiss cancels, then invalidates, clears ?session= and refreshes", async () => {
      pendingSession()
      await renderPicker()
      act(() => {
        vi.advanceTimersByTime(POLL_TIMEOUT_MS)
      })
      click(buttonByText(ui.container, "googleAds.picker.dismiss"))
      expect(mocks.actions.cancel).toHaveBeenCalledWith({ sessionId: "s1" })
      expect(mocks.calls).toEqual([])
      await act(async () => {
        await mocks.actionOptions.cancel.onSuccess?.()
      })
      expect(mocks.calls).toEqual([
        "invalidate",
        `replace:${WORKSPACE_SETTINGS}`,
        "refresh",
      ])
    })

    test("a failed cancel shows a translated error and keeps the actions", async () => {
      pendingSession()
      await renderPicker()
      act(() => {
        vi.advanceTimersByTime(POLL_TIMEOUT_MS)
      })
      click(buttonByText(ui.container, "googleAds.picker.dismiss"))
      act(() => {
        mocks.actionOptions.cancel.onError?.({ error: {} })
      })
      expect(ui.container.textContent).toContain(
        "googleAds.picker.cancelFailed",
      )
      expect(
        buttonByText(ui.container, "googleAds.picker.dismiss"),
      ).toBeTruthy()
    })
  })

  test("a failed Cancel on the waiting card shows a translated error", async () => {
    mocks.session.mockReturnValue({
      isPending: false,
      data: sessionData({ status: "authorized" }),
    })
    await renderPicker({ id: "s1", status: "authorized" })
    click(buttonByText(ui.container, "actions.cancel"))
    act(() => {
      mocks.actionOptions.cancel.onError?.({ error: {} })
    })
    expect(ui.container.textContent).toContain("googleAds.picker.cancelFailed")
  })

  test("Cancel also clears the ?session= param", async () => {
    mocks.session.mockReturnValue({
      isPending: false,
      data: sessionData({ status: "awaiting_selection" }),
    })
    await renderPicker()
    await act(async () => {
      await mocks.actionOptions.cancel.onSuccess?.()
    })
    expect(mocks.calls).toEqual([
      "invalidate",
      `replace:${WORKSPACE_SETTINGS}`,
      "refresh",
    ])
  })

  test("waiting is an inline polite status row with a low-key Cancel, not a card", async () => {
    mocks.session.mockReturnValue({
      isPending: false,
      data: sessionData({ status: "pending" }),
    })
    await renderPicker()
    const status = ui.container.querySelector("[role=status]")
    expect(status?.getAttribute("aria-live")).toBe("polite")
    expect(status?.querySelector("svg.animate-spin")).not.toBeNull()
    expect(
      ui.container.querySelector(".rounded-xl, [data-slot=card]"),
    ).toBeNull()
  })

  test("awaiting selection: a bordered radio list with formatted ids and one primary action", async () => {
    mocks.session.mockReturnValue({
      isPending: false,
      data: sessionData({
        targets: [{ id: "1112223333", name: "Acme", selectable: true }],
      }),
    })
    await renderPicker()
    const list = ui.container.querySelector("fieldset")
    expect(list?.className).toContain("border")
    expect(list?.textContent).toContain("111-222-3333")
    expect(
      buttonByText(ui.container, "googleAds.picker.connectSelected"),
    ).toBeDefined()
  })

  test("failed shows the destructive alert with a title and only a close button", async () => {
    mocks.session.mockReturnValue({
      isPending: false,
      data: sessionData({ status: "failed", errorCode: "internal_error" }),
    })
    await renderPicker({ id: "s1", status: "failed" })
    const alert = ui.container.querySelector('[role="alert"]')
    expect(alert?.textContent).toContain("googleAds.picker.connectErrorTitle")
    expect(alert?.textContent).toContain(
      "googleAds.picker.errors.internalError",
    )
    expect(
      Array.from(alert?.querySelectorAll("button") ?? []).map((b) =>
        b.getAttribute("aria-label"),
      ),
    ).toEqual(["googleAds.picker.dismiss"])
    expect(alert?.textContent).not.toContain("googleAds.picker.connectAgain")
  })

  test.each([
    ["expired", "googleAds.picker.sessionExpired"],
    ["cancelled", "googleAds.picker.sessionCancelled"],
  ])("%s shows a neutral alert instead of a separate card", async (status, key) => {
    mocks.session.mockReturnValue({
      isPending: false,
      data: sessionData({ status }),
    })
    await renderPicker({ id: "s1", status })
    expect(ui.container.querySelectorAll('[role="alert"]')).toHaveLength(1)
    expect(ui.container.textContent).toContain(key)
  })
})
