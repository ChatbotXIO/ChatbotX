// @vitest-environment jsdom

import { TRIAL_BROADCAST_PLAN_POLICY } from "@chatbotx.io/database/partials"
import type React from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { CreateBroadcastForm } from "@/features/broadcasts/create-broadcast-form"
import type { BroadcastPlanLimitOutcome } from "@/features/broadcasts/lib/broadcast-plan-limit"

const translate = vi.hoisted(() => (key: string) => key)
vi.mock("next-intl", () => ({ useTranslations: () => translate }))

const push = vi.hoisted(() => vi.fn())
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }))

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }))
vi.mock("sonner", () => ({ toast }))

const actionState = vi.hoisted(() => ({
  result: undefined as unknown,
  onSuccess: undefined as ((args: { data?: unknown }) => void) | undefined,
  submitCalls: 0,
  values: {} as Record<string, unknown>,
}))

const setValue = vi.hoisted(() =>
  vi.fn((name: string, value: unknown) => {
    actionState.values[name] = value
  }),
)
const getValues = vi.hoisted(() => vi.fn(() => []))
const formState = { isValid: true, isSubmitting: false, errors: {} }
const form = {
  control: {},
  formState,
  getValues,
  setValue,
}

vi.mock("@next-safe-action/adapter-react-hook-form/hooks", () => ({
  useHookFormAction: (
    _action: unknown,
    _resolver: unknown,
    props: {
      actionProps?: { onSuccess?: (args: { data?: unknown }) => void }
    },
  ) => {
    actionState.onSuccess = props.actionProps?.onSuccess
    return {
      form,
      handleSubmitWithAction: (event?: { preventDefault?: () => void }) => {
        event?.preventDefault?.()
        actionState.submitCalls += 1
        actionState.onSuccess?.({ data: actionState.result })
        return Promise.resolve()
      },
    }
  },
}))

const watchedValues: Record<string, unknown> = {
  channel: "messenger",
  subaction: "allContacts",
  inboxIds: [],
  targets: [],
  contactFilter: { operator: "and", conditions: [] },
  schedulesType: "now",
}
vi.mock("react-hook-form", () => ({
  useFormContext: () => form,
  useWatch: ({ name }: { name: string }) => watchedValues[name],
}))

vi.mock("@/features/broadcasts/actions/create-broadcast.action", () => ({
  createBroadcastAction: { bind: vi.fn(() => ({})) },
}))
vi.mock("@/features/broadcasts/actions/update-draft-broadcast.action", () => ({
  updateDraftBroadcastAction: { bind: vi.fn(() => ({})) },
}))

const debouncedCount = vi.hoisted(() => vi.fn(() => Promise.resolve()))
vi.mock("@chatbotx.io/ui/hooks/use-debounced-callback", () => ({
  useDebouncedCallback: () => debouncedCount,
}))

vi.mock("@/hooks/routing", () => ({ useWorkspaceId: () => "ws-1" }))
vi.mock("../src/features/contacts/provider/contact-store-context", () => ({
  useContactStore: (selector: (value: unknown) => unknown) =>
    selector({
      contactInboxesCount: 5,
      getContactInboxesCount: vi.fn(),
      loadingInboxesCount: false,
    }),
}))
vi.mock("../src/features/flows/provider/flow-hook", () => ({
  useFlows: () => ({ data: [] }),
}))
vi.mock("../src/features/inboxes/provider/inbox-hook", () => ({
  useInboxList: () => [],
}))

vi.mock("../src/features/contact-filter", () => ({ ContactFilter: () => null }))
vi.mock("../src/features/inboxes/components/inbox-icon", () => ({
  InboxIcon: () => <div>inbox</div>,
}))
vi.mock(
  "@/features/broadcasts/components/broadcast-audience-preview-dialog",
  () => ({
    BroadcastAudiencePreviewDialog: () => null,
  }),
)
vi.mock("@/features/broadcasts/components/broadcast-flow-targets", () => ({
  BroadcastFlowTargets: () => null,
}))
vi.mock(
  "@/features/broadcasts/components/broadcast-flow-type-selector",
  () => ({
    BroadcastFlowTypeSelector: () => null,
  }),
)
vi.mock(
  "@/features/broadcasts/components/broadcast-inbox-multi-select",
  () => ({
    BroadcastInboxMultiSelect: () => null,
  }),
)
vi.mock("@/features/broadcasts/components/broadcast-send-limit-fields", () => ({
  BroadcastSendLimitFields: () => null,
}))
vi.mock("@/features/broadcasts/components/broadcast-template-targets", () => ({
  BroadcastTemplateTargets: () => null,
}))

vi.mock("@/features/broadcasts/components/broadcast-confirm-dialog", () => ({
  BroadcastConfirmDialog: ({ open }: { open: boolean }) =>
    open ? (
      <div data-testid="confirm-dialog">
        <button form="broadcast-form" type="submit">
          submit-confirm
        </button>
      </div>
    ) : null,
}))

vi.mock("@/enterprise/features/billing/upgrade-plan-dialog", () => ({
  UpgradePlanDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="pricing-dialog">pricing</div> : null,
}))

vi.mock("@chatbotx.io/ui/components/form/combobox-field", () => ({
  ComboboxField: () => null,
}))
vi.mock("@chatbotx.io/ui/components/form/date-picker-field", () => ({
  DateTimePickerField: () => null,
}))
vi.mock("@chatbotx.io/ui/components/form/select-field", () => ({
  SelectField: () => null,
}))
vi.mock("@chatbotx.io/ui/components/ui/form", () => ({
  Form: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))
vi.mock("@chatbotx.io/ui/components/ui/card", () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  CardHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  CardTitle: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}))
vi.mock("@chatbotx.io/ui/components/ui/separator", () => ({
  Separator: () => null,
}))
vi.mock("@chatbotx.io/ui/components/ui/button", () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}))
vi.mock("@chatbotx.io/ui/components/ui/dialog", () => ({
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div data-testid="plan-limit-dialog">{children}</div> : null,
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

describe("CreateBroadcastForm plan limit", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    actionState.result = undefined
    actionState.submitCalls = 0
    actionState.values = {}
    push.mockReset()
    toast.success.mockReset()
    setValue.mockClear()
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
    act(() => {
      root.render(
        <CreateBroadcastForm
          planPolicy={TRIAL_BROADCAST_PLAN_POLICY}
          workspaceId="ws-1"
        />,
      )
    })
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  const button = (label: string) =>
    Array.from(container.querySelectorAll("button")).find(
      (candidate) => candidate.textContent === label,
    )

  const submitForm = () => {
    act(() => {
      container
        .querySelector("form")
        ?.dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        )
    })
  }

  test("confirm outcome closes the confirm dialog and opens the plan-limit dialog", async () => {
    actionState.result = PLAN_LIMIT_OUTCOME
    act(() => button("actions.confirm")?.click())
    expect(
      container.querySelector('[data-testid="confirm-dialog"]'),
    ).not.toBeNull()

    await submitForm()

    expect(container.querySelector('[data-testid="confirm-dialog"]')).toBeNull()
    expect(
      container.querySelector('[data-testid="plan-limit-dialog"]'),
    ).not.toBeNull()
    expect(push).not.toHaveBeenCalled()
  })

  test("Enter-key form submit opens the plan-limit dialog", async () => {
    actionState.result = PLAN_LIMIT_OUTCOME

    await submitForm()

    expect(
      container.querySelector('[data-testid="plan-limit-dialog"]'),
    ).not.toBeNull()
    expect(push).not.toHaveBeenCalled()
  })

  test("save as draft keeps its existing success path", async () => {
    actionState.result = { status: "draft" }

    act(() => {
      button("actions.saveAsDraft")?.click()
    })
    await act(async () => {
      await Promise.resolve()
    })

    expect(actionState.submitCalls).toBe(1)
    expect(setValue).toHaveBeenCalledWith("saveAsDraft", true, {
      shouldDirty: false,
    })
    expect(push).toHaveBeenCalledWith("/space/ws-1/broadcasts")
  })

  test("a successful activation still navigates to the broadcasts list", async () => {
    actionState.result = { status: "scheduled" }

    await submitForm()

    expect(toast.success).toHaveBeenCalledTimes(1)
    expect(push).toHaveBeenCalledWith("/space/ws-1/broadcasts")
  })
})
