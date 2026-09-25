// @vitest-environment jsdom

import type React from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { BroadcastPlanLimitDialog } from "@/features/broadcasts/components/broadcast-plan-limit-dialog"
import type { BroadcastPlanLimitStep } from "@/features/broadcasts/hooks/use-broadcast-plan-limit"

vi.mock("next-intl", () => ({
  useTranslations:
    () => (key: string, values?: Record<string, string | number>) => {
      if (key === "billing.trial.planName") {
        return "Translated trial"
      }
      return values ? `${key}:${JSON.stringify(values)}` : key
    },
}))

vi.mock("@chatbotx.io/ui/components/ui/dialog", () => ({
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div data-testid="short-dialog">{children}</div> : null,
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

vi.mock("@/enterprise/features/billing/upgrade-plan-dialog", () => ({
  UpgradePlanDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="pricing-dialog">pricing</div> : null,
}))

const limitState = (
  reason: "sendRate" | "activeBroadcasts",
  planName?: string,
): BroadcastPlanLimitStep => ({
  step: "limit",
  outcome: {
    outcome: "planLimit",
    limit: {
      reason,
      planName,
      maxSendRatePerMinute: 60,
      maxActiveBroadcasts: 1,
      displayedSendRatePerMinute: 100,
      upgradeSpeedMultiplier: 20,
    },
  },
})

describe("BroadcastPlanLimitDialog", () => {
  let container: HTMLDivElement
  let root: Root
  const onDismiss = vi.fn()
  const onOpenPricing = vi.fn()

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    onDismiss.mockReset()
    onOpenPricing.mockReset()
  })

  const render = (state: BroadcastPlanLimitStep) => {
    act(() => {
      root.render(
        <BroadcastPlanLimitDialog
          onDismiss={onDismiss}
          onOpenPricing={onOpenPricing}
          state={state}
        />,
      )
    })
  }

  test("renders the send-rate sentence with product display values, never the enforced cap", () => {
    render(limitState("sendRate", "Starter"))

    const text = container.textContent ?? ""
    expect(text).toContain("broadcasts.planLimitDialog.sendRate")
    expect(text).toContain('"plan":"Starter"')
    expect(text).toContain('"rate":100')
    expect(text).toContain('"multiplier":20')
    expect(text).not.toContain('"rate":60')
  })

  test("uses the translated trial name when the outcome has no plan name", () => {
    render(limitState("sendRate"))

    expect(container.textContent).toContain('"plan":"Translated trial"')
  })

  test("renders the active-broadcast sentence and max value", () => {
    render(limitState("activeBroadcasts", "Trial"))

    expect(container.textContent).toContain(
      "broadcasts.planLimitDialog.activeBroadcasts",
    )
    expect(container.textContent).toContain('"max":1')
  })

  test("cancel dismisses and upgrade requests the pricing step", () => {
    render(limitState("sendRate", "Trial"))
    const buttons = Array.from(container.querySelectorAll("button"))

    act(() => buttons[0]?.click())
    expect(onDismiss).toHaveBeenCalledTimes(1)

    act(() => buttons[1]?.click())
    expect(onOpenPricing).toHaveBeenCalledTimes(1)
  })

  test("mounts either the short dialog or pricing dialog, and closed renders nothing", () => {
    render(limitState("sendRate", "Trial"))
    expect(
      container.querySelector('[data-testid="short-dialog"]'),
    ).not.toBeNull()
    expect(container.querySelector('[data-testid="pricing-dialog"]')).toBeNull()

    render({ step: "pricing" })
    expect(container.querySelector('[data-testid="short-dialog"]')).toBeNull()
    expect(
      container.querySelector('[data-testid="pricing-dialog"]'),
    ).not.toBeNull()

    render({ step: "closed" })
    expect(container.childElementCount).toBe(0)
  })
})
