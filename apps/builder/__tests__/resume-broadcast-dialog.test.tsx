import type { BroadcastModel } from "@chatbotx.io/database/types"
import { act, useCallback, useState } from "react"
import { createRoot, type Root } from "react-dom/client"
import { useForm, useFormContext } from "react-hook-form"
import { afterEach, describe, expect, test, vi } from "vitest"
import { useBroadcastTransitionActionCallbacks } from "@/features/broadcasts/components/broadcast-transition-dialog"
import { ResumeBroadcastDialog } from "@/features/broadcasts/components/resume-broadcast-dialog"
import type { BroadcastPlanLimitOutcome } from "@/features/broadcasts/lib/broadcast-plan-limit"

/** Echoes the key back so assertions never depend on the English copy. */
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }))
vi.mock("sonner", () => ({ toast }))

const refresh = vi.hoisted(() => vi.fn())
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}))

vi.mock("@/enterprise/features/billing/upgrade-plan-dialog", () => ({
  UpgradePlanDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="pricing-dialog">pricing</div> : null,
}))

type ActionOptions = {
  onSuccess?: (args: { data?: unknown }) => void
  onError?: (args: { error: { serverError?: string } }) => void
}
const execute = vi.hoisted(() => vi.fn())
const actionState = vi.hoisted(() => ({
  options: {} as ActionOptions,
}))

vi.mock("@next-safe-action/adapter-react-hook-form/hooks", () => ({
  useHookFormAction: (
    _action: unknown,
    _resolver: unknown,
    props?: {
      actionProps?: ActionOptions
      formProps?: { defaultValues?: Record<string, unknown> }
    },
  ) => {
    actionState.options = props?.actionProps ?? {}
    const form = useForm({
      defaultValues: props?.formProps?.defaultValues,
      resolver: _resolver as never,
    })
    const { reset } = form
    return {
      form,
      handleSubmitWithAction: form.handleSubmit(execute),
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

const bind = vi.hoisted(() => vi.fn(() => ({})))
vi.mock("@/features/broadcasts/actions/resume-broadcast.action", () => ({
  resumeBroadcastAction: { bind },
}))

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

const BROADCAST = {
  id: "bc-1",
  workspaceId: "ws-1",
  name: "Spring sale",
  sendRatePerMinute: 120,
} as BroadcastModel
const PLAN_LIMIT_OUTCOME: BroadcastPlanLimitOutcome = {
  outcome: "planLimit",
  limit: {
    reason: "sendRate",
    planName: "Trial",
    maxSendRatePerMinute: 60,
    maxActiveBroadcasts: 1,
    displayedSendRatePerMinute: 100,
    upgradeSpeedMultiplier: 20,
  },
}

let container: HTMLDivElement | null = null
let root: Root | null = null

function renderDialog() {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
  act(() => {
    root?.render(
      <ResumeBroadcastDialog
        broadcast={BROADCAST}
        onOpenChange={() => {
          // no-op — the test drives `open` directly via re-render
        }}
        open={true}
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
  execute.mockClear()
  refresh.mockClear()
  toast.error.mockClear()
  toast.success.mockClear()
  bind.mockClear()
  numberFieldProps.current = null
})

describe("ResumeBroadcastDialog", () => {
  test("binds resumeBroadcastAction to (null, workspaceId, broadcastId)", () => {
    renderDialog()

    expect(bind).toHaveBeenCalledWith(null, "ws-1", "bc-1")
  })

  test("prefills the stored rate and submits a typed rate", async () => {
    const el = renderDialog()
    const rateField = el.querySelector<HTMLButtonElement>(
      '[data-testid="field-sendRatePerMinute"]',
    )
    expect(rateField?.dataset.value).toBe("120")
    expect(numberFieldProps.current?.placeholder).toBe("120")

    act(() => {
      rateField?.click()
    })
    const confirmButton = Array.from(el.querySelectorAll("button")).find(
      (btn) => btn.textContent === "actions.resume",
    )

    await act(async () => {
      confirmButton?.click()
      await Promise.resolve()
    })

    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({ sendRatePerMinute: 250 }),
      expect.anything(),
    )
  })

  test("submits null when the prefilled rate is cleared", async () => {
    const el = renderDialog()

    act(() => {
      el.querySelector<HTMLButtonElement>(
        '[data-testid="clear-sendRatePerMinute"]',
      )?.click()
    })
    const confirmButton = Array.from(el.querySelectorAll("button")).find(
      (btn) => btn.textContent === "actions.resume",
    )
    await act(async () => {
      confirmButton?.click()
      await Promise.resolve()
    })

    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({ sendRatePerMinute: null }),
      expect.anything(),
    )
  })

  test("success shows a toast and refreshes so the row moves back to sending", () => {
    renderDialog()

    act(() => {
      actionState.options.onSuccess?.({})
    })

    expect(toast.success).toHaveBeenCalledTimes(1)
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  test("closes the resume dialog before showing the plan-limit dialog", () => {
    function Harness() {
      const [open, setOpen] = useState(true)
      return (
        <ResumeBroadcastDialog
          broadcast={BROADCAST}
          onOpenChange={setOpen}
          open={open}
        />
      )
    }

    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
    act(() => root?.render(<Harness />))

    act(() => {
      actionState.options.onSuccess?.({ data: PLAN_LIMIT_OUTCOME })
    })

    expect(container.querySelectorAll('[data-testid="dialog"]')).toHaveLength(1)
    expect(container.textContent).toContain("broadcasts.planLimitDialog.title")
    expect(toast.success).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
  })

  test("never reports success for a plan-limit outcome when no plan-limit callback is supplied", () => {
    const onOpenChange = vi.fn()

    function Harness() {
      const callbacks = useBroadcastTransitionActionCallbacks({ onOpenChange })
      return (
        <button
          onClick={() => callbacks.onSuccess({ data: PLAN_LIMIT_OUTCOME })}
          type="button"
        >
          complete
        </button>
      )
    }

    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
    act(() => root?.render(<Harness />))
    act(() => container?.querySelector("button")?.click())

    expect(toast.success).not.toHaveBeenCalled()
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(refresh).not.toHaveBeenCalled()
  })

  test("a race error (e.g. the broadcast was deleted from another tab) shows the server message and refreshes the stale row", () => {
    renderDialog()

    act(() => {
      actionState.options.onError?.({
        error: { serverError: "Broadcast is no longer cancelled" },
      })
    })

    expect(toast.error).toHaveBeenCalledWith("Broadcast is no longer cancelled")
    expect(refresh).toHaveBeenCalledTimes(1)
  })
})
