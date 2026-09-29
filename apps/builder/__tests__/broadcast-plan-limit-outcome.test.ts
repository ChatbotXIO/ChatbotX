// @vitest-environment node

import {
  BROADCAST_PLAN_LIMIT_CODE,
  broadcastPlanLimitException,
} from "@chatbotx.io/business/errors"
import { TRIAL_BROADCAST_PLAN_POLICY } from "@chatbotx.io/database/partials"
import { describe, expect, test } from "vitest"
import { withBroadcastPlanLimitOutcome } from "@/features/broadcasts/actions/broadcast-plan-limit-outcome"
import { isBroadcastPlanLimitOutcome } from "@/features/broadcasts/lib/broadcast-plan-limit"

const createPlanLimitError = () =>
  broadcastPlanLimitException("sendRate", {
    policy: TRIAL_BROADCAST_PLAN_POLICY,
    planName: "Trial",
  })

describe("withBroadcastPlanLimitOutcome", () => {
  test("returns a typed outcome for the real business exception", async () => {
    const error = createPlanLimitError()

    await expect(
      withBroadcastPlanLimitOutcome(() => Promise.reject(error)),
    ).resolves.toEqual({ outcome: "planLimit", limit: error.data })
  })

  test("does not narrow a plain Error carrying the same code", async () => {
    const error = Object.assign(new Error("not a business exception"), {
      code: BROADCAST_PLAN_LIMIT_CODE,
    })

    await expect(
      withBroadcastPlanLimitOutcome(() => Promise.reject(error)),
    ).rejects.toBe(error)
  })

  test("rethrows the original exception when its data is malformed", async () => {
    const error = createPlanLimitError()
    error.data = { reason: "sendRate" }

    await expect(
      withBroadcastPlanLimitOutcome(() => Promise.reject(error)),
    ).rejects.toBe(error)
  })

  test("rethrows unrelated errors unchanged", async () => {
    const error = new Error("database down")

    await expect(
      withBroadcastPlanLimitOutcome(() => Promise.reject(error)),
    ).rejects.toBe(error)
  })
})

describe("isBroadcastPlanLimitOutcome", () => {
  test("recognizes the outcome shape and rejects unrelated values", () => {
    const error = createPlanLimitError()
    const outcome = { outcome: "planLimit", limit: error.data }

    expect(isBroadcastPlanLimitOutcome(outcome)).toBe(true)
    expect(isBroadcastPlanLimitOutcome({ outcome: "planLimit" })).toBe(false)
    expect(
      isBroadcastPlanLimitOutcome({ outcome: "planLimit", limit: {} }),
    ).toBe(false)
    expect(isBroadcastPlanLimitOutcome(new Error("no"))).toBe(false)
  })
})
