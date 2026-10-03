import { NextIntlClientProvider } from "next-intl"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { useForm } from "react-hook-form"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import messages from "../messages/en.json"
import type { SaveAiHandoverSettingsRequest } from "../src/features/integration-ai-handover/schema/request"

vi.mock("@/features/tenant/tenant-settings-provider", () => ({
  useTenantSettings: () => ({ name: "AhaChat" }),
}))
vi.mock("@/features/sequences/components/flow-selector", () => ({
  ClearableFlowSelector: ({ value }: { value: string | null }) => (
    <div data-testid="flow-selector">{value}</div>
  ),
}))
vi.mock(
  "../src/features/integration-ai-handover/components/ai-handover-apply-to-all",
  () => ({
    AiHandoverApplyToAll: (props: {
      inboxId: string
      canEdit: boolean
      isAutomationActive: boolean
    }) => (
      <div
        data-can-edit={String(props.canEdit)}
        data-inbox-id={props.inboxId}
        data-testid="apply-to-all"
      />
    ),
  }),
)
vi.mock(
  "../src/features/integration-ai-handover/actions/save-ai-handover-settings.action",
  () => ({
    saveAiHandoverSettingsAction: { bind: () => vi.fn() },
  }),
)

const router = vi.hoisted(() => ({ refresh: vi.fn() }))
const queries = vi.hoisted(() => ({ invalidateQueries: vi.fn() }))
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: queries.invalidateQueries }),
}))
vi.mock("@/lib/orpc/query", () => ({
  orpc: {
    aiHandoverAPIs: {
      getApplyToAllStatus: { key: () => ["apply-to-all-status"] },
    },
  },
}))
vi.mock("next/navigation", () => ({ useRouter: () => router }))

const toastMocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock("sonner", () => ({ toast: toastMocks }))

// The real adapter wires a safe-action to react-hook-form; here the form is a
// real react-hook-form instance (real resolver, real validation) and submit
// runs the captured action callbacks.
const adapter = vi.hoisted(() => ({
  submitted: vi.fn(),
  actionProps: undefined as
    | {
        onSuccess: (arg: { data: unknown }) => void
        onError: (arg: { error: { serverError?: string } }) => void
      }
    | undefined,
}))
vi.mock("@next-safe-action/adapter-react-hook-form/hooks", () => ({
  useHookFormAction: (
    _action: unknown,
    resolver: Parameters<typeof useForm>[0] extends infer O
      ? O extends { resolver?: infer R }
        ? R
        : never
      : never,
    options: {
      formProps: { defaultValues: unknown }
      actionProps: typeof adapter.actionProps
    },
  ) => {
    adapter.actionProps = options.actionProps
    const form = useForm({
      resolver,
      defaultValues: options.formProps.defaultValues as never,
    })
    return {
      form,
      handleSubmitWithAction: form.handleSubmit((values) =>
        adapter.submitted(values),
      ),
      action: { isExecuting: false },
    }
  },
}))

const { AiHandoverSettingsCard } = await import(
  "../src/features/integration-ai-handover/components/ai-handover-settings-card"
)

const INITIAL: SaveAiHandoverSettingsRequest = {
  enabled: false,
  scheduleEnabled: false,
  timeRanges: [],
  gotoFlowId: null,
  returnMessage: "",
  pauseBotWaitingForStaff: false,
}

describe("AIHandoverSettingsCard", () => {
  let container: HTMLDivElement
  let root: Root

  const render = (
    props: { canEdit?: boolean; initial?: SaveAiHandoverSettingsRequest } = {},
  ) =>
    act(() => {
      root.render(
        <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
          <AiHandoverSettingsCard
            canEdit={props.canEdit ?? true}
            inboxId="inbox-1"
            initialApplyToAllStatus={{
              status: "idle",
              applyToAllCustomers: false,
              isAutomationActive: true,
              run: null,
            }}
            initialValues={props.initial ?? INITIAL}
            workspaceId="ws-1"
          />
        </NextIntlClientProvider>,
      )
    })

  // The Run time switch is the second switch (Enable, Run time, Pause bot).
  const scheduleSwitch = () =>
    container.querySelectorAll<HTMLElement>("[role='switch']")[1]
  const rangeInputs = () =>
    Array.from(
      container.querySelectorAll<HTMLInputElement>("input[data-slot='input']"),
    )
  /** Click Save and let the async react-hook-form validation settle. */
  const submit = async () => {
    await act(async () => {
      saveButton()?.click()
      await Promise.resolve()
    })
  }
  const saveButton = () =>
    Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Save",
    )

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    // base-ui's Switch builds a PointerEvent on click, which jsdom lacks.
    if (!window.PointerEvent) {
      Object.assign(window, { PointerEvent: MouseEvent })
    }
    vi.clearAllMocks()
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  test("turning the schedule on adds the default 8-17 window", () => {
    render()
    expect(rangeInputs()).toHaveLength(0)

    act(() => scheduleSwitch()?.click())

    expect(rangeInputs().map((input) => input.value)).toEqual(["8", "17"])
  })

  test("turning the schedule off drops ranges that could not be saved, so Save is never blocked silently", async () => {
    render({
      initial: {
        ...INITIAL,
        scheduleEnabled: true,
        timeRanges: [{ from: 9, to: 9 }],
      },
    })
    // Switch off with an invalid (equal-bounds) hidden range, then save.
    act(() => scheduleSwitch()?.click())
    await submit()

    expect(adapter.submitted).toHaveBeenCalledTimes(1)
    expect(adapter.submitted.mock.calls[0][0]).toMatchObject({
      scheduleEnabled: false,
      timeRanges: [],
    })
  })

  test("turning the schedule off keeps valid ranges", async () => {
    render({
      initial: {
        ...INITIAL,
        scheduleEnabled: true,
        timeRanges: [{ from: 8, to: 17 }],
      },
    })
    act(() => scheduleSwitch()?.click())
    await submit()

    expect(adapter.submitted.mock.calls[0][0]).toMatchObject({
      scheduleEnabled: false,
      timeRanges: [{ from: 8, to: 17 }],
    })
  })

  test("read-only mode disables the fields and offers no Save", () => {
    render({ canEdit: false })

    expect(container.querySelector("fieldset")?.hasAttribute("disabled")).toBe(
      true,
    )
    expect(saveButton()).toBeUndefined()
    expect(container.textContent).toContain(
      "You can view these settings but not change them.",
    )
  })

  test("an editable form starts clean: Save is disabled until something changes", () => {
    render()
    expect(saveButton()?.hasAttribute("disabled")).toBe(true)
  })

  test("the header switch is the saved `enabled` flag and Save sends it", async () => {
    render()
    const headerSwitch =
      container.querySelectorAll<HTMLElement>("[role='switch']")[0]
    expect(headerSwitch?.getAttribute("aria-label")).toBe("Enable")

    act(() => headerSwitch?.click())
    expect(saveButton()?.hasAttribute("disabled")).toBe(false)
    await submit()

    expect(adapter.submitted.mock.calls[0][0]).toMatchObject({ enabled: true })
  })

  test("the header switch is read-only for a viewer", () => {
    render({ canEdit: false })
    const headerSwitch =
      container.querySelectorAll<HTMLElement>("[role='switch']")[0]
    expect(headerSwitch?.hasAttribute("data-disabled")).toBe(true)
  })

  test("the apply-to-all switch belongs to the Page and sits outside the read-only fieldset", () => {
    render({ canEdit: false })

    const applyToAll = container.querySelector("[data-testid='apply-to-all']")
    expect(applyToAll?.getAttribute("data-inbox-id")).toBe("inbox-1")
    expect(applyToAll?.closest("fieldset")).toBeNull()
  })

  test("a server error is shown as a toast", () => {
    render()
    adapter.actionProps?.onError({ error: { serverError: "Flow not found" } })
    expect(toastMocks.error).toHaveBeenCalledWith("Flow not found")

    adapter.actionProps?.onError({ error: {} })
    expect(toastMocks.error).toHaveBeenLastCalledWith("Unknown error")
  })

  test("a successful save is announced", () => {
    render()
    act(() => adapter.actionProps?.onSuccess({ data: INITIAL }))
    expect(toastMocks.success).toHaveBeenCalledWith("Saved successfully")
    // The server decides whether the automation runs now (gates apply-to-all).
    expect(router.refresh).toHaveBeenCalledTimes(1)
    expect(queries.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["apply-to-all-status"],
    })
  })
})
