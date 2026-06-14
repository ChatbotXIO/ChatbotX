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

    const [created] = await db
      .insert(tenantModel)
      .values({ ownerId })
      .returning({ id: tenantModel.id })
    await invalidateCacheByTags([`tenant:owner:${ownerId}`])
    return created.id
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

/**
 * @deprecated `PlatformSetting` was promoted into the `Tenant` table. This shim
 * keeps existing callers compiling: settings are now keyed by the tenant a user
 * owns. Prefer `tenantService.findByOwner` / `tenantService.upsertByOwner`.
 */
export const platformSettingService = {
  findForUser: (userId: string) => tenantService.findByOwner(userId),
  upsert: (userId: string, data: TenantBrandingData) =>
    tenantService.upsertByOwner(userId, data),
}
