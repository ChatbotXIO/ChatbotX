import { db, eq } from "@chatbotx.io/database/client"
import { tenantModel } from "@chatbotx.io/database/schema"
import { invalidateCacheByTags, withCache } from "@chatbotx.io/redis"
import type { EmailTemplate } from "../../platform/settings"

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
}
