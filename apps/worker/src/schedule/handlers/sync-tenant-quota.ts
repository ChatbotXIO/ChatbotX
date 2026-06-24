import { tenantQuotaService } from "@chatbotx.io/business"
import { logger } from "../../lib/logger"

/**
 * Reconcile the pooled tenant usage counters from the source-of-truth DB counts
 * (aggregated across every workspace under the tenant), mirroring
 * `sync-user-quota` but keyed by `tenantId`. The DB/cache logic lives in
 * `tenantQuotaService` (data-access rule); this handler only orchestrates the
 * walk over tracked tenants.
 */
export const syncTenantQuota = async (): Promise<void> => {
  const tenantIds = await tenantQuotaService.listTrackedTenantIds()
  if (tenantIds.length === 0) {
    return
  }

  logger.info(
    { count: tenantIds.length },
    "tenant-quota: syncing pooled quota for tenants",
  )

  const BATCH_SIZE = 50
  for (let i = 0; i < tenantIds.length; i += BATCH_SIZE) {
    const batch = tenantIds.slice(i, i + BATCH_SIZE)
    await Promise.all(
      batch.map((tenantId) => tenantQuotaService.reconcileFromDb(tenantId)),
    )
  }
}
