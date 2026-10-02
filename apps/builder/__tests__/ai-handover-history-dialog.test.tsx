import { NextIntlClientProvider } from "next-intl"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import messages from "../messages/en.json"
import type { AiHandoverBulkRunResource } from "../src/features/integration-ai-handover/schema/bulk"

const query = vi.hoisted(() => ({
  result: {} as Record<string, unknown>,
  options: undefined as
    | undefined
    | {
        input: Record<string, unknown>
        enabled: boolean
        refetchInterval: (q: {
          state: { data?: { data: { status: string }[] } }
        }) => number | false
      },
  refetch: vi.fn(),
}))
vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: NonNullable<typeof query.options>) => {
    query.options = options
    return { ...query.result, refetch: query.refetch }
  },
}))
vi.mock("@/lib/orpc/query", () => ({
  orpc: {
    aiHandoverAPIs: {
      listBulkHistory: { queryOptions: (options: unknown) => options },
    },
  },
}))

const { AiHandoverHistoryDialog } = await import(
  "../src/features/integration-ai-handover/components/ai-handover-history-dialog"
)

const run = (
  overrides: Partial<AiHandoverBulkRunResource> = {},
): AiHandoverBulkRunResource => ({
  id: "run-1",
  action: "disable",
  status: "completed",
  message: "A person is here",
  requestedAt: new Date("2026-10-02T10:00:00Z"),
  startedAt: new Date("2026-10-02T10:00:05Z"),
  finishedAt: new Date("2026-10-02T10:05:00Z"),
  processedCount: 3,
  skippedCount: 1,
  failedCount: 2,
  totalCount: 6,
  currentError: null,
  requestedByName: "Linh",
  pausedUntil: null,
  ...overrides,
})

describe("AiHandoverHistoryDialog", () => {
  let container: HTMLDivElement
  let root: Root

  const render = (isRunLive = false) =>
    act(() => {
      root.render(
        <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
          <AiHandoverHistoryDialog
            inboxId="inbox-1"
            isRunLive={isRunLive}
            workspaceId="ws-1"
          />
        </NextIntlClientProvider>,
      )
    })
  const button = (label: string) =>
    Array.from(
      document.body.querySelectorAll<HTMLButtonElement>("button"),
    ).find(
      (candidate) =>
        candidate.textContent?.trim() === label ||
        candidate.getAttribute("aria-label") === label,
    )
  const open = () => act(() => button("History")?.click())

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    vi.clearAllMocks()
    query.result = { data: undefined, isPending: true, isError: false }
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    document.body.innerHTML = ""
  })

  test("loads nothing until it is opened", () => {
    render()

    expect(query.options?.enabled).toBe(false)
    open()
    expect(query.options?.enabled).toBe(true)
    expect(query.options?.input).toEqual({
      workspaceId: "ws-1",
      inboxId: "inbox-1",
      page: 1,
      perPage: 10,
    })
  })

  test("shows a loading state while the first page loads", () => {
    render()
    open()

    expect(document.body.querySelector("[role='status']")).not.toBeNull()
  })

  test("shows the empty state when the Page has no run yet", () => {
    query.result = {
      data: { data: [], pageCount: 0 },
      isPending: false,
      isError: false,
    }
    render()
    open()

    expect(document.body.textContent).toContain("No runs yet.")
  })

  test("shows an error with a retry that refetches", () => {
    query.result = { data: undefined, isPending: false, isError: true }
    render()
    open()

    expect(document.body.textContent).toContain("Could not load the history.")
    act(() => button("Retry")?.click())
    expect(query.refetch).toHaveBeenCalledTimes(1)
  })

  test("lists each run: action, status, progress, finish time, message and requester", () => {
    query.result = {
      data: { data: [run()], pageCount: 1 },
      isPending: false,
      isError: false,
    }
    render()
    open()

    const text = document.body.textContent ?? ""
    expect(text).toContain("Disable for all")
    expect(text).toContain("Completed")
    expect(text).toContain("6 of 6 conversations")
    expect(text).toContain("3 done, 1 skipped, 2 failed")
    expect(text).toContain("A person is here")
    expect(text).toContain("Linh")
    expect(document.body.textContent).not.toContain("1 / 1")
  })

  test("a failed run shows its reason and a paused one says until when", () => {
    query.result = {
      data: {
        data: [
          run({ id: "a", status: "failed", currentError: "tokenInvalid" }),
          run({
            id: "b",
            status: "running",
            finishedAt: null,
            pausedUntil: new Date("2026-10-02T13:30:00Z"),
          }),
        ],
        pageCount: 1,
      },
      isPending: false,
      isError: false,
    }
    render()
    open()

    const text = document.body.textContent ?? ""
    expect(text).toContain("access was revoked")
    expect(text).toContain("Paused until")
  })

  test("a long message is truncated with the full text on hover", () => {
    const long = "x".repeat(80)
    query.result = {
      data: { data: [run({ message: long })], pageCount: 1 },
      isPending: false,
      isError: false,
    }
    render()
    open()

    const cell = document.body.querySelector(`[title='${long}']`)
    expect(cell?.textContent).toBe(`${"x".repeat(60)}…`)
  })

  test("pages through the history ten at a time", () => {
    query.result = {
      data: { data: [run()], pageCount: 3 },
      isPending: false,
      isError: false,
    }
    render()
    open()
    expect(button("Previous page")?.hasAttribute("disabled")).toBe(true)

    act(() => button("Next page")?.click())

    expect(query.options?.input).toMatchObject({ page: 2 })
    expect(document.body.textContent).toContain("2 / 3")
  })

  test("a single page shows no pager", () => {
    query.result = {
      data: { data: [run()], pageCount: 1 },
      isPending: false,
      isError: false,
    }
    render()
    open()

    expect(button("Next page")).toBeUndefined()
  })

  test("refreshes every five seconds while the Page's run is live, or any listed row still is", () => {
    const poll = (isRunLive: boolean, rows?: { status: string }[]) => {
      render(isRunLive)
      return query.options?.refetchInterval({
        state: { data: rows ? { data: rows } : undefined },
      })
    }

    expect(poll(true)).toBe(5000)
    // The status query may settle (or show no run while a change waits) before
    // this list does: its own rows keep it polling.
    expect(poll(false, [{ status: "cancelling" }])).toBe(5000)
    expect(poll(false, [{ status: "completed" }, { status: "running" }])).toBe(
      5000,
    )
    expect(poll(false, [{ status: "completed" }, { status: "failed" }])).toBe(
      false,
    )
    expect(poll(false)).toBe(false)
  })
})
