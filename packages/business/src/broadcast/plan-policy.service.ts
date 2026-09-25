import { type DatabaseClient, sql } from "@chatbotx.io/database/client"
import {
  ACTIVE_BROADCAST_STATUSES,
  type BroadcastPlanPolicy,
  exceedsPlanSendRate,
  isChannelRestrictedByAnyPolicy,
  type RestrictedBroadcastPlanPolicy,
  resolveApplicablePolicy,
  resolveSendRateOverride as resolvePolicySendRateOverride,
  TRIAL_BROADCAST_PLAN_POLICY,
  UNRESTRICTED_BROADCAST_PLAN_POLICY,
} from "@chatbotx.io/database/partials"
import { broadcastRepository } from "@chatbotx.io/database/repositories"
import { broadcastPlanLimitException } from "../errors"
import { isCloud } from "../keys"
import { userQuotaService } from "../user-quota/service"
import { workspaceService } from "../workspace/service"

export type BroadcastPlanContext = {
  policy: BroadcastPlanPolicy
  planName: string | null
}

export type RestrictedBroadcastPlanContext = {
  policy: RestrictedBroadcastPlanPolicy
  planName: string | null
}

const unrestrictedContext = (
  planName: string | null = null,
): BroadcastPlanContext => ({
  policy: UNRESTRICTED_BROADCAST_PLAN_POLICY,
  planName,
})

class BroadcastPlanPolicyService {
  async resolveForWorkspace(
    workspaceId: string,
  ): Promise<BroadcastPlanContext> {
    if (!isCloud()) {
      return unrestrictedContext()
    }

    const workspace = await workspaceService.find({
      where: { id: workspaceId },
    })
    if (!workspace) {
      return unrestrictedContext()
    }

    const identity = await userQuotaService.getPlanIdentity(workspace.ownerId)
    return identity.isOnTrial
      ? { policy: TRIAL_BROADCAST_PLAN_POLICY, planName: identity.planName }
      : unrestrictedContext(identity.planName)
  }

  /** Avoids entitlement reads when a known channel is outside every trial restriction. */
  appliesToChannel(channel: string): boolean {
    return isChannelRestrictedByAnyPolicy(channel)
  }

  hasRestrictions(ctx: BroadcastPlanContext): boolean {
    return ctx.policy.kind === "restricted"
  }

  restrictionFor(
    ctx: BroadcastPlanContext,
    channel: string,
  ): RestrictedBroadcastPlanContext | null {
    const policy = resolveApplicablePolicy(ctx.policy, channel)
    return policy ? { policy, planName: ctx.planName } : null
  }

  resolveSendRateOverride(
    ctx: RestrictedBroadcastPlanContext,
    sendRatePerMinute: number | null | undefined,
  ): { sendRatePerMinute: number } {
    return resolvePolicySendRateOverride(ctx.policy, sendRatePerMinute)
  }

  assertSendRateAllowed(
    ctx: RestrictedBroadcastPlanContext,
    sendRatePerMinute: number | null | undefined,
  ): void {
    if (exceedsPlanSendRate(ctx.policy, sendRatePerMinute)) {
      throw broadcastPlanLimitException("sendRate", ctx)
    }
  }

  async lockActivation(tx: DatabaseClient, workspaceId: string): Promise<void> {
    const lockKey = `broadcast-activation:${workspaceId}`
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`,
    )
  }

  async assertActiveSlotAvailable(
    tx: DatabaseClient,
    input: {
      workspaceId: string
      channel: string
      ctx: RestrictedBroadcastPlanContext
      excludeBroadcastId?: string
    },
  ): Promise<void> {
    const activeCount = await broadcastRepository.countActive(
      {
        workspaceId: input.workspaceId,
        channel: input.channel,
        statuses: ACTIVE_BROADCAST_STATUSES,
        excludeId: input.excludeBroadcastId,
      },
      tx,
    )
    if (activeCount >= input.ctx.policy.maxActiveBroadcasts) {
      throw broadcastPlanLimitException("activeBroadcasts", input.ctx)
    }
  }
}

export const broadcastPlanPolicyService = new BroadcastPlanPolicyService()
