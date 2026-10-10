// @vitest-environment jsdom
import { act } from "react"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  executors: {} as Record<string, ReturnType<typeof vi.fn>>,
  options: {} as Record<string, { onSuccess?: () => Promise<void> | void }>,
  calls: [] as string[],
}))

vi.mock("next-intl", async () =>
  (await import("./helpers/google-ads-ui")).nextIntlMock(),
)
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => mocks.calls.push("refresh") }),
}))
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }))
vi.mock(
  "@/features/integration-google-ads/hooks/use-invalidate-google-ads",
  () => ({
    useInvalidateGoogleAds: () => () => {
      mocks.calls.push("invalidate")
      return Promise.resolve()
    },
  }),
)
vi.mock(
  "@/features/integration-google-ads/actions/start-connect.action",
  () => ({
    startGoogleAdsConnectAction: { bind: () => "connect" },
  }),
)
vi.mock(
  "@/features/integration-google-ads/actions/start-reconnect.action",
  () => ({
    startGoogleAdsReconnectAction: { bind: () => "reconnect" },
  }),
)
vi.mock("@/features/integration-google-ads/actions/disconnect.action", () => ({
  disconnectGoogleAdsAction: { bind: () => "disconnect" },
}))
vi.mock(
  "@/features/integration-google-ads/actions/sync-conversion-actions.action",
  () => ({
    syncGoogleAdsConversionActionsAction: { bind: () => "sync" },
  }),
)
vi.mock("next-safe-action/hooks", () => ({
  useAction: (
    id: string,
    options: { onSuccess?: () => Promise<void> | void },
  ) => {
    mocks.executors[id] ??= vi.fn()
    mocks.options[id] = options
    return { execute: mocks.executors[id], isPending: false }
  },
}))

import { googleAdsSetupErrorSchema } from "@chatbotx.io/database/partials"
import { ConnectionRow } from "@/features/integration-google-ads/components/connection-row"
import { setupErrorKey } from "@/features/integration-google-ads/lib/status"
import type { GoogleAdsSettingsView } from "@/features/integration-google-ads/lib/to-settings-view"
import {
  buttonByText,
  click,
  type Mounted,
  mount,
} from "./helpers/google-ads-ui"

let ui: Mounted
beforeEach(() => {
  ui = mount()
  mocks.executors = {}
  mocks.calls.length = 0
})
afterEach(() => ui.unmount())

const setupView = (
  overrides: Partial<GoogleAdsSettingsView> = {},
): GoogleAdsSettingsView => ({
  customerId: "1234567890",
  loginCustomerId: null,
  descriptiveName: "Acme Ads",
  currencyCode: "USD",
  conversionCustomerId: "1234567890",
  acceptedCustomerDataTerms: true,
  setupError: null,
  uploadMethod: "dataManager",
  readiness: "ready",
  connectionStatus: "connected",
  conversionActions: [],
  conversionActionsSyncedAt: null,
  ...overrides,
})

const renderRow = (props: {
  isConfigured?: boolean
  setup: GoogleAdsSettingsView | null
}) =>
  ui.render(
    <ConnectionRow
      isConfigured={props.isConfigured ?? true}
      setup={props.setup}
      workspaceId="ws-1"
    />,
  )

const text = () => ui.container.textContent ?? ""
const syncButton = () =>
  ui.container.querySelector<HTMLButtonElement>(
    '[aria-label="googleAds.conversionActions.sync"]',
  )

describe("ConnectionRow", () => {
  test("not connected: one sentence, a compact connect button and no always-visible bullet list", () => {
    renderRow({ setup: null })
    expect(text()).toContain("googleAds.description")
    expect(text()).toContain("googleAds.connect.howItWorks")
    expect(ui.container.querySelector("ul, ol")).toBeNull()
    expect(ui.container.querySelector(".border")).toBeNull()
    click(buttonByText(ui.container, "googleAds.connect.button"))
    expect(mocks.executors.connect).toHaveBeenCalled()
  })

  test("not connected: the connect button sits in the same header row as the description, under a labelled section", () => {
    renderRow({ setup: null })
    const section = ui.container.querySelector("section")
    const heading = section?.querySelector("h3")
    expect(heading?.classList.contains("sr-only")).toBe(true)
    expect(heading?.textContent).toBe("googleAds.title")
    expect(section?.getAttribute("aria-labelledby")).toBe(heading?.id)
    const button = buttonByText(ui.container, "googleAds.connect.button")
    expect(button?.parentElement).toBe(section)
  })

  test("How it works reveals the three steps and the permissions note", () => {
    renderRow({ setup: null })
    click(buttonByText(ui.container, "googleAds.connect.howItWorks"))
    const popup = document.body.textContent ?? ""
    expect(popup).toContain("googleAds.connect.steps.signIn")
    expect(popup).toContain("googleAds.connect.steps.chooseAccount")
    expect(popup).toContain("googleAds.connect.steps.pickAction")
    expect(popup).toContain("googleAds.connect.scopes")
  })

  test("not configured: disabled connect button and the not-available explanation", () => {
    renderRow({ isConfigured: false, setup: null })
    expect(text()).toContain("googleAds.notAvailable.description")
    expect(text()).not.toContain("googleAds.connect.howItWorks")
    const button = buttonByText(ui.container, "googleAds.connect.button")
    expect(button?.disabled).toBe(true)
    click(button)
    expect(mocks.executors.connect).not.toHaveBeenCalled()
  })

  test("connected: name, mono customer id, manager and a status badge", () => {
    renderRow({ setup: setupView({ loginCustomerId: "9998887777" }) })
    expect(text()).toContain("Acme Ads")
    expect(text()).toContain("123-456-7890")
    expect(text()).toContain("googleAds.connect.viaManager:999-888-7777")
    expect(text()).toContain("googleAds.status.connected")
    expect(
      Array.from(ui.container.querySelectorAll("span")).some(
        (el) =>
          el.classList.contains("font-mono") &&
          el.textContent === "123-456-7890",
      ),
    ).toBe(true)
    expect(
      buttonByText(ui.container, "googleAds.connect.reconnect"),
    ).toBeUndefined()
  })

  test("connected: disconnect is a bordered outline button in the same action group as sync", () => {
    renderRow({ setup: setupView() })
    const disconnect = buttonByText(ui.container, "actions.disconnect")
    expect(disconnect?.className).toContain("border")
    expect(disconnect?.className).toContain("text-destructive")
    expect(disconnect?.parentElement).toBe(syncButton()?.parentElement)
  })

  test("connected: a single labelled section, no duplicate visible title", () => {
    renderRow({ setup: setupView() })
    expect(ui.container.querySelectorAll("section")).toHaveLength(1)
    expect(ui.container.querySelectorAll("h3.sr-only")).toHaveLength(1)
  })

  test.each([
    ["dataManager", "googleAds.uploadMethods.dataManager"],
    ["legacy", "googleAds.uploadMethods.legacy"],
  ] as const)("connected: shows the %s upload method", (uploadMethod, label) => {
    renderRow({ setup: setupView({ uploadMethod }) })
    expect(text()).toContain(`googleAds.connect.uploadMethod:${label}`)
  })

  test("connected: one-line setup summary with account, action count and sync time", () => {
    const syncedAt = new Date("2026-01-01T00:00:00Z")
    renderRow({
      setup: setupView({
        conversionActions: [],
        conversionActionsSyncedAt: syncedAt,
      }),
    })
    expect(text()).toContain("googleAds.setup.conversionCustomer 123-456-7890")
    expect(text()).toContain("googleAds.conversionActions.count:0")
    expect(text()).toContain(
      `googleAds.conversionActions.syncedAt:ago:${syncedAt.toISOString()}`,
    )
  })

  test("reconnect sits in the same action group as disconnect", () => {
    renderRow({ setup: setupView({ connectionStatus: "needs_reauth" }) })
    expect(
      buttonByText(ui.container, "googleAds.connect.reconnect")?.parentElement,
    ).toBe(buttonByText(ui.container, "actions.disconnect")?.parentElement)
  })

  test("never synced is stated plainly", () => {
    renderRow({ setup: setupView() })
    expect(text()).toContain("googleAds.conversionActions.neverSynced")
  })

  test("the icon-only refresh button syncs and is labelled", () => {
    renderRow({ setup: setupView() })
    click(syncButton())
    expect(mocks.executors.sync).toHaveBeenCalledTimes(1)
  })

  test("needs_reauth: warning badge, explanation and Reconnect", () => {
    renderRow({ setup: setupView({ connectionStatus: "needs_reauth" }) })
    expect(text()).toContain("googleAds.status.needsReauth")
    expect(text()).toContain("googleAds.connect.needsReauthDescription")
    click(buttonByText(ui.container, "googleAds.connect.reconnect"))
    expect(mocks.executors.reconnect).toHaveBeenCalled()
  })

  test("degraded: badge, explanation and a Reconnect button", () => {
    renderRow({ setup: setupView({ connectionStatus: "degraded" }) })
    expect(text()).toContain("googleAds.status.degraded")
    expect(text()).toContain("googleAds.connect.degradedDescription")
    click(buttonByText(ui.container, "googleAds.connect.reconnect"))
    expect(mocks.executors.reconnect).toHaveBeenCalled()
  })

  test("paused: muted badge, explanation and no Reconnect", () => {
    renderRow({ setup: setupView({ connectionStatus: "paused" }) })
    expect(text()).toContain("googleAds.status.paused")
    expect(text()).toContain("googleAds.connect.pausedDescription")
    expect(
      buttonByText(ui.container, "googleAds.connect.reconnect"),
    ).toBeUndefined()
  })

  test("ready account shows no warning and no retry", () => {
    renderRow({ setup: setupView() })
    expect(buttonByText(ui.container, "googleAds.setup.retry")).toBeUndefined()
    expect(ui.container.querySelector('[role="status"]')).toBeNull()
  })

  test.each(
    googleAdsSetupErrorSchema.options,
  )("setupError %s renders an inline warning with Retry setup", (setupError) => {
    renderRow({
      setup: setupView({ setupError, readiness: "setup_incomplete" }),
    })
    expect(text()).toContain(setupErrorKey[setupError])
    click(buttonByText(ui.container, "googleAds.setup.retry"))
    expect(mocks.executors.sync).toHaveBeenCalledTimes(1)
  })

  test("warns about the data terms when not accepted and no error code covers it", () => {
    renderRow({ setup: setupView({ acceptedCustomerDataTerms: false }) })
    expect(text()).toContain("googleAds.setup.dataTermsWarning")
  })

  test("does not duplicate the data-terms warning when the error code already says it", () => {
    renderRow({
      setup: setupView({
        acceptedCustomerDataTerms: false,
        setupError: "customer_data_terms_not_accepted",
      }),
    })
    expect(text()).not.toContain("googleAds.setup.dataTermsWarning")
  })

  test("sync success invalidates before refreshing", async () => {
    renderRow({ setup: setupView({ setupError: "sync_failed" }) })
    await act(async () => {
      await mocks.options.sync.onSuccess?.()
    })
    expect(mocks.calls).toEqual(["invalidate", "refresh"])
  })

  test("disconnect success invalidates before refreshing", async () => {
    renderRow({ setup: setupView() })
    await act(async () => {
      await mocks.options.disconnect.onSuccess?.()
    })
    expect(mocks.calls).toEqual(["invalidate", "refresh"])
  })
})
