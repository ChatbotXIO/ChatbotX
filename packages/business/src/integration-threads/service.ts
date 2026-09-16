import {
  and,
  type DatabaseClient,
  db,
  eq,
  sql,
} from "@chatbotx.io/database/client"
import { integrationThreadsModel } from "@chatbotx.io/database/schema"
import type { IntegrationThreadsModel } from "@chatbotx.io/database/types"
import { createId } from "@chatbotx.io/utils"
import { z } from "zod"
import { BaseService } from "../base.service"
import {
  connectChannelIntegration,
  runConnectTransaction,
} from "../inbox/connect-channel"
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
    await db
      .update(integrationThreadsModel)
      .set({ tokenRefreshError: error })
      .where(eq(integrationThreadsModel.id, id))
  }

  /**
   * Persists a Threads connect atomically. `IntegrationThreads.threadsUserId`
   * is unique *globally* while `connectChannelIntegration`'s duplicate check is
   * workspace-scoped, so a second workspace connecting the same account only
   * collides on the insert — without one transaction around both writes the
   * `Inbox` row would already be committed and left orphaned. Passing `tx`
   * joins a caller's transaction instead, which then owns the error mapping.
   */
  async connect(props: {
    workspaceId: string
    ownerId: string
    auth: Record<string, unknown>
    threadsUserId: string
    username: string
    name: string
    tx?: DatabaseClient
  }): Promise<IntegrationThreadsModel> {
    const insert = async (tx: DatabaseClient) => {
      const { integration } = await connectChannelIntegration({
        tx,
        ownerId: props.ownerId,
        inboxData: {
          id: createId(),
          workspaceId: props.workspaceId,
          name: props.name,
          channel: "threads",
          sourceId: props.threadsUserId,
        },
        insertIntegration: async (inboxId) =>
          tx
            .insert(integrationThreadsModel)
            .values({
              id: createId(),
              inboxId,
              workspaceId: props.workspaceId,
              auth: props.auth,
              threadsUserId: props.threadsUserId,
              username: props.username,
              name: props.name,
            })
            .returning()
            .then((rows) => rows[0]),
      })

      return integration
    }

    if (props.tx) {
      return await insert(props.tx)
    }

    return await runConnectTransaction("threads", insert)
  }

  /**
   * Returns whether a row actually matched, so the caller can tell a real
   * reconnect from an UPDATE that hit nothing (wrong id, wrong workspace, row
   * already disconnected) instead of reporting success either way.
   */
  async reconnect(props: {
    workspaceId: string
    id: string
    auth: Record<string, unknown>
    username: string
    name: string
  }): Promise<boolean> {
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

    await inboxService.disconnect({
      inboxId: integration.inboxId,
      ownerId: workspace.ownerId,
      workspaceId: props.workspaceId,
      reason: "manual",
      tx: client,
    })
  }
}

export const integrationThreadsService = new IntegrationThreadsService()
