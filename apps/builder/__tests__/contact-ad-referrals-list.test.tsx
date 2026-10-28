// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { ContactAdReferralsList } from "@/features/contacts/components/contact-ad-referrals-list"

const listAdReferrals = vi.hoisted(() => vi.fn())

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useFormatter: () => ({ dateTime: () => "Oct 20, 2026, 8:00 AM" }),
}))

vi.mock("@/features/inboxes/lib/channel-label", () => ({
  channelLabel: (channel: string) => `label:${channel}`,
}))

vi.mock("@/lib/orpc/orpc", () => ({
  client: {
    contactsAPIs: { listContactAdReferralsAuthenticatedAPI: listAdReferrals },
  },
}))

const referral = (overrides: Record<string, unknown> = {}) => ({
  id: "9",
  adId: "120",
  title: "Summer sale",
  channel: "messenger",
  provider: "meta",
  campaignId: null,
  adGroupId: null,
  source: "ADS",
  sourceUrl: "https://fb.me/ad",
  occurredAt: new Date("2026-10-20T08:00:00.000Z"),
  ...overrides,
})

describe("ContactAdReferralsList", () => {
  let container: HTMLDivElement
  let root: Root
  let queryClient: QueryClient

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    listAdReferrals.mockReset()
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
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

  const renderList = async () => {
    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <ContactAdReferralsList contactId="c-1" workspaceId="ws-1" />
        </QueryClientProvider>,
      )
    })
    await vi.waitFor(() => expect(listAdReferrals).toHaveBeenCalled())
  }

  test("loads the first page of the contact's touches", async () => {
    listAdReferrals.mockResolvedValue({ data: [], nextCursor: null })

    await renderList()

    expect(listAdReferrals).toHaveBeenCalledWith(
      { workspaceId: "ws-1", contactId: "c-1", perPage: 20 },
      expect.anything(),
    )
  })

  test("shows each ad's headline, id, channel and time, linking to the ad", async () => {
    listAdReferrals.mockResolvedValue({
      data: [referral()],
      nextCursor: null,
    })

    await renderList()

    await vi.waitFor(() =>
      expect(container.textContent).toContain("Summer sale"),
    )
    expect(container.textContent).toContain("120")
    expect(container.textContent).toContain("label:messenger")
    expect(container.textContent).toContain("Oct 20, 2026, 8:00 AM")
    expect(container.querySelector("a")?.getAttribute("href")).toBe(
      "https://fb.me/ad",
    )
  })

  test("never turns a non-http(s) source into a link", async () => {
    listAdReferrals.mockResolvedValue({
      data: [referral({ sourceUrl: "javascript:alert(1)" })],
      nextCursor: null,
    })

    await renderList()

    await vi.waitFor(() =>
      expect(container.textContent).toContain("Summer sale"),
    )
    expect(container.querySelector("a")).toBeNull()
  })

  test("names a Google click without an ad id by its network", async () => {
    listAdReferrals.mockResolvedValue({
      data: [
        referral({
          adId: null,
          title: null,
          provider: "google",
          channel: "zalo",
        }),
      ],
      nextCursor: null,
    })

    await renderList()

    await vi.waitFor(() =>
      expect(container.textContent).toContain("condition.fields.fromGoogleAd"),
    )
    expect(container.textContent).toContain("label:zalo")
  })

  test("says so when the contact never came from an ad", async () => {
    listAdReferrals.mockResolvedValue({ data: [], nextCursor: null })

    await renderList()

    await vi.waitFor(() =>
      expect(container.textContent).toContain("contactAdReferrals.empty"),
    )
  })

  test("a failed load offers a retry", async () => {
    listAdReferrals.mockRejectedValue(new Error("boom"))

    await renderList()

    await vi.waitFor(() =>
      expect(container.textContent).toContain("messages.errorLoadingData"),
    )
    expect(container.textContent).toContain("actions.retry")
  })

  test("a failed next page keeps the loaded ads and retries only that page", async () => {
    listAdReferrals
      .mockResolvedValueOnce({
        data: [referral({ id: "9" })],
        nextCursor: "cursor-2",
      })
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({
        data: [referral({ id: "8", title: "Winter sale", adId: "121" })],
        nextCursor: null,
      })

    await renderList()
    await vi.waitFor(() =>
      expect(container.textContent).toContain("actions.loadMore"),
    )
    const clickButton = (label: string) =>
      act(() => {
        Array.from(container.querySelectorAll("button"))
          .find((button) => button.textContent?.includes(label))
          ?.click()
      })

    clickButton("actions.loadMore")
    await vi.waitFor(() =>
      expect(container.textContent).toContain("messages.errorLoadingData"),
    )
    expect(container.textContent).toContain("Summer sale")

    clickButton("actions.retry")
    await vi.waitFor(() =>
      expect(container.textContent).toContain("Winter sale"),
    )
    expect(container.textContent).not.toContain("messages.errorLoadingData")
    expect(listAdReferrals).toHaveBeenCalledTimes(3)
    expect(listAdReferrals).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: "cursor-2" }),
      expect.anything(),
    )
  })

  test("loads the next page with the cursor the server returned", async () => {
    listAdReferrals
      .mockResolvedValueOnce({
        data: [referral({ id: "9" })],
        nextCursor: "cursor-2",
      })
      .mockResolvedValueOnce({
        data: [referral({ id: "8", title: "Winter sale", adId: "121" })],
        nextCursor: null,
      })

    await renderList()
    await vi.waitFor(() =>
      expect(container.textContent).toContain("actions.loadMore"),
    )

    const loadMore = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("actions.loadMore"),
    )
    act(() => {
      loadMore?.click()
    })

    await vi.waitFor(() =>
      expect(container.textContent).toContain("Winter sale"),
    )
    expect(listAdReferrals).toHaveBeenLastCalledWith(
      {
        workspaceId: "ws-1",
        contactId: "c-1",
        perPage: 20,
        cursor: "cursor-2",
      },
      expect.anything(),
    )
    expect(container.textContent).toContain("Summer sale")
    expect(container.textContent).not.toContain("actions.loadMore")
  })
})
