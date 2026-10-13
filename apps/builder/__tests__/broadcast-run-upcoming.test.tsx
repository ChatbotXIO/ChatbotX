import { NextIntlClientProvider } from "next-intl"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import messages from "../messages/en.json"
import { BroadcastRunUpcoming } from "../src/features/broadcasts/components/broadcast-run-upcoming"
import type { BroadcastResourceWithRelations } from "../src/features/broadcasts/schema/resource"

const execute = vi.hoisted(() => vi.fn())
const actionOptions = vi.hoisted(() => ({
  current: {} as {
    onSuccess?: (args: { input: { date: string; skipped: boolean } }) => void
    onError?: () => void
  },
}))
const refresh = vi.hoisted(() => vi.fn())
const invalidateRuns = vi.hoisted(() => vi.fn())
const toastSuccess = vi.hoisted(() => vi.fn())
const toastError = vi.hoisted(() => vi.fn())
let isPending = false
let pendingInput: { date: string; skipped: boolean } | undefined

vi.mock("next-safe-action/hooks", () => ({
  useAction: (_action: unknown, options: typeof actionOptions.current) => {
    actionOptions.current = options
    return { execute, isPending, input: pendingInput }
  },
}))
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }))
vi.mock("sonner", () => ({
  toast: { success: toastSuccess, error: toastError },
}))
vi.mock(
  "../src/features/broadcasts/hooks/use-invalidate-broadcast-runs",
  () => ({ useInvalidateBroadcastRuns: () => invalidateRuns }),
)
vi.mock(
  "../src/features/broadcasts/actions/set-broadcast-run-skipped.action",
  () => ({ setBroadcastRunSkippedAction: { bind: () => vi.fn() } }),
)

// 2026-10-15 is a Thursday.
const NOW = new Date("2026-10-15T00:30:00Z")
const RULE = {
  frequency: "daily" as const,
  interval: 1,
  timeOfDay: "09:00",
  timezone: "UTC",
  startsOn: "2026-10-01",
  end: { kind: "never" as const },
}

type Series = Parameters<typeof BroadcastRunUpcoming>[0]["broadcast"]

const series = (
  recurrence: Partial<
    NonNullable<BroadcastResourceWithRelations["recurrence"]>
  > = {},
  broadcast: Partial<Series> = {},
): Series =>
  ({
    id: "t1",
    status: "recurring",
    schedulesType: "recurring",
    occurrenceAt: null,
    recurrence: {
      id: "r1",
      rule: RULE,
      nextRunAt: new Date("2026-10-15T09:00:00Z"),
      nextSendAt: new Date("2026-10-15T09:00:00Z"),
      occurrenceCount: 0,
      lastOccurrenceAt: null,
      pausedAt: null,
      endedAt: null,
      ...recurrence,
    },
    ...broadcast,
  }) as Series

describe("BroadcastRunUpcoming", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(NOW)
    vi.clearAllMocks()
    isPending = false
    pendingInput = undefined
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    vi.useRealTimers()
  })

  const render = (broadcast: Series) => {
    act(() => {
      root.render(
        <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
          <BroadcastRunUpcoming broadcast={broadcast} workspaceId="w1" />
        </NextIntlClientProvider>,
      )
    })
    return container.textContent ?? ""
  }
  const buttons = () => Array.from(container.querySelectorAll("button"))
  const click = (button: HTMLElement | undefined) => {
    act(() => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })
  }

  test("lists the next five runs, each with a Skip button", () => {
    const text = render(series())

    expect(text).toContain("Upcoming runs")
    expect(text).toContain("Thu, Oct 15, 2026")
    expect(text).toContain("Mon, Oct 19, 2026")
    expect(text).not.toContain("Oct 20, 2026")
    expect(buttons().map((button) => button.textContent)).toEqual(
      new Array(5).fill("Skip"),
    )
  })

  test("a skipped run is struck through and offers Restore", () => {
    const text = render(
      series({ rule: { ...RULE, excludeDates: ["2026-10-16"] } }),
    )

    expect(text).toContain("Skipped")
    expect(buttons().map((button) => button.textContent)).toEqual([
      "Skip",
      "Restore",
      "Skip",
      "Skip",
      "Skip",
    ])
  })

  test("Skip sends that run's local date", () => {
    render(series())
    click(buttons()[1])

    expect(execute).toHaveBeenCalledWith({ date: "2026-10-16", skipped: true })
  })

  test("Restore sends skipped: false", () => {
    render(series({ rule: { ...RULE, excludeDates: ["2026-10-16"] } }))
    click(buttons()[1])

    expect(execute).toHaveBeenCalledWith({ date: "2026-10-16", skipped: false })
  })

  test("a successful skip toasts with Undo and refreshes the caches", () => {
    render(series())
    act(() => {
      actionOptions.current.onSuccess?.({
        input: { date: "2026-10-16", skipped: true },
      })
    })

    const [message, options] = toastSuccess.mock.calls[0]
    expect(message).toBe("Skipped Oct 16, 2026")
    options.action.onClick()
    expect(execute).toHaveBeenCalledWith({ date: "2026-10-16", skipped: false })
    expect(invalidateRuns).toHaveBeenCalled()
    expect(refresh).toHaveBeenCalled()
  })

  test("a restore toasts without Undo", () => {
    render(series())
    act(() => {
      actionOptions.current.onSuccess?.({
        input: { date: "2026-10-16", skipped: false },
      })
    })

    expect(toastSuccess).toHaveBeenCalledWith("Restored Oct 16, 2026")
  })

  test("a rejected change says so and re-reads the series", () => {
    render(series())
    act(() => {
      actionOptions.current.onError?.()
    })

    expect(toastError).toHaveBeenCalledWith("This run can no longer be changed")
    expect(refresh).toHaveBeenCalled()
  })

  test("buttons are disabled while a change is in flight", () => {
    isPending = true
    render(series())

    expect(buttons().every((button) => button.disabled)).toBe(true)
  })

  test("only the row being changed shows a spinner", () => {
    isPending = true
    pendingInput = { date: "2026-10-16", skipped: true }
    render(series())

    const spinning = buttons().map(
      (button) => button.querySelector(".animate-spin") !== null,
    )
    expect(spinning).toEqual([false, true, false, false, false])
  })

  test.each([
    ["a paused series", { pausedAt: new Date(), nextRunAt: null }, {}],
    ["an ended series", { endedAt: new Date(), nextRunAt: null }, {}],
    ["a cancelled series", {}, { status: "cancelled" as const }],
    ["a one-off", {}, { schedulesType: "now" as const }],
  ])("renders nothing for %s", (_label, recurrence, broadcast) => {
    expect(render(series(recurrence, broadcast))).toBe("")
  })

  test("says so when no run is left", () => {
    const text = render(
      series({
        rule: { ...RULE, end: { kind: "onDate", date: "2026-10-01" } },
      }),
    )

    expect(text).toContain("No upcoming runs")
  })
})
