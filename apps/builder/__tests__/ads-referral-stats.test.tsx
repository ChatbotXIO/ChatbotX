// @vitest-environment jsdom

import { ORPCError } from "@orpc/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { AdsReferralStats } from "@/features/ads/components/ads-referral-stats"

const getReferralStats = vi.hoisted(() => vi.fn())

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}))

vi.mock("@/lib/orpc/orpc", () => ({
  client: { adsAPI: { getReferralStats } },
}))

const range = { from: "2026-10-01", to: "2026-10-07", tz: "UTC" }

const statsRow = (overrides: Record<string, unknown> = {}) => ({
  adId: "120",
  title: "Summer sale",
  anyTouchContacts: 1500,
  firstTouchContacts: 900,
  leads: 0,
  purchases: 0,
  revenue: [],
  ...overrides,
})

describe("AdsReferralStats", () => {
  let container: HTMLDivElement
  let root: Root
  let queryClient: QueryClient

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    getReferralStats.mockReset()
    queryClient = new QueryClient({
      defaultOptions: { queries: { retryDelay: 0 } },
    })
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

  const renderStats = async (tz = range.tz) => {
    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <AdsReferralStats
            channel="messenger"
            range={{ ...range, tz }}
            workspaceId="ws-1"
          />
        </QueryClientProvider>,
      )
    })
    await vi.waitFor(() => expect(getReferralStats).toHaveBeenCalled())
  }

  test("asks for the channel's ads over the dashboard range", async () => {
    getReferralStats.mockResolvedValue({ data: [] })

    await renderStats()

    expect(getReferralStats).toHaveBeenCalledWith(
      {
        workspaceId: "ws-1",
        from: "2026-10-01",
        to: "2026-10-07",
        tz: "UTC",
        channel: "messenger",
        limit: 50,
      },
      expect.anything(),
    )
  })

  test("sends no timezone when the URL carried none", async () => {
    getReferralStats.mockResolvedValue({ data: [] })

    await renderStats("")

    expect(getReferralStats.mock.calls[0]?.[0].tz).toBeUndefined()
  })

  test("shows a busy placeholder while the report loads", async () => {
    getReferralStats.mockReturnValue(new Promise(() => undefined))

    await renderStats()

    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull()
  })

  test("lists each ad with its headline and id, and the contact counts", async () => {
    getReferralStats.mockResolvedValue({ data: [statsRow()] })

    await renderStats()

    await vi.waitFor(() =>
      expect(container.textContent).toContain("Summer sale"),
    )
    expect(container.textContent).toContain("120")
    expect(container.textContent).toContain("1,500")
    expect(container.textContent).toContain("900")
  })

  test("names an ad without a headline by its id alone", async () => {
    getReferralStats.mockResolvedValue({
      data: [statsRow({ title: null, adId: "777" })],
    })

    await renderStats()

    await vi.waitFor(() => expect(container.textContent).toContain("777"))
    expect(container.textContent).not.toContain("Summer sale")
  })

  test("hides the conversion columns until some ad has a conversion", async () => {
    getReferralStats.mockResolvedValue({ data: [statsRow()] })

    await renderStats()

    await vi.waitFor(() =>
      expect(container.textContent).toContain("firstTouch"),
    )
    expect(container.textContent).not.toContain("leads")
    expect(container.textContent).not.toContain("revenue")
  })

  test("shows conversions and revenue in each currency once an ad has them", async () => {
    getReferralStats.mockResolvedValue({
      data: [
        statsRow({
          leads: 4,
          purchases: 3,
          revenue: [
            { currency: "USD", amount: "150.5" },
            { currency: "VND", amount: "500000" },
          ],
        }),
      ],
    })

    await renderStats()

    await vi.waitFor(() => expect(container.textContent).toContain("leads"))
    expect(container.textContent).toContain("$150.50")
    expect(container.textContent).toContain("₫500,000")
  })

  test("a currency code that is not ISO shows as a number instead of crashing the card", async () => {
    getReferralStats.mockResolvedValue({
      data: [
        statsRow({
          purchases: 1,
          revenue: [{ currency: "not-a-currency", amount: "12" }],
        }),
      ],
    })

    await renderStats()

    await vi.waitFor(() => expect(container.textContent).toContain("12"))
    expect(container.textContent).toContain("Summer sale")
  })

  test("says so when no ad was clicked in the period", async () => {
    getReferralStats.mockResolvedValue({ data: [] })

    await renderStats()

    await vi.waitFor(() => expect(container.textContent).toContain("empty"))
  })

  test("a failed load offers a retry", async () => {
    getReferralStats.mockRejectedValue(new Error("boom"))

    await renderStats()

    await vi.waitFor(() =>
      expect(container.textContent).toContain("messages.errorLoadingData"),
    )
    expect(container.textContent).toContain("actions.retry")
    expect(container.textContent).not.toContain("timeout")
  })

  test("a failure other than a timeout is retried before it is shown", async () => {
    getReferralStats.mockRejectedValue(new Error("boom"))

    await renderStats()

    await vi.waitFor(() =>
      expect(container.textContent).toContain("messages.errorLoadingData"),
    )
    expect(getReferralStats.mock.calls.length).toBeGreaterThan(1)
  })

  test("a report that timed out asks for a shorter range instead of offering a retry", async () => {
    getReferralStats.mockRejectedValue(
      new ORPCError("reportTimeout", { status: 503, message: "too long" }),
    )

    await renderStats()

    await vi.waitFor(() => expect(container.textContent).toContain("timeout"))
    expect(container.textContent).not.toContain("actions.retry")
    expect(getReferralStats).toHaveBeenCalledTimes(1)
  })
})
