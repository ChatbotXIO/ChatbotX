// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

vi.mock("@/features/integration-google-ads/components/connection-row", () => ({
  ConnectionRow: () => <div data-testid="connection-row" />,
}))
vi.mock("@/features/integration-google-ads/components/account-picker", () => ({
  AccountPicker: () => <div data-testid="account-picker" />,
}))
vi.mock(
  "@/features/integration-google-ads/components/connect-error-alert",
  () => ({
    ConnectErrorAlert: ({ code }: { code: string }) => (
      <div data-code={code} data-testid="connect-error-alert" />
    ),
  }),
)
vi.mock(
  "@/features/integration-google-ads/components/conversion-actions-section",
  () => ({
    ConversionActionsSection: () => <div data-testid="actions-section" />,
  }),
)
vi.mock("@/features/integration-google-ads/components/consent-section", () => ({
  ConsentSection: ({ uploadMethod }: { uploadMethod: string | null }) => (
    <div
      data-testid="consent-section"
      data-upload-method={String(uploadMethod)}
    />
  ),
}))
vi.mock(
  "@/features/integration-google-ads/components/events-history-section",
  () => ({
    EventsHistorySection: ({ isConnected }: { isConnected: boolean }) => (
      <div data-connected={String(isConnected)} data-testid="events-history" />
    ),
  }),
)

import { GoogleAdsSettings } from "@/features/integration-google-ads/components/google-ads-settings"
import type { GoogleAdsSettingsView } from "@/features/integration-google-ads/lib/to-settings-view"
import type { GoogleAdsConsentView } from "@/features/integration-google-ads/schema/integration"
import { type Mounted, mount } from "./helpers/google-ads-ui"

let ui: Mounted
beforeEach(() => {
  ui = mount()
})
afterEach(() => ui.unmount())

const setup: GoogleAdsSettingsView = {
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
}

const has = (id: string) =>
  ui.container.querySelector(`[data-testid="${id}"]`) !== null

const consent: GoogleAdsConsentView = {
  status: "absent",
  adUserData: { type: "notProvided", template: null },
  adPersonalization: { type: "notProvided", template: null },
}

describe("GoogleAdsSettings", () => {
  test("connected: shows the connection, actions and the events history", () => {
    ui.render(
      <GoogleAdsSettings
        consent={consent}
        initialSession={null}
        isConfigured
        setup={setup}
        workspaceId="ws-1"
      />,
    )
    expect(has("connection-row")).toBe(true)
    expect(has("actions-section")).toBe(true)
    expect(has("events-history")).toBe(true)
  })

  test("sections render in order: connection, picker, actions, consent, history", () => {
    ui.render(
      <GoogleAdsSettings
        consent={consent}
        initialSession={null}
        isConfigured
        setup={setup}
        workspaceId="ws-1"
      />,
    )
    const ids = Array.from(ui.container.querySelectorAll("[data-testid]")).map(
      (element) => element.getAttribute("data-testid"),
    )
    expect(ids).toEqual([
      "connection-row",
      "account-picker",
      "actions-section",
      "consent-section",
      "events-history",
    ])
  })

  test("consent is editable without a connection and gets the upload method when connected", () => {
    ui.render(
      <GoogleAdsSettings
        consent={consent}
        initialSession={null}
        isConfigured={false}
        setup={null}
        workspaceId="ws-1"
      />,
    )
    const section = () =>
      ui.container.querySelector('[data-testid="consent-section"]')
    expect(section()?.getAttribute("data-upload-method")).toBe("null")

    ui.render(
      <GoogleAdsSettings
        consent={consent}
        initialSession={null}
        isConfigured
        setup={{ ...setup, uploadMethod: "legacy" }}
        workspaceId="ws-1"
      />,
    )
    expect(section()?.getAttribute("data-upload-method")).toBe("legacy")
  })

  test("disconnected: events history survives without any account setup", () => {
    ui.render(
      <GoogleAdsSettings
        consent={consent}
        initialSession={null}
        isConfigured
        setup={null}
        workspaceId="ws-1"
      />,
    )
    expect(has("actions-section")).toBe(false)
    expect(has("events-history")).toBe(true)
    expect(
      ui.container
        .querySelector('[data-testid="events-history"]')
        ?.getAttribute("data-connected"),
    ).toBe("false")
  })

  test("not configured and not connected still renders history", () => {
    ui.render(
      <GoogleAdsSettings
        consent={consent}
        initialSession={null}
        isConfigured={false}
        setup={null}
        workspaceId="ws-1"
      />,
    )
    expect(has("account-picker")).toBe(false)
    expect(has("events-history")).toBe(true)
  })

  test("renders the connect error alert above the connection row only when a connect_error is present", () => {
    ui.render(
      <GoogleAdsSettings
        connectError="developer_token_not_approved"
        consent={consent}
        initialSession={null}
        isConfigured
        setup={null}
        workspaceId="ws-1"
      />,
    )
    const alert = ui.container.querySelector(
      '[data-testid="connect-error-alert"]',
    )
    expect(alert?.getAttribute("data-code")).toBe(
      "developer_token_not_approved",
    )
    const wrapper = ui.container.firstElementChild?.firstElementChild
    expect(wrapper?.contains(alert ?? null)).toBe(true)
    expect(wrapper?.className).toContain("pb-4")
    expect(wrapper?.nextElementSibling?.getAttribute("data-testid")).toBe(
      "connection-row",
    )
  })

  test("no connect error, no alert", () => {
    ui.render(
      <GoogleAdsSettings
        consent={consent}
        initialSession={null}
        isConfigured
        setup={null}
        workspaceId="ws-1"
      />,
    )
    expect(has("connect-error-alert")).toBe(false)
  })
})
