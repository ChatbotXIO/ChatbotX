// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const listBroadcastsMock = vi.hoisted(() => vi.fn())

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useFormatter: () => ({ dateTime: () => "formatted time" }),
}))
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string
    children: React.ReactNode
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))
vi.mock("@/features/inboxes/lib/channel-label", () => ({
  channelLabel: (channel: string) => `label:${channel}`,
}))
vi.mock("@/lib/orpc/query", () => ({
  orpc: {
    contactsAPIs: {
      listContactBroadcastsAuthenticatedAPI: {
        infiniteOptions: ({
          input,
          initialPageParam,
          getNextPageParam,
        }: {
          input: (cursor: string | undefined) => unknown
          initialPageParam: undefined
          getNextPageParam: (page: { nextCursor: string | null }) => unknown
        }) => ({
          // Like the real key, it carries the input: a new search is a new query.
          queryKey: ["contact-broadcasts", JSON.stringify(input(undefined))],
          queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
            listBroadcastsMock(input(pageParam)),
          initialPageParam,
          getNextPageParam,
        }),
      },
    },
  },
}))

import { ContactBroadcastsList } from "@/features/contacts/components/contact-broadcasts-list"

const broadcast = (overrides: Record<string, unknown> = {}) => ({
  broadcastId: "9",
  name: "Black Friday",
  broadcastStatus: "sent",
  channel: "messenger",
  scheduledAt: new Date("2026-10-20T08:00:00Z"),
  recipientStatus: "delivered",
  deliveredAt: new Date("2026-10-20T08:01:00Z"),
  seenAt: null,
  clickedAt: null,
  failedAt: null,
  ...overrides,
})

describe("ContactBroadcastsList", () => {
  let container: HTMLDivElement
  let root: Root
  let queryClient: QueryClient

  const render = (canOpenBroadcast = true) => {
    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <ContactBroadcastsList
            canOpenBroadcast={canOpenBroadcast}
            contactId="contact-1"
            workspaceId="ws-1"
          />
        </QueryClientProvider>,
      )
    })
  }

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    listBroadcastsMock.mockReset()
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
    queryClient.clear()
  })

  test("shows a loader while the first page is loading", () => {
    listBroadcastsMock.mockReturnValue(new Promise(() => undefined))

    render()

    expect(container.querySelector(".animate-spin")).not.toBeNull()
  })

  test("shows the empty state for a contact nobody has sent a broadcast to", async () => {
    listBroadcastsMock.mockResolvedValueOnce({ data: [], nextCursor: null })

    render()

    await vi.waitFor(() => {
      expect(container.textContent).toContain("contactBroadcasts.empty")
    })
  })

  test("shows each broadcast with its name, outcome, channel and time, newest first as served", async () => {
    listBroadcastsMock.mockResolvedValueOnce({
      data: [
        broadcast(),
        broadcast({
          broadcastId: "8",
          name: "Welcome",
          channel: "whatsapp",
          recipientStatus: "failed",
          failedAt: new Date("2026-10-19T08:00:00Z"),
        }),
      ],
      nextCursor: null,
    })

    render()

    await vi.waitFor(() => {
      expect(container.textContent).toContain("Black Friday")
    })
    const text = container.textContent ?? ""
    expect(text.indexOf("Black Friday")).toBeLessThan(text.indexOf("Welcome"))
    expect(text).toContain("broadcasts.stats.delivered")
    expect(text).toContain("broadcasts.stats.failed")
    expect(text).toContain("label:messenger")
    expect(text).toContain("label:whatsapp")
    expect(text).toContain("formatted time")
  })

  test("links the name to that broadcast for a member who may open Broadcasts", async () => {
    listBroadcastsMock.mockResolvedValueOnce({
      data: [broadcast()],
      nextCursor: null,
    })

    render(true)

    await vi.waitFor(() => {
      expect(container.querySelector("a")).not.toBeNull()
    })
    expect(container.querySelector("a")?.getAttribute("href")).toBe(
      "/space/ws-1/broadcasts?broadcastId=9",
    )
  })

  test("shows the name as plain text, with no link, for a member who may not open Broadcasts", async () => {
    listBroadcastsMock.mockResolvedValueOnce({
      data: [broadcast()],
      nextCursor: null,
    })

    render(false)

    await vi.waitFor(() => {
      expect(container.textContent).toContain("Black Friday")
    })
    expect(container.querySelector("a")).toBeNull()
  })

  test("is read-only: there is nothing to add or remove", async () => {
    listBroadcastsMock.mockResolvedValueOnce({
      data: [broadcast()],
      nextCursor: null,
    })

    render()

    await vi.waitFor(() => {
      expect(container.textContent).toContain("Black Friday")
    })
    expect(container.querySelector("button")).toBeNull()
  })

  test("loads the next page with the cursor of the previous one", async () => {
    listBroadcastsMock
      .mockResolvedValueOnce({ data: [broadcast()], nextCursor: "cursor-1" })
      .mockResolvedValueOnce({
        data: [broadcast({ broadcastId: "7", name: "Older" })],
        nextCursor: null,
      })

    render()
    await vi.waitFor(() => {
      expect(container.textContent).toContain("actions.loadMore")
    })
    act(() => {
      container.querySelector("button")?.click()
    })

    await vi.waitFor(() => {
      expect(container.textContent).toContain("Older")
    })
    expect(listBroadcastsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: "cursor-1", contactId: "contact-1" }),
    )
    expect(container.textContent).not.toContain("actions.loadMore")
  })

  test("a failed first load offers a retry", async () => {
    listBroadcastsMock.mockRejectedValueOnce(new Error("boom"))

    render()

    await vi.waitFor(() => {
      expect(container.textContent).toContain("messages.errorLoadingData")
    })
    expect(container.textContent).toContain("actions.retry")
  })

  test("scrolls inside a capped height instead of stretching the panel", async () => {
    listBroadcastsMock.mockResolvedValueOnce({
      data: [broadcast()],
      nextCursor: null,
    })

    render()

    await vi.waitFor(() => {
      expect(container.textContent).toContain("Black Friday")
    })
    const scroller = container.querySelector(".overflow-y-auto")
    expect(scroller?.className).toContain("max-h-72")
    expect(scroller?.textContent).toContain("Black Friday")
    // The search stays above the scrolling rows.
    expect(scroller?.querySelector("input")).toBeNull()
  })

  describe("search", () => {
    const type = (value: string) => {
      const input = container.querySelector("input") as HTMLInputElement
      const setValue = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set
      act(() => {
        setValue?.call(input, value)
        input.dispatchEvent(new Event("input", { bubbles: true }))
      })
    }

    afterEach(() => {
      vi.useRealTimers()
    })

    test("asks the server for the typed name or id once typing pauses, trimmed", async () => {
      listBroadcastsMock.mockResolvedValue({
        data: [broadcast()],
        nextCursor: null,
      })
      render()
      await vi.waitFor(() => {
        expect(container.textContent).toContain("Black Friday")
      })
      vi.useFakeTimers()

      type("  Black  ")
      expect(listBroadcastsMock).toHaveBeenCalledTimes(1)
      act(() => {
        vi.advanceTimersByTime(300)
      })

      await vi.waitFor(() => {
        expect(listBroadcastsMock).toHaveBeenLastCalledWith(
          expect.objectContaining({ search: "Black", contactId: "contact-1" }),
        )
      })
    })

    test("sends no search when the box is empty", async () => {
      listBroadcastsMock.mockResolvedValue({ data: [], nextCursor: null })

      render()

      await vi.waitFor(() => {
        expect(listBroadcastsMock).toHaveBeenCalled()
      })
      expect(listBroadcastsMock.mock.calls[0]?.[0]).toMatchObject({
        search: undefined,
      })
    })

    test("keeps the search box while the matches load, and says so when none match", async () => {
      listBroadcastsMock
        .mockResolvedValueOnce({ data: [broadcast()], nextCursor: null })
        .mockResolvedValueOnce({ data: [], nextCursor: null })
      render()
      await vi.waitFor(() => {
        expect(container.textContent).toContain("Black Friday")
      })
      vi.useFakeTimers()

      type("zzz")
      act(() => {
        vi.advanceTimersByTime(300)
      })

      await vi.waitFor(() => {
        expect(container.textContent).toContain("messages.noResults")
      })
      expect(container.textContent).not.toContain("contactBroadcasts.empty")
      expect((container.querySelector("input") as HTMLInputElement).value).toBe(
        "zzz",
      )
    })
  })
})
