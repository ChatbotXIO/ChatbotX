import type { ChannelType } from "@chatbotx.io/utils/channel"
import {
  and,
  type DatabaseClient,
  db,
  desc,
  eq,
  inArray,
  relationsFilterToSQL,
  sql,
} from "../../client"
import {
  ACTIVE_CONNECTION_STATUSES,
  type ConnectionKind,
  type ConnectionStatus,
} from "../../partials/connection"
import type { IntegrationType } from "../../partials/integration"
import { connectionModel } from "../../schema"
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

  /** Locks one connection row; callers must pass an open transaction. */
  async findByIdForUpdate(
    input: { id: string; workspaceId: string },
    tx: DatabaseClient,
  ): Promise<ConnectionModel | undefined> {
    const [row] = await tx
      .select()
      .from(connectionModel)
      .where(
        and(
          eq(connectionModel.id, input.id),
          eq(connectionModel.workspaceId, input.workspaceId),
        ),
      )
      .for("update")
    return row
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
}
