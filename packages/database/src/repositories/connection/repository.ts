import type { ChannelType } from "@chatbotx.io/utils/channel"
import { type DatabaseClient, db, eq, relationsFilterToSQL } from "../../client"
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

  /**
   * Same identity key as `findByProviderSourceId`, without a known
   * workspace — used by webhook-triggered `markUnhealthyByIdentifier` (a
   * revoked-token webhook payload carries the provider's external id,
   * never the workspace) and by `listAndAttachCandidates`'s
   * already-connected check.
   *
   * `(provider, sourceId)` is NOT unique across workspaces (e.g. the same
   * TikTok account disconnected in one workspace and reconnected in
   * another leaves a stale `disconnected` row behind), so an unordered
   * `findFirst` could previously return an arbitrary — possibly stale,
   * possibly another workspace's — row (regression I8). This now prefers
   * a row whose status is currently ACTIVE (`ACTIVE_CONNECTION_STATUSES`)
   * over a disconnected/needs_reauth/paused one, and both branches order by
   * `id DESC` (most recently created) as a deterministic tiebreaker when
   * more than one row still matches.
   */
  async findByProviderAndSourceIdAnyWorkspace(
    input: { provider: IntegrationType; sourceId: string },
    tx: DatabaseClient = db,
  ): Promise<ConnectionModel | undefined> {
    const active = await tx.query.connectionModel.findFirst({
      where: {
        provider: input.provider,
        sourceId: input.sourceId,
        status: { in: [...ACTIVE_CONNECTION_STATUSES] },
      },
      orderBy: { id: "desc" },
    })
    if (active) {
      return active
    }
    return await tx.query.connectionModel.findFirst({
      where: { provider: input.provider, sourceId: input.sourceId },
      orderBy: { id: "desc" },
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

  /**
   * Same as `findById`, but takes a `SELECT ... FOR UPDATE` row lock —
   * MUST be called from inside an open transaction (`tx` has no default,
   * unlike every other method here, so a caller that forgets to pass one
   * is a type error, not a silent no-lock read). `ConnectionStateService
   * .transition` uses this (never the relational-query `findById`) so two
   * concurrent transitions on the SAME connection serialize on this row
   * instead of both reading the same pre-transition `status` and each
   * independently deciding to consume/release quota — the race that
   * double-consumed (or double-released) one `channels` quota unit for
   * what should have been a single state change.
   */
  async findByIdForUpdate(
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
