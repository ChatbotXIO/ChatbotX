import { socialPostPublishRepository } from "@chatbotx.io/database/repositories"
import { z } from "zod"
import { logger } from "../logger"
import {
  MESSAGE_QUOTA_EXCEEDED,
  messageUsageService,
} from "../message-usage/service"
import { logSafe } from "./publish-common"

/** The error a target gets when the owner's message quota is used up before it publishes. */
export const SOCIAL_POST_QUOTA_ERROR = {
  category: "quotaExceeded",
  code: MESSAGE_QUOTA_EXCEEDED,
  message:
    "The message quota of this account is used up. Upgrade the plan or wait for the next billing period, then retry.",
} as const

/** What one charge attempt did: charged now, nothing owed (another caller won), or failed (claim given back). */
export const quotaChargeOutcomeSchema = z.enum(["charged", "failed", "notOwed"])
export type QuotaChargeOutcome = z.infer<typeof quotaChargeOutcomeSchema>

export interface QuotaChargeTarget {
  id: string
  workspaceId: string
}

/**
 * Charges one message for a target that settled `published` (parts included).
 * The durable `quotaChargePending` flag was written in the settling UPDATE; this
 * claims it with a conditional UPDATE (only the winner charges), then charges.
 * A charge that throws gives the claim back so the recovery sweep retries; a
 * crash between claim and charge loses that one charge, never doubles it.
 * Never throws: the target is already published.
 */
export async function chargePublishedTarget(
  target: QuotaChargeTarget,
): Promise<QuotaChargeOutcome> {
  try {
    const claimed = await socialPostPublishRepository.claimQuotaCharge({
      id: target.id,
      workspaceId: target.workspaceId,
    })
    if (!claimed) {
      return "notOwed"
    }
    try {
      await messageUsageService.charge({
        count: 1,
        workspaceId: target.workspaceId,
      })
    } catch (err) {
      await socialPostPublishRepository.releaseQuotaCharge({
        id: target.id,
        workspaceId: target.workspaceId,
      })
      throw err
    }
    return "charged"
  } catch (err) {
    logger.error(
      { err: logSafe(err), targetId: target.id },
      "social-post publish: the message quota charge failed, the sweep retries it",
    )
    return "failed"
  }
}

/**
 * Charges the targets the sweep finds still owing, oldest first. Returns how
 * many were charged. A charge throws only when the workspace could not be read
 * (a database outage: a target's workspace cannot be missing, the FK cascades),
 * so the sweep stops at the first failure instead of hammering the database;
 * the next run starts again from the oldest.
 */
export async function sweepPendingQuotaCharges(limit: number): Promise<number> {
  const pending = await socialPostPublishRepository.listPendingQuotaCharges({
    limit,
  })
  let charged = 0
  for (const target of pending) {
    const outcome = await chargePublishedTarget(target)
    if (outcome === "failed") {
      break
    }
    if (outcome === "charged") {
      charged += 1
    }
  }
  return charged
}
