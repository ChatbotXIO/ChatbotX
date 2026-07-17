import {
  and,
  type DatabaseClient,
  db,
  eq,
  gt,
  sql,
} from "@chatbotx.io/database/client"
import type { ContactInboxReferral } from "@chatbotx.io/database/schema"
import { contactInboxModel, contactModel } from "@chatbotx.io/database/schema"
import type {
  ContactInboxModel,
  ContactModel,
  ConversationModel,
} from "@chatbotx.io/database/types"
import { withCache } from "@chatbotx.io/redis"
import { BaseService } from "../base.service"
import { logger } from "../logger"

// Lower bound for message lookups/deletions scoped to a contact-inbox: the
// first moment the inbox could have received a message.
export const getContactInboxSinceTime = (
  contactInbox: Pick<ContactInboxModel, "firstInteractionAt" | "createdAt">,
): Date => contactInbox.firstInteractionAt ?? contactInbox.createdAt

export type ContactInboxWithAnalytics = Pick<
  ContactInboxModel,
  "id" | "contactId" | "sourceId" | "channel"
> & {
  contact: Pick<
    ContactModel,
    "id" | "firstName" | "lastName" | "fullName" | "avatar"
  >
  conversation: Pick<ConversationModel, "id"> | null
}

export type ContactInboxTrackingData = Partial<
  Pick<
    ContactInboxModel,
    | "firstInteractionAt"
    | "lastMessageAt"
    | "lastIncomingMessageAt"
    | "lastOutboundMessageAt"
    | "lastCommentMessageId"
    | "lastCommentMessageAt"
    | "contactLastReadAt"
    | "consecutiveFailedReply"
    | "lastInputFailure"
    | "lastErrorLog"
    | "lastBtnTitle"
    | "lastUserInput"
    | "lastUserInputType"
    | "webchatParentUrl"
  >
> & { referral?: ContactInboxReferral | null }

export type ContactInboxTrackingInvalidation = {
  cacheTags: string[]
}

export type ContactInboxBulkTrackingRow = {
  contactInboxId: string
  contactId: string
  workspaceId: string
  firstInteractionAt: Date
  lastMessageAt: Date
  lastIncomingMessageAt: Date | null
}

type FindByProps = {
  id: string
  contactId: string
  inboxId: string
  channel: string
  sourceId: string
}

const compactReferral = (
  referral: ContactInboxReferral,
): Partial<ContactInboxReferral> => {
  const nextReferral: Partial<ContactInboxReferral> = {}

  for (const [key, value] of Object.entries(referral)) {
    if (value == null) {
      continue
    }
    if (
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value).length === 0
    ) {
      continue
    }

    Object.assign(nextReferral, { [key]: value })
  }

  return nextReferral
}

class ContactInboxService extends BaseService {
  protected readonly cachePrefix: string = "contact-inboxes"

  async findByUncached(props: {
    tx?: DatabaseClient
    where: Partial<FindByProps>
  }): Promise<ContactInboxModel | undefined> {
    const { tx = db, where } = props

    return await tx.query.contactInboxModel.findFirst({
      where,
    })
  }

  /**
   * The most recently active contact inbox for an inbox + source (e.g. a
   * webchat guest). Ordered by `lastMessageAt` desc so that when a guest has
   * reconnected and produced duplicate rows for the same `sourceId`, the live
   * one wins. Uncached: callers (e.g. the webchat message action) gate
   * new-contact creation on this read and must not see a stale miss.
   *
   * `workspaceId` is optional for callers that have already independently
   * verified `inboxId` belongs to their workspace, but passing it applies the
   * same defense-in-depth `workspaceScope` check used by the tracking
   * mutations below — prefer always passing it when available.
   */
  async findLatestBySource(props: {
    tx?: DatabaseClient
    inboxId: string
    sourceId: string
    workspaceId?: string
  }): Promise<ContactInboxModel | undefined> {
    const { tx = db, inboxId, sourceId, workspaceId } = props
    if (workspaceId) {
      const rows = await tx
        .select()
        .from(contactInboxModel)
        .where(
          and(
            eq(contactInboxModel.inboxId, inboxId),
            eq(contactInboxModel.sourceId, sourceId),
            this.workspaceScope(workspaceId),
          ),
        )
        .orderBy(sql`${contactInboxModel.lastMessageAt} DESC NULLS LAST`)
        .limit(1)
      return rows[0]
    }

    return await tx.query.contactInboxModel.findFirst({
      where: { inboxId, sourceId },
      orderBy: { lastMessageAt: "desc" },
    })
  }

  async findBy(props: {
    tx?: DatabaseClient
    where: Partial<FindByProps>
    ttlInSeconds?: number
  }): Promise<ContactInboxModel | undefined> {
    const cacheKey = `${this.cachePrefix}:${JSON.stringify(props.where)}`

    return await withCache(
      cacheKey,
      async () => await this.findByUncached(props),
      {
        ttl: props.ttlInSeconds,
        dynamicTags: (result) =>
          result ? this.getTrackingCacheTags(result.contactId) : undefined,
      },
    )
  }

  async listByContactId(props: {
    tx?: DatabaseClient
    contactId: string
  }): Promise<ContactInboxModel[]> {
    const { tx = db, contactId } = props
    const cacheKey = `contacts:${contactId}:contact-inboxes`

    return await withCache(
      cacheKey,
      async () =>
        await tx.query.contactInboxModel.findMany({
          where: {
            contactId,
          },
          orderBy: {
            id: "asc",
          },
        }),
      {
        tags: [`contacts:${contactId}:contact-inboxes`],
      },
    )
  }

  /**
   * Of the given candidate source ids, the subset already linked to this inbox.
   * Used by the contact import to dedup rows that already exist. Uncached: the
   * import gates inserts on this and must not see a stale miss. Accepts a `tx`
   * so the locked re-check can read within the same connection if needed.
   */
  async findExistingSourceIds(props: {
    tx?: DatabaseClient
    inboxId: string
    sourceIds: string[]
  }): Promise<Set<string>> {
    const { tx = db, inboxId, sourceIds } = props
    if (sourceIds.length === 0) {
      return new Set()
    }
    const rows = await tx.query.contactInboxModel.findMany({
      where: { inboxId, sourceId: { in: sourceIds } },
      columns: { sourceId: true },
    })
    return new Set(rows.map((row) => row.sourceId))
  }

  async findManyByIds(ids: string[]): Promise<ContactInboxWithAnalytics[]> {
    return (await db.query.contactInboxModel.findMany({
      where: { id: { in: ids } },
      columns: { id: true, contactId: true, sourceId: true, channel: true },
      with: {
        contact: {
          columns: {
            id: true,
            firstName: true,
            lastName: true,
            fullName: true,
            avatar: true,
          },
        },
        conversation: { columns: { id: true } },
      },
    })) as ContactInboxWithAnalytics[]
  }

  async findRecentByContactId(props: {
    tx?: DatabaseClient
    contactId: string
  }): Promise<ContactInboxModel | undefined> {
    const allContactInboxes = await this.listByContactId(props)
    return [...allContactInboxes].sort(
      (a, b) =>
        new Date(b.lastMessageAt ?? 0).getTime() -
        new Date(a.lastMessageAt ?? 0).getTime(),
    )[0]
  }

  /**
   * Set (or clear) the channel persona for a contact-inbox connection. Used by
   * the "Set Persona" Messenger flow action; stores the local persona id (or
   * null to fall back to the page default). Invalidates the contact's
   * contact-inbox caches so the next send reads the new value.
   */
  async setPersona(props: {
    tx?: DatabaseClient
    contactInboxId: string
    contactId: string
    personaId: string | null
  }): Promise<void> {
    const { tx = db, contactInboxId, contactId, personaId } = props

    await tx
      .update(contactInboxModel)
      .set({ personaId })
      .where(eq(contactInboxModel.id, contactInboxId))

    await this.invalidateCacheTags([`contacts:${contactId}:contact-inboxes`])
  }

  async updateLanguage(props: {
    tx?: DatabaseClient
    workspaceId: string
    contactId: string
    contactInboxId: string
    language: string | null
  }): Promise<ContactInboxTrackingInvalidation | null> {
    const { tx = db, workspaceId, contactId, contactInboxId, language } = props

    const updatedRows = await tx
      .update(contactInboxModel)
      .set({ language })
      .where(
        and(
          eq(contactInboxModel.id, contactInboxId),
          eq(contactInboxModel.contactId, contactId),
          this.workspaceScope(workspaceId),
        ),
      )
      .returning({ id: contactInboxModel.id })

    if (updatedRows.length === 0) {
      this.logSkippedTrackingUpdate({
        contactInboxId,
        contactId,
        workspaceId,
        operation: "updateLanguage",
      })
      return null
    }

    const invalidation = this.createTrackingInvalidation(contactId)
    await this.invalidateTracking(invalidation)

    return invalidation
  }

  async updateTracking(props: {
    tx?: DatabaseClient
    contactInboxId: string
    contactId: string
    workspaceId: string
    data: ContactInboxTrackingData
  }): Promise<ContactInboxTrackingInvalidation | null> {
    const { tx = db, contactInboxId, contactId, data, workspaceId } = props
    const {
      firstInteractionAt: explicitFirstInteractionAt,
      lastIncomingMessageAt: explicitLastIncomingMessageAt,
      lastUserInput,
      lastUserInputType,
      referral,
      ...nextData
    } = data

    const updateData = { ...nextData }
    if (explicitFirstInteractionAt) {
      Object.assign(updateData, {
        firstInteractionAt: sql`CASE WHEN ${contactInboxModel.firstInteractionAt} IS NULL OR ${contactInboxModel.firstInteractionAt} > ${explicitFirstInteractionAt} THEN ${explicitFirstInteractionAt} ELSE ${contactInboxModel.firstInteractionAt} END`,
      })
    }
    if (explicitLastIncomingMessageAt) {
      const isLatestIncomingMessage = sql`${contactInboxModel.lastIncomingMessageAt} IS NULL OR ${explicitLastIncomingMessageAt} >= ${contactInboxModel.lastIncomingMessageAt}`
      Object.assign(updateData, {
        lastIncomingMessageAt: sql`GREATEST(${contactInboxModel.lastIncomingMessageAt}, ${explicitLastIncomingMessageAt})`,
      })
      if (Object.hasOwn(data, "lastUserInput")) {
        Object.assign(updateData, {
          lastUserInput: sql`CASE WHEN ${isLatestIncomingMessage} THEN ${lastUserInput} ELSE ${contactInboxModel.lastUserInput} END`,
        })
      }
      if (Object.hasOwn(data, "lastUserInputType")) {
        Object.assign(updateData, {
          lastUserInputType: sql`CASE WHEN ${isLatestIncomingMessage} THEN ${lastUserInputType} ELSE ${contactInboxModel.lastUserInputType} END`,
        })
      }
    }
    if (referral) {
      const nextReferral = compactReferral(referral)
      if (Object.keys(nextReferral).length > 0) {
        Object.assign(updateData, {
          referral: sql`COALESCE(${contactInboxModel.referral}, '{}'::jsonb) || ${JSON.stringify(nextReferral)}::jsonb`,
        })
      }
    }

    if (Object.keys(updateData).length === 0) {
      return null
    }

    const updatedRows = await tx
      .update(contactInboxModel)
      .set(updateData)
      .where(
        and(
          eq(contactInboxModel.id, contactInboxId),
          eq(contactInboxModel.contactId, contactId),
          this.workspaceScope(workspaceId),
        ),
      )
      .returning({ id: contactInboxModel.id })

    if (updatedRows.length === 0) {
      this.logSkippedTrackingUpdate({
        contactInboxId,
        contactId,
        workspaceId,
        operation: "updateTracking",
      })
      return null
    }

    const invalidation = this.createTrackingInvalidation(contactId)
    if (!props.tx) {
      await this.invalidateTracking(invalidation)
    }

    return invalidation
  }

  async bulkUpdateTracking(props: {
    tx?: DatabaseClient
    rows: ContactInboxBulkTrackingRow[]
  }): Promise<ContactInboxTrackingInvalidation | null> {
    const { tx = db, rows } = props
    if (rows.length === 0) {
      return null
    }

    const valueRows = rows.map(
      (row) => sql`(
        ${row.contactInboxId}::int8,
        ${row.contactId}::int8,
        ${row.workspaceId}::int8,
        ${row.lastMessageAt}::timestamptz,
        ${row.firstInteractionAt}::timestamptz,
        ${row.lastIncomingMessageAt}::timestamptz
      )`,
    )

    // Postgres GREATEST/LEAST ignore NULL operands, so each column keeps its
    // existing value when the incoming one is NULL and vice versa.
    await tx.execute(sql`
      UPDATE "ContactInbox" AS t
      SET
        "firstInteractionAt" = LEAST(t."firstInteractionAt", u.first_ts),
        "lastMessageAt" = GREATEST(t."lastMessageAt", u.message_ts),
        "lastIncomingMessageAt" = GREATEST(t."lastIncomingMessageAt", u.incoming_ts)
      FROM (VALUES ${sql.join(valueRows, sql`, `)})
        AS u(id, contact_id, workspace_id, message_ts, first_ts, incoming_ts)
      WHERE
        t."id" = u.id
        AND t."contactId" = u.contact_id
        AND ${this.bulkWorkspaceScope()}
    `)

    const invalidation = {
      cacheTags: [
        ...new Set(
          rows.flatMap((row) => this.getTrackingCacheTags(row.contactId)),
        ),
      ],
    }
    if (!props.tx) {
      await this.invalidateTracking(invalidation)
    }

    return invalidation
  }

  async recordOutboundMessageCreated(props: {
    tx?: DatabaseClient
    contactInboxId: string
    contactId: string
    workspaceId: string
    at: Date
  }): Promise<ContactInboxTrackingInvalidation | null> {
    return await this.updateTracking({
      tx: props.tx,
      contactInboxId: props.contactInboxId,
      contactId: props.contactId,
      workspaceId: props.workspaceId,
      data: {
        firstInteractionAt: props.at,
        lastMessageAt: props.at,
      },
    })
  }

  async recordOutboundMessageSent(props: {
    tx?: DatabaseClient
    contactInboxId: string
    contactId: string
    workspaceId: string
    at: Date
  }): Promise<ContactInboxTrackingInvalidation | null> {
    return await this.updateTracking({
      tx: props.tx,
      contactInboxId: props.contactInboxId,
      contactId: props.contactId,
      workspaceId: props.workspaceId,
      data: {
        firstInteractionAt: props.at,
        lastMessageAt: props.at,
        lastOutboundMessageAt: props.at,
        consecutiveFailedReply: 0,
        lastErrorLog: null,
      },
    })
  }

  async recordSendFailure(props: {
    tx?: DatabaseClient
    contactInboxId: string
    contactId: string
    workspaceId: string
    error: string
  }): Promise<ContactInboxTrackingInvalidation | null> {
    const { tx = db, contactInboxId, contactId, error, workspaceId } = props
    const updatedRows = await tx
      .update(contactInboxModel)
      .set({
        lastErrorLog: error,
        consecutiveFailedReply: sql`${contactInboxModel.consecutiveFailedReply} + 1`,
      })
      .where(
        and(
          eq(contactInboxModel.id, contactInboxId),
          eq(contactInboxModel.contactId, contactId),
          this.workspaceScope(workspaceId),
        ),
      )
      .returning({ id: contactInboxModel.id })

    if (updatedRows.length === 0) {
      this.logSkippedTrackingUpdate({
        contactInboxId,
        contactId,
        workspaceId,
        operation: "recordSendFailure",
      })
      return null
    }

    const invalidation = this.createTrackingInvalidation(contactId)
    if (!props.tx) {
      await this.invalidateTracking(invalidation)
    }

    return invalidation
  }

  async findLatestLastIncomingMessageAtByContactId(props: {
    tx?: DatabaseClient
    contactId: string
  }): Promise<Date | null> {
    const { tx = db, contactId } = props
    const contactInboxes = await tx.query.contactInboxModel.findMany({
      where: {
        contactId,
        lastIncomingMessageAt: { isNotNull: true as const },
      },
      columns: { lastIncomingMessageAt: true },
      orderBy: { lastIncomingMessageAt: "desc" },
      limit: 1,
    })

    return contactInboxes[0]?.lastIncomingMessageAt ?? null
  }

  async hasIncomingMessageSince(props: {
    tx?: DatabaseClient
    workspaceId: string
    contactInboxId: string
    since: Date
  }): Promise<boolean> {
    const { tx = db, workspaceId, contactInboxId, since } = props
    const rows = await tx
      .select({ id: contactInboxModel.id })
      .from(contactInboxModel)
      .innerJoin(contactModel, eq(contactModel.id, contactInboxModel.contactId))
      .where(
        and(
          eq(contactInboxModel.id, contactInboxId),
          eq(contactModel.workspaceId, workspaceId),
          gt(contactInboxModel.lastIncomingMessageAt, since),
        ),
      )
      .limit(1)
    const row = rows[0]
    return row !== undefined
  }

  async invalidateTracking(
    invalidation: ContactInboxTrackingInvalidation,
  ): Promise<void> {
    await this.invalidateCacheTags(invalidation.cacheTags)
  }

  private createTrackingInvalidation(
    contactId: string,
  ): ContactInboxTrackingInvalidation {
    return { cacheTags: this.getTrackingCacheTags(contactId) }
  }

  private getTrackingCacheTags(contactId: string): string[] {
    return [`contacts:${contactId}:contact-inboxes`]
  }

  private workspaceScope(workspaceId: string) {
    return sql`EXISTS (
      SELECT 1
      FROM ${contactModel}
      WHERE ${contactModel.id} = ${contactInboxModel.contactId}
        AND ${contactModel.workspaceId} = ${workspaceId}
    )`
  }

  private bulkWorkspaceScope() {
    return sql`EXISTS (
      SELECT 1
      FROM ${contactModel} AS c
      WHERE c."id" = t."contactId" AND c."workspaceId" = u.workspace_id
    )`
  }

  private logSkippedTrackingUpdate(props: {
    contactInboxId: string
    contactId: string
    workspaceId: string
    operation: string
  }): void {
    logger.warn(
      props,
      "ContactInbox tracking update skipped because workspace scope did not match",
    )
  }
}

export const contactInboxService = new ContactInboxService()
