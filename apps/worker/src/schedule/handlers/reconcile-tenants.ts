import { tenantService, userQuotaService } from "@chatbotx.io/business"
import { logger } from "../../lib/logger"

/**
 * Reconcile reseller tenants against their stored white-label entitlement: the
 * authoritative safety net behind the immediate upgrade-time provisioning.
 * Walks the union of owners that *should* own a tenant (white-label entitlement
 * set) and owners that *currently* own an active tenant, so a single pass both
 * provisions newly-upgraded resellers and suspends ones that churned. All
 * DB/cache logic lives in `tenantService` (data-access rule); this handler only
 * orchestrates the walk. Each `reconcileOwnerEntitlement` is idempotent.
 */
export const reconcileTenants = async (): Promise<void> => {
  const [whiteLabelOwnerIds, activeOwnerIds] = await Promise.all([
    userQuotaService.listWhiteLabelOwnerIds(),
    tenantService.listActiveOwnerIds(),
  ])

  const ownerIds = [...new Set([...whiteLabelOwnerIds, ...activeOwnerIds])]
  if (ownerIds.length === 0) {
    return
  }

  logger.info(
    { count: ownerIds.length },
    "tenant-reconcile: reconciling tenant provisioning for owners",
  )

  const BATCH_SIZE = 50
  for (let i = 0; i < ownerIds.length; i += BATCH_SIZE) {
    const batch = ownerIds.slice(i, i + BATCH_SIZE)
    await Promise.all(
      batch.map((ownerId) =>
        tenantService.reconcileOwnerEntitlement(ownerId).catch((err) => {
          logger.error(
            { err, ownerId },
            "tenant-reconcile: failed to reconcile owner",
          )
        }),
      ),
    )
  }
}
