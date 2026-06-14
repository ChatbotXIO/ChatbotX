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

  findByTenantId(tenantId: string) {
    return withCache(
      `custom-domain:tenant:${tenantId}`,
      () =>
        db.query.customDomainModel.findMany({
          where: { tenantId },
        }),
      {
        tags: [`cd:tenant:${tenantId}`],
        dynamicTags: (results) => results.map((r) => `cd:domain:${r.domain}`),
      },
    )
  },
}
