import {
  and,
  type DatabaseClient,
  db,
  eq,
  isNull,
  lte,
  or,
  sql,
} from "../../client"
import { inboxModel, integrationSmtpModel } from "../../schema"
import type { IntegrationSmtpModel } from "../../types"

export type DueImapInbox = {
  id: string
  workspaceId: string
  inboxId: string
}

export type ImapPollSuccess = {
  id: string
  uidValidity: number
  lastUid: number
  polledAt: Date
}

export type ImapPollFailure = {
  id: string
  error: string
  polledAt: Date
  nextPollAt: Date
}

export const integrationSmtpRepository = {
  /**
   * IMAP-enabled rows of a still-connected inbox whose back-off has elapsed.
   * Bounded by `limit`; the caller enqueues one poll job per row.
   */
  async listDueImapInboxes(
    props: { now: Date; limit: number },
    tx: DatabaseClient = db,
  ): Promise<DueImapInbox[]> {
    return await tx
      .select({
        id: integrationSmtpModel.id,
        workspaceId: integrationSmtpModel.workspaceId,
        inboxId: integrationSmtpModel.inboxId,
      })
      .from(integrationSmtpModel)
      .innerJoin(inboxModel, eq(inboxModel.id, integrationSmtpModel.inboxId))
      .where(
        and(
          eq(integrationSmtpModel.imapEnabled, true),
          eq(inboxModel.status, "connected"),
          or(
            isNull(integrationSmtpModel.imapNextPollAt),
            lte(integrationSmtpModel.imapNextPollAt, props.now),
          ),
        ),
      )
      // Least-recently-polled first so, above `limit` due inboxes, every inbox
      // gets a turn instead of the same rows winning each run.
      .orderBy(sql`${integrationSmtpModel.lastPolledAt} ASC NULLS FIRST`)
      .limit(props.limit)
  },

  async findById(
    id: string,
    tx: DatabaseClient = db,
  ): Promise<IntegrationSmtpModel | undefined> {
    return await tx.query.integrationSmtpModel.findFirst({ where: { id } })
  },

  async findByInboundToken(
    token: string,
    tx: DatabaseClient = db,
  ): Promise<IntegrationSmtpModel | undefined> {
    return await tx.query.integrationSmtpModel.findFirst({
      where: { inboundToken: token },
    })
  },

  /** Replaces the webhook token; the unique index rejects a collision. */
  async setInboundToken(
    props: { id: string; workspaceId: string; token: string },
    tx: DatabaseClient = db,
  ): Promise<IntegrationSmtpModel | undefined> {
    const [row] = await tx
      .update(integrationSmtpModel)
      .set({ inboundToken: props.token })
      .where(
        and(
          eq(integrationSmtpModel.id, props.id),
          eq(integrationSmtpModel.workspaceId, props.workspaceId),
        ),
      )
      .returning()
    return row
  },

  /** Sets the token only if none exists, so concurrent first calls agree on one. */
  async setInboundTokenIfUnset(
    props: { id: string; workspaceId: string; token: string },
    tx: DatabaseClient = db,
  ): Promise<IntegrationSmtpModel | undefined> {
    const [row] = await tx
      .update(integrationSmtpModel)
      .set({ inboundToken: props.token })
      .where(
        and(
          eq(integrationSmtpModel.id, props.id),
          eq(integrationSmtpModel.workspaceId, props.workspaceId),
          isNull(integrationSmtpModel.inboundToken),
        ),
      )
      .returning()
    return row
  },

  /** Stores the new cursor and clears any earlier poll error / back-off. */
  async recordPollSuccess(
    props: ImapPollSuccess,
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx
      .update(integrationSmtpModel)
      .set({
        imapUidValidity: props.uidValidity,
        imapLastUid: props.lastUid,
        lastPolledAt: props.polledAt,
        lastPollError: null,
        imapNextPollAt: null,
      })
      .where(eq(integrationSmtpModel.id, props.id))
  },

  async recordPollFailure(
    props: ImapPollFailure,
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx
      .update(integrationSmtpModel)
      .set({
        lastPolledAt: props.polledAt,
        lastPollError: props.error,
        imapNextPollAt: props.nextPollAt,
      })
      .where(eq(integrationSmtpModel.id, props.id))
  },
}
