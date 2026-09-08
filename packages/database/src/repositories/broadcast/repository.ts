import { type DatabaseClient, db, eq, relationsFilterToSQL } from "../../client"
import { broadcastModel, contactsOnBroadcastsModel } from "../../schema"
import {
  getPaginationWithDefaults,
  likeContains,
  parseOrderByAsObject,
} from "../../utils"

const NUMERIC_RE = /^\d+$/

export type BroadcastListInput = {
  workspaceId: string
  name?: string | null
  /** The builder narrows this to its own `BroadcastFilterStatus` union. */
  status?: string | null
  page?: number | null
  perPage?: number | null
  sort?: { id: string; desc: boolean }[] | null
}

const buildWhere = (input: BroadcastListInput) => ({
  workspaceId: input.workspaceId,
  name: input.name ? { ilike: likeContains(input.name) } : undefined,
  status: input.status ?? undefined,
  deletedAt: { isNull: true as const },
})

export const broadcastRepository = {
  /**
   * Paginated broadcast list with the 3 slim relations the list page shows.
   * The `with` literal stays inline for Drizzle's type inference to survive
   * into `BroadcastResourceWithRelations`.
   */
  async listWithRelations(input: BroadcastListInput, tx: DatabaseClient = db) {
    const where = buildWhere(input)
    const pagination = getPaginationWithDefaults(input)
    const orderBy = parseOrderByAsObject(broadcastModel, input)

    return await tx.query.broadcastModel.findMany({
      where,
      with: {
        flow: {
          columns: {
            id: true,
            name: true,
          },
        },
        integrationWhatsapp: {
          columns: {
            id: true,
            name: true,
          },
        },
        integrationMessenger: {
          columns: {
            id: true,
            name: true,
          },
        },
      },
      ...pagination,
      orderBy,
    })
  },

  async count(
    input: BroadcastListInput,
    tx: DatabaseClient = db,
  ): Promise<number> {
    const where = buildWhere(input)
    return await tx.$count(
      broadcastModel,
      relationsFilterToSQL(broadcastModel, where),
    )
  },

  /**
   * Ownership gate before listing a broadcast's audience — scoped to a
   * non-deleted broadcast owned by this workspace so a soft-deleted (or
   * foreign) broadcast never leaks its audience, even if a future caller
   * skips the `publicGetBroadcast` lookup the current API handler happens to
   * run first.
   */
  async findIdIfActive(
    input: { id: string; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<{ id: string } | undefined> {
    return await tx.query.broadcastModel.findFirst({
      where: {
        id: input.id,
        workspaceId: input.workspaceId,
        deletedAt: { isNull: true },
      },
      columns: { id: true },
    })
  },

  async listAudience(
    input: { broadcastId: string; limit: number; offset: number },
    tx: DatabaseClient = db,
  ) {
    return await tx.query.contactsOnBroadcastsModel.findMany({
      where: { broadcastId: input.broadcastId },
      with: { contact: true },
      limit: input.limit,
      offset: input.offset,
    })
  },

  async countAudience(
    broadcastId: string,
    tx: DatabaseClient = db,
  ): Promise<number> {
    return await tx.$count(
      contactsOnBroadcastsModel,
      eq(contactsOnBroadcastsModel.broadcastId, broadcastId),
    )
  },

  /** id-or-name lookup, scoped to a non-deleted broadcast in the workspace. */
  async findByIdOrName(
    input: { workspaceId: string; idOrName: string },
    tx: DatabaseClient = db,
  ) {
    const where = {
      ...(NUMERIC_RE.test(input.idOrName)
        ? { id: input.idOrName, workspaceId: input.workspaceId }
        : { name: input.idOrName, workspaceId: input.workspaceId }),
      deletedAt: { isNull: true as const },
    }

    return await tx.query.broadcastModel.findFirst({ where })
  },

  /**
   * Reads only the stored `contactFilter` of a broadcast — used by the
   * resend action to re-derive the pruned filter with the CURRENT caller's
   * email/phone visibility, rather than trusting whatever was pruned into
   * the original broadcast.
   */
  async findContactFilter(
    input: { id: string; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<{ contactFilter: unknown } | undefined> {
    return await tx.query.broadcastModel.findFirst({
      where: { id: input.id, workspaceId: input.workspaceId },
      columns: { contactFilter: true },
    })
  },
}
