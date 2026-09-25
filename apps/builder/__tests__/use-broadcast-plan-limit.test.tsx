// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import { useBroadcastPlanLimit } from "@/features/broadcasts/hooks/use-broadcast-plan-limit"
import type { BroadcastPlanLimitOutcome } from "@/features/broadcasts/lib/broadcast-plan-limit"

const OUTCOME: BroadcastPlanLimitOutcome = {
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

function Harness() {
  const planLimit = useBroadcastPlanLimit()
  return (
    <div>
      <span data-testid="step">{planLimit.state.step}</span>
      <button onClick={() => planLimit.show(OUTCOME)} type="button">
        show
      </button>
      <button onClick={planLimit.openPricing} type="button">
        pricing
      </button>
      <button onClick={planLimit.dismiss} type="button">
        dismiss
      </button>
    </div>
  )
}

describe("useBroadcastPlanLimit", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
    act(() => root.render(<Harness />))
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  const click = (label: string) => {
    const button = Array.from(container.querySelectorAll("button")).find(
      (candidate) => candidate.textContent === label,
    )
    act(() => button?.click())
  }

  const step = () =>
    container.querySelector('[data-testid="step"]')?.textContent

  test("moves from closed to limit to pricing", () => {
    expect(step()).toBe("closed")

    click("show")
    expect(step()).toBe("limit")

    click("pricing")
    expect(step()).toBe("pricing")
  })

  test("dismisses from both the limit and pricing steps", () => {
    click("show")
    click("dismiss")
    expect(step()).toBe("closed")

    click("pricing")
    click("dismiss")
    expect(step()).toBe("closed")
  })
})
