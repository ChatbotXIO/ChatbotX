import { tenantService, userQuotaService } from "@chatbotx.io/business"
import { logger } from "../../lib/logger"
import { runJobWithAuditContext } from "../../lib/run-job-with-audit-context"

// Owners downgraded (white-label entitlement lost while their tenant is
// still active) in a single reconcile pass. A spike here is far more
// consistent with `hasWhiteLabelEntitlement` misreading a quota outage as
// "not a reseller" than real churn — abort the downgrade branch instead of
// silently disconnecting every sub-account's channels. Provision/reactivate
// still run: they only ever add access back, so they're safe either way.
const MAX_DOWNGRADES_PER_RUN = 50

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

  const whiteLabelOwnerIdSet = new Set(whiteLabelOwnerIds)
  const downgradeCandidateIds = activeOwnerIds.filter(
    (ownerId) => !whiteLabelOwnerIdSet.has(ownerId),
  )
  const skipDowngrade = downgradeCandidateIds.length > MAX_DOWNGRADES_PER_RUN
  if (skipDowngrade) {
    logger.error(
      {
        count: downgradeCandidateIds.length,
        sample: downgradeCandidateIds.slice(0, 5),
      },
      "tenant-reconcile: abnormal downgrade batch size, skipping downgrades this run",
    )
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
        runJobWithAuditContext({ source: "schedule:reconcileTenants" }, () =>
          tenantService.reconcileOwnerEntitlement(ownerId, {
            skipDowngrade,
          }),
        ).catch((err) => {
          logger.error(
            { err, ownerId },
            "tenant-reconcile: failed to reconcile owner",
          )
        }),
      ),
    )
  }
}
