import { db, eq } from "@chatbotx.io/database/client"
import { tenantModel } from "@chatbotx.io/database/schema"
import { invalidateCacheByTags, withCache } from "@chatbotx.io/redis"
import type { EmailTemplate } from "../../platform/settings"
import { userQuotaService } from "../../user-quota/service"

type TenantStatus = "active" | "suspended"

type TenantBrandingData = {
  brandName?: string | null
  customCss?: string | null
  customJs?: string | null
  faviconPath?: string | null
  forgotPasswordEmailTemplate?: EmailTemplate | null
  logoDarkPath?: string | null
  logoLightPath?: string | null
  magicLinkEmailTemplate?: EmailTemplate | null
  policyUrl?: string | null
  signupEmailTemplate?: EmailTemplate | null
  status?: string
  storageUrl?: string | null
  termsOfServiceUrl?: string | null
  theme?: string | null
}

/**
 * Read/write access to the `Tenant` row (identity + lifecycle + branding). A
 * tenant is keyed by its own id; the reseller that owns it is `Tenant.ownerId`.
 * Branding writes target the tenant owned by a given reseller (`upsertByOwner`).
 */
export const tenantService = {
  findById(tenantId: string) {
    return withCache(
      `tenant:${tenantId}`,
      () =>
        db.query.tenantModel.findFirst({
          where: { id: tenantId },
        }),
      { tags: [`tenant:${tenantId}`] },
    )
  },

  findByOwner(ownerId: string) {
    return withCache(
      `tenant:owner:${ownerId}`,
      () =>
        db.query.tenantModel.findFirst({
          where: { ownerId },
        }),
      { tags: [`tenant:owner:${ownerId}`] },
    )
  },

  /**
   * The id of the tenant owned by `ownerId`, provisioning one if none exists.
   * Idempotent — every reseller is guaranteed exactly one tenant.
   */
  async provisionForOwner(ownerId: string): Promise<string> {
    const existing = await db.query.tenantModel.findFirst({
      where: { ownerId },
      columns: { id: true },
    })
    if (existing) {
      return existing.id
    }

    // Race-safe insert: rely on the `Tenant_ownerId_key` partial unique index,
    // not the read above. Two concurrent callers both miss the `findFirst`; the
    // loser's insert is a no-op (`onConflictDoNothing`) and returns nothing, so
    // we re-read to hand back the row the winner created. Provisioning stays
    // idempotent — exactly one tenant per reseller.
    const [created] = await db
      .insert(tenantModel)
      .values({ ownerId })
      .onConflictDoNothing({ target: tenantModel.ownerId })
      .returning({ id: tenantModel.id })
    await invalidateCacheByTags([`tenant:owner:${ownerId}`])
    if (created) {
      return created.id
    }

    const winner = await db.query.tenantModel.findFirst({
      where: { ownerId },
      columns: { id: true },
    })
    if (!winner) {
      throw new Error(`Failed to provision tenant for owner ${ownerId}`)
    }
    return winner.id
  },

  /**
   * Owner ids of every active, owned tenant (the seeded root tenant has a null
   * owner and is excluded). Used by the provisioning reconcile to find tenants
   * whose owner may have lost their white-label entitlement and should be
   * suspended.
   */
  async listActiveOwnerIds(): Promise<string[]> {
    const rows = await db.query.tenantModel.findMany({
      where: { status: "active" },
      columns: { ownerId: true },
    })
    return rows
      .map((row) => row.ownerId)
      .filter((ownerId): ownerId is string => ownerId !== null)
  },

  /**
   * Bring the reseller's tenant into line with their stored white-label
   * entitlement. The single idempotent unit both the upgrade server action and
   * the worker reconcile call, so a tenant is created exactly when (and only
   * when) the owner holds a purchased white-label plan:
   *   - has entitlement, no tenant      → provision one;
   *   - has entitlement, tenant suspended → reactivate it;
   *   - no entitlement, tenant active    → downgrade (suspend + clear flags).
   * Every branch is a no-op when already in the target state, so repeated or
   * concurrent calls are safe.
   */
  async reconcileOwnerEntitlement(ownerId: string): Promise<void> {
    const [hasWhiteLabel, tenant] = await Promise.all([
      userQuotaService.hasWhiteLabelEntitlement(ownerId),
      this.findByOwner(ownerId),
    ])

    if (hasWhiteLabel) {
      if (!tenant) {
        await this.provisionForOwner(ownerId)
      } else if (tenant.status !== "active") {
        await this.reactivate(ownerId)
      }
      return
    }

    if (tenant?.status === "active") {
      await this.downgrade(ownerId)
    }
  },

  /** Update the branding/config of the tenant owned by `ownerId`. */
  async upsertByOwner(ownerId: string, data: TenantBrandingData) {
    const [updated] = await db
      .update(tenantModel)
      .set(data)
      .where(eq(tenantModel.ownerId, ownerId))
      .returning({ id: tenantModel.id })
    if (updated) {
      await invalidateCacheByTags([
        `tenant:${updated.id}`,
        `tenant:owner:${ownerId}`,
      ])
    }
  },

  /** Flip the lifecycle status of the tenant owned by `ownerId`, busting caches. */
  async setStatusByOwner(ownerId: string, status: TenantStatus): Promise<void> {
    const [updated] = await db
      .update(tenantModel)
      .set({ status })
      .where(eq(tenantModel.ownerId, ownerId))
      .returning({ id: tenantModel.id })
    if (updated) {
      await invalidateCacheByTags([
        `tenant:${updated.id}`,
        `tenant:owner:${ownerId}`,
      ])
    }
  },

  /**
   * Suspend the tenant owned by `ownerId`. Sub-accounts can no longer sign in
   * (auth falls back to the root tenant) and quota enforcement stops treating
   * the owner as a reseller (the pool is gated on an active tenant). Reversible
   * via `reactivate` — no data is deleted.
   */
  suspend(ownerId: string): Promise<void> {
    return this.setStatusByOwner(ownerId, "suspended")
  },

  /** Restore a suspended tenant to active, re-enabling its sub-accounts. */
  reactivate(ownerId: string): Promise<void> {
    return this.setStatusByOwner(ownerId, "active")
  },

  /**
   * Full downgrade from a white-label plan: suspend the reseller's tenant
   * (disabling all sub-accounts, reversibly) and clear the white-label /
   * enterprise entitlement flags on the owner's quota row. The new plan's
   * numeric limits are written separately by the billing layer
   * (`publishEntitlements`).
   */
  async downgrade(ownerId: string): Promise<void> {
    await this.suspend(ownerId)
    await userQuotaService.clearWhiteLabelEntitlements(ownerId)
  },
}
