import type { BroadcastModel } from "@chatbotx.io/database/types"
import { act, useCallback } from "react"
import { createRoot, type Root } from "react-dom/client"
import { useForm, useFormContext } from "react-hook-form"
import { afterEach, describe, expect, test, vi } from "vitest"
import { ScheduleBroadcastDialog } from "@/features/broadcasts/components/schedule-broadcast-dialog"

/** Echoes the key back so assertions never depend on the English copy. */
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
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
vi.mock("@next-safe-action/adapter-react-hook-form/hooks", () => ({
  useHookFormAction: (
    _action: unknown,
    _resolver: unknown,
    props?: { formProps?: { defaultValues?: Record<string, unknown> } },
  ) => {
    const form = useForm({ defaultValues: props?.formProps?.defaultValues })
    const { reset } = form
    return {
      form,
      handleSubmitWithAction: (event?: { preventDefault?: () => void }) => {
        event?.preventDefault?.()
        return Promise.resolve()
      },
      // Memoized like the real adapter's `resetFormAndAction` (stable
      // `resetForm`/`resetAction` refs) — an inline closure here would
      // change identity every render and loop the dialog's `useEffect`.
      resetFormAndAction: useCallback(() => reset(), [reset]),
    }
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

vi.mock("@chatbotx.io/ui/components/form/date-picker-field", () => ({
  DateTimePickerField: ({ name }: { name: string }) => {
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

const BROADCAST_A = { id: "bc-a", name: "Broadcast A" } as BroadcastModel
const BROADCAST_B = { id: "bc-b", name: "Broadcast B" } as BroadcastModel

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
})

describe("ScheduleBroadcastDialog reopen reset", () => {
  test("resets to defaults when reopened for a different broadcast after being cancelled mid-edit", () => {
    const el = renderDialog({ broadcast: BROADCAST_A, open: true })

    const scheduleTypeField = () =>
      el.querySelector<HTMLButtonElement>('[data-testid="field-schedulesType"]')
    const dateField = () =>
      el.querySelector<HTMLButtonElement>('[data-testid="field-schedulesAt"]')

    expect(scheduleTypeField()?.dataset.value).toBe("now")
    expect(dateField()).toBeNull()

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
  })
})
