import {
  and,
  asc,
  type DatabaseClient,
  db,
  eq,
  inArray,
  lte,
  ne,
  sql,
} from "../../client"
import { inboxStatuses } from "../../partials"
import {
  inboxModel,
  integrationInstagramModel,
  integrationMessengerModel,
} from "../../schema"

/** The most pages one fan-out query looks at; the caller chunks bigger lists. */
export const MAX_FAN_OUT_PAGES_PER_QUERY = 500

/** The integration tables a Facebook login reconnect can refresh. */
export type FanOutKind = "messenger" | "instagramFacebook"

/**
 * One inbox integration that the reconnecting person also authorized. `auth` is
 * the raw stored column (parse with the channel schema; never log it).
 */
export type FanOutCandidate = {
  auth: unknown
  id: string
  inboxId: string
  kind: FanOutKind
  name: string
  pageId: string
  /** When the row was last written; compared with the reconnect's `authorizedAt`. */
  updatedAt: Date
}

export type FanOutQuery = {
  /** The app the reconnect used: only rows stored with this client id match. */
  clientId: string
  /** The Facebook user id of the reconnecting person (the stored authorizer id). */
  facebookUserId: string
  pageIds: readonly string[]
  /** Rows already handled by the reconnect itself. */
  excludeIntegrationId?: string
  workspaceId: string
}

const authClientId = (auth: unknown) => sql`(${auth} ->> 'clientId')`

/**
 * Inbox integrations eligible for a fan-out, in one query per table: same
 * workspace, `pageId` among the pages the person manages, connected inbox, same
 * app client id, and a stored authorizer (`userInfo.userId`) equal to the
 * reconnecting Facebook user. A row with no stored authorizer never matches.
 * Reads only; never creates an inbox or an integration.
 */
export const publishFanOutRepository = {
  async findCandidates(
    input: FanOutQuery & { kinds: readonly FanOutKind[]; limit: number },
    tx: DatabaseClient = db,
  ): Promise<FanOutCandidate[]> {
    const pageIds = [...new Set(input.pageIds)].slice(
      0,
      MAX_FAN_OUT_PAGES_PER_QUERY,
    )
    if (pageIds.length === 0 || input.kinds.length === 0) {
      return []
    }
    const found: FanOutCandidate[] = []
    if (input.kinds.includes("messenger")) {
      const rows = await tx
        .select({
          auth: integrationMessengerModel.auth,
          id: integrationMessengerModel.id,
          inboxId: integrationMessengerModel.inboxId,
          name: integrationMessengerModel.name,
          pageId: integrationMessengerModel.pageId,
          updatedAt: integrationMessengerModel.updatedAt,
        })
        .from(integrationMessengerModel)
        .innerJoin(
          inboxModel,
          and(
            eq(inboxModel.id, integrationMessengerModel.inboxId),
            eq(inboxModel.workspaceId, integrationMessengerModel.workspaceId),
          ),
        )
        .where(
          and(
            eq(integrationMessengerModel.workspaceId, input.workspaceId),
            inArray(integrationMessengerModel.pageId, pageIds),
            input.excludeIntegrationId
              ? ne(integrationMessengerModel.id, input.excludeIntegrationId)
              : undefined,
            eq(inboxModel.status, inboxStatuses.enum.connected),
            sql`${authClientId(integrationMessengerModel.auth)} = ${input.clientId}`,
            sql`${integrationMessengerModel.userInfo} ->> 'userId' = ${input.facebookUserId}`,
          ),
        )
        .orderBy(asc(integrationMessengerModel.id))
        .limit(input.limit)
      found.push(...rows.map((row) => ({ ...row, kind: "messenger" as const })))
    }
    if (input.kinds.includes("instagramFacebook")) {
      const rows = await tx
        .select({
          auth: integrationInstagramModel.auth,
          id: integrationInstagramModel.id,
          inboxId: integrationInstagramModel.inboxId,
          name: integrationInstagramModel.name,
          pageId: integrationInstagramModel.pageId,
          updatedAt: integrationInstagramModel.updatedAt,
        })
        .from(integrationInstagramModel)
        .innerJoin(
          inboxModel,
          and(
            eq(inboxModel.id, integrationInstagramModel.inboxId),
            eq(inboxModel.workspaceId, integrationInstagramModel.workspaceId),
          ),
        )
        .where(
          and(
            eq(integrationInstagramModel.workspaceId, input.workspaceId),
            eq(integrationInstagramModel.type, "facebook"),
            inArray(integrationInstagramModel.pageId, pageIds),
            input.excludeIntegrationId
              ? ne(integrationInstagramModel.id, input.excludeIntegrationId)
              : undefined,
            eq(inboxModel.status, inboxStatuses.enum.connected),
            sql`${authClientId(integrationInstagramModel.auth)} = ${input.clientId}`,
            sql`${integrationInstagramModel.userInfo} ->> 'userId' = ${input.facebookUserId}`,
          ),
        )
        .orderBy(asc(integrationInstagramModel.id))
        .limit(input.limit)
      found.push(
        ...rows.map((row) => ({ ...row, kind: "instagramFacebook" as const })),
      )
    }
    return found
  },

  /**
   * Re-validates one candidate inside the transaction that is about to write
   * it, holding a row lock on the integration and its inbox until commit, so a
   * disconnect or a newer reconnect that raced the token exchange is seen (or
   * waits). True only while the inbox is still connected, the stored app and
   * authorizer are unchanged, and the row was not written after the reconnect
   * that started the fan-out (`authorizedAt`): a row written later holds a newer
   * authorization than the snapshot this fan-out carries, so it is never
   * overwritten with the older one. The stored token is deliberately not
   * compared: the generation decides, so a newer fan-out still replaces what an
   * older one wrote meanwhile (every other write stamps now, the fan-out stamps
   * its `authorizedAt`). False means skip the row.
   */
  async lockUnchangedCandidate(
    input: {
      /** When the reconnect that started the fan-out committed. */
      authorizedAt: Date
      candidate: Pick<FanOutCandidate, "id" | "inboxId" | "kind">
      clientId: string
      facebookUserId: string
      workspaceId: string
    },
    tx: DatabaseClient,
  ): Promise<boolean> {
    const { candidate } = input
    const model =
      candidate.kind === "messenger"
        ? integrationMessengerModel
        : integrationInstagramModel
    const rows = await tx
      .select({ id: model.id })
      .from(model)
      .innerJoin(
        inboxModel,
        and(
          eq(inboxModel.id, model.inboxId),
          eq(inboxModel.workspaceId, model.workspaceId),
        ),
      )
      .where(
        and(
          eq(model.id, candidate.id),
          eq(model.workspaceId, input.workspaceId),
          eq(model.inboxId, candidate.inboxId),
          lte(model.updatedAt, input.authorizedAt),
          eq(inboxModel.status, inboxStatuses.enum.connected),
          sql`${authClientId(model.auth)} = ${input.clientId}`,
          sql`${model.userInfo} ->> 'userId' = ${input.facebookUserId}`,
        ),
      )
      .limit(1)
      .for("update")
    return rows.length > 0
  },
}
