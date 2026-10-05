import {
  and,
  type DatabaseClient,
  db,
  eq,
  findOrFail,
  sql,
} from "@chatbotx.io/database/client"
import { connectionRepository } from "@chatbotx.io/database/repositories"
import { integrationThreadsModel } from "@chatbotx.io/database/schema"
import type { IntegrationThreadsModel } from "@chatbotx.io/database/types"
import type { AuthValue } from "@chatbotx.io/sdk"
import { z } from "zod"
import { BaseService } from "../base.service"
import {
  authExpiresAtOf,
  CONNECTION_STORE_BINDINGS,
  type ConnectionQuotaConsumption,
  resolveOwnerId,
  saveOrInsertSatellite,
  upsertConnectionRow,
  withQuotaCompensation,
} from "../connection"
import { connectionStateService } from "../connection/state-service"
import { ChatbotXException, channelDuplicatedException } from "../errors"
import { inboxService } from "../inbox/service"
import { workspaceService } from "../workspace"

const threadsRefreshAuthSchema = z
  .object({
    tokens: z
      .object({
        accessToken: z.string().min(1),
        expiresAt: z.string().datetime().optional(),
      })
      .passthrough(),
  })
  .passthrough()

export const THREADS_TOKEN_REFRESH_THRESHOLD_DAYS = 14

export type ThreadsTokenRefreshCandidate = {
  id: string
  workspaceId: string
  auth: Record<string, unknown>
  currentAccessToken: string
}

type ThreadsRefreshRow = {
  id: string
  workspaceId: string
  auth: Record<string, unknown>
}

class IntegrationThreadsService extends BaseService {
  findByInboxId(inboxId: string) {
    return db.query.integrationThreadsModel.findFirst({
      where: { inboxId },
    })
  }

  /**
   * An inbox's connection, scoped to the workspace that claims it. An inbox id
   * is not a secret, so any caller that already knows the workspace must use
   * this rather than `findByInboxId` — otherwise one workspace can read
   * another's connection by passing its inbox id.
   *
   * Throws rather than returning null, matching the messenger/instagram/tiktok
   * equivalents: a caller cannot forget a check that does not exist.
   */
  findByInboxIdForWorkspace(props: {
    inboxId: string
    workspaceId: string
  }): Promise<IntegrationThreadsModel> {
    return findOrFail({
      table: integrationThreadsModel,
      where: { inboxId: props.inboxId, workspaceId: props.workspaceId },
      message: "Threads integration not found",
    })
  }

  findByThreadsUserId(threadsUserId: string) {
    return db.query.integrationThreadsModel.findFirst({
      where: { threadsUserId },
    })
  }

  findByIdForWorkspace(props: { id: string; workspaceId: string }) {
    return db.query.integrationThreadsModel.findFirst({
      where: props,
    })
  }

  async listByWorkspaceId(props: {
    workspaceId: string
  }): Promise<{ data: IntegrationThreadsModel[] }> {
    const data = await db.query.integrationThreadsModel.findMany({
      where: { workspaceId: props.workspaceId },
      orderBy: { createdAt: "asc" },
    })

    return { data }
  }

  async markTokenRefreshError(id: string, error: string): Promise<void> {
    const [updated] = await db
      .update(integrationThreadsModel)
      .set({ tokenRefreshError: error })
      .where(eq(integrationThreadsModel.id, id))
      .returning({
        workspaceId: integrationThreadsModel.workspaceId,
        threadsUserId: integrationThreadsModel.threadsUserId,
      })

    // `threads` now has a real `Connection` adapter/store binding
    // (`CONNECTION_STORE_BINDINGS.threads`) once the row has been backfilled
    // (`backfill-connections.ts`) — this degrades the matching `Connection`
    // row's status alongside `IntegrationThreads.tokenRefreshError`. This
    // cron path has no revoked/terminal signal, only a bare refresh
    // failure, so `degraded` (not `markUnhealthyByIdentifier`) is correct.
    if (updated) {
      await connectionStateService.markDegradedByIdentifier({
        provider: "threads",
        identifier: updated.threadsUserId,
        workspaceId: updated.workspaceId,
        reason: "refresh_failed",
      })
    }
  }

  /**
   * Persists a Threads connect atomically: creates the `Inbox` row, then
   * writes the `Connection` + `IntegrationThreads` rows through the generic
   * engine (`upsertConnectionRow`/`CONNECTION_STORE_BINDINGS.threads`) — the
   * same path `tiktokIntegrationService.connect` uses.
   * `IntegrationThreads.threadsUserId` is unique *globally*, unlike the
   * `(workspaceId, provider, sourceId)` key `upsertConnectionRow` itself
   * guards against, so a second workspace connecting the same account only
   * collides on the satellite insert — `upsertConnectionRow` maps that to
   * `connectionAlreadyConnected`, translated back below to the
   * `channelDuplicated` code the (pre-engine) caller already expects.
   */
  async connect(props: {
    workspaceId: string
    ownerId: string
    auth: Record<string, unknown>
    threadsUserId: string
    username: string
    name: string
  }): Promise<IntegrationThreadsModel> {
    const quotaConsumption: ConnectionQuotaConsumption = {
      consumed: false,
      workspaceUsageIncremented: false,
    }

    return await withQuotaCompensation(
      {
        ownerId: props.ownerId,
        quotaConsumption,
        context: { provider: "threads", workspaceId: props.workspaceId },
      },
      () =>
        db.transaction(async (tx) => {
          const { inbox } = await inboxService.create({
            tx,
            ownerId: props.ownerId,
            data: {
              workspaceId: props.workspaceId,
              name: props.name,
              channel: "threads",
              sourceId: props.threadsUserId,
            },
            skipQuota: true,
          })

          const existing = await connectionRepository.findByProviderSourceId(
            {
              workspaceId: props.workspaceId,
              provider: "threads",
              sourceId: props.threadsUserId,
            },
            tx,
          )

          try {
            await upsertConnectionRow({
              tx,
              workspaceId: props.workspaceId,
              provider: "threads",
              kind: "channel",
              descriptor: {
                sourceId: props.threadsUserId,
                displayName: props.name,
              },
              auth: props.auth as AuthValue,
              extraConfig: { username: props.username },
              existing,
              store: CONNECTION_STORE_BINDINGS.threads as NonNullable<
                (typeof CONNECTION_STORE_BINDINGS)["threads"]
              >,
              ownerId: props.ownerId,
              quotaConsumption,
              inboxId: inbox.id,
            })
          } catch (err) {
            if (
              err instanceof ChatbotXException &&
              err.code === "connectionAlreadyConnected"
            ) {
              throw channelDuplicatedException()
            }
            throw err
          }

          return await findOrFail({
            table: integrationThreadsModel,
            where: { inboxId: inbox.id },
            client: tx,
            message: "Threads integration not found",
          })
        }),
    )
  }

  /**
   * Returns whether a row actually matched, so the caller can tell a real
   * reconnect from an UPDATE that hit nothing (wrong id, wrong workspace, row
   * already disconnected) instead of reporting success either way. Goes
   * through the generic engine for a row already backfilled into
   * `Connection`: revives the satellite auth via
   * `CONNECTION_STORE_BINDINGS.threads` and runs the FSM's
   * `connect.completed` transition (consumes `channels` quota when reviving
   * from `needs_reauth`/`disconnected`, stamps `authExpiresAt`). Falls back
   * to the legacy satellite-only update for a row backfill hasn't reached
   * yet — mirrors `ConnectionStateService.reconnectInbox`'s own no-op
   * fallback for the same case.
   */
  async reconnect(props: {
    workspaceId: string
    id: string
    auth: Record<string, unknown>
    username: string
    name: string
  }): Promise<boolean> {
    const integrationThreads = await db.query.integrationThreadsModel.findFirst(
      {
        where: { id: props.id, workspaceId: props.workspaceId },
      },
    )
    if (!integrationThreads) {
      return false
    }

    const auth = props.auth as AuthValue
    const connection = await connectionRepository.findByInboxId({
      inboxId: integrationThreads.inboxId,
    })

    if (!connection) {
      const rows = await db
        .update(integrationThreadsModel)
        .set({
          auth: props.auth,
          username: props.username,
          name: props.name,
          // A fresh token clears whatever the refresh cron last recorded —
          // otherwise the error icon and workspace banner stick forever.
          tokenRefreshError: null,
        })
        .where(
          and(
            eq(integrationThreadsModel.id, props.id),
            eq(integrationThreadsModel.workspaceId, props.workspaceId),
          ),
        )
        .returning({ id: integrationThreadsModel.id })

      return rows.length > 0
    }

    const store = CONNECTION_STORE_BINDINGS.threads
    if (!store) {
      throw new Error("threads has no store binding registered")
    }
    const descriptor = {
      sourceId: integrationThreads.threadsUserId,
      displayName: props.name,
    }
    const ownerId = await resolveOwnerId(connection)
    const quotaConsumption: ConnectionQuotaConsumption = {
      consumed: false,
      workspaceUsageIncremented: false,
    }

    await withQuotaCompensation(
      {
        ownerId,
        quotaConsumption,
        context: { provider: "threads", id: props.id },
      },
      () =>
        db.transaction(async (tx) => {
          await saveOrInsertSatellite({
            tx,
            workspaceId: props.workspaceId,
            kind: "channel",
            inboxId: connection.inboxId,
            auth,
            descriptor,
            extraConfig: {
              username: props.username,
              name: props.name,
              // A fresh token clears whatever the refresh cron last recorded
              // — otherwise the error icon and workspace banner stick
              // forever. Mirrors the legacy fallback branch above; requires
              // `tokenRefreshError` in the threads store binding's
              // `configColumns` (`store-bindings.ts`) since this write goes
              // through `saveAuthByForeignKey`, not a raw UPDATE.
              tokenRefreshError: null,
            },
            existing: connection,
            store,
          })
          await connectionRepository.update(
            {
              id: connection.id,
              workspaceId: connection.workspaceId,
              values: {
                displayName: descriptor.displayName,
                lastError: null,
              },
            },
            tx,
          )
          await connectionStateService.transition({
            connectionId: connection.id,
            event: "connect.completed",
            ownerId,
            tx,
            quotaConsumption,
            values: { authExpiresAt: authExpiresAtOf(auth), lastError: null },
          })
        }),
    )

    return true
  }

  async listDueForTokenRefresh(props?: {
    refreshBefore?: Date
    includeMissingExpiresAt?: boolean
  }): Promise<ThreadsTokenRefreshCandidate[]> {
    const refreshBefore =
      props?.refreshBefore ??
      new Date(
        Date.now() + THREADS_TOKEN_REFRESH_THRESHOLD_DAYS * 24 * 60 * 60 * 1000,
      )
    const includeMissingExpiresAt = props?.includeMissingExpiresAt ?? true

    // Parenthesised at the source: `::` binds tighter than `->>`, so an
    // unwrapped fragment would make `<frag>::timestamptz` parse as
    // `auth -> 'tokens' ->> ('expiresAt'::timestamptz)` and fail at runtime
    // with "invalid input syntax for type timestamp with time zone".
    const expiresAtText = sql`(${integrationThreadsModel.auth} -> 'tokens' ->> 'expiresAt')`
    // A row with no `expiresAt` is opted in or out wholesale; one with a value
    // is due only once it falls inside the refresh window. Postgres does the
    // filtering so the cron loads the rows it will actually refresh, not every
    // Threads `auth` blob in the table.
    //
    // CASE, not `AND`, because only CASE guarantees left-to-right evaluation:
    // an unparseable `expiresAt` must be skipped the way the old JS
    // `Number.isNaN` check skipped it, never abort the whole query with a cast
    // error and take the entire refresh run down with it.
    const dueForRefresh = sql`(CASE
      WHEN ${expiresAtText} IS NULL THEN ${includeMissingExpiresAt}
      WHEN ${expiresAtText} ~ '^\\d{4}-\\d{2}-\\d{2}[T ]\\d{2}:\\d{2}'
        THEN ${expiresAtText}::timestamptz <= ${refreshBefore.toISOString()}::timestamptz
      ELSE false
    END)`

    const rows = (await db
      .select({
        id: integrationThreadsModel.id,
        workspaceId: integrationThreadsModel.workspaceId,
        auth: integrationThreadsModel.auth,
      })
      .from(integrationThreadsModel)
      .where(
        and(
          sql`${integrationThreadsModel.auth} -> 'tokens' ->> 'accessToken' IS NOT NULL`,
          dueForRefresh,
        ),
      )) as ThreadsRefreshRow[]

    // Kept as a safety net for rows whose `auth` shape the SQL above cannot
    // vouch for (a malformed blob, a non-string token).
    return rows.flatMap((row) => {
      const parsedAuth = threadsRefreshAuthSchema.safeParse(row.auth)

      if (!parsedAuth.success) {
        return []
      }

      return [
        {
          id: row.id,
          workspaceId: row.workspaceId,
          auth: row.auth,
          currentAccessToken: parsedAuth.data.tokens.accessToken,
        },
      ]
    })
  }

  async updateAuthIfAccessTokenMatches(props: {
    id: string
    workspaceId: string
    expectedCurrentAccessToken: string
    auth: Record<string, unknown>
  }): Promise<boolean> {
    const rows = await db
      .update(integrationThreadsModel)
      .set({
        auth: props.auth,
        // A successful refresh clears the previous failure, matching
        // `tiktokIntegrationService` / `zaloIntegrationService`.
        tokenRefreshError: null,
      })
      .where(
        and(
          eq(integrationThreadsModel.id, props.id),
          eq(integrationThreadsModel.workspaceId, props.workspaceId),
          sql`${integrationThreadsModel.auth} -> 'tokens' ->> 'accessToken' = ${props.expectedCurrentAccessToken}`,
        ),
      )
      .returning({ id: integrationThreadsModel.id })

    return rows.length > 0
  }

  async disconnect(props: {
    workspaceId: string
    id: string
    tx?: DatabaseClient
  }): Promise<void> {
    if (!props.tx) {
      await db.transaction(async (tx) => {
        await this.disconnect({
          ...props,
          tx,
        })
      })
      return
    }

    const client = props.tx
    const [integration, workspace] = await Promise.all([
      client.query.integrationThreadsModel.findFirst({
        where: { id: props.id, workspaceId: props.workspaceId },
      }),
      workspaceService.findById({ id: props.workspaceId, tx: client }),
    ])

    if (!integration) {
      throw new Error("Integration Threads not found")
    }

    await client
      .delete(integrationThreadsModel)
      .where(eq(integrationThreadsModel.id, integration.id))

    await connectionStateService.disconnectInbox({
      inboxId: integration.inboxId,
      workspaceId: props.workspaceId,
      ownerId: workspace.ownerId,
      tx: client,
    })
  }
}

export const integrationThreadsService = new IntegrationThreadsService()
