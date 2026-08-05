import { and, type DatabaseClient, db, eq } from "../../client"
import { accountModel } from "../../schema"

type FindByUserAndProviderInput = {
  userId: string
  providerId: string
}

type AuthAccountToken = {
  accessToken: string | null
}

class AuthAccountRepository {
  /**
   * A user's linked OAuth account for one provider. Filtering by `userId` is
   * inherently tenant-safe (a `User` row belongs to exactly one tenant), so no
   * separate `tenantId` filter is needed here — unlike the identity lookup
   * (`providerId` + `accountId`) the auth adapter scopes by tenant to prevent
   * cross-tenant identity collisions.
   */
  async findByUserAndProvider(
    input: FindByUserAndProviderInput,
    tx: DatabaseClient = db,
  ): Promise<AuthAccountToken | null> {
    const [row] = await tx
      .select({ accessToken: accountModel.accessToken })
      .from(accountModel)
      .where(
        and(
          eq(accountModel.userId, input.userId),
          eq(accountModel.providerId, input.providerId),
        ),
      )
      .limit(1)

    return row ?? null
  }
}

export const authAccountRepository = new AuthAccountRepository()
