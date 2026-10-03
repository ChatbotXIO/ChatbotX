import { NextIntlClientProvider } from "next-intl"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import messages from "../messages/en.json"
import type {
  AiHandoverBulkRunResource,
  GetApplyToAllStatusResponse,
} from "../src/features/integration-ai-handover/schema/bulk"

vi.mock("@/features/tenant/tenant-settings-provider", () => ({
  useTenantSettings: () => ({ name: "AhaChat" }),
}))
vi.mock(
  "../src/features/integration-ai-handover/components/ai-handover-history-dialog",
  () => ({
    AiHandoverHistoryDialog: (props: { isRunLive: boolean }) => (
      <button data-live={String(props.isRunLive)} type="button">
        History
      </button>
    ),
  }),
)

const toastMocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock("sonner", () => ({ toast: toastMocks }))

const query = vi.hoisted(() => ({
  data: undefined as unknown,
  invalidateQueries: vi.fn(),
  refetchInterval: undefined as unknown,
}))
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: query.data }),
  useQueryClient: () => ({ invalidateQueries: query.invalidateQueries }),
}))
vi.mock("@/lib/orpc/query", () => ({
  orpc: {
    aiHandoverAPIs: {
      getApplyToAllStatus: {
        queryOptions: (options: { refetchInterval: unknown }) => {
          query.refetchInterval = options.refetchInterval
          return { queryKey: ["apply-to-all"] }
        },
      },
      listBulkHistory: { key: () => ["history"] },
    },
  },
}))

vi.mock(
  "../src/features/integration-ai-handover/actions/set-apply-to-all.action",
  () => ({ setApplyToAllAction: { bind: () => "set" } }),
)
vi.mock(
  "../src/features/integration-ai-handover/actions/retry-apply-to-all.action",
  () => ({ retryApplyToAllAction: { bind: () => "retry" } }),
)

type ActionOptions = {
  onSuccess: () => void
  onError: (arg: { error: { serverError?: string } }) => void
}
const hooks = vi.hoisted(() => ({
  set: { execute: vi.fn(), isExecuting: false, options: undefined as unknown },
  retry: {
    execute: vi.fn(),
    isExecuting: false,
    options: undefined as unknown,
  },
}))
vi.mock("next-safe-action/hooks", () => ({
  useAction: (action: "set" | "retry", options: unknown) => {
    hooks[action].options = options
    return hooks[action]
  },
}))

const { AiHandoverApplyToAll } = await import(
  "../src/features/integration-ai-handover/components/ai-handover-apply-to-all"
)

const run = (
  overrides: Partial<AiHandoverBulkRunResource> = {},
): AiHandoverBulkRunResource => ({
  id: "run-1",
  action: "enable",
  status: "running",
  message: null,
  requestedAt: new Date("2026-10-02T10:00:00Z"),
  startedAt: null,
  finishedAt: null,
  processedCount: 0,
  skippedCount: 0,
  failedCount: 0,
  totalCount: null,
  currentError: null,
  requestedByName: null,
  pausedUntil: null,
  ...overrides,
})

const status = (
  value: AiHandoverBulkRunResource | null,
  overrides: Partial<GetApplyToAllStatusResponse> = {},
): GetApplyToAllStatusResponse => ({
  status: value?.status ?? "idle",
  applyToAllCustomers: value?.action === "enable",
  isAutomationActive: true,
  run: value,
  ...overrides,
})

describe("AiHandoverApplyToAll", () => {
  let container: HTMLDivElement
  let root: Root

  const render = (
    props: {
      canEdit?: boolean
      isAutomationActive?: boolean
      current?: GetApplyToAllStatusResponse
    } = {},
  ) => {
    const base = props.current ?? status(null)
    const initial = {
      ...base,
      isAutomationActive: props.isAutomationActive ?? base.isAutomationActive,
    }
    query.data = initial
    act(() => {
      root.render(
        <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
          <AiHandoverApplyToAll
            canEdit={props.canEdit ?? true}
            inboxId="inbox-1"
            initialStatus={initial}
            workspaceId="ws-1"
          />
        </NextIntlClientProvider>,
      )
    })
  }

  const applySwitch = () =>
    container.querySelector<HTMLElement>("[role='switch']")
  const button = (label: string) =>
    Array.from(
      document.body.querySelectorAll<HTMLButtonElement>("button"),
    ).find((candidate) => candidate.textContent?.trim() === label)
  const click = (label: string) => act(() => button(label)?.click())
  const messageBox = () =>
    document.body.querySelector<HTMLTextAreaElement>("textarea")
  const typeMessage = (value: string) =>
    act(() => {
      const box = messageBox()
      if (!box) {
        return
      }
      const setter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )?.set
      setter?.call(box, value)
      box.dispatchEvent(new Event("input", { bubbles: true }))
    })

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    // base-ui's Switch builds a PointerEvent on click, which jsdom lacks.
    if (!window.PointerEvent) {
      Object.assign(window, { PointerEvent: MouseEvent })
    }
    vi.clearAllMocks()
    hooks.set.isExecuting = false
    hooks.retry.isExecuting = false
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    document.body.innerHTML = ""
  })

  test("a Page never switched shows the switch off and no progress", () => {
    render()

    expect(applySwitch()?.getAttribute("aria-checked")).toBe("false")
    expect(applySwitch()?.hasAttribute("data-disabled")).toBe(false)
    expect(container.querySelector("[role='progressbar']")).toBeNull()
  })

  test("turning it on asks for confirmation and only then requests the change", () => {
    render()

    act(() => applySwitch()?.click())
    expect(hooks.set.execute).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain("Enable for all")

    click("Enable for all")

    expect(hooks.set.execute).toHaveBeenCalledExactlyOnceWith({
      applyToAllCustomers: true,
      message: "",
    })
  })

  test("cancelling the confirmation requests nothing", () => {
    render()
    act(() => applySwitch()?.click())

    click("Cancel")

    expect(hooks.set.execute).not.toHaveBeenCalled()
    expect(document.body.textContent).not.toContain("Enable for all")
  })

  test("turning it off needs the message: blank is refused, then it is sent trimmed", () => {
    render({ current: status(run({ status: "completed" })) })
    expect(applySwitch()?.getAttribute("aria-checked")).toBe("true")

    act(() => applySwitch()?.click())
    click("Disable for all")
    expect(hooks.set.execute).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain(
      "Enter the message to send to customers.",
    )

    typeMessage("  A person is here  ")
    click("Disable for all")

    expect(hooks.set.execute).toHaveBeenCalledExactlyOnceWith({
      applyToAllCustomers: false,
      message: "A person is here",
    })
  })

  test("while the automation is not running the switch cannot be turned on, and says why", () => {
    render({ isAutomationActive: false })

    expect(applySwitch()?.hasAttribute("data-disabled")).toBe(true)
    expect(container.textContent).toContain(
      "Save the automation above and switch it on",
    )
  })

  test("the switch unlocks when the status says the automation now runs (schedule opened, or Save), without a reload", () => {
    render({ isAutomationActive: false })
    expect(applySwitch()?.hasAttribute("data-disabled")).toBe(true)

    // The status query refetched (poll / focus / invalidation after Save).
    query.data = { ...status(null), isAutomationActive: true }
    render({ isAutomationActive: true })

    expect(applySwitch()?.hasAttribute("data-disabled")).toBe(false)
  })

  test("an ON Page can still be turned off while the automation is not running", () => {
    render({
      isAutomationActive: false,
      current: status(run({ status: "completed" })),
    })

    expect(applySwitch()?.hasAttribute("data-disabled")).toBe(false)
  })

  test("a viewer sees the state but cannot move the switch or retry", () => {
    render({
      canEdit: false,
      current: status(run({ status: "failed", currentError: "tokenInvalid" })),
    })

    expect(applySwitch()?.hasAttribute("data-disabled")).toBe(true)
    expect(button("Retry")).toBeUndefined()
  })

  test("a live run shows processed / total, and the switch stays usable to reverse it", () => {
    render({
      current: status(
        run({
          status: "running",
          totalCount: 200,
          processedCount: 40,
          skippedCount: 10,
          failedCount: 10,
        }),
      ),
    })

    expect(container.textContent).toContain("Enabling for customers: 60 / 200")
    expect(applySwitch()?.hasAttribute("data-disabled")).toBe(false)
    expect(
      container
        .querySelector("[role='progressbar']")
        ?.getAttribute("aria-valuenow"),
    ).toBe("30")
  })

  test("a disable run is labelled as disabling", () => {
    render({
      current: status(
        run({ action: "disable", totalCount: 10, processedCount: 4 }),
        { applyToAllCustomers: false },
      ),
    })

    expect(container.textContent).toContain("Disabling for customers: 4 / 10")
  })

  test("while the total is still counted it says so instead of 0 / 0", () => {
    render({ current: status(run({ status: "pending", totalCount: null })) })

    expect(container.textContent).toContain("Enabling for customers: counting…")
    expect(container.textContent).not.toContain("/ 0")
  })

  test("a run past its estimated total is clamped at 100%", () => {
    render({
      current: status(
        run({ status: "running", totalCount: 10, processedCount: 25 }),
      ),
    })

    expect(
      container
        .querySelector("[role='progressbar']")
        ?.getAttribute("aria-valuenow"),
    ).toBe("100")
  })

  test("a run waiting out Meta's rate limit says until when, and resumes on its own", () => {
    render({
      current: status(
        run({
          status: "running",
          totalCount: 100,
          pausedUntil: new Date("2026-10-02T13:30:00Z"),
        }),
      ),
    })

    expect(container.textContent).toContain("Paused until")
    expect(container.textContent).toContain("resumes on its own")
  })

  test("a stored change whose run does not exist yet shows it is preparing", () => {
    render({
      current: {
        status: "reconciling",
        applyToAllCustomers: true,
        isAutomationActive: true,
        run: null,
      },
    })

    expect(container.textContent).toContain("Preparing")
  })

  test("a failed run of the latest state shows the reason and a Retry that asks again", () => {
    render({
      current: status(run({ status: "failed", currentError: "tokenInvalid" })),
    })

    expect(container.textContent).toContain("access was revoked")
    click("Retry")
    expect(hooks.retry.execute).toHaveBeenCalledTimes(1)
  })

  test("a stopped run without a stored reason still offers Retry", () => {
    render({ current: status(run({ status: "cancelled" })) })

    expect(container.textContent).toContain(
      "Enabling for all customers was stopped.",
    )
    expect(button("Retry")).toBeDefined()
  })

  test("a completed run is summarised", () => {
    render({
      current: status(
        run({ status: "completed", totalCount: 50, processedCount: 48 }),
      ),
    })

    expect(container.textContent).toContain("Enabled for 48 of 50 customers.")
    expect(button("Retry")).toBeUndefined()
  })

  test("the history dialog is told whether a run is live", () => {
    render({ current: status(run({ status: "running", totalCount: 5 })) })
    expect(button("History")?.getAttribute("data-live")).toBe("true")
  })

  test("an accepted change closes the popover and refreshes the status", () => {
    render()
    act(() => applySwitch()?.click())

    act(() => (hooks.set.options as ActionOptions).onSuccess())

    expect(query.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["apply-to-all"],
    })
    // The history dialog must not show a list without the run just created.
    expect(query.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["history"],
    })
    expect(document.body.textContent).not.toContain("Enable for all")
  })

  test("a refused change shows the server's translated reason, else a generic one", () => {
    render()

    ;(hooks.set.options as ActionOptions).onError({
      error: { serverError: "Save the automation first" },
    })
    expect(toastMocks.error).toHaveBeenCalledWith("Save the automation first")
    ;(hooks.set.options as ActionOptions).onError({ error: {} })
    expect(toastMocks.error).toHaveBeenLastCalledWith("Unknown error")
  })

  test("a retry that was accepted is announced and refreshes the status", () => {
    render({ current: status(run({ status: "failed" })) })

    act(() => (hooks.retry.options as ActionOptions).onSuccess())

    expect(toastMocks.success).toHaveBeenCalledWith(
      "Started. You can follow the progress here.",
    )
    expect(query.invalidateQueries).toHaveBeenCalled()
  })

  test("a change made after a long watched run keeps polling while its run is created", () => {
    render()
    const poll = query.refetchInterval as (q: {
      state: { data?: { status: string } }
    }) => number | false
    const reconciling = { state: { data: { status: "reconciling" } } }
    const running = { state: { data: { status: "running" } } }

    expect(poll(running)).toBe(5000)
    // The old run was cancelled and the new revision has no run yet.
    expect(poll(reconciling)).toBe(5000)
    expect(poll(reconciling)).toBe(5000)
    expect(poll({ state: { data: { status: "completed" } } })).toBe(false)
  })
})
