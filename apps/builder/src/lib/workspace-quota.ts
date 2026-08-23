import {
  quotaEnforcementService,
  userQuotaService,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import type { UserQuotaModel } from "@chatbotx.io/database/types"
import { isCloud } from "@/env"
import { resolveBlockReason, resolveTrialEndsAt } from "./quota-metrics"

export interface WorkspaceBlockState {
  blocked: boolean
  blockReason: "status" | "mac" | null
  quota: UserQuotaModel | null
  trialEndsAt: string | null
}

/**
 * Resolves the entitlement state for a workspace. Quota is owner-anchored: the
 * workspace owner's UserQuota row is the tenant pool, including for invited
 * members (AGENTS.md invariant #12).
 */
export async function resolveWorkspaceBlockState(
  ownerId: string,
): Promise<WorkspaceBlockState> {
  if (!isCloud()) {
    return {
      blocked: false,
      blockReason: null,
      quota: null,
      trialEndsAt: null,
    }
  }

  const [quota, atLimit] = await Promise.all([
    userQuotaService.getForUser(ownerId),
    quotaEnforcementService.getAtLimitMap(ownerId),
  ])
  const trialEndsAt = resolveTrialEndsAt(quota)
  const blockReason = resolveBlockReason(
    quota?.planStatus ?? null,
    trialEndsAt,
    atLimit.mac,
  )

  return {
    blocked: blockReason !== null,
    blockReason,
    quota,
    trialEndsAt,
  }
}

/**
 * Mutation-path parity with `workspaceActionClient`'s `getWorkspaceOwnerAccessState`
 * gate (`apps/builder/src/lib/safe-action.ts`). `workspaceAuthorizedMidddleware`
 * only checks membership + scheduled-deletion (read endpoints must stay readable
 * when expired, AGENTS.md invariant #14), so every oRPC mutation handler must
 * call this explicitly after that middleware runs.
 */
export async function assertWorkspaceNotBlocked(
  ownerId: string,
): Promise<void> {
  const { blocked, blockReason } = await resolveWorkspaceBlockState(ownerId)
  if (blocked) {
    throw new ChatbotXException(
      blockReason === "mac"
        ? "Contact limit reached for this plan"
        : "This workspace's plan/trial has expired",
      "workspaceBlocked",
      402,
    )
  }
}
