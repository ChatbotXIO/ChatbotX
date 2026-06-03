import {
  and,
  type DatabaseClient,
  db,
  eq,
  inArray,
} from "@chatbotx.io/database/client"
import { conversationModel } from "@chatbotx.io/database/schema"
import type {
  AttachmentModel,
  ContactCustomFieldModel,
  ContactInboxModel,
  ContactModel,
  ContactNoteModel,
  ContactsOnSequenceModel,
  ConversationModel,
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
import { withCache } from "@chatbotx.io/redis"
import { BaseService } from "../base.service"
import { notFoundException } from "../errors"

const BOT_DISABLE_DURATION_MS = 24 * 60 * 60 * 1000

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
  contactInboxes: ContactInboxModel[]
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
  contactInboxes: ContactInboxModel[]
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

class ConversationService extends BaseService {
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
    orderBy?: Record<string, unknown>
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
        contactInboxes: true,
        messages: true,
        assignedUser: true,
        assignedInboxTeam: true,
      },
    })
    return result as ConversationWithFullRelations | undefined
  }

  // ─── Writes ──────────────────────────────────────────────────────────────

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
      .set({ archivedAt })
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
    }

    for (const conv of conversations) {
      emit("analytics:dashboard", {
        eventType,
        workspaceId,
        conversationId: conv.id,
        occurredAt: new Date(),
        metadata: { triggerContext },
      })
    }
  }

  async updateAssignment(props: {
    workspaceId: string
    conversations: { id: string; contactId: string }[]
    assignedUserId: string | null
    assignedInboxTeamId: string | null
    assignedBy?: string
    triggerContext: TriggerContext
    tx?: DatabaseClient
  }): Promise<ConversationModel[]> {
    const {
      workspaceId,
      conversations,
      assignedUserId,
      assignedInboxTeamId,
      triggerContext,
      tx = db,
    } = props
    const ids = conversations.map((c) => c.id)
    const updated = await tx
      .update(conversationModel)
      .set({ assignedUserId, assignedInboxTeamId })
      .where(inArray(conversationModel.id, ids))
      .returning()
    await this.invalidate({ workspaceId, ids })

    const assignedTo = assignedUserId || assignedInboxTeamId
    for (const conv of conversations) {
      if (assignedTo) {
        await emitConversationAssigned(
          workspaceId,
          conv.contactId,
          conv.id,
          assignedTo,
          props.assignedBy,
        )
        emit("analytics:dashboard", {
          eventType: "conversation:assigned",
          workspaceId,
          conversationId: conv.id,
          toAssignee: assignedTo,
          occurredAt: new Date(),
          metadata: { triggerContext },
        })
      } else {
        await emitConversationUnassigned(
          workspaceId,
          conv.contactId,
          conv.id,
          props.assignedBy,
        )
        emit("analytics:dashboard", {
          eventType: "conversation:unassigned",
          workspaceId,
          conversationId: conv.id,
          occurredAt: new Date(),
          metadata: { triggerContext },
        })
      }
    }

    return updated
  }

  async updateBotEnabled(props: {
    workspaceId: string
    ids: string[]
    botEnabled: boolean
    botResumeAt?: Date | null
    tx?: DatabaseClient
  }): Promise<void> {
    const { workspaceId, ids, botEnabled, tx = db } = props
    let botResumeAt: Date | null
    if (props.botResumeAt !== undefined) {
      botResumeAt = props.botResumeAt
    } else if (botEnabled) {
      botResumeAt = null
    } else {
      botResumeAt = new Date(Date.now() + BOT_DISABLE_DURATION_MS)
    }
    await tx
      .update(conversationModel)
      .set({ botEnabled, botResumeAt })
      .where(
        and(
          eq(conversationModel.workspaceId, workspaceId),
          inArray(conversationModel.id, ids),
        ),
      )
    await this.invalidate({ workspaceId, ids })
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

    emit("analytics:dashboard", {
      eventType: followed ? "conversation:followed" : "conversation:unfollowed",
      workspaceId,
      conversationId: id,
      occurredAt: new Date(),
      metadata: { triggerContext },
    })
  }

  async updateReadStatus(props: {
    workspaceId: string
    id: string
    agentLastReadAt: Date | null
    tx?: DatabaseClient
  }): Promise<void> {
    const { workspaceId, id, agentLastReadAt, tx = db } = props
    await tx
      .update(conversationModel)
      .set({ agentLastReadAt })
      .where(
        and(
          eq(conversationModel.id, id),
          eq(conversationModel.workspaceId, workspaceId),
        ),
      )
    await this.invalidate({ workspaceId, ids: [id] })
  }

  // ─── Bot state helpers ───────────────────────────────────────────────────

  async disableBotState(props: {
    workspaceId: string
    conversations: { id: string; contactId: string }[]
    userId?: string
    triggerContext: TriggerContext
    tx?: DatabaseClient
  }): Promise<void> {
    await this.updateBotEnabled({
      workspaceId: props.workspaceId,
      ids: props.conversations.map((c) => c.id),
      botEnabled: false,
      tx: props.tx,
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
        metadata: { triggerContext: props.triggerContext },
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
}

export const conversationService = new ConversationService()
