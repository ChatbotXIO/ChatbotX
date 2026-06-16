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

  /**
   * Every active custom domain (hostnames only). Used by the auth layer's
   * `trustedOrigins`, which better-auth evaluates on *every* request — so this is
   * cached with a short TTL rather than scanning `CustomDomain` each time. The
   * 60s TTL is a self-healing safety net: a newly verified domain becomes a
   * trusted origin within a minute even if the (private) write path doesn't
   * invalidate the `cd:active:all` tag.
   */
  async listActiveDomains(): Promise<string[]> {
    const rows = await withCache(
      "custom-domain:active:all",
      () =>
        db.query.customDomainModel.findMany({
          where: { status: "active" },
          columns: { domain: true },
        }),
      { tags: ["cd:active:all"], ttl: 60 },
    )
    return rows.map((row) => row.domain)
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
