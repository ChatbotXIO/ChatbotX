"use server"

import { tenantService } from "@chatbotx.io/business"
import type { UserModel } from "@chatbotx.io/database/types"
import { isCloud } from "@/env"
import { authActionClient } from "@/lib/safe-action"

/**
 * Provision (or reconcile) the current user's white-label tenant right after a
 * plan upgrade. The billing portal writes `UserQuota.whiteLabel` and posts
 * `billing:upgrade-success`; this gives the reseller their `Tenant` row
 * immediately instead of waiting for the periodic worker reconcile.
 *
 * Best-effort and idempotent: the portal's entitlement write can lag the
 * postMessage, so this may briefly see no white-label flag and do nothing — the
 * worker reconcile is the authority and provisions on its next tick. Cloud-only;
 * other editions have no quota row, so there is nothing to reconcile.
 */
export const reconcileTenantEntitlementAction = authActionClient.action(
  async ({ ctx }: { ctx: { user: UserModel } }) => {
    if (!isCloud()) {
      return
    }
    await tenantService.reconcileOwnerEntitlement(ctx.user.id)
  },
)
