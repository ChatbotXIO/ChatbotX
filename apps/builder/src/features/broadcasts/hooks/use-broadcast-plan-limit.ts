"use client"

import { useState } from "react"
import type { BroadcastPlanLimitOutcome } from "../lib/broadcast-plan-limit"

export type BroadcastPlanLimitStep =
  | { step: "closed" }
  | { step: "limit"; outcome: BroadcastPlanLimitOutcome }
  | { step: "pricing" }

export function useBroadcastPlanLimit(): {
  state: BroadcastPlanLimitStep
  show: (outcome: BroadcastPlanLimitOutcome) => void
  openPricing: () => void
  dismiss: () => void
} {
  const [state, setState] = useState<BroadcastPlanLimitStep>({ step: "closed" })

  return {
    state,
    show: (outcome) => setState({ step: "limit", outcome }),
    openPricing: () => setState({ step: "pricing" }),
    dismiss: () => setState({ step: "closed" }),
  }
}
