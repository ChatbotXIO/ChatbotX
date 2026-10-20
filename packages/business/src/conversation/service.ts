import {
  and,
  type DatabaseClient,
  db,
  eq,
  exists,
  inArray,
  isNull,
  lt,
  or,
  type SQL,
  sql,
} from "@chatbotx.io/database/client"
import type {
  ConversationAttributes,
  ConversationQuickReplyChallenge,
} from "@chatbotx.io/database/partials"
import {
  assignTargetIfUnassigned,
  assignUserIfUnassigned,
  closeHumanReplyWindow,
  contactInboxOperationalColumns,
  contactInboxRepository,
  createMessageRepository,
  getSafeSinceTime,
} from "@chatbotx.io/database/repositories"
import { conversationModel, inboxModel } from "@chatbotx.io/database/schema"
import type {
  AttachmentModel,
  ContactCustomFieldModel,
  ContactInboxModel,
  ContactModel,
  ContactNoteModel,
  ContactsOnSequenceModel,
  ConversationModel,
  InboxModel,
  InboxTeamModel,
  MessageModel,
  SequenceModel,
  TagModel,
  UserModel,
} from "@chatbotx.io/database/types"
import { emit } from "@chatbotx.io/event-bus"
import {
  emitConversationArchived,
  emitConversationAssigned,
  emitConversationFollowUp,
  emitConversationTransferredToBot,
  emitConversationTransferredToHuman,
  emitConversationUnassigned,
} from "@chatbotx.io/events"
import {
  RealtimeEventType,
  routeForAssignment,
  routeForConversation,
} from "@chatbotx.io/realtime-protocol"
import { withCache } from "@chatbotx.io/redis"
import { createId } from "@chatbotx.io/utils"
import {
  NotificationJobAction,
  notificationQueue,
} from "@chatbotx.io/worker-config"
import type { PgUpdateSetSource } from "drizzle-orm/pg-core"
import { BaseService } from "../base.service"
import { contactService } from "../contact"
import type {
  ContactInboxTrackingData,
  ContactInboxTrackingInvalidation,
} from "../contact-inbox/service"
import { contactInboxService } from "../contact-inbox/service"
import { inboxTeamService } from "../enterprise/inbox-team/service"
import { ChatbotXException, notFoundException } from "../errors"
import { logger } from "../logger"
import { queueWorkspaceRealtimeEvent } from "../platform/realtime-broadcast"
import { responseSlaService } from "../response-sla/service"
import { smartDelayService } from "../smart-delay/service"
import { threadControlService } from "../thread-control/service"
import { isUserOnShift } from "../working-hours/on-shift"
import { workspaceMemberService } from "../workspace-member/service"
import {
  type HumanReplyWindowTransition,
  humanReplyWindowSet,
  reopenIfUnansweredSince,
} from "./human-reply-window"

// Contact-authored message opens the DM waiting window; a native-app outgoing
// echo (a human replied outside the product) closes it; anything else leaves it.
const resolveInboundWindow = (props: {
  at: Date
  contactRepliedAt?: Date
  isExternalHumanEcho?: boolean
}): HumanReplyWindowTransition | undefined => {
  if (props.contactRepliedAt) {
    return { open: props.contactRepliedAt }
  }
  if (props.isExternalHumanEcho) {
    return { close: props.at, actor: "externalHuman" }
  }
  return
}

export const BOT_DISABLE_DURATION_MS = 24 * 60 * 60 * 1000

export type TriggerContext = {
  triggerSource: string
  triggerHandler: string
  triggerType: string
}

// ─── Relation type system ──────────────────────────────────────────────────────

type ContactWithFullRelations = ContactModel & {
  contactsOnSequences: (ContactsOnSequenceModel & { sequence: SequenceModel })[]
  contactNotes: ContactNoteModel[]
  contactCustomFields: ContactCustomFieldModel[]
  tags: TagModel[]
}

type ConversationRelationMap = {
  contact: ContactModel | null
  contactInboxes: (ContactInboxModel & { inbox: InboxModel })[]
  assignedUser: UserModel | null
  assignedInboxTeam: InboxTeamModel | null
  messages: MessageModel[]
  attachments: AttachmentModel[]
}

type ConversationWithConfig = Partial<
  Record<keyof ConversationRelationMap, true | object>
>

type ConversationWithRelations<W extends ConversationWithConfig> =
  ConversationModel & {
    [K in Extract<
      keyof W,
      keyof ConversationRelationMap
    >]: ConversationRelationMap[K]
  }

export type ConversationWithFullRelations = ConversationModel & {
  contact: ContactWithFullRelations | null
  contactInboxes: (ContactInboxModel & { inbox: InboxModel })[]
  messages: MessageModel[]
  assignedUser: UserModel | null
  assignedInboxTeam: InboxTeamModel | null
}

// ─── Service ───────────────────────────────────────────────────────────────────

type FindByProps = {
  id: string
  contactId: string
  workspaceId: string
}

export type ConversationWithContactInboxes = ConversationModel & {
  contactInboxes: ContactInboxModel[]
}

const quickReplyChallengeJson = () =>
  sql`${conversationModel.additionalAttributes}->'challenge'`

const isQuickReplyChallenge = () =>
  sql`${quickReplyChallengeJson()}->>'type' = 'quickReply'`

/**
 * SET fragment that drops a quick-reply challenge and leaves every other
 * challenge (e.g. Get User Data `type: "step"`) untouched. Reused by the
 * handoff executor.
 */
const dropChallenge = () =>
  sql`${conversationModel.additionalAttributes} - 'challenge'`

const setChallenge = (
  challenge: NonNullable<ConversationAttributes["challenge"]>,
) =>
  sql`jsonb_set(COALESCE(${conversationModel.additionalAttributes}, '{}'::jsonb), '{challenge}', ${JSON.stringify(challenge)}::jsonb, true)`

export const sqlDropQuickReplyChallenge = () =>
  sql`CASE WHEN ${isQuickReplyChallenge()} THEN ${dropChallenge()} ELSE ${conversationModel.additionalAttributes} END`

type ReopenWindowOption = {
  /**
   * Reopen the DM waiting window at the contact's unanswered last message.
   * Opt-in: only a pause that runs as an immediate reaction to that message
   * passes true. A bot close leaves no marker, so a later manual pause must
   * not resurrect a window the bot already answered.
   */
  reopenUnansweredHumanReplyWindow?: boolean
}

type BotPauseOptions = ReopenWindowOption & {
  /** `undefined` pauses for the default duration; `null` pauses indefinitely. */
  botResumeAt?: Date | null
}

/** The one SET clause every bot pause writes (identical for all pause paths). */
const botPauseSet = (options: BotPauseOptions) => ({
  botEnabled: false,
  botResumeAt:
    options.botResumeAt === undefined
      ? new Date(Date.now() + BOT_DISABLE_DURATION_MS)
      : options.botResumeAt,
  additionalAttributes: sqlDropQuickReplyChallenge(),
  ...(options.reopenUnansweredHumanReplyWindow
    ? { awaitingHumanReplySince: reopenIfUnansweredSince() }
    : {}),
})

class ConversationService extends BaseService {
  /**
   * Records a human reply and closes the DM waiting window in one serialized
   * claim (see `closeHumanReplyWindow`). `isFirstResponse` is true when the
   * conversation had never been answered by a human/API before this reply.
   * Returns `null` when the conversation is not in the workspace.
   */
  async markAgentReplied(input: {
    id: string
    workspaceId: string
    at: Date
  }): Promise<{
    closedAwaitingSince: Date | null
    isFirstResponse: boolean
    assignedUserId: string | null
    assignedUserAt: Date | null
    /** SLA snapshot of the window this reply closed; `null` when no SLA applied. */
    slaDueAt: Date | null
    slaTargetSeconds: number | null
  } | null> {
    const claim = await closeHumanReplyWindow({
      workspaceId: input.workspaceId,
      conversationId: input.id,
      repliedAt: input.at,
    })
    await this.invalidate({ workspaceId: input.workspaceId, ids: [input.id] })
    if (!claim) {
      return null
    }
    return {
      closedAwaitingSince: claim.closedAwaitingSince,
      isFirstResponse: claim.previousAdminRepliedAt === null,
      assignedUserId: claim.assignedUserId,
      assignedUserAt: claim.assignedUserAt,
      slaDueAt: claim.closedResponseDueAt,
      slaTargetSeconds: claim.closedResponseSlaTargetSeconds,
    }
  }
  protected readonly cachePrefix: string = "conversations"

  // ─── Reads (cached) ──────────────────────────────────────────────────────

  async findByUncached(props: {
    tx?: DatabaseClient
    where: Partial<FindByProps>
  }): Promise<ConversationModel | undefined> {
    const { tx = db, where } = props
    return await tx.query.conversationModel.findFirst({
      where,
    })
  }

  async findDMByContact(props: {
    workspaceId: string
    contactId: string
    tx?: DatabaseClient
  }): Promise<ConversationModel | undefined> {
    const { tx = db, workspaceId, contactId } = props
    // The DM conversation is `sourceId IS NULL` on every channel; a non-null
    // sourceId is a comment thread, keyed by the post id.
    return await tx.query.conversationModel.findFirst({
      where: {
        workspaceId,
        contactId,
        sourceId: { isNull: true },
      },
    })
  }

  async findDMByContactIds(props: {
    workspaceId: string
    contactIds: string[]
    tx?: DatabaseClient
  }): Promise<ConversationModel[]> {
    const { tx = db, workspaceId, contactIds } = props
    const uniqueContactIds = Array.from(new Set(contactIds))
    if (uniqueContactIds.length === 0) {
      return []
    }

    // The DM conversation is `sourceId IS NULL` on every channel; a non-null
    // sourceId is a comment thread, keyed by the post id. At most one row per
    // contact, via the Conversation_contactId_dm_key unique index.
    return await tx.query.conversationModel.findMany({
      where: {
        workspaceId,
        contactId: { in: uniqueContactIds },
        sourceId: { isNull: true },
      },
    })
  }

  /**
   * Resolves the conversation for a specific ContactInbox by looking up its
   * channel and delegating to `findDMByContact` — use when the caller already
   * knows which ContactInbox a contact used, instead of guessing the channel.
   */
  async findDMByContactInbox(props: {
    workspaceId: string
    contactId: string
    contactInboxId: string
    tx?: DatabaseClient
  }): Promise<ConversationModel | undefined> {
    const { tx = db, workspaceId, contactId, contactInboxId } = props
    const contactInbox = await contactInboxService.findBy({
      where: { id: contactInboxId },
      tx,
    })
    if (!contactInbox) {
      return
    }

    return await this.findDMByContact({ workspaceId, contactId, tx })
  }

  async updateChallenge(props: {
    workspaceId: string
    conversationId: string
    challenge: ConversationAttributes["challenge"] | undefined
  }): Promise<void> {
    const additionalAttributes =
      props.challenge === undefined
        ? dropChallenge()
        : setChallenge(props.challenge)

    const [row] = await db
      .update(conversationModel)
      .set({
        additionalAttributes,
      })
      .where(
        and(
          eq(conversationModel.id, props.conversationId),
          eq(conversationModel.workspaceId, props.workspaceId),
        ),
      )
      .returning({ id: conversationModel.id })
    if (!row) {
      throw notFoundException("Conversation not found")
    }
  }

  /**
   * Atomic compare-and-clear claim on the conversation's `challenge` jsonb
   * attribute. Used by webview-submission handlers (e.g. getUserData's
   * date/datetime picker) to guard against double-submit / stale-token
   * replay: two concurrent submissions racing to clear the same challenge
   * must not both "win" — only the row matching the current stepId AND
   * challengeId is cleared, and only one caller can ever observe a returned
   * row for a given challengeId. See `.agents/skills/reliability-concurrency`.
   */
  async consumeChallenge(props: {
    workspaceId: string
    conversationId: string
    stepId: string
    challengeId: string
  }): Promise<boolean> {
    const { workspaceId, conversationId, stepId, challengeId } = props
    const rows = await db
      .update(conversationModel)
      .set({
        additionalAttributes: dropChallenge(),
      })
      .where(
        and(
          eq(conversationModel.id, conversationId),
          eq(conversationModel.workspaceId, workspaceId),
          sql`${conversationModel.additionalAttributes}->'challenge'->'data'->>'stepId' = ${stepId}`,
          sql`${conversationModel.additionalAttributes}->'challenge'->'data'->>'challengeId' = ${challengeId}`,
        ),
      )
      .returning({ id: conversationModel.id })

    return rows.length > 0
  }

  /**
   * Compensating write for a failed post-claim side effect: puts a consumed
   * challenge back so the contact can retry, but ONLY while no challenge
   * exists on the conversation. Unconditional restore could overwrite a
   * newer challenge started between the claim and the restore, silently
   * invalidating that newer cycle's token. Returns false when a challenge
   * already exists (restore skipped).
   */
  async restoreChallengeIfAbsent(props: {
    workspaceId: string
    conversationId: string
    challenge: NonNullable<ConversationAttributes["challenge"]>
  }): Promise<boolean> {
    const rows = await db
      .update(conversationModel)
      .set({
        additionalAttributes: setChallenge(props.challenge),
      })
      .where(
        and(
          eq(conversationModel.id, props.conversationId),
          eq(conversationModel.workspaceId, props.workspaceId),
          sql`(${conversationModel.additionalAttributes} IS NULL OR NOT jsonb_exists(${conversationModel.additionalAttributes}, 'challenge'))`,
        ),
      )
      .returning({ id: conversationModel.id })

    return rows.length > 0
  }

  /**
   * Clears a pending quick-reply retry. Never touches a Get User Data
   * (`type: "step"`) challenge. Returns whether a row changed, so concurrent
   * callers can tell who won. `attempts` makes it a compare-and-set on the
   * current attempt count (mirrors `setQuickReplyChallengeAttempts`), so a
   * stale caller cannot clear a freshly re-armed challenge.
   */
  async clearQuickReplyChallenge(props: {
    tx?: DatabaseClient
    workspaceId: string
    conversationId: string
    nodeId?: string
    exceptFlowId?: string
    attempts?: number
  }): Promise<boolean> {
    const { tx = db } = props
    const challenge = quickReplyChallengeJson()
    const rows = await tx
      .update(conversationModel)
      .set({ additionalAttributes: dropChallenge() })
      .where(
        and(
          eq(conversationModel.workspaceId, props.workspaceId),
          eq(conversationModel.id, props.conversationId),
          isQuickReplyChallenge(),
          props.nodeId
            ? sql`${challenge}->'data'->>'nodeId' = ${props.nodeId}`
            : undefined,
          props.exceptFlowId
            ? sql`${challenge}->'data'->>'flowId' <> ${props.exceptFlowId}`
            : undefined,
          props.attempts === undefined
            ? undefined
            : sql`(${challenge}->'data'->>'attempts')::int = ${props.attempts}`,
        ),
      )
      .returning({ id: conversationModel.id })

    return rows.length > 0
  }

  /**
   * Writes a quick-reply retry challenge only while the bot is enabled, so a
   * pause landing between the caller's `ensureActive` read and this write
   * cannot leave a challenge on a handed-off conversation. Returns whether it
   * was written.
   */
  async armQuickReplyChallenge(props: {
    workspaceId: string
    conversationId: string
    challenge: ConversationQuickReplyChallenge
  }): Promise<boolean> {
    const rows = await db
      .update(conversationModel)
      .set({
        additionalAttributes: setChallenge(props.challenge),
      })
      .where(
        and(
          eq(conversationModel.workspaceId, props.workspaceId),
          eq(conversationModel.id, props.conversationId),
          eq(conversationModel.botEnabled, true),
        ),
      )
      .returning({ id: conversationModel.id })

    return rows.length > 0
  }

  /** Compare-and-set on `attempts`: only one concurrent retry wins. */
  async setQuickReplyChallengeAttempts(props: {
    tx?: DatabaseClient
    workspaceId: string
    conversationId: string
    nodeId: string
    fromAttempts: number
    toAttempts: number
  }): Promise<boolean> {
    const { tx = db } = props
    const challenge = quickReplyChallengeJson()
    const rows = await tx
      .update(conversationModel)
      .set({
        additionalAttributes: sql`jsonb_set(${conversationModel.additionalAttributes}, '{challenge,data,attempts}', to_jsonb(${props.toAttempts}::int), false)`,
      })
      .where(
        and(
          eq(conversationModel.workspaceId, props.workspaceId),
          eq(conversationModel.id, props.conversationId),
          isQuickReplyChallenge(),
          sql`${challenge}->'data'->>'nodeId' = ${props.nodeId}`,
          sql`(${challenge}->'data'->>'attempts')::int = ${props.fromAttempts}`,
        ),
      )
      .returning({ id: conversationModel.id })

    return rows.length > 0
  }

  async clearQuickReplyChallengesForStaleVersion(props: {
    tx?: DatabaseClient
    workspaceId: string
    flowId: string
    currentFlowVersionId: string
  }): Promise<number> {
    const { tx = db } = props
    const challenge = quickReplyChallengeJson()
    const rows = await tx
      .update(conversationModel)
      .set({ additionalAttributes: dropChallenge() })
      .where(
        and(
          eq(conversationModel.workspaceId, props.workspaceId),
          isQuickReplyChallenge(),
          sql`${challenge}->'data'->>'flowId' = ${props.flowId}`,
          sql`${challenge}->'data'->>'flowVersionId' IS NOT NULL`,
          sql`${challenge}->'data'->>'flowVersionId' <> ${props.currentFlowVersionId}`,
        ),
      )
      .returning({ id: conversationModel.id })

    return rows.length
  }

  /**
   * A contact can hold a DM conversation and one comment thread per post, so
   * "the contact's conversation" is a choice, not a lookup. The one query
   * evaluates that choice in a single snapshot: a concurrently created DM
   * cannot appear between a DM probe and the comment-thread fallback.
   *
   * The DM thread always wins. Every caller is a
   * `/v1/contacts/{identifier}/messages` handler — send, list and get — and a
   * direct message is what all three are about. A contact who has only ever
   * commented has no DM row to prefer and resolves to their newest comment
   * thread instead. Equal activity timestamps fall back to `id` so the result
   * stays deterministic.
   */
  async findByContactWithInboxes(props: {
    contactId: string
    workspaceId: string
    tx?: DatabaseClient
  }): Promise<ConversationWithContactInboxes | undefined> {
    const { tx = db, contactId, workspaceId } = props

    return (await tx.query.conversationModel.findFirst({
      where: { contactId, workspaceId },
      // `sourceId IS NOT NULL` sorts false (DM) before true (comment thread).
      // `lastActivityAt` is nullable with no default, so `NULLS LAST` is
      // explicit, then id is the stable tie-breaker.
      orderBy: (table) => [
        sql`${table.sourceId} IS NOT NULL`,
        sql`${table.lastActivityAt} DESC NULLS LAST`,
        sql`${table.id} DESC`,
      ],
      with: { contactInboxes: true },
    })) as ConversationWithContactInboxes | undefined
  }

  /**
   * Shared by the public `/v1/contacts/{identifier}/messages|auto-replies|flows`
   * handlers: resolve the contact's conversation and the specific
   * `ContactInbox` to send through, throwing the same 404 either way instead of
   * repeating both lookups + both `notFoundException` calls at every call site.
   *
   * Both halves used to be picked arbitrarily, and a send that resolved wrong
   * failed asynchronously — the handler had already answered 204.
   *
   * - The conversation comes from `findByContactWithInboxes`, which settles the
   *   DM-vs-comment-thread choice for the read paths too.
   * - The `ContactInbox` now comes from `findRecentByContactId`. The relation
   *   on the conversation row is keyed by `contactId`, so it carries every
   *   inbox the contact has across every channel — taking `[0]` of an unordered
   *   list could address the wrong page entirely. An explicit `inboxId` still
   *   wins and is still matched against that relation.
   *
   * The channel is therefore decided by the `ContactInbox` alone — a
   * `Conversation` carries no inbox or channel column, and the single DM row a
   * contact owns is shared across all of their channels. So for a contact
   * connected on more than one channel, omitting `inboxId` makes the channel a
   * best guess ("most recently active"). Pass `inboxId` when it must be exact.
   */
  async resolveContactInboxForSend(props: {
    contactId: string
    workspaceId: string
    inboxId?: string
  }): Promise<{
    conversation: ConversationWithContactInboxes
    contactInbox: ContactInboxModel
  }> {
    const { contactId, workspaceId, inboxId } = props
    const conversation = await this.findByContactWithInboxes({
      contactId,
      workspaceId,
    })
    if (!conversation) {
      throw notFoundException("Conversation not found")
    }

    const contactInbox = inboxId
      ? conversation.contactInboxes.find((ci) => ci.inboxId === inboxId)
      : await contactInboxService.findRecentByContactId({
          workspaceId,
          contactId,
        })
    if (!contactInbox) {
      throw notFoundException("Conversation not found")
    }

    return { conversation, contactInbox }
  }

  /**
   * Shared by the authenticated `POST .../messages` handler and
   * `createMessageAction`: resolve the `ContactInbox` to send an outgoing
   * message through, scoped to an already-identified `conversationId` rather
   * than `contactId` (see `resolveContactInboxForSend` for the public-API
   * variant, which starts from `contactId` and resolves the conversation too).
   * Both settle on the same `ContactInbox` for a given contact.
   */
  async resolveContactInboxForConversation(props: {
    conversation: Pick<ConversationModel, "contactId">
    workspaceId: string
    inboxId?: string
  }): Promise<ContactInboxModel> {
    const { conversation, workspaceId, inboxId } = props
    const contactInbox = inboxId
      ? await contactInboxService.findBy({
          where: { contactId: conversation.contactId, inboxId },
        })
      : await contactInboxService.findRecentByContactId({
          workspaceId,
          contactId: conversation.contactId,
        })
    if (!contactInbox) {
      throw notFoundException("Inbox not found")
    }
    return contactInbox
  }

  async findLatestByContact(props: {
    contactId: string
    tx?: DatabaseClient
  }): Promise<ConversationModel | undefined> {
    const { tx = db, contactId } = props
    // A contact can have multiple conversations (DM + comment threads), all
    // sharing the same ContactInbox — order by activity so callers get the
    // conversation the contact is actually active in, not an arbitrary one.
    // NULLS LAST keeps never-active conversations last; id resolves equal
    // activity timestamps deterministically.
    return await tx.query.conversationModel.findFirst({
      where: { contactId },
      orderBy: (table) =>
        sql`${table.lastActivityAt} DESC NULLS LAST, ${table.id} DESC`,
    })
  }

  async findBy(props: {
    tx?: DatabaseClient
    where: Partial<FindByProps>
  }): Promise<ConversationModel | undefined> {
    const cacheKey = `${this.cachePrefix}:${JSON.stringify(props.where)}`

    return await withCache(
      cacheKey,
      async () => await this.findByUncached(props),
      {
        dynamicTags: (result) => {
          if (result) {
            return [`${this.cachePrefix}:${result.id}`]
          }
        },
      },
    )
  }

  async findByOrFail(props: {
    tx?: DatabaseClient
    where: Partial<FindByProps>
  }): Promise<ConversationModel> {
    const conversation = await this.findBy(props)
    if (!conversation) {
      throw notFoundException("Conversation not found")
    }
    return conversation
  }

  // ─── Reads with dynamic relations ────────────────────────────────────────

  async findManyQuery<W extends ConversationWithConfig>(props: {
    where: Record<string, unknown>
    orderBy?: NonNullable<
      Parameters<typeof db.query.conversationModel.findMany>[0]
    >["orderBy"]
    limit?: number
    with?: W
    tx?: DatabaseClient
  }): Promise<ConversationWithRelations<W>[]> {
    const { where, orderBy, limit, tx = db } = props
    const result = await tx.query.conversationModel.findMany({
      where,
      ...(orderBy ? { orderBy } : {}),
      ...(limit === undefined ? {} : { limit }),
      ...(props.with ? { with: props.with } : {}),
    })
    return result as unknown as ConversationWithRelations<W>[]
  }

  async findFirstQuery<W extends ConversationWithConfig>(props: {
    where: Record<string, unknown>
    with?: W
    tx?: DatabaseClient
  }): Promise<ConversationWithRelations<W> | undefined> {
    const { where, tx = db } = props
    const result = await tx.query.conversationModel.findFirst({
      where,
      ...(props.with ? { with: props.with } : {}),
    })
    return result as unknown as ConversationWithRelations<W> | undefined
  }

  async findManyByIds<W extends ConversationWithConfig>(props: {
    workspaceId: string
    ids: string[]
    with?: W
    tx?: DatabaseClient
  }): Promise<ConversationWithRelations<W>[]> {
    const { workspaceId, ids, tx = db } = props
    if (ids.length === 0) {
      return []
    }
    const result = await tx.query.conversationModel.findMany({
      where: { workspaceId, id: { in: ids } },
      ...(props.with ? { with: props.with } : {}),
    })
    return result as unknown as ConversationWithRelations<W>[]
  }

  async findManyByContactIds<W extends ConversationWithConfig>(props: {
    workspaceId: string
    contactIds: string[]
    with?: W
    tx?: DatabaseClient
  }): Promise<ConversationWithRelations<W>[]> {
    const { workspaceId, contactIds, tx = db } = props
    if (contactIds.length === 0) {
      return []
    }
    const result = await tx.query.conversationModel.findMany({
      where: { workspaceId, contactId: { in: contactIds } },
      ...(props.with ? { with: props.with } : {}),
    })
    return result as unknown as ConversationWithRelations<W>[]
  }

  async findWithFullRelations(props: {
    where: Record<string, unknown>
    tx?: DatabaseClient
  }): Promise<ConversationWithFullRelations | undefined> {
    const { where, tx = db } = props
    const result = await tx.query.conversationModel.findFirst({
      where,
      with: {
        contact: {
          with: {
            contactsOnSequences: {
              with: {
                sequence: true,
              },
            },
            contactNotes: true,
            contactCustomFields: true,
            tags: true,
          },
        },
        contactInboxes: {
          columns: contactInboxOperationalColumns,
          with: { inbox: true },
        },
        messages: true,
        assignedUser: true,
        assignedInboxTeam: true,
      },
    })
    return result as ConversationWithFullRelations | undefined
  }

  // ─── Writes ──────────────────────────────────────────────────────────────

  /**
   * Persists the channel's own conversation id onto an existing row when the
   * channel newly reported one, or reported a different one.
   *
   * TikTok can rotate `conversation_id` for the same contact, and rows created
   * before this field existed carry none, so the write has to be idempotent
   * rather than create-only — otherwise an outbound DM on a pre-existing
   * conversation has nothing to address.
   */
  private async syncChannelConversationId(props: {
    conversation: ConversationModel
    channelConversationId: string
    tx: DatabaseClient
  }): Promise<ConversationModel> {
    const { conversation, channelConversationId, tx } = props
    if (
      conversation.additionalAttributes?.channelConversationId ===
      channelConversationId
    ) {
      return conversation
    }

    const updated = await tx
      .update(conversationModel)
      .set({
        additionalAttributes: {
          ...conversation.additionalAttributes,
          channelConversationId,
        },
      })
      .where(eq(conversationModel.id, conversation.id))
      .returning()
      .then((result) => result[0])

    if (!updated) {
      return conversation
    }

    await this.invalidate({
      workspaceId: conversation.workspaceId,
      ids: [conversation.id],
    })
    return updated
  }

  async findOrCreate(props: {
    workspaceId: string
    contactId: string
    sourceId: string | null
    /**
     * The channel's own conversation identifier (TikTok's `conversation_id`),
     * stored on `additionalAttributes` rather than keying the row. See
     * `IncomingContact.channelConversationId`.
     */
    channelConversationId?: string | null
    tx?: DatabaseClient
  }): Promise<ConversationModel> {
    const {
      workspaceId,
      contactId,
      sourceId,
      channelConversationId,
      tx = db,
    } = props

    const findExisting = () =>
      tx.query.conversationModel.findFirst({
        where: {
          workspaceId,
          contactId,
          sourceId: sourceId === null ? { isNull: true } : sourceId,
        },
      })

    const existing = await findExisting()
    if (existing) {
      return channelConversationId
        ? await this.syncChannelConversationId({
            conversation: existing,
            channelConversationId,
            tx,
          })
        : existing
    }

    const created = await tx
      .insert(conversationModel)
      .values({
        id: createId(),
        workspaceId,
        contactId,
        sourceId,
        additionalAttributes: channelConversationId
          ? { channelConversationId }
          : undefined,
      })
      .onConflictDoNothing()
      .returning()
      .then((result) => result[0])

    if (!created) {
      // A concurrent writer (e.g. the message echo webhook opening the same DM
      // while a comment automation resolves it) won the partial unique index —
      // `Conversation_contactId_dm_key` for DMs, otherwise
      // `Conversation_contactId_sourceId_key` — so the insert produced no row.
      // Re-read rather than fail: the winner already created the conversation,
      // so this path has no additional side effect.
      const concurrent = await findExisting()
      if (!concurrent) {
        throw new Error("Conversation not found")
      }
      return channelConversationId
        ? await this.syncChannelConversationId({
            conversation: concurrent,
            channelConversationId,
            tx,
          })
        : concurrent
    }

    return created
  }

  async updateArchived(props: {
    workspaceId: string
    conversations: { id: string; contactId: string }[]
    archivedAt: Date | null
    userId?: string
    triggerContext: TriggerContext
    tx?: DatabaseClient
  }): Promise<void> {
    const {
      workspaceId,
      conversations,
      archivedAt,
      triggerContext,
      tx = db,
    } = props
    const ids = conversations.map((c) => c.id)
    await tx
      .update(conversationModel)
      .set({
        archivedAt,
        ...(archivedAt
          ? humanReplyWindowSet({
              close: archivedAt,
              actor: "archive",
            })
          : {}),
      })
      .where(
        and(
          eq(conversationModel.workspaceId, workspaceId),
          inArray(conversationModel.id, ids),
        ),
      )
    await this.invalidate({ workspaceId, ids })

    const eventType = archivedAt
      ? "conversation:archived"
      : "conversation:unarchived"

    if (archivedAt) {
      for (const conv of conversations) {
        await emitConversationArchived(
          workspaceId,
          conv.contactId,
          conv.id,
          props.userId,
        )
      }
      await this.releaseOwnedThreads({ workspaceId, conversations, archivedAt })
    }

    const attributions = await this.resolveAnalyticsAttribution({
      workspaceId,
      contactIds: conversations.map((conv) => conv.contactId),
    })
    for (const conv of conversations) {
      emit("analytics:dashboard", {
        eventType,
        workspaceId,
        conversationId: conv.id,
        occurredAt: new Date(),
        ...attributions.get(conv.contactId),
        metadata: { triggerContext },
      })
    }
  }

  /**
   * (channel, inboxId) pair analytics attributes each conversation event to.
   * A conversation belongs to a contact, not an inbox, so the pair comes from
   * the contact's most recently active ContactInbox — attribution by routing
   * rule, not causal. One workspace-scoped query for the whole batch; contacts
   * without a ContactInbox stay unattributed. It reads on `db`, never the
   * caller's transaction, and a failed read only leaves the events
   * unattributed: the conversation change is already committed.
   */
  private async resolveAnalyticsAttribution(props: {
    workspaceId: string
    contactIds: string[]
  }): Promise<Map<string, { channel: string; inboxId: string }>> {
    const { workspaceId } = props
    try {
      const rows = await contactInboxRepository.listLatestAnalyticsAttribution({
        workspaceId,
        contactIds: [...new Set(props.contactIds)],
      })
      return new Map(
        rows.map((row) => [
          row.contactId,
          { channel: row.channel, inboxId: row.inboxId },
        ]),
      )
    } catch (err) {
      logger.warn(
        { err, workspaceId },
        "Conversation analytics attribution lookup failed; events stay unattributed",
      )
      return new Map()
    }
  }

  /**
   * Archiving ends the conversation, so every routing thread we own for these
   * contacts is released (the owner keeps a thread while the customer stays
   * active; stopping sends does not free it). Best effort by design: the
   * archive is already written, so a failure to enqueue is logged and the
   * thread simply idles out after 24h of customer silence.
   */
  private async releaseOwnedThreads(props: {
    workspaceId: string
    conversations: { id: string; contactId: string }[]
    archivedAt: Date
  }): Promise<void> {
    try {
      await threadControlService.releaseOwnedThreadsForContacts(props)
    } catch (err) {
      logger.warn(
        { err, workspaceId: props.workspaceId },
        "Unable to enqueue thread release after archiving conversations",
      )
    }
  }

  async archiveByIds(props: {
    workspaceId: string
    ids: string[]
    userId?: string
    triggerContext: TriggerContext
    tx?: DatabaseClient
  }): Promise<void> {
    const { workspaceId, ids, userId, triggerContext, tx } = props
    const conversations = await this.findManyByIds({ workspaceId, ids, tx })
    await this.updateArchived({
      workspaceId,
      conversations,
      archivedAt: new Date(),
      userId,
      triggerContext,
      tx,
    })
  }

  async unarchiveByIds(props: {
    workspaceId: string
    ids: string[]
    userId?: string
    triggerContext: TriggerContext
    tx?: DatabaseClient
  }): Promise<void> {
    const { workspaceId, ids, userId, triggerContext, tx } = props
    const conversations = await this.findManyByIds({ workspaceId, ids, tx })
    await this.updateArchived({
      workspaceId,
      conversations,
      archivedAt: null,
      userId,
      triggerContext,
      tx,
    })
  }

  // `onInvalid: "throw"` (API/action callers) rejects an unknown member, an
  // unknown team, or an unrecognized prefix with `invalidAssignee`.
  // `onInvalid: "ignore"` (worker trigger/flow-step callers) instead resolves
  // that case to "no target" — preserving the worker's pre-existing silent
  // no-op behavior on a stale/invalid assignee, which callers there rely on
  // (a flow step must not hard-fail a whole execution over one bad id).
  private async resolveAssignmentTarget(
    workspaceId: string,
    assignedId: string | null | undefined,
    onInvalid: "throw" | "ignore" = "throw",
    tx?: DatabaseClient,
  ): Promise<{
    assignedUserId: string | null
    assignedInboxTeamId: string | null
  }> {
    const updatedData: {
      assignedUserId: string | null
      assignedInboxTeamId: string | null
    } = {
      assignedUserId: null,
      assignedInboxTeamId: null,
    }

    if (assignedId?.startsWith("u_")) {
      const userId = assignedId.slice(2)
      const workspaceMember =
        await workspaceMemberService.findByWorkspaceIdAndUserId({
          workspaceId,
          userId,
          tx,
        })
      if (workspaceMember) {
        updatedData.assignedUserId = workspaceMember.userId
      } else if (onInvalid === "throw") {
        throw new ChatbotXException("User is not valid", "invalidAssignee", 400)
      }
    } else if (assignedId?.startsWith("t_")) {
      const inboxTeamId = assignedId.slice(2)
      if (onInvalid === "throw") {
        const inboxTeam = await inboxTeamService.findByIdOrFail({
          workspaceId,
          inboxTeamId,
          tx,
        })
        updatedData.assignedInboxTeamId = inboxTeam.id
      } else {
        const teamExists = await inboxTeamService.exists({
          workspaceId,
          id: inboxTeamId,
          tx,
        })
        if (teamExists) {
          updatedData.assignedInboxTeamId = inboxTeamId
        }
      }
    } else if (assignedId != null && onInvalid === "throw") {
      // Schema validation should already reject this shape, but guard here too
      // so a caller can never silently unassign via an unrecognized prefix.
      throw new ChatbotXException(
        "assignedId must start with 'u_' or 't_'",
        "invalidAssignee",
        400,
      )
    }

    return updatedData
  }

  async assignByContactIds(props: {
    workspaceId: string
    contactIds: string[]
    assignedId: string | null | undefined
    assignedBy?: string
    triggerContext: Omit<TriggerContext, "triggerType">
  }): Promise<void> {
    const { workspaceId, contactIds, assignedId, assignedBy } = props

    const updatedData = await this.resolveAssignmentTarget(
      workspaceId,
      assignedId,
    )

    const conversations = await this.findManyByContactIds({
      workspaceId,
      contactIds,
    })
    if (conversations.length === 0) {
      return
    }

    await this.updateAssignment({
      workspaceId,
      conversations,
      assignedUserId: updatedData.assignedUserId,
      assignedInboxTeamId: updatedData.assignedInboxTeamId,
      assignedBy,
      triggerContext: {
        ...props.triggerContext,
        triggerType:
          updatedData.assignedUserId || updatedData.assignedInboxTeamId
            ? "conversation_assigned"
            : "conversation_unassigned",
      },
    })
  }

  // Single-conversation, path-addressed variant for the public API — assigns
  // exactly the conversation given, not every conversation belonging to its
  // contact (a contact can have a DM plus N comment-thread conversations, all
  // sharing one `contactId`; see `assignByContactIds` above).
  async assignOne(props: {
    workspaceId: string
    conversation: { id: string; contactId: string }
    assignedId: string | null | undefined
    assignedBy?: string
    triggerContext: Omit<TriggerContext, "triggerType">
    tx?: DatabaseClient
    afterCommit?: (callback: () => Promise<void>) => void
  }): Promise<void> {
    const { workspaceId, conversation, assignedId, assignedBy } = props
    const updatedData = await this.resolveAssignmentTarget(
      workspaceId,
      assignedId,
      "throw",
      props.tx,
    )

    await this.updateAssignment({
      workspaceId,
      conversations: [conversation],
      assignedUserId: updatedData.assignedUserId,
      assignedInboxTeamId: updatedData.assignedInboxTeamId,
      assignedBy,
      triggerContext: {
        ...props.triggerContext,
        triggerType:
          updatedData.assignedUserId || updatedData.assignedInboxTeamId
            ? "conversation_assigned"
            : "conversation_unassigned",
      },
      tx: props.tx,
      afterCommit: props.afterCommit,
    })
  }

  // Worker trigger-action/flow-step variant: an unrecognized or stale
  // assignedId (deleted member, deleted team, malformed prefix) silently
  // does nothing rather than throwing, matching the pre-existing behavior of
  // `stepAssignConversation`/`ActionExecutor`'s assignConversation case —
  // a single bad id in a flow/trigger must not hard-fail the whole run.
  // `triggerContext` is taken as-is (unlike `assignOne`/`assignByContactIds`,
  // which derive `triggerType` as "conversation_assigned"/"unassigned" for
  // the API's DB-event taxonomy): worker callers here use a *different*
  // `triggerType` axis — "trigger_action"/"flow_action", describing how the
  // assignment fired, not what it did — and that value flows straight into
  // `emit("analytics:dashboard", { metadata: { triggerContext } })` inside
  // `updateAssignment` below, so overwriting it would silently corrupt the
  // trigger/flow analytics event.
  async assignOneOrSkip(props: {
    workspaceId: string
    conversation: { id: string; contactId: string }
    assignedId: string
    silent?: boolean
    triggerContext: TriggerContext
  }): Promise<void> {
    const { workspaceId, conversation, assignedId, silent, triggerContext } =
      props

    const updatedData = await this.resolveAssignmentTarget(
      workspaceId,
      assignedId,
      "ignore",
    )

    if (!(updatedData.assignedUserId || updatedData.assignedInboxTeamId)) {
      return
    }

    // Automated paths never hand a conversation to an agent who is off shift
    // (a person assigning in the inbox goes through `assignOne`, unchecked).
    if (
      updatedData.assignedUserId &&
      !(await isUserOnShift({
        workspaceId,
        userId: updatedData.assignedUserId,
      }))
    ) {
      logger.debug(
        { workspaceId, conversationId: conversation.id },
        "Assignment skipped: the target agent is off shift",
      )
      return
    }

    await this.updateAssignment({
      workspaceId,
      conversations: [conversation],
      assignedUserId: updatedData.assignedUserId,
      assignedInboxTeamId: updatedData.assignedInboxTeamId,
      silent,
      triggerContext,
    })
  }

  async updateAssignment(props: {
    workspaceId: string
    conversations: { id: string; contactId: string }[]
    assignedUserId: string | null
    assignedInboxTeamId: string | null
    assignedBy?: string
    silent?: boolean
    triggerContext: TriggerContext
    tx?: DatabaseClient
    afterCommit?: (callback: () => Promise<void>) => void
  }): Promise<ConversationModel[]> {
    const {
      workspaceId,
      conversations,
      assignedUserId,
      assignedInboxTeamId,
      assignedBy,
      silent,
      triggerContext,
    } = props

    if (props.tx && !props.afterCommit) {
      throw new Error(
        "updateAssignment with tx requires an afterCommit callback",
      )
    }
    if (conversations.length === 0) {
      return []
    }

    const ids = conversations.map((conversation) => conversation.id)
    const assignedAt = new Date()
    const updateInTransaction = async (
      transaction: DatabaseClient,
    ): Promise<{
      previousAssignments: Map<
        string,
        { assignedInboxTeamId: string | null; assignedUserId: string | null }
      >
      updated: ConversationModel[]
    }> => {
      const previous = await transaction
        .select({
          assignedInboxTeamId: conversationModel.assignedInboxTeamId,
          assignedUserId: conversationModel.assignedUserId,
          id: conversationModel.id,
        })
        .from(conversationModel)
        .where(
          and(
            eq(conversationModel.workspaceId, workspaceId),
            inArray(conversationModel.id, ids),
          ),
        )
        .for("update")
      const updated = await transaction
        .update(conversationModel)
        .set({
          assignedUserId,
          assignedInboxTeamId,
          assignedUserAt: sql`CASE WHEN ${assignedUserId}::bigint IS NULL THEN NULL WHEN "assignedUserId" IS DISTINCT FROM ${assignedUserId}::bigint THEN ${assignedAt.toISOString()}::timestamptz ELSE "assignedUserAt" END`,
        })
        .where(
          and(
            eq(conversationModel.workspaceId, workspaceId),
            inArray(conversationModel.id, ids),
          ),
        )
        .returning()
      return {
        previousAssignments: new Map(
          previous.map((conversation) => [conversation.id, conversation]),
        ),
        updated,
      }
    }
    const result = props.tx
      ? await responseSlaService.trackWindow(
          {
            workspaceId,
            conversationIds: ids,
            assigneeHints: [assignedUserId],
            tx: props.tx,
          },
          updateInTransaction,
        )
      : await db.transaction((tx) =>
          responseSlaService.trackWindow(
            {
              workspaceId,
              conversationIds: ids,
              assigneeHints: [assignedUserId],
              tx,
            },
            updateInTransaction,
          ),
        )
    const publish = async () =>
      await this.publishAssignmentChanges({
        workspaceId,
        conversations: result.updated.map((conversation) => {
          const previousAssignment = result.previousAssignments.get(
            conversation.id,
          )
          return {
            id: conversation.id,
            contactId: conversation.contactId,
            previousAssignedInboxTeamId:
              previousAssignment?.assignedInboxTeamId,
            previousAssignedUserId: previousAssignment?.assignedUserId,
          }
        }),
        assignedUserId,
        assignedInboxTeamId,
        assignedBy,
        silent,
        triggerContext,
      })
    if (props.tx) {
      props.afterCommit?.(publish)
    } else {
      await publish()
    }

    return result.updated
  }

  /**
   * Side effects of an assignment write, extracted so claimForCallAgent can
   * trigger the same publish from its own UPDATE. Built from the rows the
   * caller's UPDATE actually returned, never intended input; an empty
   * conversations result is a no-op.
   */
  private async publishAssignmentChanges(props: {
    workspaceId: string
    conversations: {
      id: string
      contactId: string
      previousAssignedInboxTeamId?: string | null
      previousAssignedUserId?: string | null
    }[]
    assignedUserId: string | null
    assignedInboxTeamId: string | null
    assignedBy?: string
    silent?: boolean
    triggerContext: TriggerContext
  }): Promise<void> {
    const {
      workspaceId,
      conversations,
      assignedUserId,
      assignedInboxTeamId,
      assignedBy,
      silent,
      triggerContext,
    } = props
    if (conversations.length === 0) {
      return
    }
    const ids = conversations.map((c) => c.id)

    await this.invalidate({ workspaceId, ids })

    if (!silent) {
      await queueWorkspaceRealtimeEvent(workspaceId, {
        eventType: RealtimeEventType.conversationAssigned,
        data: { conversationIds: ids, assignedUserId, assignedInboxTeamId },
        route: routeForAssignment({
          assignedUserId,
          assignedInboxTeamId,
          previousAssignedUserIds: conversations.map(
            ({ previousAssignedUserId }) => previousAssignedUserId,
          ),
          previousAssignedInboxTeamIds: conversations.map(
            ({ previousAssignedInboxTeamId }) => previousAssignedInboxTeamId,
          ),
        }),
      })
    }

    if (assignedUserId && assignedUserId !== assignedBy) {
      try {
        await notificationQueue.addBulk(
          conversations.map((conv) => ({
            name: NotificationJobAction.notifyConversationAssigned,
            data: {
              type: NotificationJobAction.notifyConversationAssigned,
              data: { workspaceId, conversationId: conv.id, assignedUserId },
            },
            opts: { jobId: `notify-assigned-${conv.id}-${assignedUserId}` },
          })),
        )
      } catch (err) {
        logger.warn(
          { err, workspaceId, conversationIds: ids },
          "conversation-assigned notification bulk enqueue failed",
        )
      }
    }

    const assignedTo = assignedUserId || assignedInboxTeamId
    const attributions = await this.resolveAnalyticsAttribution({
      workspaceId,
      contactIds: conversations.map((conv) => conv.contactId),
    })
    for (const conv of conversations) {
      if (assignedTo) {
        await emitConversationAssigned(
          workspaceId,
          conv.contactId,
          conv.id,
          assignedTo,
          assignedBy,
        )
        emit("analytics:dashboard", {
          eventType: "conversation:assigned",
          workspaceId,
          conversationId: conv.id,
          toAssignee: assignedTo,
          occurredAt: new Date(),
          ...attributions.get(conv.contactId),
          metadata: { triggerContext },
        })
      } else {
        await emitConversationUnassigned(
          workspaceId,
          conv.contactId,
          conv.id,
          assignedBy,
        )
        emit("analytics:dashboard", {
          eventType: "conversation:unassigned",
          workspaceId,
          conversationId: conv.id,
          occurredAt: new Date(),
          ...attributions.get(conv.contactId),
          metadata: { triggerContext },
        })
      }
    }
  }

  /**
   * Auto-assign on call answer/dial. Claims only when unassigned to both a
   * user and a team — assignUserIfUnassigned's guarded UPDATE is the source
   * of truth, so a concurrent manual assignment always wins. Never throws on
   * a losing claim; the call itself must not fail because of this.
   */
  async claimForCallAgent(props: {
    workspaceId: string
    conversationId: string
    userId: string
    triggerHandler: string
    tx?: DatabaseClient
  }): Promise<ConversationModel[]> {
    const { workspaceId, conversationId, userId, triggerHandler, tx } = props
    const claimed = await responseSlaService.trackWindow(
      {
        workspaceId,
        conversationIds: [conversationId],
        assigneeHints: [userId],
        tx,
      },
      (client) =>
        assignUserIfUnassigned({ workspaceId, conversationId, userId }, client),
    )

    await this.publishAssignmentChanges({
      workspaceId,
      conversations: claimed,
      assignedUserId: userId,
      assignedInboxTeamId: null,
      assignedBy: userId,
      triggerContext: {
        triggerSource: "api",
        triggerHandler,
        triggerType: "conversation_assigned",
      },
    })

    return claimed
  }

  async claimAssignmentIfUnassigned(props: {
    assignedId: `t_${string}` | `u_${string}`
    conversation: Pick<ConversationModel, "id">
    triggerContext: TriggerContext
    workspaceId: string
  }): Promise<"alreadyAssigned" | "claimed"> {
    const isTeam = props.assignedId.startsWith("t_")
    const id = props.assignedId.slice(2)
    const claimed = await responseSlaService.trackWindow(
      {
        workspaceId: props.workspaceId,
        conversationIds: [props.conversation.id],
        assigneeHints: [isTeam ? null : id],
      },
      (client) =>
        assignTargetIfUnassigned(
          {
            assignedInboxTeamId: isTeam ? id : null,
            assignedUserId: isTeam ? null : id,
            conversationId: props.conversation.id,
            workspaceId: props.workspaceId,
          },
          client,
        ),
    )
    if (claimed.length === 0) {
      return "alreadyAssigned"
    }
    await this.publishAssignmentChanges({
      assignedBy: undefined,
      assignedInboxTeamId: isTeam ? id : null,
      assignedUserId: isTeam ? null : id,
      conversations: claimed,
      triggerContext: props.triggerContext,
      workspaceId: props.workspaceId,
    })
    return "claimed"
  }

  async updateBotEnabled(
    props: BotPauseOptions & {
      workspaceId: string
      ids: string[]
      botEnabled: boolean
      tx?: DatabaseClient
    },
  ): Promise<void> {
    const { workspaceId, ids, botEnabled, tx = db } = props
    const update = (client: DatabaseClient) =>
      client
        .update(conversationModel)
        .set(
          botEnabled
            ? { botEnabled, botResumeAt: props.botResumeAt ?? null }
            : botPauseSet(props),
        )
        .where(
          and(
            eq(conversationModel.workspaceId, workspaceId),
            inArray(conversationModel.id, ids),
          ),
        )
    // Only a pause that reopens the waiting window can start an SLA.
    if (!botEnabled && props.reopenUnansweredHumanReplyWindow) {
      await responseSlaService.trackWindow(
        { workspaceId, conversationIds: ids, tx: props.tx },
        update,
      )
    } else {
      await update(tx)
    }
    if (!botEnabled) {
      // Best-effort: fire-time `ensureActive` already skips a follow-up on a
      // paused conversation, so a failed cancel must never fail the pause (or
      // skip `invalidate`). Inside a caller's tx it runs behind a SAVEPOINT so
      // a failed statement cannot poison the outer transaction.
      const cancel = (client: DatabaseClient) =>
        smartDelayService.cancelQuickReplyFollowUps({
          tx: client,
          workspaceId,
          conversationIds: ids,
        })
      try {
        if (props.tx) {
          await props.tx.transaction(cancel)
        } else {
          await cancel(tx)
        }
      } catch (error) {
        logger.warn(
          { err: error, workspaceId, conversationIds: ids },
          "quick reply follow-up cancel on bot pause failed",
        )
      }
    }
    await this.invalidate({ workspaceId, ids })
  }

  /**
   * Atomic handoff to a human: pauses the bot only while it is still enabled
   * (the WHERE guard is the idempotency check, so concurrent handoffs cannot
   * both win). With `reopenUnansweredHumanReplyWindow` it reopens the DM
   * waiting window when the contact's last message is unanswered. Returns
   * whether this call performed the handoff.
   */
  async handOffIfBotEnabled(
    props: ReopenWindowOption & {
      workspaceId: string
      conversationId: string
      tx?: DatabaseClient
    },
  ): Promise<boolean> {
    const { workspaceId, conversationId } = props
    const handOff = (client: DatabaseClient) =>
      client
        .update(conversationModel)
        .set(
          botPauseSet({
            reopenUnansweredHumanReplyWindow:
              props.reopenUnansweredHumanReplyWindow,
          }),
        )
        .where(
          and(
            eq(conversationModel.id, conversationId),
            eq(conversationModel.workspaceId, workspaceId),
            eq(conversationModel.botEnabled, true),
          ),
        )
        .returning({ id: conversationModel.id })
    // A handoff that reopens the unanswered window starts the response SLA.
    const updated = props.reopenUnansweredHumanReplyWindow
      ? await responseSlaService.trackWindow(
          { workspaceId, conversationIds: [conversationId], tx: props.tx },
          handOff,
        )
      : await handOff(props.tx ?? db)
    if (updated.length === 0) {
      return false
    }
    await this.invalidate({ workspaceId, ids: [conversationId] })
    return true
  }

  async updateFollowed(props: {
    workspaceId: string
    id: string
    contactId: string
    followed: boolean
    userId?: string
    triggerContext: TriggerContext
    tx?: DatabaseClient
  }): Promise<void> {
    const {
      workspaceId,
      id,
      contactId,
      followed,
      triggerContext,
      tx = db,
    } = props
    await tx
      .update(conversationModel)
      .set({ followed })
      .where(
        and(
          eq(conversationModel.id, id),
          eq(conversationModel.workspaceId, workspaceId),
        ),
      )
    await this.invalidate({ workspaceId, ids: [id] })

    if (followed) {
      await emitConversationFollowUp(workspaceId, contactId, id, props.userId)
    }

    const attributions = await this.resolveAnalyticsAttribution({
      workspaceId,
      contactIds: [contactId],
    })
    emit("analytics:dashboard", {
      eventType: followed ? "conversation:followed" : "conversation:unfollowed",
      workspaceId,
      conversationId: id,
      occurredAt: new Date(),
      ...attributions.get(contactId),
      metadata: { triggerContext },
    })
  }

  async setFollowed(props: {
    workspaceId: string
    id: string
    followed: boolean
    userId?: string
    triggerContext: TriggerContext
    tx?: DatabaseClient
  }): Promise<void> {
    const { workspaceId, id, followed, userId, triggerContext, tx } = props
    const conversation = await this.findByOrFail({
      where: { id, workspaceId },
      tx,
    })

    await this.updateFollowed({
      workspaceId,
      id,
      contactId: conversation.contactId,
      followed,
      userId,
      triggerContext,
      tx,
    })
  }

  async markUnread(props: {
    workspaceId: string
    id: string
    silent?: boolean
    tx?: DatabaseClient
    afterCommit?: (callback: () => Promise<void>) => void
  }): Promise<{ agentLastReadAt: Date | null }> {
    const { workspaceId, id, silent, tx } = props
    const conversation = await this.findByOrFail({
      where: { id, workspaceId },
      tx,
    })

    const messageRepository = await createMessageRepository(tx)
    const last2Messages = await messageRepository.findLastByConversation(
      conversation.id,
      {
        messageTypes: ["incoming"],
        limit: 2,
        // Anchor on this conversation's own lastActivityAt, not a shared
        // ContactInbox's lastMessageAt — a contact's ContactInbox is shared
        // across their DM and every comment-thread conversation, so its
        // lastMessageAt can reflect a different, more recently active
        // conversation and push sinceTime past this conversation's real last
        // message, causing the sharded scan to miss it.
        sinceTime: getSafeSinceTime(
          conversation.lastActivityAt ?? conversation.createdAt,
          365 * 24 * 60 * 60 * 1000,
        ),
        workspaceId,
      },
    )
    // Newest first: the cursor lands on the second-newest incoming message so
    // only the latest one is unread. With a single message there is nothing
    // to anchor on — anchoring on that message would make `lastActivityAt >
    // agentLastReadAt` false and leave the row read — so it becomes never-read.
    const agentLastReadAt =
      last2Messages.length >= 2 ? (last2Messages[1]?.createdAt ?? null) : null

    await this.updateReadStatus({
      workspaceId,
      id,
      agentLastReadAt,
      silent,
      tx,
      afterCommit: props.afterCommit,
    })

    return { agentLastReadAt }
  }

  /**
   * Channel message id (e.g. a WhatsApp wamid) of the newest incoming message
   * this conversation received on `contactInboxId`. Read receipts and typing
   * indicators that must reference a real message use it. Looks back 30 days,
   * matching WhatsApp's mark-as-read guidance.
   */
  async findLastIncomingMessageSourceId(props: {
    conversation: Pick<
      ConversationModel,
      "id" | "workspaceId" | "lastActivityAt" | "createdAt"
    >
    contactInboxId: string
  }): Promise<string | undefined> {
    const { conversation, contactInboxId } = props
    const messageRepository = await createMessageRepository()
    const messages = await messageRepository.findLastByConversation(
      conversation.id,
      {
        workspaceId: conversation.workspaceId,
        messageTypes: ["incoming"],
        limit: 10,
        withAttachments: false,
        // Anchor on this conversation's own lastActivityAt, not a shared
        // ContactInbox's lastMessageAt (see the sharded-scan note elsewhere).
        sinceTime: getSafeSinceTime(
          conversation.lastActivityAt ?? conversation.createdAt,
          30 * 24 * 60 * 60 * 1000,
        ),
      },
    )

    return (
      messages.find(
        (message) =>
          message.contactInboxId === contactInboxId && message.sourceId,
      )?.sourceId ?? undefined
    )
  }

  async updateReadStatus(props: {
    workspaceId: string
    id: string
    agentLastReadAt: Date | null
    silent?: boolean
    tx?: DatabaseClient
    afterCommit?: (callback: () => Promise<void>) => void
  }): Promise<void> {
    const { workspaceId, id, agentLastReadAt, silent, tx = db } = props

    if (props.tx && !props.afterCommit) {
      throw new Error(
        "updateReadStatus with tx requires an afterCommit callback",
      )
    }
    const [updated] = await tx
      .update(conversationModel)
      .set({ agentLastReadAt })
      .where(
        and(
          eq(conversationModel.id, id),
          eq(conversationModel.workspaceId, workspaceId),
        ),
      )
      .returning({
        assignedInboxTeamId: conversationModel.assignedInboxTeamId,
        assignedUserId: conversationModel.assignedUserId,
      })
    if (!updated) {
      return
    }

    const publish = async () => {
      await this.invalidate({ workspaceId, ids: [id] })
      if (!silent) {
        await queueWorkspaceRealtimeEvent(workspaceId, {
          eventType: RealtimeEventType.conversationUpdated,
          data: {
            conversationIds: [id],
            changes: {
              agentLastReadAt: agentLastReadAt?.toISOString() ?? null,
            },
          },
          route: routeForConversation(updated),
        })
      }
    }
    if (props.tx) {
      props.afterCommit?.(publish)
      return
    }
    await publish()
  }

  /**
   * Advances agent read state only, so retries and delayed outbound events
   * cannot overwrite a newer read. The inbox preference is checked inside the
   * same statement to avoid racing a separate gate read; successful advances
   * broadcast the same best-effort realtime update as manual reads.
   */
  async markReadByOutbound(props: {
    workspaceId: string
    conversationId: string
    inboxId: string
    readAt: Date
    silent?: boolean
  }): Promise<boolean> {
    const { conversationId, inboxId, readAt, silent, workspaceId } = props
    const updated = await db
      .update(conversationModel)
      .set({ agentLastReadAt: readAt })
      .where(
        and(
          eq(conversationModel.id, conversationId),
          eq(conversationModel.workspaceId, workspaceId),
          or(
            isNull(conversationModel.agentLastReadAt),
            lt(conversationModel.agentLastReadAt, readAt),
          ),
          exists(
            db
              .select({ value: sql<number>`1` })
              .from(inboxModel)
              .where(
                and(
                  eq(inboxModel.id, inboxId),
                  eq(inboxModel.workspaceId, workspaceId),
                  eq(inboxModel.markReadOnOutbound, true),
                ),
              ),
          ),
        ),
      )
      .returning({
        assignedInboxTeamId: conversationModel.assignedInboxTeamId,
        assignedUserId: conversationModel.assignedUserId,
        id: conversationModel.id,
      })

    if (updated.length === 0) {
      return false
    }

    await this.invalidate({ workspaceId, ids: [conversationId] })
    if (!silent) {
      await queueWorkspaceRealtimeEvent(workspaceId, {
        eventType: RealtimeEventType.conversationUpdated,
        data: {
          conversationIds: [conversationId],
          changes: { agentLastReadAt: readAt.toISOString() },
        },
        route: routeForConversation(updated[0]),
      })
    }

    return true
  }

  /**
   * Contact-side companion to updateReadStatus. Shared by read-receipt worker
   * paths so conversation and contact-inbox tracking stay in sync.
   */
  async markReadByContact(props: {
    workspaceId: string
    conversationId: string
    contactInboxId: string
    contactId: string
    seenAt: Date
  }): Promise<void> {
    const { workspaceId, conversationId, contactInboxId, contactId, seenAt } =
      props

    const trackingInvalidation = await db.transaction(async (tx) => {
      await tx
        .update(conversationModel)
        .set({ contactLastReadAt: seenAt })
        .where(
          and(
            eq(conversationModel.id, conversationId),
            eq(conversationModel.workspaceId, workspaceId),
          ),
        )

      return await contactInboxService.updateTracking({
        tx,
        contactInboxId,
        contactId,
        workspaceId,
        data: { contactLastReadAt: seenAt },
      })
    })

    if (trackingInvalidation) {
      await contactInboxService.invalidateTracking(trackingInvalidation)
    }

    await this.invalidate({ workspaceId, ids: [conversationId] })
  }

  async updateAIContextLastMessageId(props: {
    workspaceId: string
    conversationId: string
    messageId: string | null
    tx?: DatabaseClient
  }): Promise<void> {
    const { workspaceId, conversationId, messageId, tx = db } = props
    await tx
      .update(conversationModel)
      .set({ aiContextLastMessageId: messageId })
      .where(
        and(
          eq(conversationModel.id, conversationId),
          eq(conversationModel.workspaceId, workspaceId),
        ),
      )
    await this.invalidate({ workspaceId, ids: [conversationId] })
  }

  /**
   * Batched activity + AI-context-marker advance for coexist sync writes.
   * ONE VALUES-join UPDATE for the whole bulk (mirrors the pre-existing
   * `lastActivityAt`-only UPDATE in `applyCoexistActivityUpdates`), extended
   * to also advance `aiContextLastMessageId`.
   *
   * Both columns are advance-only and NULL-guarded per row: a null
   * `newestMessageAt` leaves `lastActivityAt` untouched, and a null
   * `aiMarkerMessageId` leaves `aiContextLastMessageId` untouched. The marker
   * only ever moves FORWARD to a message id actually inserted by a coexist
   * sync for that conversation (either direction) — never backwards, and
   * never to an arbitrary id — so a stale/replayed batch can never regress
   * it. Callers dedup rows by `conversationId` before calling this.
   */
  async bulkAdvanceActivityAndAiContextMarker(props: {
    workspaceId: string
    rows: Array<{
      conversationId: string
      newestMessageAt: Date | null
      /** Id of the newest sync-inserted message (either direction); null = leave marker untouched. */
      aiMarkerMessageId: string | null
    }>
    tx?: DatabaseClient
  }): Promise<void> {
    const { workspaceId, rows, tx = db } = props
    if (rows.length === 0) {
      return
    }

    const valueRows = rows.map(
      (row) => sql`(
        ${row.conversationId}::int8,
        ${row.newestMessageAt}::timestamptz,
        ${row.aiMarkerMessageId}::int8
      )`,
    )

    await tx.execute(sql`
      UPDATE "Conversation" AS t
      SET "lastActivityAt" = CASE
            WHEN u.ts IS NOT NULL AND (t."lastActivityAt" IS NULL OR t."lastActivityAt" < u.ts) THEN u.ts
            ELSE t."lastActivityAt" END,
          "aiContextLastMessageId" = CASE
            WHEN u.marker IS NOT NULL AND (t."aiContextLastMessageId" IS NULL OR t."aiContextLastMessageId" < u.marker) THEN u.marker
            ELSE t."aiContextLastMessageId" END
      FROM (VALUES ${sql.join(valueRows, sql`, `)}) AS u(id, ts, marker)
      WHERE t."id" = u.id AND t."workspaceId" = ${workspaceId}::int8
    `)

    await this.invalidate({
      workspaceId,
      ids: rows.map((row) => row.conversationId),
    })
  }

  async updateFlowStepState(props: {
    workspaceId: string
    conversationId: string
    currentStep?: string | null
    lastActivityAt?: Date
    lastStep?: string | null
    contactLastReadAt?: Date
    contactRepliedAt?: Date
    /** DM waiting-window transition applied in this same UPDATE. */
    humanReplyWindow?: HumanReplyWindowTransition
    tx?: DatabaseClient
  }): Promise<void> {
    const { workspaceId, conversationId, tx = db } = props
    const data: PgUpdateSetSource<typeof conversationModel> = {}
    if ("currentStep" in props) {
      data.currentStep = props.currentStep
    }
    if (props.lastActivityAt !== undefined) {
      // Postgres GREATEST ignores NULL operands, so a NULL column advances to the new value.
      data.lastActivityAt = sql`GREATEST(${conversationModel.lastActivityAt}, ${props.lastActivityAt})`
    }
    if ("contactRepliedAt" in props && props.contactRepliedAt) {
      // Advance-only: a delayed/retried older webhook processed after a
      // newer one must never move this column backwards (which would hide
      // an already-seen unread message). Postgres GREATEST ignores NULLs;
      // the COALESCE is kept only for readability.
      data.contactRepliedAt = sql`GREATEST(COALESCE(${conversationModel.contactRepliedAt}, ${props.contactRepliedAt}), ${props.contactRepliedAt})`
    }
    if ("lastStep" in props) {
      data.lastStep = props.lastStep
    }
    if (props.contactLastReadAt !== undefined) {
      data.contactLastReadAt = props.contactLastReadAt
    }
    if (props.humanReplyWindow) {
      Object.assign(data, humanReplyWindowSet(props.humanReplyWindow))
    }

    if (Object.keys(data).length === 0) {
      return
    }

    const update = (client: DatabaseClient) =>
      client
        .update(conversationModel)
        .set(data)
        .where(
          and(
            eq(conversationModel.id, conversationId),
            eq(conversationModel.workspaceId, workspaceId),
          ),
        )
    // A contact message opening the window starts the response SLA.
    if (props.humanReplyWindow && "open" in props.humanReplyWindow) {
      await responseSlaService.trackWindow(
        { workspaceId, conversationIds: [conversationId], tx: props.tx },
        update,
      )
    } else {
      await update(tx)
    }
    if (!props.tx) {
      await this.invalidate({ workspaceId, ids: [conversationId] })
    }
  }

  // ─── Bot state helpers ───────────────────────────────────────────────────

  async disableBotState(
    props: ReopenWindowOption & {
      workspaceId: string
      conversations: { id: string; contactId: string }[]
      userId?: string
      triggerContext: TriggerContext
      tx?: DatabaseClient
    },
  ): Promise<void> {
    await this.updateBotEnabled({
      workspaceId: props.workspaceId,
      ids: props.conversations.map((c) => c.id),
      botEnabled: false,
      reopenUnansweredHumanReplyWindow: props.reopenUnansweredHumanReplyWindow,
      tx: props.tx,
    })

    const attributions = await this.resolveAnalyticsAttribution({
      workspaceId: props.workspaceId,
      contactIds: props.conversations.map((conv) => conv.contactId),
    })
    for (const conv of props.conversations) {
      await emitConversationTransferredToHuman(
        props.workspaceId,
        conv.contactId,
        conv.id,
        props.userId,
      )

      emit("analytics:dashboard", {
        eventType: "conversation:transferred_to_human",
        workspaceId: props.workspaceId,
        conversationId: conv.id,
        occurredAt: new Date(),
        ...attributions.get(conv.contactId),
        metadata: { triggerContext: props.triggerContext },
      })
    }
  }

  async enableBotState(props: {
    workspaceId: string
    conversations: { id: string; contactId: string }[]
    userId?: string
    triggerContext: TriggerContext
    tx?: DatabaseClient
  }): Promise<void> {
    await this.updateBotEnabled({
      workspaceId: props.workspaceId,
      ids: props.conversations.map((c) => c.id),
      botEnabled: true,
      botResumeAt: null,
      tx: props.tx,
    })

    const attributions = await this.resolveAnalyticsAttribution({
      workspaceId: props.workspaceId,
      contactIds: props.conversations.map((conv) => conv.contactId),
    })
    for (const conv of props.conversations) {
      await emitConversationTransferredToBot(
        props.workspaceId,
        conv.contactId,
        conv.id,
        props.userId,
      )

      emit("analytics:dashboard", {
        eventType: "conversation:transferred_to_bot",
        workspaceId: props.workspaceId,
        conversationId: conv.id,
        occurredAt: new Date(),
        ...attributions.get(conv.contactId),
        metadata: { triggerContext: props.triggerContext },
      })
    }
  }

  async setBotEnabledByIds(props: {
    workspaceId: string
    ids: string[]
    botEnabled: boolean
    userId?: string
    triggerContext: TriggerContext
    tx?: DatabaseClient
  }): Promise<void> {
    const { workspaceId, ids, botEnabled, userId, triggerContext, tx } = props
    const conversations = await this.findManyByIds({ workspaceId, ids, tx })

    if (botEnabled) {
      await this.enableBotState({
        workspaceId,
        conversations,
        userId,
        triggerContext,
        tx,
      })
    } else {
      await this.disableBotState({
        workspaceId,
        conversations,
        userId,
        triggerContext,
        tx,
      })
    }
  }

  async ensureActive(
    conversation: Pick<
      ConversationModel,
      "id" | "workspaceId" | "contactId" | "botEnabled" | "botResumeAt"
    >,
    tx?: DatabaseClient,
  ): Promise<boolean> {
    if (conversation.botEnabled) {
      return true
    }

    if (!conversation.botResumeAt || conversation.botResumeAt > new Date()) {
      return false
    }

    await this.enableBotState({
      workspaceId: conversation.workspaceId,
      conversations: [
        { id: conversation.id, contactId: conversation.contactId },
      ],
      triggerContext: {
        triggerSource: "system",
        triggerHandler: "ensureActive",
        triggerType: "bot_auto_resume",
      },
      tx,
    })

    return true
  }

  // ─── Cache ───────────────────────────────────────────────────────────────

  async invalidate(props: {
    workspaceId: string
    ids?: string[]
  }): Promise<void> {
    const tags = [
      this.cachePrefix,
      `${this.cachePrefix}:${props.workspaceId}`,
      ...(props.ids?.map((id) => `${this.cachePrefix}:${id}`) ?? []),
    ]
    await this.invalidateCacheTags(tags)
  }

  /**
   * Conversation + contact, for the hot send-flow-step path (do NOT use
   * `findWithFullRelations` here — it fetches far more). Unscoped by `id`
   * only — safe today because its sole caller (`send-flow-step.ts`) is the
   * entry point that resolves the workspace *from* this conversation lookup,
   * so no `workspaceId` exists yet to filter by.
   */
  async findByIdWithContactUnscoped(props: {
    id: string
    tx?: DatabaseClient
  }): Promise<
    (ConversationModel & { contact: ContactModel | null }) | undefined
  > {
    const { id, tx = db } = props
    return await tx.query.conversationModel.findFirst({
      where: { id },
      with: { contact: true },
    })
  }

  /**
   * Inbound-message activity write — owns the transaction: contact-inbox
   * tracking update, an optional contact location write, and the
   * conversation's `lastActivityAt` advance (via `updateFlowStepState`
   * instead of a raw `tx.update`). Moved from
   * `received-message.ts`'s `persistNewMessageSideEffects`.
   *
   * NOTE: `updateFlowStepState`'s WHERE includes `workspaceId` — the raw
   * worker version did not scope by `workspaceId` on this UPDATE. Safe here
   * because the conversation is already loaded workspace-scoped upstream,
   * but this is a deliberate behavior change — call it out in the PR body.
   */
  async recordInboundActivity(props: {
    workspaceId: string
    conversationId: string
    contactInboxId: string
    contactId: string
    tracking: ContactInboxTrackingData
    contactLocation?: ContactModel["location"] | null
    at: Date
    /** Contact's own inbox read cursor, advanced with an inbound message. */
    contactLastReadAt?: Date
    /** Set only for contact-authored messages; drives the "No admin reply" filter. */
    contactRepliedAt?: Date
    /**
     * Native-app outgoing echo (a human replied outside the product): closes
     * the DM waiting window without emitting a response event.
     */
    isExternalHumanEcho?: boolean
  }): Promise<ContactInboxTrackingInvalidation | null> {
    const {
      workspaceId,
      conversationId,
      contactInboxId,
      contactId,
      tracking,
      contactLocation,
      at,
      contactLastReadAt,
      contactRepliedAt,
      isExternalHumanEcho,
    } = props
    const humanReplyWindow = resolveInboundWindow({
      at,
      contactRepliedAt,
      isExternalHumanEcho,
    })

    return await db.transaction(async (tx) => {
      const invalidation = await contactInboxService.updateTracking({
        tx,
        contactInboxId,
        contactId,
        workspaceId,
        data: tracking,
      })

      if (contactLocation) {
        await contactService.update(
          { workspaceId, id: contactId },
          { location: contactLocation },
          tx,
        )
      }

      await this.updateFlowStepState({
        tx,
        workspaceId,
        conversationId,
        lastActivityAt: at,
        ...(contactLastReadAt ? { contactLastReadAt } : {}),
        ...(contactRepliedAt ? { contactRepliedAt } : {}),
        ...(humanReplyWindow ? { humanReplyWindow } : {}),
      })

      return invalidation
    })
  }

  /**
   * Outbound flow-step send activity — owns the transaction:
   * `recordOutboundMessageCreated` + `updateFlowStepState` (advances
   * `currentStep`/`lastStep`/`lastActivityAt`). Moved from
   * `chat/handlers/send-flow-step.ts`'s `sendFlowStep`.
   */
  async recordOutboundFlowStep(props: {
    workspaceId: string
    conversationId: string
    contactInboxId: string
    contactId: string
    at: Date
    bumpActivity?: boolean
    lastStep?: string | null
    currentStep?: string | null
    /** Bot send closes the DM waiting window unless false (bulk/proactive). */
    closeHumanReplyWindow?: boolean
  }): Promise<ContactInboxTrackingInvalidation | null> {
    const {
      workspaceId,
      conversationId,
      contactInboxId,
      contactId,
      at,
      bumpActivity = true,
      lastStep,
      currentStep,
      closeHumanReplyWindow: shouldCloseWindow = true,
    } = props

    return await db.transaction(async (tx) => {
      const invalidation =
        await contactInboxService.recordOutboundMessageCreated({
          tx,
          contactInboxId,
          contactId,
          workspaceId,
          at,
        })

      await this.updateFlowStepState({
        tx,
        workspaceId,
        conversationId,
        ...(bumpActivity ? { lastActivityAt: at } : {}),
        lastStep,
        currentStep,
        ...(shouldCloseWindow
          ? { humanReplyWindow: { close: at, actor: "bot" as const } }
          : {}),
      })

      return invalidation
    })
  }

  /**
   * Outbound message activity (chat / template sends) — owns the
   * transaction: `recordOutboundMessageCreated` + `updateFlowStepState`
   * (`lastActivityAt` only). Shared by `sendChatMessage`,
   * `send-messenger-template.ts`, and `send-whatsapp-template.ts` — write
   * once, call from all three.
   *
   * NOTE: `updateFlowStepState`'s WHERE includes `workspaceId` — the raw
   * worker version's `tx.update(conversationModel)` scoped only by `id`.
   * Safe here (conversation is already workspace-scoped upstream) but a
   * deliberate behavior change — call it out in the PR body.
   */
  async recordOutboundMessageActivity(props: {
    workspaceId: string
    conversationId: string
    contactInboxId: string
    contactId: string
    at: Date
    bumpActivity?: boolean
    /** Bot send closes the DM waiting window unless false (bulk/proactive). */
    closeHumanReplyWindow?: boolean
  }): Promise<ContactInboxTrackingInvalidation | null> {
    const {
      workspaceId,
      conversationId,
      contactInboxId,
      contactId,
      at,
      bumpActivity = true,
      closeHumanReplyWindow: shouldCloseWindow = true,
    } = props

    return await db.transaction(async (tx) => {
      const invalidation =
        await contactInboxService.recordOutboundMessageCreated({
          tx,
          contactInboxId,
          contactId,
          workspaceId,
          at,
        })

      await this.updateFlowStepState({
        tx,
        workspaceId,
        conversationId,
        ...(bumpActivity ? { lastActivityAt: at } : {}),
        ...(shouldCloseWindow
          ? { humanReplyWindow: { close: at, actor: "bot" as const } }
          : {}),
      })

      return invalidation
    })
  }

  /**
   * Per-assignee open-conversation counts for round-robin allocation
   * (`step-handlers.ts`'s `stepAutoAssignConversation`). Accepts the raw
   * `filterConditions` `SQL[]` built by the caller (e.g. the "last N hours"
   * rule) rather than a semantic filter object — a documented fallback to
   * avoid a larger move of `filterConversationConditions` construction.
   */
  async countByAssignee(props: {
    workspaceId: string
    filterConditions: SQL[]
    userIds: string[]
    inboxTeamIds: string[]
    tx?: DatabaseClient
  }): Promise<
    Array<{
      assignedUserId: string | null
      assignedInboxTeamId: string | null
      conversationsCount: number
    }>
  > {
    const {
      workspaceId,
      filterConditions,
      userIds,
      inboxTeamIds,
      tx = db,
    } = props
    return await tx
      .select({
        assignedUserId: conversationModel.assignedUserId,
        assignedInboxTeamId: conversationModel.assignedInboxTeamId,
        conversationsCount: sql<number>`cast(count(${conversationModel.id}) as int)`,
      })
      .from(conversationModel)
      .groupBy(
        conversationModel.assignedUserId,
        conversationModel.assignedInboxTeamId,
      )
      .where(
        and(
          eq(conversationModel.workspaceId, workspaceId),
          ...filterConditions,
          and(
            or(
              inArray(conversationModel.assignedUserId, userIds),
              inArray(conversationModel.assignedInboxTeamId, inboxTeamIds),
            ),
          ),
        ),
      )
  }

  /**
   * `trigger/services/action-executor.ts` execute: the trigger action's own
   * conversation lookup, ordered by `createdAt` desc and workspace-scoped.
   * Distinct from `findLatestByContact` (orders by `lastActivityAt`, not
   * workspace-scoped) — do not reuse that one here.
   */
  async findLatestCreatedByContact(props: {
    workspaceId: string
    contactId: string
    tx?: DatabaseClient
  }): Promise<ConversationModel | undefined> {
    const { tx = db, workspaceId, contactId } = props
    return await tx.query.conversationModel.findFirst({
      where: { contactId, workspaceId },
      orderBy: { createdAt: "desc" },
    })
  }
}

export const conversationService = new ConversationService()
