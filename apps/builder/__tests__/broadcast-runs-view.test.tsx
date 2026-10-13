import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { NextIntlClientProvider } from "next-intl"
import { act, useState } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import messages from "../messages/en.json"
import { BroadcastRunsView } from "../src/features/broadcasts/components/broadcast-runs-view"
import type { BroadcastResourceWithRelations } from "../src/features/broadcasts/schema/resource"

type GroupsInput = {
  workspaceId: string
  idOrName: string
  groupBy: string
  limit: number
  cursor: string | undefined
}
type OccurrencesInput = {
  idOrName: string
  from: Date
  to: Date
  cursor: string | undefined
}

const api = vi.hoisted(() => ({
  groups: vi.fn(),
  occurrences: vi.fn(),
}))

// Real tanstack options built from the call the view makes, so the real
// `useInfiniteQuery` drives loading / error / paging.
vi.mock("@/lib/orpc/query", () => {
  const infinite =
    (handler: () => (input: never) => Promise<unknown>, name: string) =>
    (options: {
      input: (cursor: string | undefined) => unknown
      initialPageParam: undefined
      getNextPageParam: (page: never) => string | undefined
    }) => ({
      queryKey: [name, options.input(undefined)],
      queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
        handler()(options.input(pageParam) as never),
      initialPageParam: options.initialPageParam,
      getNextPageParam: options.getNextPageParam,
    })
  return {
    orpc: {
      broadcastAPIs: {
        privateListBroadcastRunGroupsAPI: {
          infiniteOptions: infinite(() => api.groups, "groups"),
          key: () => ["groups"],
        },
        privateListBroadcastOccurrencesAPI: {
          infiniteOptions: infinite(() => api.occurrences, "occurrences"),
          key: () => ["occurrences"],
        },
      },
    },
  }
})

vi.mock("nuqs", () => ({
  parseAsStringEnum: () => ({ withDefault: (value: string) => value }),
  useQueryState: (_key: string, initial: string) => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useState(initial)
  },
}))

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
  }: {
    href: string
    children: React.ReactNode
  }) => <a href={href}>{children}</a>,
}))

vi.mock(
  "../src/features/broadcasts/components/broadcast-contacts-dialog",
  () => ({
    BroadcastContactsDialog: (props: {
      open: boolean
      broadcastId: string
      eventType: string
      total: number
    }) =>
      props.open ? (
        <div data-testid="contacts-dialog">
          {props.broadcastId}:{props.eventType}:{props.total}
        </div>
      ) : null,
  }),
)

const BROADCAST = {
  id: "bc-series",
  name: "Daily digest",
  status: "recurring",
  schedulesType: "recurring",
  occurrenceAt: null,
  recurrence: {
    id: "r-1",
    rule: {
      frequency: "daily",
      interval: 1,
      timeOfDay: "09:00",
      timezone: "Asia/Ho_Chi_Minh",
      startsOn: "2026-10-01",
      end: { kind: "never" },
    },
    nextRunAt: new Date("2026-10-16T02:00:00Z"),
    occurrenceCount: 2,
    lastOccurrenceAt: new Date("2026-10-15T02:00:00Z"),
    pausedAt: null,
    endedAt: null,
  },
} as unknown as BroadcastResourceWithRelations

const group = (overrides: Record<string, unknown> = {}) => ({
  periodStart: "2026-10-15",
  periodEnd: "2026-10-16",
  periodStartAt: "2026-10-14T17:00:00.000Z",
  periodEndAt: "2026-10-15T17:00:00.000Z",
  slotCount: 3,
  createdCount: 1,
  skippedCount: 1,
  missedCount: 1,
  reasonCounts: { paused: 1, catchUpSuperseded: 1 },
  runStateCounts: { sent: 1 },
  stats: {
    "message:sent": 100,
    "message:delivered": 90,
    "message:seen": 40,
    "flow:clicked": 5,
    "message:failed": 10,
  },
  ...overrides,
})

const groupsPage = (
  data: ReturnType<typeof group>[],
  nextCursor: string | null = null,
) => ({
  data,
  nextCursor,
  totalSlots: 12,
  totalRuns: 7,
  timezone: "Asia/Ho_Chi_Minh",
  weekStartsOn: "monday",
})

const occurrence = (overrides: Record<string, unknown> = {}) => ({
  localSlot: "2026-10-15 09:00",
  occurrenceAt: new Date("2026-10-15T02:00:00Z"),
  outcome: "created",
  reason: null,
  latenessMs: 0,
  supersededCount: 1,
  run: {
    id: "run-1",
    status: "sent",
    contactCount: 100,
    isStalled: false,
    stats: { "message:delivered": 90, "message:failed": 10 },
  },
  ...overrides,
})

describe("BroadcastRunsView", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
    api.groups.mockReset()
    api.occurrences.mockReset()
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  const render = async (broadcast = BROADCAST) => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    act(() => {
      root.render(
        <QueryClientProvider client={client}>
          <NextIntlClientProvider
            locale="en"
            messages={messages}
            timeZone="UTC"
          >
            <BroadcastRunsView broadcast={broadcast} workspaceId="ws-1" />
          </NextIntlClientProvider>
        </QueryClientProvider>,
      )
    })
    await flush()
  }
  // Query results land a few ticks after the promise settles.
  const flush = () =>
    act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  const text = () => container.textContent ?? ""
  const buttonByText = (label: string) =>
    Array.from(container.querySelectorAll("button")).find(
      (button) =>
        button.textContent?.includes(label) ||
        button.getAttribute("aria-label") === label,
    )

  test("shows a busy skeleton while the groups load", async () => {
    api.groups.mockReturnValue(new Promise(() => undefined))
    await render()

    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull()
  })

  test("lists each period with its runs, misses and skips and delivery rate", async () => {
    api.groups.mockResolvedValue(groupsPage([group()]))
    await render()

    expect(text()).toContain("Oct 15, 2026")
    expect(text()).toContain("1 run")
    expect(text()).toContain("1 missed")
    expect(text()).toContain("1 skipped")
    expect(text()).toContain("90% delivered")
    expect(text()).toContain("7 runs")
  })

  test("asks for days first, newest page, in the series' workspace", async () => {
    api.groups.mockResolvedValue(groupsPage([group()]))
    await render()

    const input = api.groups.mock.calls[0]?.[0] as GroupsInput
    expect(input).toMatchObject({
      workspaceId: "ws-1",
      idOrName: "bc-series",
      groupBy: "day",
      cursor: undefined,
    })
  })

  test("switching to week regroups by week", async () => {
    api.groups.mockResolvedValue(groupsPage([group()]))
    await render()

    act(() => {
      buttonByText("Week")?.click()
    })
    await flush()

    const last = api.groups.mock.calls.at(-1)?.[0] as GroupsInput
    expect(last.groupBy).toBe("week")
    expect(text()).toContain("Week of")
  })

  test("says there are no runs yet", async () => {
    api.groups.mockResolvedValue(groupsPage([]))
    await render()

    expect(text()).toContain("No runs yet")
  })

  test("reports a load failure and can retry", async () => {
    api.groups.mockRejectedValueOnce(new Error("boom"))
    api.groups.mockResolvedValue(groupsPage([group()]))
    await render()

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Could not load the runs.",
    )
    act(() => {
      buttonByText("Try again")?.click()
    })
    await flush()

    expect(text()).toContain("Oct 15, 2026")
    expect(container.querySelector('[role="alert"]')).toBeNull()
  })

  test("loads the next page of groups with the cursor", async () => {
    api.groups.mockResolvedValueOnce(groupsPage([group()], "cursor-2"))
    api.groups.mockResolvedValueOnce(
      groupsPage([
        group({
          periodStart: "2026-10-14",
          periodStartAt: "2026-10-13T17:00:00.000Z",
          periodEndAt: "2026-10-14T17:00:00.000Z",
        }),
      ]),
    )
    await render()

    act(() => {
      buttonByText("Load more")?.click()
    })
    await flush()

    expect(api.groups.mock.calls[1]?.[0]).toMatchObject({ cursor: "cursor-2" })
    expect(text()).toContain("Oct 14, 2026")
    expect(buttonByText("Load more")).toBeUndefined()
  })

  test("a group stays closed, and fetches nothing, until it is opened", async () => {
    api.groups.mockResolvedValue(groupsPage([group()]))
    await render()

    expect(api.occurrences).not.toHaveBeenCalled()
    const header = container.querySelector<HTMLButtonElement>(
      "button[aria-expanded]",
    )
    expect(header?.getAttribute("aria-expanded")).toBe("false")
  })

  test("opening a group lists its slots, including the ones not sent and why", async () => {
    api.groups.mockResolvedValue(groupsPage([group()]))
    api.occurrences.mockResolvedValue({
      data: [
        occurrence(),
        occurrence({
          localSlot: "2026-10-15 08:00",
          occurrenceAt: new Date("2026-10-15T01:00:00Z"),
          outcome: "skipped",
          reason: "paused",
          run: null,
        }),
        occurrence({
          localSlot: "2026-10-14 09:00",
          outcome: "missed",
          reason: "catchUpSuperseded",
          supersededCount: 3,
          run: null,
        }),
      ],
      nextCursor: null,
    })
    await render()

    act(() => {
      container
        .querySelector<HTMLButtonElement>("button[aria-expanded]")
        ?.click()
    })
    await flush()

    const input = api.occurrences.mock.calls[0]?.[0] as OccurrencesInput
    expect(input.idOrName).toBe("bc-series")
    expect(input.from.toISOString()).toBe("2026-10-14T17:00:00.000Z")
    expect(input.to.toISOString()).toBe("2026-10-15T17:00:00.000Z")
    expect(text()).toContain("Not sent — the schedule was paused")
    expect(text()).toContain(
      "Not sent — the platform was down; a later run was sent instead",
    )
    expect(text()).toContain("3 earlier slots missed")
    expect(text()).toContain("100 recipients")
  })

  test("calls out a stalled and a late run", async () => {
    api.groups.mockResolvedValue(groupsPage([group()]))
    api.occurrences.mockResolvedValue({
      data: [
        occurrence({
          latenessMs: 2 * 60 * 60 * 1000,
          run: {
            id: "run-late",
            status: "scheduled",
            contactCount: null,
            isStalled: true,
            stats: {},
          },
        }),
      ],
      nextCursor: null,
    })
    await render()
    act(() => {
      container
        .querySelector<HTMLButtonElement>("button[aria-expanded]")
        ?.click()
    })
    await flush()

    expect(text()).toContain("Stalled")
    expect(text()).toContain("Late by 2 hours")
  })

  test("does not call a run that was handled within minutes late", async () => {
    api.groups.mockResolvedValue(groupsPage([group()]))
    api.occurrences.mockResolvedValue({
      data: [occurrence({ latenessMs: 60_000 })],
      nextCursor: null,
    })
    await render()
    act(() => {
      container
        .querySelector<HTMLButtonElement>("button[aria-expanded]")
        ?.click()
    })
    await flush()

    expect(text()).not.toContain("Late by")
  })

  test("every stat of a run opens its recipients, and an empty count is disabled", async () => {
    api.groups.mockResolvedValue(groupsPage([group()]))
    api.occurrences.mockResolvedValue({
      data: [
        occurrence({
          run: {
            id: "run-1",
            status: "sent",
            contactCount: 100,
            isStalled: false,
            stats: {
              "message:sent": 100,
              "message:delivered": 100,
              "message:seen": 60,
              "flow:clicked": 12,
              "message:failed": 0,
            },
          },
        }),
      ],
      nextCursor: null,
    })
    await render()
    act(() => {
      container
        .querySelector<HTMLButtonElement>("button[aria-expanded]")
        ?.click()
    })
    await flush()

    expect(buttonByText("Failed: 0")?.disabled).toBe(true)
    const opened = () =>
      container.querySelector('[data-testid="contacts-dialog"]')?.textContent
    for (const [label, expected] of [
      ["Sent: 100", "run-1:message:sent:100"],
      ["Delivered: 100", "run-1:message:delivered:100"],
      ["Seen: 60", "run-1:message:seen:60"],
      ["Clicked: 12", "run-1:flow:clicked:12"],
    ] as const) {
      act(() => {
        buttonByText(label)?.click()
      })
      expect(opened()).toBe(expected)
    }
  })

  test("a failure loading one group's slots is local to it", async () => {
    api.groups.mockResolvedValue(groupsPage([group()]))
    api.occurrences.mockRejectedValue(new Error("boom"))
    await render()
    act(() => {
      container
        .querySelector<HTMLButtonElement>("button[aria-expanded]")
        ?.click()
    })
    await flush()

    expect(text()).toContain("Oct 15, 2026")
    expect(text()).toContain("Could not load the runs.")
  })

  test("shows a pause notice with the date for a paused series", async () => {
    api.groups.mockResolvedValue(groupsPage([group()]))
    await render({
      ...BROADCAST,
      status: "cancelled",
      recurrence: {
        ...BROADCAST.recurrence,
        nextRunAt: null,
        pausedAt: new Date("2026-10-15T01:00:00Z"),
      },
    } as BroadcastResourceWithRelations)

    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      "Paused since Oct 15, 2026",
    )
  })

  test("links back to the repeating list", async () => {
    api.groups.mockResolvedValue(groupsPage([group()]))
    await render()

    expect(
      container.querySelector<HTMLAnchorElement>("a")?.getAttribute("href"),
    ).toBe("/space/ws-1/broadcasts?kind=repeating")
  })

  test("a period with no sent run shows no stat grid, not a row of zeros", async () => {
    api.groups.mockResolvedValue(
      groupsPage([
        group({ createdCount: 0, missedCount: 1, skippedCount: 0, stats: {} }),
      ]),
    )
    api.occurrences.mockResolvedValue({ data: [], nextCursor: null })
    await render()
    act(() => {
      container
        .querySelector<HTMLButtonElement>("button[aria-expanded]")
        ?.click()
    })
    await flush()

    expect(container.querySelector("dl")).toBeNull()
  })

  const openFirstGroup = async (createdCount: number) => {
    api.groups.mockResolvedValue(groupsPage([group({ createdCount })]))
    api.occurrences.mockResolvedValue({
      data: [occurrence()],
      nextCursor: null,
    })
    await render()
    act(() => {
      container
        .querySelector<HTMLButtonElement>("button[aria-expanded]")
        ?.click()
    })
    await flush()
  }

  test("a period with one run frames its numbers once, as buttons on the run", async () => {
    await openFirstGroup(1)

    // One grid, and it is the run's own: every number is a button.
    expect(container.querySelectorAll("dl")).toHaveLength(1)
    expect(container.querySelectorAll("dl button").length).toBeGreaterThan(0)
    expect(text()).not.toContain("Delivered: 90")
  })

  test("a period with several runs shows plain totals above runs that carry their own buttons", async () => {
    await openFirstGroup(3)

    expect(container.querySelectorAll("dl")).toHaveLength(1)
    expect(container.querySelectorAll("dl button")).toHaveLength(0)
    expect(buttonByText("Delivered: 90")).toBeDefined()
  })
})
