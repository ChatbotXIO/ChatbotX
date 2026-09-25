// @vitest-environment node

import {
  ACTIVE_BROADCAST_STATUSES,
  broadcastPlanLimitDataSchema,
  exceedsPlanSendRate,
  isChannelRestrictedByAnyPolicy,
  RESTRICTED_BROADCAST_PLAN_POLICIES,
  resolveApplicablePolicy,
  resolveSendRateOverride,
  TRIAL_BROADCAST_PLAN_POLICY,
  UNRESTRICTED_BROADCAST_PLAN_POLICY,
} from "@chatbotx.io/database/partials"
import { channelTypes } from "@chatbotx.io/utils/channel"
import { describe, expect, test } from "vitest"

describe("broadcast plan policy", () => {
  test("defines the trial Messenger limits and display values", () => {
    expect(TRIAL_BROADCAST_PLAN_POLICY).toEqual({
      kind: "restricted",
      maxSendRatePerMinute: 60,
      maxActiveBroadcasts: 1,
      channels: ["messenger"],
      display: {
        sendRatePerMinute: 100,
        upgradeSpeedMultiplier: 20,
      },
    })
  })

  test("applies the trial policy only to Messenger", () => {
    expect(
      resolveApplicablePolicy(TRIAL_BROADCAST_PLAN_POLICY, "messenger"),
    ).toBe(TRIAL_BROADCAST_PLAN_POLICY)

    for (const channel of channelTypes.options) {
      if (channel !== "messenger") {
        expect(
          resolveApplicablePolicy(TRIAL_BROADCAST_PLAN_POLICY, channel),
        ).toBeNull()
      }
    }
  })

  test("registers the trial policy for channel-first restriction checks", () => {
    expect(RESTRICTED_BROADCAST_PLAN_POLICIES).toContain(
      TRIAL_BROADCAST_PLAN_POLICY,
    )
    expect(isChannelRestrictedByAnyPolicy("messenger")).toBe(true)
    expect(isChannelRestrictedByAnyPolicy("whatsapp")).toBe(false)
  })

  test("does not apply an unrestricted policy to any channel", () => {
    for (const channel of channelTypes.options) {
      expect(
        resolveApplicablePolicy(UNRESTRICTED_BROADCAST_PLAN_POLICY, channel),
      ).toBeNull()
    }
  })

  test("detects only send rates above the restricted cap", () => {
    expect(exceedsPlanSendRate(TRIAL_BROADCAST_PLAN_POLICY, null)).toBe(false)
    expect(exceedsPlanSendRate(TRIAL_BROADCAST_PLAN_POLICY, 60)).toBe(false)
    expect(exceedsPlanSendRate(TRIAL_BROADCAST_PLAN_POLICY, 61)).toBe(true)
  })

  test.each([
    { rate: undefined, expected: 60 },
    { rate: null, expected: 60 },
    { rate: 30, expected: 30 },
    { rate: 60, expected: 60 },
  ])("resolves a restricted rate of $rate to $expected", ({
    rate,
    expected,
  }) => {
    expect(resolveSendRateOverride(TRIAL_BROADCAST_PLAN_POLICY, rate)).toEqual({
      sendRatePerMinute: expected,
    })
  })

  test("defines scheduled and sending as the active slot statuses", () => {
    expect(ACTIVE_BROADCAST_STATUSES).toEqual(["scheduled", "sending"])
  })

  test("accepts an absent plan name and rejects nullable numeric limits", () => {
    const validPayload = {
      reason: "sendRate",
      maxSendRatePerMinute: 60,
      maxActiveBroadcasts: 1,
      displayedSendRatePerMinute: 100,
      upgradeSpeedMultiplier: 20,
    }

    expect(broadcastPlanLimitDataSchema.safeParse(validPayload).success).toBe(
      true,
    )
    expect(
      broadcastPlanLimitDataSchema.safeParse({
        ...validPayload,
        maxSendRatePerMinute: null,
      }).success,
    ).toBe(false)
  })
})
