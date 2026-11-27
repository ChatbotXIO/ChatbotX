import type { SQL } from "drizzle-orm"
import { PgDialect } from "drizzle-orm/pg-core"
import { describe, expect, test, vi } from "vitest"
import type { DatabaseClient } from "../src/client"
import { oauthConsentRepository } from "../src/repositories/oauth-consent/repository"

const dialect = new PgDialect()
const render = (clause: SQL) => dialect.sqlToQuery(clause)

const createSelectTx = (rows: unknown[]) => {
  const orderBy = vi.fn().mockResolvedValue(rows)
  const where = vi.fn().mockReturnValue({ orderBy })
  const leftJoin = vi.fn().mockReturnValue({ where })
  const innerJoin = vi.fn().mockReturnValue({ leftJoin })
  const from = vi.fn().mockReturnValue({ innerJoin })

  const as = vi.fn().mockReturnValue({ clientId: {} })
  const groupBy = vi.fn().mockReturnValue({ as })
  const activeTokenWhere = vi.fn().mockReturnValue({ groupBy })
  const activeTokenFrom = vi.fn().mockReturnValue({ where: activeTokenWhere })
  const select = vi
    .fn()
    .mockReturnValueOnce({ from: activeTokenFrom })
    .mockReturnValueOnce({ from })

  return {
    activeTokenWhere,
    orderBy,
    select,
    tx: { select } as unknown as DatabaseClient,
    where,
  }
}

describe("oauthConsentRepository.listGivenByUser", () => {
  test("lists given consents and aggregates only live refresh tokens", async () => {
    const now = new Date("2026-10-29T00:00:00.000Z")
    const { activeTokenWhere, orderBy, select, tx, where } = createSelectTx([])

    await expect(
      oauthConsentRepository.listGivenByUser("user-1", now, tx),
    ).resolves.toEqual([])

    const consentPredicate = render(where.mock.calls[0]?.[0] as SQL)
    expect(consentPredicate.sql).toContain('"OAuthConsent"."userId" = $1')
    expect(consentPredicate.params).toEqual(["user-1"])

    const activeTokenPredicate = render(
      activeTokenWhere.mock.calls[0]?.[0] as SQL,
    )
    expect(activeTokenPredicate.sql).toContain(
      '"OAuthRefreshToken"."expiresAt" > $2',
    )
    expect(activeTokenPredicate.sql).toContain(
      '"OAuthRefreshToken"."revoked" is null',
    )
    expect(activeTokenPredicate.params).toEqual(["user-1", now.toISOString()])
    expect(orderBy).toHaveBeenCalledTimes(1)

    const selectedFields = select.mock.calls[0]?.[0] as {
      activeUntil: {
        sql: {
          decoder?: { mapFromDriverValue: (value: string) => Date | null }
        }
      }
      lastRefreshedAt: {
        sql: {
          decoder?: { mapFromDriverValue: (value: string) => Date | null }
        }
      }
    }
    expect(
      selectedFields.activeUntil.sql.decoder?.mapFromDriverValue(
        "2026-11-01T00:00:00.000Z",
      ),
    ).toEqual(new Date("2026-11-01T00:00:00.000Z"))
    expect(
      selectedFields.lastRefreshedAt.sql.decoder?.mapFromDriverValue(
        "2026-10-30T00:00:00.000Z",
      ),
    ).toEqual(new Date("2026-10-30T00:00:00.000Z"))
  })
})
