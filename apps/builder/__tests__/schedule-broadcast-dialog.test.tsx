import type { BroadcastModel } from "@chatbotx.io/database/types"
import { act, useCallback, useState } from "react"
import { createRoot, type Root } from "react-dom/client"
import { useForm, useFormContext } from "react-hook-form"
import { afterEach, describe, expect, test, vi } from "vitest"
import { ScheduleBroadcastDialog } from "@/features/broadcasts/components/schedule-broadcast-dialog"
import type { BroadcastPlanLimitOutcome } from "@/features/broadcasts/lib/broadcast-plan-limit"

/** Echoes the key back so assertions never depend on the English copy. */
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

vi.mock("@/enterprise/features/billing/upgrade-plan-dialog", () => ({
  UpgradePlanDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="pricing-dialog">pricing</div> : null,
}))

// The dialog only `.bind()`s this before handing it to the (mocked) hook
// below — it is never invoked in this test — so a bare stub is enough and
// keeps the test from pulling in `@chatbotx.io/business` / DB wiring.
vi.mock("@/features/broadcasts/actions/schedule-broadcast.action", () => ({
  scheduleBroadcastAction: vi.fn(),
}))

// Real `useForm()` wired the same way the adapter wires it (`defaultValues`
// from `formProps`, `resetFormAndAction` = RHF's plain `reset()`) so the
// dialog's own `useEffect` resync logic — the thing under test — runs
// unmodified. `handleSubmitWithAction` is a no-op since no test here submits.
const actionCallbacks = vi.hoisted(() => ({
  onSuccess: undefined as ((args: { data?: unknown }) => void) | undefined,
  execute: vi.fn(),
}))

vi.mock("@next-safe-action/adapter-react-hook-form/hooks", () => ({
  useHookFormAction: (
    _action: unknown,
    _resolver: unknown,
    props?: {
      actionProps?: { onSuccess?: (args: { data?: unknown }) => void }
      formProps?: { defaultValues?: Record<string, unknown> }
    },
  ) => {
    actionCallbacks.onSuccess = props?.actionProps?.onSuccess
    const form = useForm({
      defaultValues: props?.formProps?.defaultValues,
      resolver: _resolver as never,
    })
    const { reset } = form
    return {
      form,
      handleSubmitWithAction: form.handleSubmit(actionCallbacks.execute),
      // Memoized like the real adapter's `resetFormAndAction` (stable
      // `resetForm`/`resetAction` refs) — an inline closure here would
      // change identity every render and loop the dialog's `useEffect`.
      resetFormAndAction: useCallback(() => reset(), [reset]),
    }
  },
}))

const numberFieldProps = vi.hoisted(() => ({
  current: null as Record<string, unknown> | null,
}))

vi.mock("@chatbotx.io/ui/components/form/input-number-field", () => ({
  InputNumberField: (props: { name: string; placeholder?: string }) => {
    numberFieldProps.current = props
    const { name } = props
    const { setValue, watch } = useFormContext()
    const value = watch(name)
    return (
      <>
        <button
          data-testid={`field-${name}`}
          data-value={String(value ?? "")}
          onClick={() => setValue(name, 250, { shouldDirty: true })}
          type="button"
        >
          {String(value ?? "")}
        </button>
        <button
          data-testid={`clear-${name}`}
          onClick={() => setValue(name, undefined, { shouldDirty: true })}
          type="button"
        >
          clear
        </button>
      </>
    )
  },
}))

// Swap the heavy form widgets for buttons that mutate the real RHF state
// via `useFormContext` — avoids simulating native `<select>`/date-picker
// interaction, which is irrelevant to the reset bug this test covers.
vi.mock("@chatbotx.io/ui/components/form/select-field", () => ({
  SelectField: ({ name }: { name: string }) => {
    const { setValue, watch } = useFormContext()
    const value = watch(name)
    return (
      <button
        data-testid={`field-${name}`}
        data-value={String(value ?? "")}
        onClick={() => setValue(name, "future", { shouldDirty: true })}
        type="button"
      >
        {String(value ?? "")}
      </button>
    )
  },
}))

// Records the props the dialog hands the picker so the `saveFormat` contract
// below can be asserted without driving the real calendar widget.
const pickerProps = vi.hoisted(() => ({
  current: null as Record<string, unknown> | null,
}))

vi.mock("@chatbotx.io/ui/components/form/date-picker-field", () => ({
  DateTimePickerField: (props: { name: string }) => {
    pickerProps.current = props
    const { name } = props
    const { setValue, watch } = useFormContext()
    const value = watch(name)
    return (
      <button
        data-testid={`field-${name}`}
        data-value={String(value ?? "")}
        onClick={() =>
          setValue(name, "2099-01-01 12:00", { shouldDirty: true })
        }
        type="button"
      >
        {String(value ?? "")}
      </button>
    )
  },
}))

// Simple conditional shell — no portal/animation machinery, which is
// unrelated to the reset-on-open bug and would only add flakiness in jsdom.
vi.mock("@chatbotx.io/ui/components/ui/dialog", () => ({
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div data-testid="dialog">{children}</div> : null,
  DialogClose: ({ render }: { render: React.ReactElement }) => render,
  DialogContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogDescription: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogFooter: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}))

vi.mock("@chatbotx.io/ui/components/ui/button", () => ({
  Button: ({
    children,
    ...rest
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...rest}>{children}</button>
  ),
}))

const BROADCAST_A = {
  id: "bc-a",
  name: "Broadcast A",
  sendRatePerMinute: 120,
} as BroadcastModel
const BROADCAST_B = {
  id: "bc-b",
  name: "Broadcast B",
  sendRatePerMinute: null,
} as BroadcastModel
const PLAN_LIMIT_OUTCOME: BroadcastPlanLimitOutcome = {
  outcome: "planLimit",
  limit: {
    reason: "activeBroadcasts",
    planName: "Trial",
    maxSendRatePerMinute: 60,
    maxActiveBroadcasts: 1,
    displayedSendRatePerMinute: 100,
    upgradeSpeedMultiplier: 20,
  },
}

let container: HTMLDivElement | null = null
let root: Root | null = null

function renderDialog(props: {
  broadcast: BroadcastModel | null
  open: boolean
}) {
  if (!root) {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  }
  act(() => {
    root?.render(
      <ScheduleBroadcastDialog
        broadcast={props.broadcast}
        onOpenChange={() => {
          // no-op — the test drives `open` directly via re-render
        }}
        open={props.open}
      />,
    )
  })
  // biome-ignore lint/style/noNonNullAssertion: assigned synchronously above
  return container!
}

afterEach(() => {
  if (root) {
    act(() => {
      root?.unmount()
    })
  }
  container?.remove()
  container = null
  root = null
  pickerProps.current = null
  numberFieldProps.current = null
  actionCallbacks.onSuccess = undefined
  actionCallbacks.execute.mockReset()
})

function PlanLimitHarness() {
  const [open, setOpen] = useState(true)
  return (
    <ScheduleBroadcastDialog
      broadcast={BROADCAST_A}
      onOpenChange={setOpen}
      open={open}
    />
  )
}

describe("ScheduleBroadcastDialog reopen reset", () => {
  test("resets to defaults when reopened for a different broadcast after being cancelled mid-edit", () => {
    const el = renderDialog({ broadcast: BROADCAST_A, open: true })

    const scheduleTypeField = () =>
      el.querySelector<HTMLButtonElement>('[data-testid="field-schedulesType"]')
    const dateField = () =>
      el.querySelector<HTMLButtonElement>('[data-testid="field-schedulesAt"]')
    const rateField = () =>
      el.querySelector<HTMLButtonElement>(
        '[data-testid="field-sendRatePerMinute"]',
      )

    expect(scheduleTypeField()?.dataset.value).toBe("now")
    expect(dateField()).toBeNull()
    expect(rateField()?.dataset.value).toBe("120")
    expect(numberFieldProps.current?.placeholder).toBe("120")

    // Pick "future" and a date for broadcast A, then cancel without submitting.
    act(() => {
      scheduleTypeField()?.click()
    })
    expect(scheduleTypeField()?.dataset.value).toBe("future")
    act(() => {
      dateField()?.click()
    })
    expect(dateField()?.dataset.value).toBe("2099-01-01 12:00")

    // Cancel — dialog closes, component stays mounted (matches the table's
    // usage: it never unmounts `ScheduleBroadcastDialog`, only toggles `open`).
    renderDialog({ broadcast: BROADCAST_A, open: false })

    // Reopen for a different broadcast.
    const reopened = renderDialog({ broadcast: BROADCAST_B, open: true })
    const reopenedScheduleTypeField = () =>
      reopened.querySelector<HTMLButtonElement>(
        '[data-testid="field-schedulesType"]',
      )
    const reopenedDateField = () =>
      reopened.querySelector<HTMLButtonElement>(
        '[data-testid="field-schedulesAt"]',
      )

    // The stale "future" + date selection must not leak into broadcast B's dialog.
    expect(reopenedScheduleTypeField()?.dataset.value).toBe("now")
    expect(reopenedDateField()).toBeNull()
    expect(
      reopened.querySelector<HTMLButtonElement>(
        '[data-testid="field-sendRatePerMinute"]',
      )?.dataset.value,
    ).toBe("")
    expect(numberFieldProps.current?.placeholder).toBe("500")
  })
})

describe("ScheduleBroadcastDialog send rate", () => {
  test("submits a typed rate", async () => {
    const el = renderDialog({ broadcast: BROADCAST_A, open: true })

    act(() => {
      el.querySelector<HTMLButtonElement>(
        '[data-testid="field-sendRatePerMinute"]',
      )?.click()
    })
    await act(async () => {
      el.querySelector("form")?.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      )
      await Promise.resolve()
    })

    expect(actionCallbacks.execute).toHaveBeenCalledWith(
      expect.objectContaining({ sendRatePerMinute: 250 }),
      expect.anything(),
    )
  })

  test("submits null when the prefilled rate is cleared", async () => {
    const el = renderDialog({ broadcast: BROADCAST_A, open: true })

    act(() => {
      el.querySelector<HTMLButtonElement>(
        '[data-testid="clear-sendRatePerMinute"]',
      )?.click()
    })
    await act(async () => {
      el.querySelector("form")?.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      )
      await Promise.resolve()
    })

    expect(actionCallbacks.execute).toHaveBeenCalledWith(
      expect.objectContaining({ sendRatePerMinute: null }),
      expect.anything(),
    )
  })
})

describe("ScheduleBroadcastDialog send time", () => {
  test("persists the picked time as an ISO instant, not a zoneless wall-clock string", () => {
    // Regression: the picker defaults to `saveFormat="formatted"`, which saves
    // "yyyy-MM-dd HH:mm:ss" with no offset. The server then re-reads it with
    // `new Date(...)` in ITS zone (UTC in production), so a broadcast scheduled
    // at 08:00 by a UTC+7 operator was stored — and sent — at 15:00 their time.
    const el = renderDialog({ broadcast: BROADCAST_A, open: true })

    act(() => {
      el.querySelector<HTMLButtonElement>(
        '[data-testid="field-schedulesType"]',
      )?.click()
    })

    // `afterEach` clears the recorder, so a `null` here means the picker never
    // mounted — which fails this assertion just as loudly as a wrong format.
    expect(pickerProps.current?.saveFormat).toBe("iso")
  })
})

describe("ScheduleBroadcastDialog plan limit", () => {
  test("closes the schedule dialog before showing the plan-limit dialog", () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
    act(() => root?.render(<PlanLimitHarness />))

    act(() => actionCallbacks.onSuccess?.({ data: PLAN_LIMIT_OUTCOME }))

    const dialogs = container.querySelectorAll('[data-testid="dialog"]')
    expect(dialogs).toHaveLength(1)
    expect(dialogs[0]?.textContent).toContain(
      "broadcasts.planLimitDialog.title",
    )
  })
})
