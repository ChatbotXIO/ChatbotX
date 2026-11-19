import type { ChannelType } from "@chatbotx.io/utils/channel"
import {
  and,
  type DatabaseClient,
  db,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  relationsFilterToSQL,
  sql,
} from "../../client"
import {
  ACTIVE_CONNECTION_STATUSES,
  type ConnectionKind,
  type ConnectionStatus,
} from "../../partials/connection"
import type { IntegrationType } from "../../partials/integration"
import { connectionModel, workspaceModel } from "../../schema"
import type { ConnectionModel } from "../../types"
import { getPaginationWithDefaults } from "../../utils"

export type ConnectionListInput = {
  workspaceId: string
  kind?: ConnectionKind | null
  provider?: IntegrationType | null
  channel?: ChannelType | null
  status?: ConnectionStatus[] | null
  page?: number | null
  perPage?: number | null
}

const buildWhere = (input: ConnectionListInput) => ({
  workspaceId: input.workspaceId,
  kind: input.kind ?? undefined,
  provider: input.provider ?? undefined,
  channel: input.channel ?? undefined,
  status: input.status?.length ? { in: input.status } : undefined,
})

export const connectionRepository = {
  /** `ORDER BY kind, provider, displayName, id` per the public API contract. */
  async list(
    input: ConnectionListInput,
    tx: DatabaseClient = db,
  ): Promise<ConnectionModel[]> {
    const { limit, offset } = getPaginationWithDefaults(input)
    return await tx.query.connectionModel.findMany({
      where: buildWhere(input),
      orderBy: { kind: "asc", provider: "asc", displayName: "asc", id: "asc" },
      limit,
      offset,
    })
  },

  async count(
    input: ConnectionListInput,
    tx: DatabaseClient = db,
  ): Promise<number> {
    return await tx.$count(
      connectionModel,
      relationsFilterToSQL(connectionModel, buildWhere(input)),
    )
  },

  async findByIdForWorkspace(
    input: { id: string; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<ConnectionModel | undefined> {
    return await tx.query.connectionModel.findFirst({
      where: { id: input.id, workspaceId: input.workspaceId },
    })
  },

  /** Revive-or-insert lookup key — `(workspaceId, provider, sourceId)` is the table's unique constraint. */
  async findByProviderSourceId(
    input: { workspaceId: string; provider: IntegrationType; sourceId: string },
    tx: DatabaseClient = db,
  ): Promise<ConnectionModel | undefined> {
    return await tx.query.connectionModel.findFirst({
      where: {
        workspaceId: input.workspaceId,
        provider: input.provider,
        sourceId: input.sourceId,
      },
    })
  },

  /** Prefers an active matching connection, then the newest row. */
  async findByProviderAndSourceIdAnyWorkspace(
    input: { provider: IntegrationType; sourceId: string },
    tx: DatabaseClient = db,
  ): Promise<ConnectionModel | undefined> {
    const [row] = await tx
      .select()
      .from(connectionModel)
      .where(
        sql`${connectionModel.provider} = ${input.provider} AND ${connectionModel.sourceId} = ${input.sourceId}`,
      )
      .orderBy(
        sql`CASE WHEN ${inArray(connectionModel.status, ACTIVE_CONNECTION_STATUSES)} THEN 0 ELSE 1 END`,
        desc(connectionModel.id),
      )
      .limit(1)
    return row
  },

  /**
   * Returns every matching row grouped with active rows first per source id.
   * Callers select the first row for each source to preserve the singular
   * lookup's active-first semantics without issuing one query per candidate.
   */
  async findByProviderAndSourceIdsAnyWorkspace(
    input: { provider: IntegrationType; sourceIds: string[] },
    tx: DatabaseClient = db,
  ): Promise<ConnectionModel[]> {
    if (input.sourceIds.length === 0) {
      return []
    }
    return await tx
      .select()
      .from(connectionModel)
      .where(
        and(
          eq(connectionModel.provider, input.provider),
          inArray(connectionModel.sourceId, input.sourceIds),
        ),
      )
      .orderBy(
        connectionModel.sourceId,
        sql`CASE WHEN ${inArray(connectionModel.status, ACTIVE_CONNECTION_STATUSES)} THEN 0 ELSE 1 END`,
        desc(connectionModel.id),
      )
  },

  async findById(
    input: { id: string },
    tx: DatabaseClient = db,
  ): Promise<ConnectionModel | undefined> {
    return await tx.query.connectionModel.findFirst({
      where: { id: input.id },
    })
  },

  /** Locks one connection row by globally-unique id; callers must pass an open transaction. */
  async findByIdForUpdateById(
    input: { id: string },
    tx: DatabaseClient,
  ): Promise<ConnectionModel | undefined> {
    const [row] = await tx
      .select()
      .from(connectionModel)
      .where(eq(connectionModel.id, input.id))
      .for("update")
    return row
  },

  async findByInboxId(
    input: { inboxId: string },
    tx: DatabaseClient = db,
  ): Promise<ConnectionModel | undefined> {
    return await tx.query.connectionModel.findFirst({
      where: { inboxId: input.inboxId },
    })
  },

  async findByIntegrationId(
    input: { integrationId: string },
    tx: DatabaseClient = db,
  ): Promise<ConnectionModel | undefined> {
    return await tx.query.connectionModel.findFirst({
      where: { integrationId: input.integrationId },
    })
  },

  async insert(
    values: typeof connectionModel.$inferInsert,
    tx: DatabaseClient = db,
  ): Promise<ConnectionModel> {
    const [row] = await tx.insert(connectionModel).values(values).returning()
    return row
  },

  async update(
    input: {
      id: string
      workspaceId: string
      values: Partial<typeof connectionModel.$inferInsert>
    },
    tx: DatabaseClient = db,
  ): Promise<ConnectionModel | undefined> {
    const [row] = await tx
      .update(connectionModel)
      .set(input.values)
      .where(
        and(
          eq(connectionModel.id, input.id),
          eq(connectionModel.workspaceId, input.workspaceId),
        ),
      )
      .returning()
    return row
  },

  /**
   * Keyset page of one provider's connections that have no credential pin yet
   * (`id` ascending, after `afterId`). Backs the pin backfill script.
   */
  async listUnpinnedByProvider(
    input: {
      provider: IntegrationType
      afterId?: string | null
      workspaceId?: string | null
      limit: number
    },
    tx: DatabaseClient = db,
  ): Promise<ConnectionModel[]> {
    return await tx
      .select()
      .from(connectionModel)
      .where(
        and(
          eq(connectionModel.provider, input.provider),
          isNull(connectionModel.platformCredentialId),
          input.afterId ? gt(connectionModel.id, input.afterId) : undefined,
          input.workspaceId
            ? eq(connectionModel.workspaceId, input.workspaceId)
            : undefined,
        ),
      )
      .orderBy(connectionModel.id)
      .limit(input.limit)
  },

  /** Writes a pin only while the connection still has none, so a concurrent connect's pin is never overwritten. Returns whether a row was pinned. */
  async pinCredentialIfUnset(
    input: { id: string; workspaceId: string; platformCredentialId: string },
    tx: DatabaseClient = db,
  ): Promise<boolean> {
    const rows = await tx
      .update(connectionModel)
      .set({ platformCredentialId: input.platformCredentialId })
      .where(
        and(
          eq(connectionModel.id, input.id),
          eq(connectionModel.workspaceId, input.workspaceId),
          isNull(connectionModel.platformCredentialId),
        ),
      )
      .returning({ id: connectionModel.id })
    return rows.length > 0
  },

  /** `SELECT DISTINCT provider` for the given workspace+statuses — backs `listConnectionProviderResources`'s already-connected check without paging through every matching row. */
  async distinctProvidersByStatus(
    input: { workspaceId: string; statuses: ConnectionStatus[] },
    tx: DatabaseClient = db,
  ): Promise<IntegrationType[]> {
    const rows = await tx
      .selectDistinct({ provider: connectionModel.provider })
      .from(connectionModel)
      .where(
        and(
          eq(connectionModel.workspaceId, input.workspaceId),
          inArray(connectionModel.status, input.statuses),
        ),
      )
    return rows.map((row) => row.provider)
  },

  /**
   * Every `paused` Connection across the owner's workspaces — resolves
   * workspace ownership via a join since `Connection` only carries
   * `workspaceId`, not `ownerId`. Backs `tenantService.reactivate`'s
   * per-connection `teardown.resume` sweep.
   */
  async listPausedByOwner(
    input: { ownerId: string; tenantId?: string },
    tx: DatabaseClient = db,
  ): Promise<ConnectionModel[]> {
    const rows = await tx
      .select({ connection: connectionModel })
      .from(connectionModel)
      .innerJoin(
        workspaceModel,
        eq(connectionModel.workspaceId, workspaceModel.id),
      )
      .where(
        and(
          eq(workspaceModel.ownerId, input.ownerId),
          input.tenantId
            ? eq(workspaceModel.tenantId, input.tenantId)
            : undefined,
          eq(connectionModel.status, "paused"),
        ),
      )
    return rows.map((row) => row.connection)
  },
}
