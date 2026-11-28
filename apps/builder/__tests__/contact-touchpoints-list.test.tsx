// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { ReactNode } from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import {
  ContactTouchpointsList,
  dedupeByRowKey,
} from "@/features/contacts/components/contact-touchpoints-list"
import type { ContactTouchpointResource } from "@/features/contacts/schema/touchpoint"

const listTouchpoints = vi.hoisted(() => vi.fn())

vi.mock("next-intl", () => {
  const translate = (key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${JSON.stringify(params)}` : key
  return {
    useTranslations: () => Object.assign(translate, { has: () => true }),
    useFormatter: () => ({ dateTime: () => "Oct 20, 2026, 8:00 AM" }),
  }
})

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    className,
  }: {
    children: ReactNode
    href: string
    className?: string
  }) => (
    <a className={className} href={href}>
      {children}
    </a>
  ),
}))

vi.mock("@/features/inboxes/lib/channel-label", () => ({
  channelLabel: (channel: string) => `label:${channel}`,
}))

vi.mock("@/features/tools/tools-list", () => ({
  TOOLS_CONFIG: [
    "minigames",
    "poll-manager",
    "tiktok-comment",
    "qr-code",
    "reflinks",
  ].map((id) => ({
    id,
    labelKey: `tool.${id}`,
    icon: () => <svg data-testid="tool-icon" />,
    getLink: (workspaceId: string) => `/space/${workspaceId}/${id}`,
  })),
}))

vi.mock("@/lib/orpc/orpc", () => ({
  client: {
    contactsAPIs: { listContactTouchpointsAuthenticatedAPI: listTouchpoints },
  },
}))

const touchpoint = (
  overrides: Record<string, unknown>,
): ContactTouchpointResource =>
  ({
    resourceKey: "1",
    resourceName: "Name",
    occurredAt: new Date("2026-10-20T08:00:00.000Z"),
    channel: null,
    inboxId: null,
    ...overrides,
  }) as ContactTouchpointResource

const minigame = touchpoint({
  kind: "minigame",
  resourceKey: "10",
  resourceName: "Lucky wheel",
  details: { played: 3, lastPrizeName: "Coffee", lastWon: true },
})
const poll = touchpoint({
  kind: "poll",
  resourceKey: "20",
  resourceName: "Best staff",
  details: { candidateName: "Alice" },
})

describe("ContactTouchpointsList", () => {
  let container: HTMLDivElement
  let root: Root
  let queryClient: QueryClient

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    listTouchpoints.mockReset()
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
          <ContactTouchpointsList contactId="c-1" workspaceId="ws-1" />
        </QueryClientProvider>,
      )
    })
    await vi.waitFor(() => expect(listTouchpoints).toHaveBeenCalled())
  }

  test("loads the first page of the contact's touchpoints", async () => {
    listTouchpoints.mockResolvedValue({ data: [], nextCursor: null })

    await renderList()

    expect(listTouchpoints).toHaveBeenCalledWith(
      { workspaceId: "ws-1", contactId: "c-1", perPage: 20 },
      expect.anything(),
    )
  })

  test("shows a spinner while the first page loads", async () => {
    listTouchpoints.mockReturnValue(new Promise(() => undefined))

    await renderList()

    expect(container.querySelector(".animate-spin")).not.toBeNull()
  })

  test("says so when the contact has no touchpoints", async () => {
    listTouchpoints.mockResolvedValue({ data: [], nextCursor: null })

    await renderList()

    await vi.waitFor(() =>
      expect(container.textContent).toContain("contactTouchpoints.empty"),
    )
  })

  test("shows an error with a retry that loads again", async () => {
    listTouchpoints.mockRejectedValueOnce(new Error("boom"))
    listTouchpoints.mockResolvedValue({ data: [minigame], nextCursor: null })

    await renderList()
    await vi.waitFor(() =>
      expect(container.textContent).toContain("messages.errorLoadingData"),
    )
    const retry = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("actions.retry"),
    )
    act(() => {
      retry?.click()
    })

    await vi.waitFor(() =>
      expect(container.textContent).toContain("Lucky wheel"),
    )
    expect(listTouchpoints).toHaveBeenCalledTimes(2)
  })

  test("lists the rows in the given order, each linking to its tool with its facts", async () => {
    listTouchpoints.mockResolvedValue({
      data: [
        touchpoint({
          kind: "inboxSource",
          resourceKey: "5",
          resourceName: "Instagram main",
          channel: "instagram",
          details: { source: "direct" },
        }),
        minigame,
        poll,
        touchpoint({
          kind: "commentAutomation",
          resourceKey: "30",
          resourceName: "Reply bot",
          details: { automationType: "tiktok", replies: 4 },
        }),
        touchpoint({
          kind: "refLink",
          resourceKey: "40",
          resourceName: "Poster",
          details: { linkType: "qrCode", visits: 2 },
        }),
      ],
      nextCursor: null,
    })

    await renderList()

    await vi.waitFor(() =>
      expect(container.textContent).toContain("Lucky wheel"),
    )
    const text = container.textContent ?? ""
    expect(text.indexOf("Instagram main")).toBeLessThan(
      text.indexOf("Lucky wheel"),
    )
    expect(text.indexOf("Lucky wheel")).toBeLessThan(text.indexOf("Best staff"))
    expect(text).toContain("condition.sources.direct")
    expect(text).toContain("label:instagram")
    expect(text).toContain('contactTouchpoints.details.played:{"count":3}')
    expect(text).toContain(
      'contactTouchpoints.details.lastPrize:{"prize":"Coffee"}',
    )
    expect(text).toContain(
      'contactTouchpoints.details.pollChoice:{"name":"Alice"}',
    )
    const hrefs = Array.from(container.querySelectorAll("a")).map((a) =>
      a.getAttribute("href"),
    )
    expect(hrefs).toEqual([
      "/space/ws-1/minigames",
      "/space/ws-1/poll-manager",
      "/space/ws-1/tiktok-comment",
      "/space/ws-1/qr-code",
    ])
  })

  test("links a post comment to its permalink only when it is http(s)", async () => {
    listTouchpoints.mockResolvedValue({
      data: [
        touchpoint({
          kind: "postComment",
          resourceKey: "1",
          resourceName: "Safe post",
          details: { permalink: "https://example.test/p", thumbnail: null },
        }),
        touchpoint({
          kind: "postComment",
          resourceKey: "2",
          resourceName: "Unsafe post",
          details: { permalink: "javascript:alert(1)", thumbnail: null },
        }),
      ],
      nextCursor: null,
    })

    await renderList()

    await vi.waitFor(() =>
      expect(container.textContent).toContain("Unsafe post"),
    )
    const anchors = Array.from(container.querySelectorAll("a"))
    expect(anchors.map((a) => a.getAttribute("href"))).toEqual([
      "https://example.test/p",
    ])
  })

  test("loads more with the cursor and shows a row that appears on two pages once", async () => {
    listTouchpoints
      .mockResolvedValueOnce({ data: [minigame], nextCursor: "next-1" })
      .mockResolvedValueOnce({ data: [minigame, poll], nextCursor: null })

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
      expect(container.textContent).toContain("Best staff"),
    )
    expect(listTouchpoints.mock.calls[1]?.[0]).toMatchObject({
      cursor: "next-1",
    })
    expect(container.textContent?.split("Lucky wheel").length).toBe(2)
    expect(container.textContent).not.toContain("actions.loadMore")
  })

  test("a failed next page keeps the rows already loaded and offers a retry", async () => {
    listTouchpoints
      .mockResolvedValueOnce({ data: [minigame], nextCursor: "next-1" })
      .mockRejectedValueOnce(new Error("boom"))

    await renderList()
    await vi.waitFor(() =>
      expect(container.textContent).toContain("actions.loadMore"),
    )
    act(() => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent?.includes("actions.loadMore"))
        ?.click()
    })

    await vi.waitFor(() =>
      expect(container.querySelector('[role="alert"]')).not.toBeNull(),
    )
    expect(container.textContent).toContain("Lucky wheel")
    expect(container.textContent).toContain("actions.retry")
  })
})

describe("dedupeByRowKey", () => {
  test("keeps the first copy of a row and the order of the rest", () => {
    const newer = touchpoint({
      kind: "poll",
      resourceKey: "20",
      resourceName: "Newer",
      details: { candidateName: null },
    })

    expect(dedupeByRowKey([minigame, poll, newer, minigame])).toEqual([
      minigame,
      poll,
    ])
  })

  test("treats the same key under two kinds as two rows", () => {
    const sameKey = touchpoint({
      kind: "minigame",
      resourceKey: "20",
      details: { played: 0, lastPrizeName: null, lastWon: null },
    })

    expect(dedupeByRowKey([poll, sameKey])).toHaveLength(2)
  })
})
