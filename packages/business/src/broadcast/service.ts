import {
  and,
  asc,
  count,
  db,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  type SQL,
} from "@chatbotx.io/database/client"
import {
  type ChannelType,
  dmConversationUsesSourceId,
  requiresRecentInteractionWindow,
} from "@chatbotx.io/database/partials"
import {
  buildContactInboxContactFilterSQL,
  contactInboxInteractedWithin24hSQL,
  pruneEmailPhoneFilterConditions,
} from "@chatbotx.io/database/queries"
import {
  broadcastModel,
  contactInboxModel,
  contactModel,
  conversationModel,
  integrationMessengerModel,
  integrationWhatsappModel,
  messengerMessageTemplateModel,
  whatsappMessageTemplateModel,
} from "@chatbotx.io/database/schema"
import { chunkById } from "@chatbotx.io/database/utils"
import { BaseService } from "../base.service"
import { inboxService } from "../inbox/service"
import type {
  BroadcastAudienceInput,
  BroadcastAudiencePreviewRow,
  BroadcastTemplateDetail,
} from "./schema"

const DEFAULT_CHUNK_SIZE = 1000
const OPTION_LIST_LIMIT = 500
const DEFAULT_PREVIEW_PER_PAGE = 20
const MAX_PREVIEW_PER_PAGE = 50

type ContactInboxRow = typeof contactInboxModel.$inferSelect
type SelectOptionRow = { id: string; name: string }

class BroadcastService extends BaseService {
  async listOptions(input: {
    workspaceId: string
    channel: ChannelType
  }): Promise<SelectOptionRow[]> {
    return await db
      .select({
        id: broadcastModel.id,
        name: broadcastModel.name,
      })
      .from(broadcastModel)
      .where(
        and(
          eq(broadcastModel.workspaceId, input.workspaceId),
          eq(broadcastModel.channel, input.channel),
        ),
      )
      .orderBy(desc(broadcastModel.createdAt))
      .limit(OPTION_LIST_LIMIT)
  }

  private buildAudienceWhere(
    inboxIds: string[],
    input: BroadcastAudienceInput,
  ): SQL | undefined {
    const contactFilter = pruneEmailPhoneFilterConditions(
      input.contactFilter,
      input.canViewEmailAndPhone !== false,
    )

    return and(
      inArray(contactInboxModel.inboxId, inboxIds),
      contactFilter
        ? buildContactInboxContactFilterSQL({
            contactIdColumn: contactInboxModel.contactId,
            workspaceId: input.workspaceId,
            contactFilter,
          })
        : undefined,
      requiresRecentInteractionWindow(input.subaction)
        ? contactInboxInteractedWithin24hSQL()
        : undefined,
    )
  }

  private resolveInboxIds(input: BroadcastAudienceInput): Promise<string[]> {
    return inboxService.resolveBroadcastInboxIds({
      workspaceId: input.workspaceId,
      channels: input.channels,
      integrationWhatsappId: input.integrationWhatsappId,
      integrationMessengerId: input.integrationMessengerId,
    })
  }

  // A broadcast's audience is scoped to a single channel. TikTok stores its DM
  // conversation with a non-null `sourceId` (the channel `conversation_id`);
  // every other channel keeps the `sourceId IS NULL` DM convention. Keeping this
  // decision in one predicate mirrors `findDMByContactIds` on the delivery side,
  // so the count/preview and the actual send agree on which conversation is the DM.
  private audienceUsesSourceIdDmConversation(
    input: BroadcastAudienceInput,
  ): boolean {
    return (input.channels ?? []).some((channel) =>
      dmConversationUsesSourceId(channel),
    )
  }

  private buildDmConversationJoin(
    input: BroadcastAudienceInput,
  ): SQL | undefined {
    return and(
      eq(conversationModel.contactId, contactInboxModel.contactId),
      this.audienceUsesSourceIdDmConversation(input)
        ? isNotNull(conversationModel.sourceId)
        : isNull(conversationModel.sourceId),
    )
  }

  private buildAssignedConversationWhere(
    input: BroadcastAudienceInput,
  ): SQL | undefined {
    return input.restrictToAssignedUserId
      ? and(
          eq(conversationModel.workspaceId, input.workspaceId),
          eq(conversationModel.assignedUserId, input.restrictToAssignedUserId),
        )
      : undefined
  }

  async countAudience(input: BroadcastAudienceInput): Promise<number> {
    const inboxIds = await this.resolveInboxIds(input)
    if (inboxIds.length === 0) {
      return 0
    }

    if (input.restrictToAssignedUserId) {
      const [result] = await db
        .select({ count: count() })
        .from(contactInboxModel)
        .innerJoin(conversationModel, this.buildDmConversationJoin(input))
        .where(
          and(
            this.buildAudienceWhere(inboxIds, input),
            this.buildAssignedConversationWhere(input),
          ),
        )

      return result?.count ?? 0
    }

    return db.$count(
      contactInboxModel,
      this.buildAudienceWhere(inboxIds, input),
    )
  }

  async listAudiencePreview(
    input: BroadcastAudienceInput & {
      page?: number | null
      perPage?: number | null
    },
  ): Promise<BroadcastAudiencePreviewRow[]> {
    const inboxIds = await this.resolveInboxIds(input)
    if (inboxIds.length === 0) {
      return []
    }

    const page = Math.max(1, input.page ?? 1)
    const perPage = Math.min(
      MAX_PREVIEW_PER_PAGE,
      Math.max(1, input.perPage ?? DEFAULT_PREVIEW_PER_PAGE),
    )

    const rows = await db
      .select({
        contactId: contactModel.id,
        contactInboxId: contactInboxModel.id,
        firstName: contactModel.firstName,
        lastName: contactModel.lastName,
        fullName: contactModel.fullName,
        avatar: contactModel.avatar,
        createdAt: contactModel.createdAt,
        channel: contactInboxModel.channel,
        conversationId: conversationModel.id,
      })
      .from(contactInboxModel)
      .innerJoin(contactModel, eq(contactModel.id, contactInboxModel.contactId))
      .leftJoin(conversationModel, this.buildDmConversationJoin(input))
      .where(
        and(
          this.buildAudienceWhere(inboxIds, input),
          eq(contactModel.workspaceId, input.workspaceId),
          this.buildAssignedConversationWhere(input),
        ),
      )
      .orderBy(asc(contactInboxModel.id))
      .limit(perPage)
      .offset((page - 1) * perPage)

    return rows.map((row) => ({
      ...row,
      channel: row.channel as ChannelType,
    }))
  }

  async getTemplateDetail(input: {
    workspaceId: string
    broadcastId: string
  }): Promise<BroadcastTemplateDetail | null> {
    const broadcast = await db.query.broadcastModel.findFirst({
      where: {
        id: input.broadcastId,
        workspaceId: input.workspaceId,
      },
      columns: {
        templateId: true,
        channel: true,
      },
    })

    if (!broadcast?.templateId) {
      return null
    }

    if (broadcast.channel === "whatsapp") {
      const [template] = await db
        .select({
          id: whatsappMessageTemplateModel.id,
          name: whatsappMessageTemplateModel.name,
          language: whatsappMessageTemplateModel.language,
          category: whatsappMessageTemplateModel.category,
          status: whatsappMessageTemplateModel.status,
          components: whatsappMessageTemplateModel.components,
          integrationName: integrationWhatsappModel.name,
        })
        .from(whatsappMessageTemplateModel)
        .innerJoin(
          integrationWhatsappModel,
          eq(
            integrationWhatsappModel.id,
            whatsappMessageTemplateModel.integrationWhatsappId,
          ),
        )
        .where(
          and(
            eq(whatsappMessageTemplateModel.id, broadcast.templateId),
            eq(integrationWhatsappModel.workspaceId, input.workspaceId),
          ),
        )
        .limit(1)

      return template ? { ...template, channel: "whatsapp" } : null
    }

    if (broadcast.channel === "messenger") {
      const [template] = await db
        .select({
          id: messengerMessageTemplateModel.id,
          name: messengerMessageTemplateModel.name,
          language: messengerMessageTemplateModel.language,
          category: messengerMessageTemplateModel.category,
          status: messengerMessageTemplateModel.status,
          parameterFormat: messengerMessageTemplateModel.parameterFormat,
          components: messengerMessageTemplateModel.components,
          integrationName: integrationMessengerModel.name,
        })
        .from(messengerMessageTemplateModel)
        .innerJoin(
          integrationMessengerModel,
          eq(
            integrationMessengerModel.id,
            messengerMessageTemplateModel.integrationMessengerId,
          ),
        )
        .where(
          and(
            eq(messengerMessageTemplateModel.id, broadcast.templateId),
            eq(integrationMessengerModel.workspaceId, input.workspaceId),
          ),
        )
        .limit(1)

      return template ? { ...template, channel: "messenger" } : null
    }

    return null
  }

  async forEachAudienceChunk(
    input: BroadcastAudienceInput & { chunkSize?: number },
    onChunk: (rows: ContactInboxRow[]) => Promise<boolean | undefined>,
  ): Promise<void> {
    const inboxIds = await this.resolveInboxIds(input)
    if (inboxIds.length === 0) {
      return
    }

    const where = this.buildAudienceWhere(inboxIds, input)
    const chunkSize = input.chunkSize ?? DEFAULT_CHUNK_SIZE

    await chunkById<ContactInboxRow>(
      (lastId) =>
        db
          .select()
          .from(contactInboxModel)
          .where(
            and(where, lastId ? gt(contactInboxModel.id, lastId) : undefined),
          )
          .orderBy(asc(contactInboxModel.id))
          .limit(chunkSize),
      { chunkSize, callback: onChunk },
    )
  }
}

export const broadcastService = new BroadcastService()
