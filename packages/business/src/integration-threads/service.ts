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
import { connectChannelIntegration } from "../inbox/connect-channel"
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

  async connect(props: {
    workspaceId: string
    ownerId: string
    auth: Record<string, unknown>
    threadsUserId: string
    username: string
    name: string
    tx?: DatabaseClient
  }): Promise<IntegrationThreadsModel> {
    const { tx = db } = props

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

  async reconnect(props: {
    workspaceId: string
    id: string
    auth: Record<string, unknown>
    username: string
    name: string
  }): Promise<void> {
    await db
      .update(integrationThreadsModel)
      .set({
        auth: props.auth,
        username: props.username,
        name: props.name,
      })
      .where(
        and(
          eq(integrationThreadsModel.id, props.id),
          eq(integrationThreadsModel.workspaceId, props.workspaceId),
        ),
      )
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

    const rows = (await db
      .select({
        id: integrationThreadsModel.id,
        workspaceId: integrationThreadsModel.workspaceId,
        auth: integrationThreadsModel.auth,
      })
      .from(integrationThreadsModel)
      .where(
        sql`${integrationThreadsModel.auth} -> 'tokens' ->> 'accessToken' IS NOT NULL`,
      )) as ThreadsRefreshRow[]

    return rows.flatMap((row) => {
      const parsedAuth = threadsRefreshAuthSchema.safeParse(row.auth)

      if (!parsedAuth.success) {
        return []
      }

      const { accessToken, expiresAt } = parsedAuth.data.tokens

      if (!expiresAt) {
        return includeMissingExpiresAt
          ? [
              {
                id: row.id,
                workspaceId: row.workspaceId,
                auth: row.auth,
                currentAccessToken: accessToken,
              },
            ]
          : []
      }

      const expiresAtDate = new Date(expiresAt)

      if (
        Number.isNaN(expiresAtDate.getTime()) ||
        expiresAtDate > refreshBefore
      ) {
        return []
      }

      return [
        {
          id: row.id,
          workspaceId: row.workspaceId,
          auth: row.auth,
          currentAccessToken: accessToken,
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
      tx: client,
    })
  }
}

export const integrationThreadsService = new IntegrationThreadsService()
