import { db } from "@chatbotx.io/database/client"
import { platformSettingModel } from "@chatbotx.io/database/schema"
import { invalidateCacheByTags, withCache } from "@chatbotx.io/redis"
import type { EmailTemplate } from "../../platform/settings"

type PlatformSettingUpsertData = {
  brandName?: string | null
  logoLightPath?: string | null
  logoDarkPath?: string | null
  faviconPath?: string | null
  customCss?: string | null
  customJs?: string | null
  theme?: string | null
  policyUrl?: string | null
  termsOfServiceUrl?: string | null
  signupEmailTemplate?: EmailTemplate | null
  forgotPasswordEmailTemplate?: EmailTemplate | null
  magicLinkEmailTemplate?: EmailTemplate | null
}

export const platformSettingService = {
  findForUser(userId: string) {
    return withCache(
      `ps:${userId}`,
      () =>
        db.query.platformSettingModel.findFirst({
          where: { userId },
        }),
      { tags: [`ps:${userId}`] },
    )
  },

  async upsert(userId: string, data: PlatformSettingUpsertData) {
    await db
      .insert(platformSettingModel)
      .values({ userId, ...data })
      .onConflictDoUpdate({
        target: [platformSettingModel.userId],
        set: data,
      })
    await invalidateCacheByTags([`ps:${userId}`])
  },
}
