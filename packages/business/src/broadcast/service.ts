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
import type { WaTemplateParams } from "@chatbotx.io/flow-config"
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

// Separates the page name from the template name in an auto-generated broadcast
// name, e.g. "Acme WhatsApp - order_confirmation".
const BROADCAST_NAME_SEPARATOR = " - "

type ContactInboxRow = typeof contactInboxModel.$inferSelect
type SelectOptionRow = { id: string; name: string }

// Scopes a template lookup to a workspace, optionally narrowing it to the chosen
// integration so a template can only be paired with its own page.
type BroadcastTemplateLookup = {
  workspaceId: string
  templateId: string
  integrationWhatsappId?: string | null
  integrationMessengerId?: string | null
}

type BroadcastTemplateLoader = (
  lookup: BroadcastTemplateLookup,
) => Promise<BroadcastTemplateDetail | null>

class BroadcastService extends BaseService {
  async findByIdForResponse(input: {
    workspaceId: string
    broadcastId: string
  }): Promise<{
    id: string
    integrationWhatsappId: string | null
    templateData: WaTemplateParams | null
  } | null> {
    const row = await db.query.broadcastModel.findFirst({
      where: {
        id: input.broadcastId,
        workspaceId: input.workspaceId,
      },
      columns: {
        id: true,
        integrationWhatsappId: true,
        templateData: true,
      },
    })

    if (!row) {
      return null
    }

    return {
      ...row,
      templateData: row.templateData as WaTemplateParams | null,
    }
  }

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

  // One loader per template-capable channel. Each owns its own tables and the
  // integration id it scopes by, so callers dispatch by channel without a
  // per-channel branch and adding a channel means adding one entry here.
  private readonly templateLoaders: Partial<
    Record<ChannelType, BroadcastTemplateLoader>
  > = {
    whatsapp: (lookup) => this.loadWhatsappTemplateDetail(lookup),
    messenger: (lookup) => this.loadMessengerTemplateDetail(lookup),
  }

  private loadTemplateDetail(
    channel: ChannelType,
    lookup: BroadcastTemplateLookup,
  ): Promise<BroadcastTemplateDetail | null> {
    const loadDetail = this.templateLoaders[channel]
    return loadDetail ? loadDetail(lookup) : Promise.resolve(null)
  }

  private async loadWhatsappTemplateDetail(
    lookup: BroadcastTemplateLookup,
  ): Promise<BroadcastTemplateDetail | null> {
    const conditions = [
      eq(whatsappMessageTemplateModel.id, lookup.templateId),
      eq(integrationWhatsappModel.workspaceId, lookup.workspaceId),
    ]
    if (lookup.integrationWhatsappId) {
      conditions.push(
        eq(
          whatsappMessageTemplateModel.integrationWhatsappId,
          lookup.integrationWhatsappId,
        ),
      )
    }

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
      .where(and(...conditions))
      .limit(1)

    return template ? { ...template, channel: "whatsapp" } : null
  }

  private async loadMessengerTemplateDetail(
    lookup: BroadcastTemplateLookup,
  ): Promise<BroadcastTemplateDetail | null> {
    const conditions = [
      eq(messengerMessageTemplateModel.id, lookup.templateId),
      eq(integrationMessengerModel.workspaceId, lookup.workspaceId),
    ]
    if (lookup.integrationMessengerId) {
      conditions.push(
        eq(
          messengerMessageTemplateModel.integrationMessengerId,
          lookup.integrationMessengerId,
        ),
      )
    }

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
      .where(and(...conditions))
      .limit(1)

    return template ? { ...template, channel: "messenger" } : null
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

    return this.loadTemplateDetail(broadcast.channel as ChannelType, {
      workspaceId: input.workspaceId,
      templateId: broadcast.templateId,
    })
  }

  // Builds the stored broadcast name from the chosen template, prefixed with the
  // page name so broadcasts from different pages stay distinguishable in the
  // list. Returns null when the template does not belong to the workspace/page,
  // letting the caller surface a "template not found" validation error.
  async resolveTemplateBroadcastName(input: {
    workspaceId: string
    channel: ChannelType
    templateId: string
    integrationWhatsappId?: string | null
    integrationMessengerId?: string | null
  }): Promise<string | null> {
    const detail = await this.loadTemplateDetail(input.channel, {
      workspaceId: input.workspaceId,
      templateId: input.templateId,
      integrationWhatsappId: input.integrationWhatsappId,
      integrationMessengerId: input.integrationMessengerId,
    })

    if (!detail) {
      return null
    }

    return detail.integrationName
      ? `${detail.integrationName}${BROADCAST_NAME_SEPARATOR}${detail.name}`
      : detail.name
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
