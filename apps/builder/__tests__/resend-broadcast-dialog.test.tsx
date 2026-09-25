// @vitest-environment jsdom

import type { BroadcastModel } from "@chatbotx.io/database/types"
import type React from "react"
import { act, useState } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, test, vi } from "vitest"
import type { BroadcastPlanLimitOutcome } from "@/features/broadcasts/lib/broadcast-plan-limit"
import { ResendBroadcastDialog } from "@/features/broadcasts/resend-broadcast-dialog"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }))
vi.mock("sonner", () => ({ toast }))

type ActionOptions = {
  onSuccess?: (args: { data?: unknown }) => void
  onError?: (args: { error: { serverError?: string } }) => void
}
const actionState = vi.hoisted(() => ({ options: {} as ActionOptions }))
vi.mock("next-safe-action/hooks", () => ({
  useAction: (_action: unknown, options: ActionOptions) => {
    actionState.options = options
    return { execute: vi.fn(), isPending: false }
  },
}))

vi.mock("@/features/broadcasts/actions/resend-broadcast.action", () => ({
  resendBroadcastAction: { bind: vi.fn(() => ({})) },
}))

vi.mock("@/enterprise/features/billing/upgrade-plan-dialog", () => ({
  UpgradePlanDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="pricing-dialog">pricing</div> : null,
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
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}))

const BROADCAST = {
  id: "bc-1",
  workspaceId: "ws-1",
  name: "Spring sale",
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

function Harness() {
  const [open, setOpen] = useState(true)
  return (
    <ResendBroadcastDialog
      broadcast={BROADCAST}
      onOpenChange={setOpen}
      open={open}
    />
  )
}

describe("ResendBroadcastDialog plan limit", () => {
  let container: HTMLDivElement
  let root: Root

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    toast.success.mockReset()
  })

  test("closes the resend dialog before showing the plan-limit dialog", () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
    act(() => root.render(<Harness />))

    act(() => actionState.options.onSuccess?.({ data: PLAN_LIMIT_OUTCOME }))

    expect(container.querySelectorAll('[data-testid="dialog"]')).toHaveLength(1)
    expect(container.textContent).toContain("broadcasts.planLimitDialog.title")
    expect(toast.success).not.toHaveBeenCalled()
  })
})
