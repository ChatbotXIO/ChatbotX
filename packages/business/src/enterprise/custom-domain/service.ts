import { db } from "@chatbotx.io/database/client"
import { withCache } from "@chatbotx.io/redis"

// Read-only service. Write and domain-verification operations live in the
// private enterprise source — they are not available in the OSS edition.
export const customDomainService = {
  findActiveByDomain(domain: string) {
    return withCache(
      `custom-domain:active:${domain}`,
      () =>
        db.query.customDomainModel.findFirst({
          where: { domain, status: "active" },
        }),
      { tags: [`cd:domain:${domain}`] },
    )
  },

  findByUserId(userId: string) {
    return withCache(
      `custom-domain:user:${userId}`,
      () =>
        db.query.customDomainModel.findMany({
          where: { userId },
        }),
      {
        tags: [`cd:user:${userId}`],
        dynamicTags: (results) => results.map((r) => `cd:domain:${r.domain}`),
      },
    )
  },
}
