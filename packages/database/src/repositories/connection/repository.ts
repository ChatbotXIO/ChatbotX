import type { ChannelType } from "@chatbotx.io/utils/channel"
import { type DatabaseClient, db, eq, relationsFilterToSQL } from "../../client"
import type {
  ConnectionKind,
  ConnectionStatus,
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

  /**
   * Same identity key as `findByProviderSourceId`, without a known
   * workspace — used by webhook-triggered `markUnhealthyByIdentifier`
   * (a revoked-token webhook payload carries the provider's external id,
   * never the workspace).
   */
  async findByProviderAndSourceIdAnyWorkspace(
    input: { provider: IntegrationType; sourceId: string },
    tx: DatabaseClient = db,
  ): Promise<ConnectionModel | undefined> {
    return await tx.query.connectionModel.findFirst({
      where: { provider: input.provider, sourceId: input.sourceId },
    })
  },

  async findById(
    input: { id: string },
    tx: DatabaseClient = db,
  ): Promise<ConnectionModel | undefined> {
    return await tx.query.connectionModel.findFirst({
      where: { id: input.id },
    })
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

  async listDueForRefresh(
    input: { before: Date; statuses: ConnectionStatus[] },
    tx: DatabaseClient = db,
  ): Promise<ConnectionModel[]> {
    return await tx.query.connectionModel.findMany({
      where: {
        status: { in: input.statuses },
        authExpiresAt: { lte: input.before },
      },
      orderBy: { authExpiresAt: "asc" },
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
    input: { id: string; values: Partial<typeof connectionModel.$inferInsert> },
    tx: DatabaseClient = db,
  ): Promise<ConnectionModel | undefined> {
    const [row] = await tx
      .update(connectionModel)
      .set(input.values)
      .where(eq(connectionModel.id, input.id))
      .returning()
    return row
  },
}
