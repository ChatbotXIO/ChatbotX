import { isCloud, keys } from "../../keys"
import { logger } from "../../logger"

/** How long to wait on the portal before giving up, so sign-up never hangs. */
const PROVISION_TIMEOUT_MS = 5000

/**
 * Same-origin path that provisions a user's default plan and publishes
 * entitlements. It is served by the private billing portal, mounted as a micro
 * frontend behind the builder's `/portal/*` rewrite (see
 * apps/builder/next.config.ts). Hitting it through the builder origin keeps this
 * repo free of any portal URL/secret — the proxy resolves the real target.
 */
const PROVISION_PATH = "/portal/api/users/provision"

type ProvisionDefaultPlanInput = {
  userId: string
  tenantId?: string
}

/**
 * Billing provisioning seam. All pricing and plan logic lives in the private
 * billing portal, integrated as a micro frontend and reached only through the
 * builder's same-origin `/portal/*` proxy; this service just asks the portal to
 * provision a newly signed-up user's default plan. The portal resolves which
 * plan is the default, then writes the entitlements onto the user's `UserQuota`
 * row (the `publishEntitlements` path) — none of that pricing logic lives in
 * this open-source repo.
 */
export const billingService = {
  /**
   * Provision the default plan for a newly created user. Cloud-only and
   * strictly best-effort: any failure (portal down, timeout, non-OK status) is
   * logged and swallowed so it never blocks sign-up. The portal endpoint must
   * be idempotent — this may be called again for the same user (hook retries,
   * re-sign-up after deletion).
   */
  async provisionDefaultPlan({
    userId,
    tenantId,
  }: ProvisionDefaultPlanInput): Promise<void> {
    if (!isCloud()) {
      return
    }

    const { NEXT_PUBLIC_BUILDER_URL } = keys()
    const url = new URL(PROVISION_PATH, NEXT_PUBLIC_BUILDER_URL)

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), PROVISION_TIMEOUT_MS)
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId, tenantId }),
        signal: controller.signal,
      })
      if (!response.ok) {
        logger.error(
          { userId, tenantId, status: response.status },
          "billing: default-plan provisioning returned a non-OK status",
        )
      }
    } catch (err) {
      logger.error(
        { err, userId, tenantId },
        "billing: default-plan provisioning request failed",
      )
    } finally {
      clearTimeout(timeout)
    }
  },
}
