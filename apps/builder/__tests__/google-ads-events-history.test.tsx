// @vitest-environment jsdom
import { act } from "react"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  queryInput: undefined as
    | { status?: string; page: number; perPage: number }
    | undefined,
  retry: vi.fn(),
  onSuccess: undefined as (() => Promise<void> | void) | undefined,
  calls: [] as string[],
}))

vi.mock("next-intl", async () =>
  (await import("./helpers/google-ads-ui")).nextIntlMock(),
)
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => mocks.calls.push("refresh") }),
}))
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }))
vi.mock("@chatbotx.io/ui/components/ui/select", async () =>
  (await import("./helpers/google-ads-ui")).selectMock(),
)
vi.mock("@/lib/orpc/query", () => ({
  orpc: {
    googleAdsAPI: {
      listEvents: {
        queryOptions: (options: { input: typeof mocks.queryInput }) => {
          mocks.queryInput = options.input
          return options
        },
      },
    },
  },
}))
vi.mock("@tanstack/react-query", () => ({ useQuery: () => mocks.query() }))
vi.mock(
  "@/features/integration-google-ads/hooks/use-invalidate-google-ads",
  () => ({
    useInvalidateGoogleAds: () => () => {
      mocks.calls.push("invalidate")
      return Promise.resolve()
    },
  }),
)
vi.mock("@/features/integration-google-ads/actions/retry-event.action", () => ({
  retryGoogleAdsEventAction: { bind: () => "retry" },
}))
vi.mock("next-safe-action/hooks", () => ({
  useAction: (
    _id: string,
    options: { onSuccess?: () => Promise<void> | void },
  ) => {
    mocks.onSuccess = options.onSuccess
    return { execute: mocks.retry, isPending: false }
  },
}))

import { EventsHistorySection } from "@/features/integration-google-ads/components/events-history-section"
import {
  buttonByText,
  click,
  type Mounted,
  mount,
} from "./helpers/google-ads-ui"

let ui: Mounted
beforeEach(() => {
  ui = mount()
  mocks.retry.mockReset()
  mocks.calls.length = 0
})
afterEach(() => ui.unmount())

const event = (
  id: string,
  status: string,
  overrides: Record<string, unknown> = {},
) => ({
  id,
  status,
  failureStage: null,
  processingStatus: null,
  error: null,
  channel: "whatsapp",
  conversionActionName: "Lead",
  uploadMethod: "dataManager",
  clickIdType: "gclid",
  maskedClickId: "abcd…wxyz",
  occurredAt: new Date("2026-01-01T00:00:00Z"),
  sentAt: null,
  value: null,
  currency: null,
  identity: null,
  conversionTimeProvided: false,
  consentSnapshot: null,
  customerMatching: null,
  customerProperties: null,
  ...overrides,
})
const loaded = (data: unknown[], total = data.length) => ({
  isPending: false,
  isError: false,
  isSuccess: true,
  data: { data, total, page: 1, perPage: 20 },
})

describe("EventsHistorySection", () => {
  test("loading state", () => {
    mocks.query.mockReturnValue({ isPending: true })
    ui.render(<EventsHistorySection isConnected workspaceId="ws-1" />)
    expect(
      ui.container.querySelector("[data-testid=google-ads-events-loading]"),
    ).not.toBeNull()
  })

  test("error state offers a retry that refetches", () => {
    const refetch = vi.fn()
    mocks.query.mockReturnValue({ isPending: false, isError: true, refetch })
    ui.render(<EventsHistorySection isConnected workspaceId="ws-1" />)
    click(buttonByText(ui.container, "actions.retry"))
    expect(refetch).toHaveBeenCalled()
  })

  test("connected with no events: one muted line and no status filter", () => {
    mocks.query.mockReturnValue(loaded([]))
    ui.render(<EventsHistorySection isConnected workspaceId="ws-1" />)
    expect(ui.container.textContent).toContain("googleAds.events.empty")
    expect(ui.container.querySelector("table")).toBeNull()
    expect(ui.container.querySelector("select")).toBeNull()
    expect(ui.container.textContent).not.toContain(
      "googleAds.events.filter.label",
    )
  })

  test("links to the statistics dashboard from the section header", () => {
    mocks.query.mockReturnValue(loaded([]))
    ui.render(<EventsHistorySection isConnected workspaceId="ws-1" />)

    const links = ui.container.querySelectorAll(
      'a[href="/space/ws-1/dashboard/ads/google"]',
    )
    expect(links).toHaveLength(1)
    expect(links[0].textContent).toBe("googleAds.stats.viewStatistics")
  })

  test("the statistics link stays when the status filter appears", () => {
    mocks.query.mockReturnValue(loaded([event("1", "failed")]))
    ui.render(<EventsHistorySection isConnected workspaceId="ws-1" />)

    expect(
      ui.container.querySelectorAll(
        'a[href="/space/ws-1/dashboard/ads/google"]',
      ),
    ).toHaveLength(1)
    expect(ui.container.querySelector("select")).not.toBeNull()
  })

  test("disconnected with no events: the section is not shown at all", () => {
    mocks.query.mockReturnValue(loaded([]))
    ui.render(<EventsHistorySection isConnected={false} workspaceId="ws-1" />)
    expect(ui.container.textContent).toBe("")
  })

  test("disconnected while loading or failing: keeps its loading and error states", () => {
    mocks.query.mockReturnValue({ isPending: true })
    ui.render(<EventsHistorySection isConnected={false} workspaceId="ws-1" />)
    expect(
      ui.container.querySelector("[data-testid=google-ads-events-loading]"),
    ).not.toBeNull()
    mocks.query.mockReturnValue({ isPending: false, isError: true })
    ui.render(<EventsHistorySection isConnected={false} workspaceId="ws-1" />)
    expect(ui.container.textContent).toContain("googleAds.events.loadError")
  })

  test("disconnected but events exist: history survives with its filter", () => {
    mocks.query.mockReturnValue(loaded([event("1", "sent")]))
    ui.render(<EventsHistorySection isConnected={false} workspaceId="ws-1" />)
    expect(ui.container.querySelector("table")).not.toBeNull()
    expect(ui.container.querySelector("select")).not.toBeNull()
  })

  test("the status filter stays reachable when a filter yields no rows", () => {
    mocks.query.mockReturnValue(loaded([event("1", "sent")]))
    ui.render(<EventsHistorySection isConnected workspaceId="ws-1" />)
    mocks.query.mockReturnValue(loaded([]))
    const select = ui.container.querySelector<HTMLSelectElement>("select")
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLSelectElement.prototype,
        "value",
      )?.set
      if (select) {
        setter?.call(select, "failed")
        select.dispatchEvent(new Event("change", { bubbles: true }))
      }
    })
    expect(ui.container.textContent).toContain("googleAds.events.emptyFiltered")
    expect(ui.container.querySelector("select")).not.toBeNull()
  })

  test("a failed row shows a Retry with icon and text; sent rows do not", () => {
    mocks.query.mockReturnValue(
      loaded([event("1", "failed"), event("2", "sent")]),
    )
    ui.render(<EventsHistorySection isConnected workspaceId="ws-1" />)
    const retry = buttonByText(ui.container, "actions.retry")
    expect(retry?.querySelector("svg")).not.toBeNull()
    expect(ui.container.querySelectorAll("tbody button")).toHaveLength(1)
  })

  test("has a caption and scoped column headers", () => {
    mocks.query.mockReturnValue(loaded([event("1", "sent")]))
    ui.render(<EventsHistorySection isConnected workspaceId="ws-1" />)
    expect(ui.container.querySelector("caption")).not.toBeNull()
    expect(
      ui.container.querySelectorAll('th[scope="col"]').length,
    ).toBeGreaterThan(3)
  })

  test("does not paginate when everything fits one page", () => {
    mocks.query.mockReturnValue(loaded([event("1", "sent")]))
    ui.render(<EventsHistorySection isConnected workspaceId="ws-1" />)
    expect(ui.container.textContent).not.toContain("googleAds.events.page")
  })

  test("renders masked click id, badges and a scrollable table container", () => {
    mocks.query.mockReturnValue(
      loaded([
        event("1", "failed", {
          failureStage: "processing",
          processingStatus: "failed",
          error: "Rejected by Google",
        }),
      ]),
    )
    ui.render(<EventsHistorySection isConnected workspaceId="ws-1" />)
    const text = ui.container.textContent ?? ""
    expect(text).toContain("abcd…wxyz")
    expect(text).toContain("googleAds.events.status.failed")
    expect(text).toContain("googleAds.events.stage.processing")
    expect(text).toContain("googleAds.events.processing.failed")
    expect(text).toContain("Rejected by Google")
    expect(
      ui.container.querySelector("table")?.closest(".overflow-x-auto"),
    ).not.toBeNull()
  })

  test("Retry appears only for failed events and calls the action", () => {
    mocks.query.mockReturnValue(
      loaded([
        event("1", "failed"),
        event("2", "sent"),
        event("3", "skipped_expired"),
      ]),
    )
    ui.render(<EventsHistorySection isConnected workspaceId="ws-1" />)
    const retries = Array.from(
      ui.container.querySelectorAll("tbody button"),
    ).filter((button) => button.textContent === "actions.retry")
    expect(retries).toHaveLength(1)
    click(retries[0])
    expect(mocks.retry).toHaveBeenCalledWith({ eventId: "1" })
  })

  test("retry success invalidates before refreshing", async () => {
    mocks.query.mockReturnValue(loaded([event("1", "failed")]))
    ui.render(<EventsHistorySection isConnected workspaceId="ws-1" />)
    await act(async () => {
      await mocks.onSuccess?.()
    })
    expect(mocks.calls).toEqual(["invalidate", "refresh"])
  })

  test("status filter feeds the query, resets the page and caps perPage at 100", () => {
    mocks.query.mockReturnValue(loaded([event("1", "sent")]))
    ui.render(<EventsHistorySection isConnected workspaceId="ws-1" />)
    expect(mocks.queryInput?.status).toBeUndefined()
    const select = ui.container.querySelector<HTMLSelectElement>("select")
    act(() => {
      if (select) {
        const setter = Object.getOwnPropertyDescriptor(
          HTMLSelectElement.prototype,
          "value",
        )?.set
        setter?.call(select, "failed")
        select.dispatchEvent(new Event("change", { bubbles: true }))
      }
    })
    expect(mocks.queryInput).toMatchObject({ status: "failed", page: 1 })
    expect(mocks.queryInput?.perPage).toBeLessThanOrEqual(100)
  })

  test("paginates when there are more rows than one page", () => {
    mocks.query.mockReturnValue(loaded([event("1", "sent")], 45))
    ui.render(<EventsHistorySection isConnected workspaceId="ws-1" />)
    expect(ui.container.textContent).toContain("googleAds.events.page:1,3")
    click(buttonByText(ui.container, "actions.next"))
    expect(mocks.queryInput?.page).toBe(2)
  })

  test("legacy events are labelled; Data Manager events carry no extra label", () => {
    mocks.query.mockReturnValue(
      loaded([
        event("1", "processed", {
          uploadMethod: "legacy",
          processingStatus: "success",
        }),
        event("2", "processed", { processingStatus: "success" }),
      ]),
    )
    ui.render(<EventsHistorySection isConnected workspaceId="ws-1" />)
    const text = ui.container.querySelector("table")?.textContent ?? ""
    expect(text.split("googleAds.uploadMethods.legacy")).toHaveLength(2)
    expect(text).not.toContain("googleAds.uploadMethods.dataManager")
  })

  test("a legacy processed row never shows a Google-is-checking state", () => {
    mocks.query.mockReturnValue(
      loaded([
        event("1", "processed", {
          uploadMethod: "legacy",
          processingStatus: "success",
        }),
      ]),
    )
    ui.render(<EventsHistorySection isConnected workspaceId="ws-1" />)
    const text = ui.container.querySelector("table")?.textContent ?? ""
    expect(text).toContain("googleAds.events.status.processed")
    expect(text).toContain("googleAds.events.processing.success")
    expect(text).not.toContain("googleAds.events.processing.processing")
    expect(text).not.toContain("googleAds.events.status.sending")
  })

  describe("options snapshot columns", () => {
    const tableText = () =>
      ui.container.querySelector("table")?.textContent ?? ""
    const render = (data: unknown[]) => {
      mocks.query.mockReturnValue(loaded(data))
      ui.render(<EventsHistorySection isConnected workspaceId="ws-1" />)
    }

    test("Dedup column shows per click, the ID, every run, and a dash without options", () => {
      render([
        event("1", "sent", { identity: { mode: "click", id: null } }),
        event("2", "sent", { identity: { mode: "id", id: "A-1042" } }),
        event("4", "sent", { identity: { mode: "event", id: null } }),
        event("3", "sent"),
      ])
      const cells = Array.from(ui.container.querySelectorAll("tbody tr")).map(
        (row) => row.querySelectorAll("td")[2]?.textContent,
      )

      expect(tableText()).toContain("googleAds.events.columns.dedup")
      expect(cells).toEqual([
        "googleAds.events.dedup.click",
        "googleAds.events.dedup.id:A-1042",
        "googleAds.events.dedup.event",
        "—",
      ])
    })

    test("Matching column shows the configured identifiers and why they may not be sent", () => {
      render([
        event("1", "sent", {
          customerMatching: { status: "enabled", fields: ["email", "phone"] },
        }),
        event("2", "sent", {
          customerMatching: { status: "withheldConsent", fields: ["email"] },
        }),
        event("3", "sent", {
          customerMatching: {
            status: "unsupportedTransport",
            fields: ["phone"],
          },
        }),
        event("4", "sent"),
      ])
      const cells = Array.from(ui.container.querySelectorAll("tbody tr")).map(
        (row) => row.querySelectorAll("td")[7]?.textContent,
      )

      expect(tableText()).toContain("googleAds.events.columns.matching")
      expect(cells).toEqual([
        "googleAds.events.matching.enabled:googleAds.conversionFields.matchEmailLabel, googleAds.conversionFields.matchPhoneLabel",
        "googleAds.events.matching.withheldConsent:googleAds.conversionFields.matchEmailLabel",
        "googleAds.events.matching.unsupportedTransport:googleAds.conversionFields.matchPhoneLabel",
        "—",
      ])
    })

    test("Properties column shows the sent values, or why they may not be sent", () => {
      render([
        event("1", "sent", {
          customerProperties: {
            status: "enabled",
            customerType: "NEW",
            customerValueBucket: "HIGH",
          },
        }),
        event("2", "sent", {
          customerProperties: {
            status: "withheldConsent",
            customerType: "RETURNING",
            customerValueBucket: null,
          },
        }),
        event("3", "sent", {
          customerProperties: {
            status: "unsupportedTransport",
            customerType: null,
            customerValueBucket: "LOW",
          },
        }),
        event("4", "sent"),
      ])
      const cells = Array.from(ui.container.querySelectorAll("tbody tr")).map(
        (row) => row.querySelectorAll("td")[8]?.textContent,
      )

      expect(tableText()).toContain("googleAds.events.columns.properties")
      expect(cells).toEqual([
        "NEW · HIGH",
        "googleAds.events.matching.withheldConsent:googleAds.conversionFields.customerTypeLabel",
        "googleAds.events.matching.unsupportedTransport:googleAds.conversionFields.customerValueBucketLabel",
        "—",
      ])
    })

    test("a long ID is cut to 16 characters; the full value is in the accessible name", () => {
      const id = "ORDER-0123456789-ABCDEF"
      render([event("1", "sent", { identity: { mode: "id", id } })])

      expect(tableText()).toContain(
        `googleAds.events.dedup.id:${id.slice(0, 16)}…`,
      )
      expect(tableText()).not.toContain(id)
      expect(
        ui.container.querySelector(
          `[aria-label="googleAds.events.dedup.id:${id}"]`,
        ),
      ).not.toBeNull()
    })

    test("a provided conversion time is marked on the occurred cell", () => {
      render([
        event("1", "sent", { conversionTimeProvided: true }),
        event("2", "sent"),
      ])
      const occurred = Array.from(
        ui.container.querySelectorAll("tbody tr"),
      ).map((row) => row.querySelectorAll("td")[5]?.textContent)

      expect(occurred[0]).toContain("googleAds.events.timeProvided")
      expect(occurred[1]).not.toContain("googleAds.events.timeProvided")
    })

    test("sent consent shows short labels with the full labels as accessible text", () => {
      render([
        event("1", "processed", {
          consentSnapshot: {
            delivery: "sent",
            adUserData: "granted",
            adPersonalization: "notSupported",
          },
        }),
      ])
      const text = tableText()

      expect(text).toContain(
        "googleAds.events.consent.adUserDataShort:googleAds.events.consent.status.granted",
      )
      expect(text).toContain(
        "googleAds.events.consent.adPersonalizationShort:googleAds.events.consent.status.notSupported",
      )
      expect(text).not.toContain("googleAds.events.consent.delivery")
      expect(
        ui.container.querySelector(
          '[aria-label*="googleAds.events.consent.adUserDataFull:googleAds.events.consent.status.granted"]',
        ),
      ).not.toBeNull()
    })

    test.each([
      ["toSend", "googleAds.events.consent.delivery.toSend"],
      ["unknown", "googleAds.events.consent.delivery.unknown"],
    ])("%s consent leads with the delivery label", (delivery, label) => {
      render([
        event("1", "pending", {
          consentSnapshot: {
            delivery,
            adUserData: "denied",
            adPersonalization: "notProvided",
          },
        }),
      ])

      expect(tableText()).toContain(label)
      expect(tableText()).toContain("googleAds.events.consent.status.denied")
    })

    test("a skipped event only says it was not sent", () => {
      render([
        event("1", "skipped_expired", {
          consentSnapshot: {
            delivery: "notSent",
            adUserData: "granted",
            adPersonalization: "granted",
          },
        }),
      ])
      const cell = ui.container.querySelectorAll("tbody td")[6]

      expect(cell?.textContent).toBe(
        "googleAds.events.consent.delivery.notSent",
      )
    })

    test("no snapshot shows a dash", () => {
      render([event("1", "sent")])

      expect(ui.container.querySelectorAll("tbody td")[6]?.textContent).toBe(
        "—",
      )
    })

    test("the table still scrolls horizontally", () => {
      render([event("1", "sent")])

      expect(
        ui.container.querySelector("table")?.closest(".overflow-x-auto"),
      ).not.toBeNull()
    })
  })
})
