import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { ContactSyncProgress } from "@/features/contact-sync/components/contact-sync-progress"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${JSON.stringify(params)}` : key,
  useFormatter: () => ({ dateTime: (date: Date) => date.toISOString() }),
}))

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }))
vi.mock("sonner", () => ({ toast }))

vi.mock("@/features/inboxes/provider/inbox-hook", () => ({
  allInboxConfigs: {},
}))

type RunQuery = {
  isPending?: boolean
  isError?: boolean
  data?: unknown
  refetch: () => void
}
type FollowUpFields = {
  followUpCoexist: boolean
  followUpRunId: string | null
  followUpError: string | null
}

const refetch = vi.hoisted(() => vi.fn())
const queryState = vi.hoisted(() => ({
  current: {} as Partial<RunQuery>,
  options: {} as {
    input?: unknown
    refetchInterval?: (query: {
      state: { data?: { status: string; items: FollowUpFields[] } }
    }) => number | false
  },
}))

const retryState = vi.hoisted(() => ({
  mutate: vi.fn(),
  isPending: false,
  options: {} as { onSuccess?: (data: { reopened: boolean }) => void },
}))
vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: typeof queryState.options) => {
    queryState.options = options
    return { refetch, ...queryState.current }
  },
  useMutation: (options: typeof retryState.options) => {
    retryState.options = options
    return { mutate: retryState.mutate, isPending: retryState.isPending }
  },
}))
vi.mock("@/features/contact-sync/hooks/use-invalidate-contact-syncs", () => ({
  useInvalidateContactSyncs: () => vi.fn(),
}))
vi.mock("@/lib/orpc/query", () => ({
  orpc: {
    contactSyncAPIs: {
      getRun: { queryOptions: (options: unknown) => options },
      retryHistory: { mutationOptions: (options: unknown) => options },
    },
  },
}))

type ActionOptions = {
  onSuccess?: () => void
  onError?: (args: { error: { serverError?: string } }) => void
}
const execute = vi.hoisted(() => vi.fn())
const bind = vi.hoisted(() => vi.fn(() => ({})))
const actionState = vi.hoisted(() => ({
  options: {} as ActionOptions,
  isPending: false,
}))
vi.mock("@/features/contact-sync/actions/contact-sync.action", () => ({
  cancelContactSyncAction: { bind },
}))
vi.mock("next-safe-action/hooks", () => ({
  useAction: (_action: unknown, options: ActionOptions) => {
    actionState.options = options
    return { execute, isPending: actionState.isPending }
  },
}))

vi.mock("@chatbotx.io/ui/components/ui/button", () => ({
  Button: ({
    children,
    ...rest
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...rest}>{children}</button>
  ),
}))
vi.mock("@chatbotx.io/ui/components/ui/badge", () => ({
  Badge: ({ children }: { children: React.ReactNode }) => (
    <span data-badge>{children}</span>
  ),
}))

const item = (overrides: Record<string, unknown> = {}) => ({
  id: "item-1",
  position: 0,
  inboxId: "i1",
  sourceChannel: "messenger",
  sourceAccountId: "page-1",
  sourceAccountName: "Shop Page",
  status: "running",
  createdCount: 3,
  updatedCount: 2,
  skippedCount: 1,
  failedCount: 0,
  skippedValueCount: 0,
  currentError: null,
  startedAt: null,
  finishedAt: null,
  followUpCoexist: false,
  followUpAiReadsSyncedHistory: false,
  followUpRunId: null,
  followUpError: null,
  ...overrides,
})

const setRun = (
  status: string,
  items: unknown[] = [item()],
  overrides: Record<string, unknown> = {},
) => {
  queryState.current = {
    data: {
      id: "run-1",
      status,
      items,
      createdAt: new Date("2030-01-01T08:00:00.000Z"),
      startedAt: null,
      finishedAt: null,
      currentError: null,
      ...overrides,
    },
  }
}

let container: HTMLDivElement | null = null
let root: Root | null = null
const onSettled = vi.fn()

function renderProgress(withDone = true) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
  act(() => {
    root?.render(
      <ContactSyncProgress
        onSettled={withDone ? onSettled : undefined}
        runId="run-1"
        workspaceId="ws-1"
      />,
    )
  })
  // biome-ignore lint/style/noNonNullAssertion: assigned synchronously above
  return container!
}

const buttonWithText = (el: HTMLElement, text: string) =>
  Array.from(el.querySelectorAll("button")).find((b) =>
    b.textContent?.includes(text),
  ) as HTMLButtonElement | undefined

beforeEach(() => {
  setRun("running")
})

afterEach(() => {
  if (root) {
    act(() => root?.unmount())
  }
  container?.remove()
  container = null
  root = null
  actionState.isPending = false
  retryState.isPending = false
  vi.clearAllMocks()
})

describe("ContactSyncProgress", () => {
  test("polls the run of the workspace and binds cancel to workspace and run", () => {
    renderProgress()

    expect(queryState.options.input).toEqual({
      workspaceId: "ws-1",
      runId: "run-1",
    })
    expect(bind).toHaveBeenCalledWith(null, "ws-1", "run-1")
  })

  test("keeps polling while live and stops once settled", () => {
    renderProgress()
    const poll = queryState.options.refetchInterval

    expect(
      poll?.({ state: { data: { status: "running", items: [] } } }),
    ).toEqual(expect.any(Number))
    expect(
      poll?.({ state: { data: { status: "cancelling", items: [] } } }),
    ).toEqual(expect.any(Number))
    for (const status of ["succeeded", "partial", "failed", "cancelled"]) {
      expect(poll?.({ state: { data: { status, items: [] } } })).toBe(false)
    }
  })

  test("keeps polling after the run ended while an item still owes its history sync", () => {
    renderProgress()
    const poll = queryState.options.refetchInterval
    const item = (overrides: Partial<FollowUpFields>) => ({
      followUpCoexist: true,
      followUpRunId: null,
      followUpError: null,
      ...overrides,
    })

    expect(
      poll?.({ state: { data: { status: "succeeded", items: [item({})] } } }),
    ).toEqual(expect.any(Number))
    expect(
      poll?.({
        state: {
          data: {
            status: "succeeded",
            items: [item({ followUpRunId: "c-1" })],
          },
        },
      }),
    ).toBe(false)
    expect(
      poll?.({
        state: {
          data: {
            status: "failed",
            items: [item({ followUpError: "expired" })],
          },
        },
      }),
    ).toBe(false)
  })

  test("shows a spinner while loading", () => {
    queryState.current = { isPending: true }

    const el = renderProgress()

    expect(el.querySelector("svg.animate-spin")).not.toBeNull()
  })

  test("shows an error with a Retry that refetches", () => {
    queryState.current = { isError: true }

    const el = renderProgress()
    expect(el.textContent).toContain("contactSync.errors.generic")
    act(() => {
      buttonWithText(el, "actions.retry")?.click()
    })

    expect(refetch).toHaveBeenCalledTimes(1)
  })

  test("renders per-source name, status and counts", () => {
    setRun("running", [
      item(),
      item({
        id: "item-2",
        sourceAccountName: null,
        status: "pending",
        createdCount: 0,
        updatedCount: 0,
        skippedCount: 0,
        failedCount: 4,
      }),
    ])

    const el = renderProgress()

    expect(el.textContent).toContain("Shop Page")
    expect(el.textContent).toContain(
      `contactSync.progress.counts:${JSON.stringify({ created: 3, updated: 2, skipped: 1, failed: 0 })}`,
    )
    expect(el.textContent).toContain("contactSync.progress.source")
    expect(el.textContent).toContain(
      `contactSync.progress.counts:${JSON.stringify({ created: 0, updated: 0, skipped: 0, failed: 4 })}`,
    )
    expect(el.textContent).toContain("contactSync.status.running")
    expect(el.textContent).toContain("contactSync.status.pending")
  })

  test("shows the skipped-values line only when some values were skipped", () => {
    setRun("running", [
      item({ skippedValueCount: 0 }),
      item({ id: "item-2", skippedValueCount: 7 }),
    ])

    const el = renderProgress()
    const text = el.textContent ?? ""

    expect(text).toContain(
      `contactSync.progress.skippedValues:${JSON.stringify({ count: 7 })}`,
    )
    expect(text.match(/contactSync\.progress\.skippedValues/g)).toHaveLength(1)
  })

  test("localizes a known item error and shows an unknown one verbatim", () => {
    setRun("failed", [
      item({ currentError: "pageNotFound" }),
      item({ id: "item-2", currentError: "something odd" }),
    ])

    const el = renderProgress()

    expect(el.textContent).toContain("contactSync.runErrors.pageNotFound")
    expect(el.textContent).toContain("something odd")
  })

  test("a live run offers Cancel, which runs the cancel action", () => {
    const el = renderProgress()

    act(() => {
      buttonWithText(el, "contactSync.progress.cancel")?.click()
    })

    expect(execute).toHaveBeenCalledTimes(1)
    expect(buttonWithText(el, "contactSync.progress.done")).toBeUndefined()
  })

  test("Cancel is disabled while the request is pending", () => {
    actionState.isPending = true

    const el = renderProgress()

    expect(buttonWithText(el, "contactSync.progress.cancel")?.disabled).toBe(
      true,
    )
  })

  test("Cancel is disabled while the run is already cancelling", () => {
    setRun("cancelling")

    const el = renderProgress()

    expect(buttonWithText(el, "contactSync.progress.cancel")?.disabled).toBe(
      true,
    )
  })

  test("a successful cancel refetches the run; a failure toasts the server error or a generic one", () => {
    renderProgress()

    act(() => {
      actionState.options.onSuccess?.()
      actionState.options.onError?.({ error: { serverError: "nope" } })
      actionState.options.onError?.({ error: {} })
    })

    expect(refetch).toHaveBeenCalledTimes(1)
    expect(toast.error).toHaveBeenNthCalledWith(1, "nope")
    expect(toast.error).toHaveBeenNthCalledWith(2, "contactSync.errors.generic")
  })

  test.each([
    "succeeded",
    "partial",
    "failed",
    "cancelled",
  ])("a %s run drops Cancel and Done calls onSettled", (status) => {
    setRun(status)

    const el = renderProgress()

    expect(buttonWithText(el, "contactSync.progress.cancel")).toBeUndefined()
    expect(el.querySelector("svg.animate-spin")).toBeNull()
    expect(onSettled).not.toHaveBeenCalled()
    act(() => {
      buttonWithText(el, "contactSync.progress.done")?.click()
    })
    expect(onSettled).toHaveBeenCalledTimes(1)
  })
  test("a finished run outside the dialog has no Done button", () => {
    setRun("succeeded")

    const el = renderProgress(false)

    expect(buttonWithText(el, "contactSync.progress.done")).toBeUndefined()
    expect(buttonWithText(el, "contactSync.progress.cancel")).toBeUndefined()
  })

  test("shows when the run started (not when it was requested) and finished", () => {
    setRun("succeeded", [item({ status: "succeeded" })], {
      startedAt: new Date("2030-01-01T08:02:00.000Z"),
      finishedAt: new Date("2030-01-01T08:05:00.000Z"),
    })

    const el = renderProgress()

    expect(el.textContent).toContain(
      'contactSync.progress.started:{"time":"2030-01-01T08:02:00.000Z"}',
    )
    expect(el.textContent).not.toContain("contactSync.progress.requested")
    expect(el.textContent).toContain(
      'contactSync.progress.finished:{"time":"2030-01-01T08:05:00.000Z"}',
    )
  })

  test("a run no worker has picked up yet shows when it was requested", () => {
    setRun("pending")

    const el = renderProgress()

    expect(el.textContent).toContain(
      'contactSync.progress.requested:{"time":"2030-01-01T08:00:00.000Z"}',
    )
    expect(el.textContent).not.toContain("contactSync.progress.started")
    expect(el.textContent).not.toContain("contactSync.progress.finished")
  })

  test("a live run shows only when it started", () => {
    setRun("running", [item()], {
      startedAt: new Date("2030-01-01T08:01:00.000Z"),
    })

    const el = renderProgress()

    expect(el.textContent).toContain("contactSync.progress.started")
    expect(el.textContent).not.toContain("contactSync.progress.finished")
  })

  test("shows the run's own error, except on a cancelled run", () => {
    setRun("failed", [item({ status: "cancelled" })], {
      currentError: "maxAttempts",
    })
    const failed = renderProgress()
    expect(failed.textContent).toContain("contactSync.runErrors.maxAttempts")
    act(() => root?.unmount())
    root = null

    setRun("cancelled", [item({ status: "cancelled" })], {
      currentError: "maxAttempts",
    })
    const cancelled = renderProgress()
    expect(cancelled.textContent).not.toContain(
      "contactSync.runErrors.maxAttempts",
    )
  })

  describe("the history sync that follows a connect import", () => {
    test("an item that owes none shows nothing about it", () => {
      const el = renderProgress()

      expect(el.textContent).not.toContain("contactSync.followUp.statusLine")
    })

    test.each([
      [{ followUpCoexist: true }, "contactSync.followUp.pending"],
      [
        { followUpCoexist: true, followUpRunId: "c-1" },
        "contactSync.followUp.linked",
      ],
      [
        { followUpCoexist: true, followUpError: "superseded" },
        "contactSync.followUp.superseded",
      ],
    ])("shows where it stands (%o)", (patch, key) => {
      setRun("succeeded", [item(patch)])

      const el = renderProgress()

      expect(el.textContent).toContain(key)
    })

    test.each([
      "cancelled",
      "channelUnavailable",
      "workspaceUnavailable",
      "expired",
    ])("offers a retry when %s, addressed by the page's inbox", (error) => {
      setRun("succeeded", [
        item({ followUpCoexist: true, followUpError: error }),
      ])
      const el = renderProgress()

      const retry = buttonWithText(el, "contactSync.followUp.retry")
      act(() => retry?.click())

      expect(retry).toBeDefined()
      expect(retryState.mutate).toHaveBeenCalledWith({
        workspaceId: "ws-1",
        inboxId: "i1",
      })
    })

    test("a superseded follow-up offers no retry: a newer import starts it", () => {
      setRun("succeeded", [
        item({ followUpCoexist: true, followUpError: "superseded" }),
      ])
      const el = renderProgress()

      expect(buttonWithText(el, "contactSync.followUp.retry")).toBeUndefined()
    })

    test("no retry when the page is gone (no inbox)", () => {
      setRun("succeeded", [
        item({
          followUpCoexist: true,
          followUpError: "channelUnavailable",
          inboxId: null,
        }),
      ])
      const el = renderProgress()

      expect(buttonWithText(el, "contactSync.followUp.retry")).toBeUndefined()
    })

    test("a successful retry says the history sync will start", () => {
      setRun("succeeded", [
        item({ followUpCoexist: true, followUpError: "expired" }),
      ])
      renderProgress()

      act(() => retryState.options.onSuccess?.({ reopened: true }))

      expect(toast.success).toHaveBeenCalledWith("contactSync.followUp.retried")
    })
  })
})
