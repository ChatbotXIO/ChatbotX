// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({ isPending: false }))

vi.mock("next-intl", async () =>
  (await import("./helpers/google-ads-ui")).nextIntlMock(),
)
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }))
vi.mock(
  "@/features/integration-google-ads/hooks/use-invalidate-google-ads",
  () => ({ useInvalidateGoogleAds: () => () => Promise.resolve() }),
)
vi.mock(
  "@/features/integration-google-ads/actions/sync-conversion-actions.action",
  () => ({ syncGoogleAdsConversionActionsAction: { bind: () => "sync" } }),
)
vi.mock("next-safe-action/hooks", () => ({
  useAction: () => ({ execute: vi.fn(), isPending: mocks.isPending }),
}))
vi.mock(
  "@/features/integration-google-ads/components/validate-request-dialog",
  () => ({ ValidateRequestDialog: () => null }),
)

import { ConversionActionsSection } from "@/features/integration-google-ads/components/conversion-actions-section"
import type { GoogleAdsSettingsView } from "@/features/integration-google-ads/lib/to-settings-view"
import { type Mounted, mount } from "./helpers/google-ads-ui"

let ui: Mounted
beforeEach(() => {
  ui = mount()
  mocks.isPending = false
})
afterEach(() => ui.unmount())

const setup = (
  action: Partial<GoogleAdsSettingsView["conversionActions"][number]>,
): GoogleAdsSettingsView => ({
  customerId: "1234567890",
  loginCustomerId: null,
  descriptiveName: "Acme",
  currencyCode: "USD",
  conversionCustomerId: "1234567890",
  acceptedCustomerDataTerms: true,
  setupError: null,
  uploadMethod: "dataManager",
  readiness: "ready",
  connectionStatus: "connected",
  conversionActions: [
    {
      id: "1",
      name: "Lead",
      category: "QUALIFIED_LEAD",
      status: "ENABLED",
      countingType: "ONE_PER_CLICK",
      lookbackDays: 30,
      ...action,
      attributionModel: action.attributionModel ?? null,
    },
  ],
  conversionActionsSyncedAt: null,
})

describe("ConversionActionsSection enum labels", () => {
  test("renders translated keys for known Google enum values", () => {
    ui.render(<ConversionActionsSection setup={setup({})} workspaceId="ws-1" />)
    const text = ui.container.textContent ?? ""
    expect(text).toContain("googleAds.enums.category.qualifiedLead")
    expect(text).toContain("googleAds.enums.countingType.onePerClick")
    expect(text).toContain("googleAds.enums.actionStatus.enabled")
  })

  test("unknown values fall back to the translated 'other' with the humanized value", () => {
    ui.render(
      <ConversionActionsSection
        setup={setup({ category: "FUTURE_KIND", status: "PAUSED_BY_GOOGLE" })}
        workspaceId="ws-1"
      />,
    )
    const text = ui.container.textContent ?? ""
    expect(text).toContain("googleAds.enums.unknown:Future kind")
    expect(text).toContain("googleAds.enums.unknown:Paused by google")
  })

  test("the gbraid note is an icon with an accessible tooltip, not a paragraph", () => {
    ui.render(<ConversionActionsSection setup={setup({})} workspaceId="ws-1" />)
    expect(
      ui.container.querySelector(
        'button[aria-label="googleAds.conversionActions.onePerClickNote"]',
      ),
    ).not.toBeNull()
    expect(ui.container.querySelector("p")?.textContent ?? "").not.toContain(
      "onePerClickNote",
    )
  })

  test("a MANY_PER_CLICK action has no gbraid note", () => {
    ui.render(
      <ConversionActionsSection
        setup={setup({ countingType: "MANY_PER_CLICK" })}
        workspaceId="ws-1"
      />,
    )
    expect(ui.container.innerHTML).not.toContain("onePerClickNote")
  })

  test("marks an external-attribution action as not supported", () => {
    ui.render(
      <ConversionActionsSection
        setup={setup({ attributionModel: "EXTERNAL" })}
        workspaceId="ws-1"
      />,
    )
    expect(
      ui.container.querySelector(
        'button[aria-label="googleAds.conversionActions.externalNote"]',
      ),
    ).not.toBeNull()
  })

  test("the table has a caption, column headers and scrolls inside a bordered container", () => {
    ui.render(<ConversionActionsSection setup={setup({})} workspaceId="ws-1" />)
    expect(ui.container.querySelector("caption")).not.toBeNull()
    expect(ui.container.querySelectorAll('th[scope="col"]')).toHaveLength(4)
    expect(
      ui.container.querySelector("table")?.closest(".overflow-x-auto.border"),
    ).not.toBeNull()
  })

  test("enabled actions get a text status, not colour alone", () => {
    ui.render(<ConversionActionsSection setup={setup({})} workspaceId="ws-1" />)
    expect(ui.container.textContent).toContain(
      "googleAds.enums.actionStatus.enabled",
    )
  })

  test("no actions: a concise empty state with the help link and no table", () => {
    ui.render(
      <ConversionActionsSection
        setup={{ ...setup({}), conversionActions: [] }}
        workspaceId="ws-1"
      />,
    )
    expect(ui.container.querySelector("table")).toBeNull()
    expect(ui.container.textContent).toContain(
      "googleAds.conversionActions.empty",
    )
    expect(ui.container.querySelector("a")?.getAttribute("href")).toBe(
      "https://support.google.com/google-ads/answer/7012522",
    )
  })

  test("the Sync button sits in the section header", () => {
    ui.render(<ConversionActionsSection setup={setup({})} workspaceId="ws-1" />)
    expect(
      Array.from(ui.container.querySelectorAll("button")).some((b) =>
        b.textContent?.includes("googleAds.conversionActions.sync"),
      ),
    ).toBe(true)
  })

  test("syncing an empty list shows skeleton rows instead of the empty state", () => {
    mocks.isPending = true
    ui.render(
      <ConversionActionsSection
        setup={{ ...setup({}), conversionActions: [] }}
        workspaceId="ws-1"
      />,
    )
    expect(
      ui.container.querySelector("[data-testid=google-ads-actions-loading]"),
    ).not.toBeNull()
    expect(ui.container.textContent).not.toContain(
      "googleAds.conversionActions.empty",
    )
  })
})
