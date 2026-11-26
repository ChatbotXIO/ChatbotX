import type { EncryptedData } from "@chatbotx.io/encryption"
import {
  and,
  asc,
  type DatabaseClient,
  db,
  eq,
  inArray,
  sql,
} from "../../client"
import type {
  SocialAccountStatus,
  SocialAccountStatusReason,
  SocialDestinationKind,
  SocialProvider,
} from "../../partials/social-account"
import { socialAccountDestinationModel, socialAccountModel } from "../../schema"

// Column maps are built when a query runs, not when the module loads, so a test
// that mocks the schema can still import the repositories.

/** Every account column except the two encrypted tokens: what any list or DTO may read. */
const safeAccountColumns = () => ({
  avatar: socialAccountModel.avatar,
  connectedById: socialAccountModel.connectedById,
  createdAt: socialAccountModel.createdAt,
  displayName: socialAccountModel.displayName,
  externalAccountId: socialAccountModel.externalAccountId,
  grantedScopes: socialAccountModel.grantedScopes,
  id: socialAccountModel.id,
  lastVerifiedAt: socialAccountModel.lastVerifiedAt,
  provider: socialAccountModel.provider,
  status: socialAccountModel.status,
  statusReason: socialAccountModel.statusReason,
  tokenExpiresAt: socialAccountModel.tokenExpiresAt,
  updatedAt: socialAccountModel.updatedAt,
  username: socialAccountModel.username,
  workspaceId: socialAccountModel.workspaceId,
})

/** Every destination column except its encrypted token. */
const safeDestinationColumns = () => ({
  avatar: socialAccountDestinationModel.avatar,
  createdAt: socialAccountDestinationModel.createdAt,
  externalId: socialAccountDestinationModel.externalId,
  id: socialAccountDestinationModel.id,
  isActive: socialAccountDestinationModel.isActive,
  kind: socialAccountDestinationModel.kind,
  lastSyncedAt: socialAccountDestinationModel.lastSyncedAt,
  name: socialAccountDestinationModel.name,
  socialAccountId: socialAccountDestinationModel.socialAccountId,
  username: socialAccountDestinationModel.username,
  workspaceId: socialAccountDestinationModel.workspaceId,
})

export type SocialAccountRow = Awaited<
  ReturnType<typeof socialAccountRepository.findForWorkspace>
>
export type SocialAccountSafeRow = NonNullable<SocialAccountRow>
export type SocialDestinationSafeRow = Awaited<
  ReturnType<typeof socialAccountRepository.listDestinations>
>[number]

export type SocialAccountIdentityInput = {
  avatar: string | null
  connectedById: string | null
  displayName: string
  externalAccountId: string
  grantedScopes: string[]
  id: string
  provider: SocialProvider
  statusReason: string | null
  tokenExpiresAt: Date | null
  username: string | null
  workspaceId: string
}

export type SocialDestinationIdentityInput = {
  avatar: string | null
  externalId: string
  id: string
  isActive: boolean
  kind: SocialDestinationKind
  name: string
  username: string | null
}

/** A token write: `null` wipes it. */
export type SocialTokenWrite = EncryptedData | null

/**
 * What a change that follows a provider call must still find unchanged: the
 * account token that was read before the call (a reconnect or refresh meanwhile
 * replaces it) and, for a refresh, the exact lease the worker claimed (a lease
 * that expired and was claimed again belongs to another worker).
 */
export type SocialTokenFence = {
  leaseUntil?: Date
  readAccessToken: EncryptedData
}

const jsonOrNull = (value: SocialTokenWrite): string | null =>
  value === null ? null : JSON.stringify(value)

/** The fence's conditions, added to the WHERE of a status or lease write. */
const fenceConditions = (fence: SocialTokenFence | undefined) =>
  fence
    ? [
        sql`${socialAccountModel.accessToken} IS NOT DISTINCT FROM ${jsonOrNull(fence.readAccessToken)}::jsonb`,
        ...(fence.leaseUntil
          ? [
              sql`${socialAccountModel.refreshLeaseExpiresAt} = ${fence.leaseUntil}::timestamptz`,
            ]
          : []),
      ]
    : []

export const socialAccountRepository = {
  async list(workspaceId: string, tx: DatabaseClient = db) {
    return await tx
      .select(safeAccountColumns())
      .from(socialAccountModel)
      .where(eq(socialAccountModel.workspaceId, workspaceId))
      .orderBy(asc(socialAccountModel.createdAt), asc(socialAccountModel.id))
  },

  async findForWorkspace(
    input: { id: string; workspaceId: string },
    tx: DatabaseClient = db,
  ) {
    const [row] = await tx
      .select(safeAccountColumns())
      .from(socialAccountModel)
      .where(
        and(
          eq(socialAccountModel.id, input.id),
          eq(socialAccountModel.workspaceId, input.workspaceId),
        ),
      )
      .limit(1)
    return row ?? null
  },

  /** The destinations of these accounts, active first. One query, never one per account. */
  async listDestinations(
    input: { accountIds: string[]; workspaceId: string },
    tx: DatabaseClient = db,
  ) {
    if (input.accountIds.length === 0) {
      return []
    }
    return await tx
      .select(safeDestinationColumns())
      .from(socialAccountDestinationModel)
      .where(
        and(
          eq(socialAccountDestinationModel.workspaceId, input.workspaceId),
          inArray(
            socialAccountDestinationModel.socialAccountId,
            input.accountIds,
          ),
        ),
      )
      .orderBy(
        sql`${socialAccountDestinationModel.isActive} DESC`,
        asc(socialAccountDestinationModel.name),
        asc(socialAccountDestinationModel.id),
      )
  },

  /** The encrypted tokens of one account. Only the services that decrypt them may call this. */
  async findTokens(
    input: { id: string; workspaceId: string },
    tx: DatabaseClient = db,
  ) {
    const [row] = await tx
      .select({
        accessToken: socialAccountModel.accessToken,
        id: socialAccountModel.id,
        provider: socialAccountModel.provider,
        refreshToken: socialAccountModel.refreshToken,
        status: socialAccountModel.status,
        tokenExpiresAt: socialAccountModel.tokenExpiresAt,
        workspaceId: socialAccountModel.workspaceId,
      })
      .from(socialAccountModel)
      .where(
        and(
          eq(socialAccountModel.id, input.id),
          eq(socialAccountModel.workspaceId, input.workspaceId),
        ),
      )
      .limit(1)
    return row ?? null
  },

  /** The id of a login already connected on this network, to bind its tokens' AAD. */
  async findIdByExternalAccount(
    input: {
      externalAccountId: string
      provider: SocialProvider
      workspaceId: string
    },
    tx: DatabaseClient = db,
  ) {
    const [row] = await tx
      .select({ id: socialAccountModel.id })
      .from(socialAccountModel)
      .where(
        and(
          eq(socialAccountModel.workspaceId, input.workspaceId),
          eq(socialAccountModel.provider, input.provider),
          eq(socialAccountModel.externalAccountId, input.externalAccountId),
        ),
      )
      .limit(1)
    return row?.id ?? null
  },

  /**
   * Inserts the login or refreshes its identity, and always returns the row's
   * real id: a concurrent connect of the same login conflicts on the unique key
   * and keeps the first id, which the caller then binds the tokens to.
   */
  async upsertIdentity(
    input: SocialAccountIdentityInput,
    tx: DatabaseClient = db,
  ) {
    const [row] = await tx
      .insert(socialAccountModel)
      .values({
        avatar: input.avatar,
        connectedById: input.connectedById,
        displayName: input.displayName,
        externalAccountId: input.externalAccountId,
        grantedScopes: input.grantedScopes,
        id: input.id,
        provider: input.provider,
        status: "connected",
        statusReason: input.statusReason,
        tokenExpiresAt: input.tokenExpiresAt,
        username: input.username,
        workspaceId: input.workspaceId,
      })
      .onConflictDoUpdate({
        target: [
          socialAccountModel.workspaceId,
          socialAccountModel.provider,
          socialAccountModel.externalAccountId,
        ],
        set: {
          avatar: input.avatar,
          connectedById: input.connectedById,
          displayName: input.displayName,
          grantedScopes: input.grantedScopes,
          refreshLeaseExpiresAt: null,
          status: "connected",
          statusReason: input.statusReason,
          tokenExpiresAt: input.tokenExpiresAt,
          updatedAt: sql`now()`,
          username: input.username,
        },
      })
      .returning({ id: socialAccountModel.id })
    if (!row) {
      throw new Error("SocialAccount upsert returned no row")
    }
    return row.id
  },

  async saveTokens(
    input: {
      accessToken: SocialTokenWrite
      id: string
      refreshToken: SocialTokenWrite
      workspaceId: string
    },
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx
      .update(socialAccountModel)
      .set({
        accessToken: input.accessToken,
        refreshToken: input.refreshToken,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(socialAccountModel.id, input.id),
          eq(socialAccountModel.workspaceId, input.workspaceId),
        ),
      )
  },

  /**
   * Inserts or refreshes the listed destinations by `externalId` and returns
   * each one's real id (a conflicting row keeps its id). The tokens are written
   * afterwards, bound to those ids.
   */
  async upsertDestinations(
    input: {
      destinations: SocialDestinationIdentityInput[]
      now: Date
      socialAccountId: string
      workspaceId: string
    },
    tx: DatabaseClient = db,
  ) {
    if (input.destinations.length === 0) {
      return []
    }
    const merged = await tx
      .insert(socialAccountDestinationModel)
      .values(
        input.destinations.map((destination) => ({
          avatar: destination.avatar,
          externalId: destination.externalId,
          id: destination.id,
          isActive: destination.isActive,
          kind: destination.kind,
          lastSyncedAt: input.now,
          name: destination.name,
          socialAccountId: input.socialAccountId,
          username: destination.username,
          workspaceId: input.workspaceId,
        })),
      )
      .onConflictDoUpdate({
        target: [
          socialAccountDestinationModel.socialAccountId,
          socialAccountDestinationModel.externalId,
        ],
        set: {
          avatar: sql`excluded."avatar"`,
          isActive: sql`excluded."isActive"`,
          kind: sql`excluded."kind"`,
          lastSyncedAt: sql`excluded."lastSyncedAt"`,
          name: sql`excluded."name"`,
          updatedAt: sql`now()`,
          username: sql`excluded."username"`,
        },
      })
      .returning({
        externalId: socialAccountDestinationModel.externalId,
        id: socialAccountDestinationModel.id,
      })
    return merged
  },

  /** Writes the destinations' encrypted tokens in one statement. */
  async saveDestinationTokens(
    input: {
      tokens: { id: string; token: SocialTokenWrite }[]
      workspaceId: string
    },
    tx: DatabaseClient = db,
  ): Promise<void> {
    if (input.tokens.length === 0) {
      return
    }
    const rows = sql.join(
      input.tokens.map(
        ({ id, token }) =>
          sql`(${id}::bigint, ${token === null ? null : JSON.stringify(token)}::text)`,
      ),
      sql`, `,
    )
    await tx.execute(sql`
      UPDATE "SocialAccountDestination" AS d
      SET "accessToken" = v.token::jsonb
      FROM (VALUES ${rows}) AS v(id, token)
      WHERE d."id" = v.id AND d."workspaceId" = ${input.workspaceId}::bigint
    `)
  },

  /**
   * Destinations the platform no longer lists stop being active and lose their
   * token; the rows stay so past posts keep their destination.
   */
  async deactivateMissingDestinations(
    input: {
      keepExternalIds: string[]
      now: Date
      socialAccountId: string
      workspaceId: string
    },
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx
      .update(socialAccountDestinationModel)
      .set({
        accessToken: null,
        isActive: false,
        lastSyncedAt: input.now,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(
            socialAccountDestinationModel.socialAccountId,
            input.socialAccountId,
          ),
          eq(socialAccountDestinationModel.workspaceId, input.workspaceId),
          eq(socialAccountDestinationModel.isActive, true),
          sql`${socialAccountDestinationModel.externalId} <> ALL(${sql.param(input.keepExternalIds)}::text[])`,
        ),
      )
  },

  /**
   * Changes the status of an account that is not disconnected (a disconnect is
   * final until a new login). With a `fence`, only while the token that was read
   * is still the stored one, so a stale provider answer never overrides a newer
   * connect.
   */
  async setStatus(
    input: {
      fence?: SocialTokenFence
      id: string
      reason: SocialAccountStatusReason | null
      status: Exclude<SocialAccountStatus, "disconnected">
      workspaceId: string
    },
    tx: DatabaseClient = db,
  ): Promise<boolean> {
    const rows = await tx
      .update(socialAccountModel)
      .set({
        refreshLeaseExpiresAt: null,
        status: input.status,
        statusReason: input.reason,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(socialAccountModel.id, input.id),
          eq(socialAccountModel.workspaceId, input.workspaceId),
          sql`${socialAccountModel.status} <> 'disconnected'`,
          ...fenceConditions(input.fence),
        ),
      )
      .returning({ id: socialAccountModel.id })
    return rows.length > 0
  },

  /**
   * Moves a claimed account to `needsReauth` when its stored token cannot be
   * read at all. The token is unreadable, so the write cannot present it;
   * it presents the claim instead: the account is still `connected` and still
   * holds the exact lease this worker took. A reconnect (which clears the
   * lease), a disconnect or a later claim makes it a no-op.
   */
  async setNeedsReauthUnderLease(
    input: {
      id: string
      leaseUntil: Date
      reason: SocialAccountStatusReason
      workspaceId: string
    },
    tx: DatabaseClient = db,
  ): Promise<boolean> {
    const rows = await tx
      .update(socialAccountModel)
      .set({
        refreshLeaseExpiresAt: null,
        status: "needsReauth",
        statusReason: input.reason,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(socialAccountModel.id, input.id),
          eq(socialAccountModel.workspaceId, input.workspaceId),
          eq(socialAccountModel.status, "connected"),
          sql`${socialAccountModel.refreshLeaseExpiresAt} = ${input.leaseUntil}::timestamptz`,
        ),
      )
      .returning({ id: socialAccountModel.id })
    return rows.length > 0
  },

  async recordVerified(
    input: {
      fence?: SocialTokenFence
      grantedScopes: string[] | null
      id: string
      now: Date
      workspaceId: string
    },
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx
      .update(socialAccountModel)
      .set({
        ...(input.grantedScopes ? { grantedScopes: input.grantedScopes } : {}),
        lastVerifiedAt: input.now,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(socialAccountModel.id, input.id),
          eq(socialAccountModel.workspaceId, input.workspaceId),
          ...fenceConditions(input.fence),
        ),
      )
  },

  /**
   * Locks the account row (`FOR UPDATE`) and says whether it is still
   * `connected` and still holds the token that was read before a provider call.
   * A disconnect, reconnect or refresh meanwhile makes it false, so a slow
   * destination sync never writes over them. The lock holds until the caller's
   * transaction ends, so a disconnect waits for the write instead of racing it.
   */
  async lockConnectedForSync(
    input: { fence: SocialTokenFence; id: string; workspaceId: string },
    tx: DatabaseClient,
  ): Promise<boolean> {
    const rows = await tx
      .select({ id: socialAccountModel.id })
      .from(socialAccountModel)
      .where(
        and(
          eq(socialAccountModel.id, input.id),
          eq(socialAccountModel.workspaceId, input.workspaceId),
          eq(socialAccountModel.status, "connected"),
          ...fenceConditions({ readAccessToken: input.fence.readAccessToken }),
        ),
      )
      .for("update")
    return rows.length > 0
  },

  /** Wipes every token of the account and its destinations and marks it disconnected. */
  async disconnect(
    input: { id: string; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<boolean> {
    const rows = await tx
      .update(socialAccountModel)
      .set({
        accessToken: null,
        refreshLeaseExpiresAt: null,
        refreshToken: null,
        status: "disconnected",
        statusReason: null,
        tokenExpiresAt: null,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(socialAccountModel.id, input.id),
          eq(socialAccountModel.workspaceId, input.workspaceId),
        ),
      )
      .returning({ id: socialAccountModel.id })
    if (rows.length === 0) {
      return false
    }
    await tx
      .update(socialAccountDestinationModel)
      .set({ accessToken: null, isActive: false, updatedAt: sql`now()` })
      .where(
        and(
          eq(socialAccountDestinationModel.socialAccountId, input.id),
          eq(socialAccountDestinationModel.workspaceId, input.workspaceId),
        ),
      )
    return true
  },

  /**
   * Claims up to `limit` connected accounts whose token expires before
   * `expiresBefore` for one refresh each: a conditional UPDATE under
   * `FOR UPDATE SKIP LOCKED` that sets a lease, so a second worker (or the next
   * minute's scan) cannot take the same row until the lease ends.
   */
  async claimDueForRefresh(
    input: {
      expiresBefore: Date
      leaseUntil: Date
      limit: number
      now: Date
      /** Only these networks: those whose adapter can refresh a token. */
      providers: SocialProvider[]
    },
    tx: DatabaseClient = db,
  ) {
    if (input.providers.length === 0) {
      return []
    }
    const result = await tx.execute<{
      id: string
      leaseUntil: Date | string
      provider: SocialProvider
      workspaceId: string
    }>(sql`
      UPDATE "SocialAccount" AS a
      SET "refreshLeaseExpiresAt" = ${input.leaseUntil}::timestamptz
      WHERE a."id" IN (
        SELECT s."id" FROM "SocialAccount" AS s
        WHERE s."status" = 'connected'
          AND s."provider" = ANY(${sql.param(input.providers)}::"socialProvider"[])
          AND s."tokenExpiresAt" IS NOT NULL
          AND s."tokenExpiresAt" <= ${input.expiresBefore}::timestamptz
          AND (s."refreshLeaseExpiresAt" IS NULL OR s."refreshLeaseExpiresAt" < ${input.now}::timestamptz)
        ORDER BY s."tokenExpiresAt" ASC, s."id" ASC
        LIMIT ${input.limit}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING a."id"::text AS "id", a."provider" AS "provider", a."workspaceId"::text AS "workspaceId", a."refreshLeaseExpiresAt" AS "leaseUntil"
    `)
    // `leaseUntil` is the claim itself: the completion must present it back.
    return result.rows.map((row) => ({
      id: row.id,
      leaseUntil: new Date(row.leaseUntil),
      provider: row.provider,
      workspaceId: row.workspaceId,
    }))
  },

  /**
   * Stores a refreshed token and releases the lease, only while the claim still
   * holds: the account is connected, the lease is the one this worker claimed
   * and the token is still the one that was read. Anything else (a reconnect, a
   * disconnect, another worker's later claim) leaves the row alone and answers
   * `false`.
   */
  async applyRefreshedToken(
    input: {
      accessToken: EncryptedData
      fence: Required<SocialTokenFence>
      /** The permissions the refresh reported, written with the token; absent keeps the stored list. */
      grantedScopes?: string[]
      id: string
      /** A rotated refresh token, written in the same statement as the new access token. */
      refreshToken?: EncryptedData
      tokenExpiresAt: Date | null
      workspaceId: string
    },
    tx: DatabaseClient = db,
  ): Promise<boolean> {
    const rows = await tx
      .update(socialAccountModel)
      .set({
        accessToken: input.accessToken,
        ...(input.refreshToken ? { refreshToken: input.refreshToken } : {}),
        ...(input.grantedScopes ? { grantedScopes: input.grantedScopes } : {}),
        refreshLeaseExpiresAt: null,
        tokenExpiresAt: input.tokenExpiresAt,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(socialAccountModel.id, input.id),
          eq(socialAccountModel.workspaceId, input.workspaceId),
          eq(socialAccountModel.status, "connected"),
          ...fenceConditions(input.fence),
        ),
      )
      .returning({ id: socialAccountModel.id })
    return rows.length > 0
  },

  /**
   * Keeps the lease until `retryAt` so a transient failure is retried later, not
   * every minute; only for the worker that still holds the claimed lease.
   */
  async deferRefresh(
    input: {
      fence: Required<SocialTokenFence>
      id: string
      retryAt: Date
      workspaceId: string
    },
    tx: DatabaseClient = db,
  ): Promise<boolean> {
    const rows = await tx
      .update(socialAccountModel)
      .set({ refreshLeaseExpiresAt: input.retryAt })
      .where(
        and(
          eq(socialAccountModel.id, input.id),
          eq(socialAccountModel.workspaceId, input.workspaceId),
          eq(socialAccountModel.status, "connected"),
          ...fenceConditions(input.fence),
        ),
      )
      .returning({ id: socialAccountModel.id })
    return rows.length > 0
  },

  /**
   * `deferRefresh` for a claim whose token could not be read: only the exact
   * lease this worker took is moved to `retryAt`.
   */
  async deferRefreshUnderLease(
    input: {
      id: string
      leaseUntil: Date
      retryAt: Date
      workspaceId: string
    },
    tx: DatabaseClient = db,
  ): Promise<boolean> {
    const rows = await tx
      .update(socialAccountModel)
      .set({ refreshLeaseExpiresAt: input.retryAt })
      .where(
        and(
          eq(socialAccountModel.id, input.id),
          eq(socialAccountModel.workspaceId, input.workspaceId),
          eq(socialAccountModel.status, "connected"),
          sql`${socialAccountModel.refreshLeaseExpiresAt} = ${input.leaseUntil}::timestamptz`,
        ),
      )
      .returning({ id: socialAccountModel.id })
    return rows.length > 0
  },

  /** The encrypted token of every active destination of the account, to re-bind on a re-encrypt. */
  async listDestinationTokens(
    input: { socialAccountId: string; workspaceId: string },
    tx: DatabaseClient = db,
  ) {
    return await tx
      .select({
        accessToken: socialAccountDestinationModel.accessToken,
        externalId: socialAccountDestinationModel.externalId,
        id: socialAccountDestinationModel.id,
        isActive: socialAccountDestinationModel.isActive,
        kind: socialAccountDestinationModel.kind,
      })
      .from(socialAccountDestinationModel)
      .where(
        and(
          eq(
            socialAccountDestinationModel.socialAccountId,
            input.socialAccountId,
          ),
          eq(socialAccountDestinationModel.workspaceId, input.workspaceId),
        ),
      )
      .orderBy(asc(socialAccountDestinationModel.id))
  },
}
