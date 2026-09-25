import { z } from "zod"
import {
  BROADCAST_TRIAL_DISPLAYED_SEND_RATE_PER_MINUTE,
  BROADCAST_TRIAL_MAX_ACTIVE,
  BROADCAST_TRIAL_SEND_RATE_PER_MINUTE,
  BROADCAST_TRIAL_UPGRADE_SPEED_MULTIPLIER,
  type BroadcastStatus,
  broadcastStatuses,
} from "./broadcast"
import type { ChannelType } from "./channel"

/** Applicability and enforcement are separate typed states so restricted limits are never nullable. */
export type RestrictedBroadcastPlanPolicy = {
  kind: "restricted"
  /** Highest rate a broadcast may carry and the value stored for a blank rate. */
  maxSendRatePerMinute: number
  /** Restricted broadcasts that may be scheduled or sending at once per workspace. */
  maxActiveBroadcasts: number
  /** Channels governed by this policy. */
  channels: readonly ChannelType[]
  /** Product copy values, independent of the enforced limits. */
  display: {
    sendRatePerMinute: number
    upgradeSpeedMultiplier: number
  }
}

export type BroadcastPlanPolicy =
  | { kind: "unrestricted" }
  | RestrictedBroadcastPlanPolicy

export const UNRESTRICTED_BROADCAST_PLAN_POLICY: BroadcastPlanPolicy = {
  kind: "unrestricted",
}

export const TRIAL_BROADCAST_PLAN_POLICY: RestrictedBroadcastPlanPolicy = {
  kind: "restricted",
  maxSendRatePerMinute: BROADCAST_TRIAL_SEND_RATE_PER_MINUTE,
  maxActiveBroadcasts: BROADCAST_TRIAL_MAX_ACTIVE,
  channels: ["messenger"],
  display: {
    sendRatePerMinute: BROADCAST_TRIAL_DISPLAYED_SEND_RATE_PER_MINUTE,
    upgradeSpeedMultiplier: BROADCAST_TRIAL_UPGRADE_SPEED_MULTIPLIER,
  },
}

export const RESTRICTED_BROADCAST_PLAN_POLICIES: readonly RestrictedBroadcastPlanPolicy[] =
  [TRIAL_BROADCAST_PLAN_POLICY]

/** Statuses that occupy an active broadcast slot. */
export const ACTIVE_BROADCAST_STATUSES: readonly BroadcastStatus[] = [
  broadcastStatuses.enum.scheduled,
  broadcastStatuses.enum.sending,
]

export const broadcastPlanLimitReasons = z.enum([
  "sendRate",
  "activeBroadcasts",
])
export type BroadcastPlanLimitReason = z.infer<typeof broadcastPlanLimitReasons>

/** Returns the restricted policy only when it governs the supplied channel. */
export const resolveApplicablePolicy = (
  policy: BroadcastPlanPolicy,
  channel: string,
): RestrictedBroadcastPlanPolicy | null => {
  if (policy.kind === "unrestricted") {
    return null
  }
  return policy.channels.some(
    (restrictedChannel) => restrictedChannel === channel,
  )
    ? policy
    : null
}

export const isChannelRestrictedByAnyPolicy = (channel: string): boolean =>
  RESTRICTED_BROADCAST_PLAN_POLICIES.some(
    (policy) => resolveApplicablePolicy(policy, channel) !== null,
  )

export const exceedsPlanSendRate = (
  policy: RestrictedBroadcastPlanPolicy,
  sendRatePerMinute: number | null | undefined,
): boolean =>
  sendRatePerMinute != null && sendRatePerMinute > policy.maxSendRatePerMinute

/** Rate patch for a restricted activation after the caller has rejected an over-cap value. */
export const resolveSendRateOverride = (
  policy: RestrictedBroadcastPlanPolicy,
  sendRatePerMinute: number | null | undefined,
): { sendRatePerMinute: number } => ({
  sendRatePerMinute: sendRatePerMinute ?? policy.maxSendRatePerMinute,
})

/** Structured plan-limit payload shared by API, action outcome, and UI layers. */
export const broadcastPlanLimitDataSchema = z.object({
  reason: broadcastPlanLimitReasons,
  planName: z.string().optional(),
  maxSendRatePerMinute: z.number().int(),
  maxActiveBroadcasts: z.number().int(),
  displayedSendRatePerMinute: z.number().int(),
  upgradeSpeedMultiplier: z.number().int(),
})
export type BroadcastPlanLimitData = z.infer<
  typeof broadcastPlanLimitDataSchema
>
