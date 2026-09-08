import {
  and,
  asc,
  count,
  db,
  desc,
  eq,
  findOrFail,
  gt,
  inArray,
  isNotNull,
  isNull,
  ne,
  type SQL,
  sql,
} from "@chatbotx.io/database/client"
import {
  type BroadcastScheduleType,
  type BroadcastStatus,
  type BroadcastSubaction,
  type BroadcastTerminalStatus,
  broadcastStatuses,
  type ChannelType,
  dmConversationUsesSourceId,
  findBroadcastChannelCapability,
  requiresRecentInteractionWindow,
} from "@chatbotx.io/database/partials"
import {
  buildContactInboxContactFilterSQL,
  type ContactFilterCriteriaInput,
  contactInboxInteractedWithin24hSQL,
  pruneEmailPhoneFilterConditions,
} from "@chatbotx.io/database/queries"
import {
  broadcastModel,
  contactInboxModel,
  contactModel,
  contactsOnBroadcastsModel,
  conversationModel,
  integrationMessengerModel,
  integrationWhatsappModel,
  messengerMessageTemplateModel,
  whatsappMessageTemplateModel,
} from "@chatbotx.io/database/schema"
import type {
  BroadcastModel,
  FlowModel,
  IntegrationMessengerModel,
  IntegrationWhatsappModel,
} from "@chatbotx.io/database/types"
import { chunkById, likeContains } from "@chatbotx.io/database/utils"
import type { WaTemplateParams } from "@chatbotx.io/flow-config"
import { createId } from "@chatbotx.io/utils"
import { startOfMinute } from "date-fns"
import { BaseService } from "../base.service"
import { ChatbotXException, validationException } from "../errors"
import { inboxService } from "../inbox/service"
import type {
  BroadcastAudienceInput,
  BroadcastAudiencePreviewRow,
  BroadcastTemplateDetail,
} from "./schema"

const DEFAULT_BROADCAST_NAME = "Broadcast"
const DEFAULT_CHUNK_SIZE = 1000
const OPTION_LIST_LIMIT = 500
const CALENDAR_LIST_LIMIT = 500
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

export type BroadcastAwaitingFinalization = Pick<
  BroadcastModel,
  "id" | "workspaceId" | "contactCount"
> & { handoffCompletedAt: Date }

/** Flow-button binding stored alongside a Messenger template's params. */
export type BroadcastTemplateButton = {
  id: string
  label: string
  flowId?: string
}

/**
 * The validated create-broadcast payload, re-applied to an existing draft.
 * Structurally identical to the builder's `createBroadcastRequest` output —
 * declared here so the service stays independent of the app layer.
 */
export type UpdateDraftBroadcastData = {
  channel: ChannelType
  flowId?: string
  templateId?: string
  integrationWhatsappId?: string
  integrationMessengerId?: string
  templateData?: Record<string, unknown>
  buttons?: BroadcastTemplateButton[]
  subaction: BroadcastSubaction
  schedulesType: BroadcastScheduleType
  schedulesAt: string | null
  contactFilter?: ContactFilterCriteriaInput | null
  saveAsDraft?: boolean
}

export type BroadcastCalendarRow = BroadcastModel & {
  flow: Pick<FlowModel, "id" | "name"> | null
  integrationWhatsapp: Pick<IntegrationWhatsappModel, "id" | "name"> | null
  integrationMessenger: Pick<IntegrationMessengerModel, "id" | "name"> | null
}

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
        deletedAt: { isNull: true },
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
          isNull(broadcastModel.deletedAt),
        ),
      )
      .orderBy(desc(broadcastModel.createdAt))
      .limit(OPTION_LIST_LIMIT)
  }

  /**
   * Existing (not soft-deleted) broadcast ids from `ids`, scoped to the
   * workspace. Gates stats/contact-statistics lookups so a soft-deleted
   * broadcast reads as "not found" rather than resurfacing stale analytics.
   */
  async listExistingIds(input: {
    workspaceId: string
    ids: string[]
  }): Promise<string[]> {
    if (input.ids.length === 0) {
      return []
    }

    const rows = await db
      .select({ id: broadcastModel.id })
      .from(broadcastModel)
      .where(
        and(
          eq(broadcastModel.workspaceId, input.workspaceId),
          inArray(broadcastModel.id, input.ids),
          isNull(broadcastModel.deletedAt),
        ),
      )
    return rows.map((row) => row.id)
  }

  /**
   * Read-only send-path guard: is `broadcastId` still eligible to receive
   * sends right now? The template send handlers and the flow dispatch guard
   * call this before delivering — a stopped/cancelled/deleted broadcast
   * returns null so the caller skips the send instead of delivering into a
   * stopped run.
   */
  async findSendableBroadcast(
    broadcastId: string,
  ): Promise<{ id: string } | null> {
    const row = await db.query.broadcastModel.findFirst({
      where: {
        id: broadcastId,
        status: broadcastStatuses.enum.sending,
        deletedAt: { isNull: true },
      },
      columns: { id: true },
    })
    return row ?? null
  }

  /** `sending` broadcasts whose recipients were all handed off — the only ones finalizeBroadcasts may resolve. */
  async listAwaitingFinalization(): Promise<BroadcastAwaitingFinalization[]> {
    const rows = await db.query.broadcastModel.findMany({
      where: {
        status: broadcastStatuses.enum.sending,
        handoffCompletedAt: { isNotNull: true },
      },
      columns: {
        id: true,
        workspaceId: true,
        contactCount: true,
        handoffCompletedAt: true,
      },
    })
    return rows.filter(
      (row): row is BroadcastAwaitingFinalization =>
        row.handoffCompletedAt !== null,
    )
  }

  /** Every recipient row has been handed to its channel send job. Idempotent. */
  async markHandoffCompleted(input: { broadcastId: string }): Promise<boolean> {
    const rows = await db
      .update(broadcastModel)
      .set({ handoffCompletedAt: new Date() })
      .where(
        and(
          eq(broadcastModel.id, input.broadcastId),
          eq(broadcastModel.status, broadcastStatuses.enum.sending),
          isNull(broadcastModel.handoffCompletedAt),
        ),
      )
      .returning({ id: broadcastModel.id })
    return rows.length > 0
  }

  async countRecipientOutcomes(input: {
    broadcastId: string
  }): Promise<{ completed: number; failed: number }> {
    const [row] = await db
      .select({
        completed:
          sql<number>`count(*) filter (where ${contactsOnBroadcastsModel.deliveredAt} is not null or ${contactsOnBroadcastsModel.failedAt} is not null)`.mapWith(
            Number,
          ),
        failed:
          sql<number>`count(*) filter (where ${contactsOnBroadcastsModel.failedAt} is not null)`.mapWith(
            Number,
          ),
      })
      .from(contactsOnBroadcastsModel)
      .where(eq(contactsOnBroadcastsModel.broadcastId, input.broadcastId))
    return { completed: row?.completed ?? 0, failed: row?.failed ?? 0 }
  }

  /** Terminal transition; a lost race (no longer `sending`) or a missing hand-off is a no-op. */
  async completeSending(input: {
    broadcastId: string
    status: BroadcastTerminalStatus
  }): Promise<boolean> {
    const rows = await db
      .update(broadcastModel)
      .set({ status: broadcastStatuses.enum[input.status] })
      .where(
        and(
          eq(broadcastModel.id, input.broadcastId),
          eq(broadcastModel.status, broadcastStatuses.enum.sending),
          isNotNull(broadcastModel.handoffCompletedAt),
        ),
      )
      .returning({ id: broadcastModel.id })
    return rows.length > 0
  }

  /** Shared workspace + draft-status scope reused by scheduleDraft and updateDraft. */
  private draftScope(workspaceId: string, broadcastId: string) {
    return and(
      eq(broadcastModel.id, broadcastId),
      eq(broadcastModel.workspaceId, workspaceId),
      eq(broadcastModel.status, broadcastStatuses.enum.draft),
      isNull(broadcastModel.deletedAt),
    )
  }

  /**
   * Shared workspace + current-status + not-deleted scope reused by every
   * status transition (moveToDraft, stopSending, resumeSending). Pinning the
   * `fromStatus` here is what makes each transition a single conditional
   * UPDATE rather than a read-then-write.
   */
  private transitionScope(
    workspaceId: string,
    broadcastId: string,
    fromStatus: BroadcastStatus,
  ) {
    return and(
      eq(broadcastModel.id, broadcastId),
      eq(broadcastModel.workspaceId, workspaceId),
      eq(broadcastModel.status, broadcastStatuses.enum[fromStatus]),
      isNull(broadcastModel.deletedAt),
    )
  }

  async scheduleDraft(input: {
    workspaceId: string
    broadcastId: string
    schedulesType: BroadcastScheduleType
    schedulesAt: Date
  }): Promise<{ id: string }> {
    const [row] = await db
      .update(broadcastModel)
      .set({
        status: broadcastStatuses.enum.scheduled,
        schedulesType: input.schedulesType,
        schedulesAt: input.schedulesAt,
      })
      .where(this.draftScope(input.workspaceId, input.broadcastId))
      .returning({ id: broadcastModel.id })

    if (!row) {
      throw new ChatbotXException("Broadcast is not a draft")
    }
    return row
  }

  /**
   * `scheduled` -> `draft`. Bumps `resumeCount` (the dispatch epoch) so a
   * still-running stale `prepareBroadcast` for the old schedule loses its
   * pinned promotion UPDATE if this round-trips back through `scheduleDraft`.
   */
  async moveToDraft(input: {
    workspaceId: string
    broadcastId: string
  }): Promise<{ id: string }> {
    const [row] = await db
      .update(broadcastModel)
      .set({
        status: broadcastStatuses.enum.draft,
        contactCount: null,
        handoffCompletedAt: null,
        resumeCount: sql`${broadcastModel.resumeCount} + 1`,
      })
      .where(
        this.transitionScope(input.workspaceId, input.broadcastId, "scheduled"),
      )
      .returning({ id: broadcastModel.id })

    if (!row) {
      throw new ChatbotXException("Broadcast is no longer scheduled")
    }
    return row
  }

  /** `sending` -> `cancelled`. */
  async stopSending(input: {
    workspaceId: string
    broadcastId: string
  }): Promise<{ id: string }> {
    const [row] = await db
      .update(broadcastModel)
      .set({ status: broadcastStatuses.enum.cancelled })
      .where(
        this.transitionScope(input.workspaceId, input.broadcastId, "sending"),
      )
      .returning({ id: broadcastModel.id })

    if (!row) {
      throw new ChatbotXException("Broadcast is not in progress")
    }
    return row
  }

  /**
   * `cancelled` -> `sending`, in a single pinned UPDATE. Clearing
   * `handoffCompletedAt` here (rather than a separate statement) closes both
   * the stop-after-handoff hole and the finalize race: `completeSending`
   * requires `handoffCompletedAt IS NOT NULL`, so a stale finalize read that
   * ran before this UPDATE loses.
   *
   * `contactCount IS NOT NULL` excludes never-prepared cancelled rows —
   * e.g. a `scheduled` broadcast cancelled by workspace teardown
   * (`campaign-cleanup.ts`) before `prepareBroadcast` ever ran. Those rows
   * have no `ContactOnBroadcast` recipients, so resuming them would flip
   * straight to `sent` with zero deliveries. `contactCount` survives
   * `stopSending` and is only cleared by `moveToDraft`, so it reliably
   * distinguishes "was actually sending" from "never prepared".
   */
  async resumeSending(input: {
    workspaceId: string
    broadcastId: string
  }): Promise<{ id: string }> {
    const [row] = await db
      .update(broadcastModel)
      .set({
        status: broadcastStatuses.enum.sending,
        handoffCompletedAt: null,
        resumeCount: sql`${broadcastModel.resumeCount} + 1`,
      })
      .where(
        and(
          this.transitionScope(
            input.workspaceId,
            input.broadcastId,
            "cancelled",
          ),
          isNotNull(broadcastModel.contactCount),
        ),
      )
      .returning({ id: broadcastModel.id })

    if (!row) {
      throw new ChatbotXException("Broadcast is not stopped")
    }
    return row
  }

  /**
   * Soft-deletes broadcasts by stamping `deletedAt`. A `sending` broadcast
   * can never be soft-deleted (the `purgeBroadcasts` hard-delete path assumes
   * recipients are no longer being actively dispatched), so it is silently
   * excluded rather than erroring — `deletedCount < requestedCount` tells the
   * caller some ids were skipped (already deleted, foreign, or sending).
   */
  async softDeleteBroadcasts(input: {
    workspaceId: string
    ids: string[]
  }): Promise<{ deletedCount: number; requestedCount: number }> {
    const requestedCount = input.ids.length
    if (requestedCount === 0) {
      return { deletedCount: 0, requestedCount: 0 }
    }

    const rows = await db
      .update(broadcastModel)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(broadcastModel.workspaceId, input.workspaceId),
          inArray(broadcastModel.id, input.ids),
          ne(broadcastModel.status, broadcastStatuses.enum.sending),
          isNull(broadcastModel.deletedAt),
        ),
      )
      .returning({ id: broadcastModel.id })

    return { deletedCount: rows.length, requestedCount }
  }

  /**
   * Re-arms one recipient row for a resumed broadcast so `processBroadcastContacts`
   * picks it up again. A row that already `failedAt` stays failed — resume
   * only replays rows that were merely in-flight, not ones that terminally
   * failed. `contactKey` supports both callers: template send handlers know
   * `contactId`; the flow guard's job data only carries `contactInboxId`.
   */
  async resetContactForResume(input: {
    broadcastId: string
    contactKey: { contactId: string } | { contactInboxId: string }
  }): Promise<void> {
    const keyCondition =
      "contactId" in input.contactKey
        ? eq(contactsOnBroadcastsModel.contactId, input.contactKey.contactId)
        : eq(
            contactsOnBroadcastsModel.contactInboxId,
            input.contactKey.contactInboxId,
          )

    await db
      .update(contactsOnBroadcastsModel)
      .set({ sent: false })
      .where(
        and(
          eq(contactsOnBroadcastsModel.broadcastId, input.broadcastId),
          keyCondition,
          isNull(contactsOnBroadcastsModel.failedAt),
        ),
      )
  }

  /**
   * Marks a recipient sent only while its broadcast is still `sending` —
   * replaces an unconditional mark so a contact processed by a stale job
   * (after `stopSending`/`moveToDraft` already moved the broadcast on)
   * cannot resurrect a row that resume/cleanup has since reset or purged.
   */
  async markContactSentIfSending(input: {
    broadcastId: string
    contactId: string
  }): Promise<void> {
    await db
      .update(contactsOnBroadcastsModel)
      .set({ sent: true })
      .where(
        and(
          eq(contactsOnBroadcastsModel.broadcastId, input.broadcastId),
          eq(contactsOnBroadcastsModel.contactId, input.contactId),
          sql`EXISTS (SELECT 1 FROM "Broadcast" b WHERE b.id = ${input.broadcastId} AND b.status = ${broadcastStatuses.enum.sending})`,
        ),
      )
  }

  /** The editable form of a broadcast: only a `draft` row may be reopened. */
  async findDraft(input: {
    workspaceId: string
    broadcastId: string
  }): Promise<BroadcastModel | null> {
    const row = await db.query.broadcastModel.findFirst({
      where: {
        id: input.broadcastId,
        workspaceId: input.workspaceId,
        status: broadcastStatuses.enum.draft,
        deletedAt: { isNull: true },
      },
    })
    return row ?? null
  }

  /**
   * Re-applies a validated create payload to an existing draft. `saveAsDraft`
   * decides whether the row stays a draft or becomes `scheduled`, mirroring
   * `createBroadcastAction`. The conditional WHERE (`draftScope`) is the guard:
   * a row that is no longer a draft — or belongs to another workspace — matches
   * nothing and the update is rejected rather than silently applied.
   */
  async updateDraft(input: {
    workspaceId: string
    broadcastId: string
    canViewEmailAndPhone: boolean
    data: UpdateDraftBroadcastData
  }): Promise<{ id: string; status: BroadcastStatus }> {
    const { workspaceId, data } = input

    this.assertDraftPayload(data)
    await this.assertBroadcastIntegrationsOwned({
      workspaceId,
      integrationWhatsappId: data.integrationWhatsappId,
      integrationMessengerId: data.integrationMessengerId,
    })

    const name = await this.resolveDraftBroadcastName({ workspaceId, data })
    const status = data.saveAsDraft
      ? broadcastStatuses.enum.draft
      : broadcastStatuses.enum.scheduled

    const [row] = await db
      .update(broadcastModel)
      .set({
        channel: data.channel,
        subaction: data.subaction,
        flowId: data.flowId ?? null,
        templateId: data.templateId ?? null,
        integrationWhatsappId: data.integrationWhatsappId ?? null,
        integrationMessengerId: data.integrationMessengerId ?? null,
        name,
        contactFilter:
          pruneEmailPhoneFilterConditions(
            data.contactFilter,
            input.canViewEmailAndPhone,
          ) ?? null,
        schedulesType: data.schedulesType,
        // Persist the minute-truncated time the schema validated against.
        schedulesAt: startOfMinute(new Date(data.schedulesAt ?? new Date())),
        // Only a template broadcast stores params. Without a templateId the
        // payload is a flow send, so a `templateData` the form left behind
        // (switching template -> flow) must not survive the edit.
        templateData:
          data.templateId && data.templateData
            ? { ...data.templateData, buttons: data.buttons ?? [] }
            : null,
        status,
      })
      .where(this.draftScope(workspaceId, input.broadcastId))
      .returning({ id: broadcastModel.id })

    if (!row) {
      throw new ChatbotXException("Broadcast is not a draft")
    }

    // `status` is the value we just wrote, so it needs no unsafe narrowing of
    // the `text`-widened enum column that `.returning()` would hand back.
    return { id: row.id, status }
  }

  /**
   * The channel/subaction/flow-or-template rules `createBroadcastAction`
   * enforces, as an ordered rule list so the first violated rule wins.
   */
  private assertDraftPayload(data: UpdateDraftBroadcastData): void {
    const capability = findBroadcastChannelCapability(data.channel)
    const rules: readonly { violated: boolean; message: string }[] = [
      { violated: !capability, message: "Unsupported broadcast channel" },
      {
        violated: !capability?.subactions.includes(data.subaction),
        message: "Unsupported broadcast subaction",
      },
      {
        violated: !(data.flowId || data.templateId),
        message: "Either flow or template must be selected",
      },
      {
        violated:
          Boolean(data.templateId) && !capability?.supportsTemplateBroadcast,
        message: "Template broadcasts are not supported for this channel",
      },
    ]

    const failed = rules.find((rule) => rule.violated)
    if (failed) {
      throw new ChatbotXException(failed.message)
    }
  }

  /**
   * Integration ids scope the audience, so a foreign id would let a broadcast
   * target another workspace's pages. Never trust them from the client.
   */
  private async assertBroadcastIntegrationsOwned(input: {
    workspaceId: string
    integrationWhatsappId?: string
    integrationMessengerId?: string
  }): Promise<void> {
    const [messenger, whatsapp] = await Promise.all([
      input.integrationMessengerId
        ? db.query.integrationMessengerModel.findFirst({
            where: {
              id: input.integrationMessengerId,
              workspaceId: input.workspaceId,
            },
            columns: { id: true },
          })
        : true,
      input.integrationWhatsappId
        ? db.query.integrationWhatsappModel.findFirst({
            where: {
              id: input.integrationWhatsappId,
              workspaceId: input.workspaceId,
            },
            columns: { id: true },
          })
        : true,
    ])

    if (!(messenger && whatsapp)) {
      throw new ChatbotXException("Integration not found")
    }
  }

  /** Same derivation as create: template name wins, else the flow's name. */
  private async resolveDraftBroadcastName(input: {
    workspaceId: string
    data: UpdateDraftBroadcastData
  }): Promise<string> {
    const { data, workspaceId } = input

    const flowName = data.flowId
      ? await this.requireFlowName(workspaceId, data.flowId)
      : null

    const templateName = data.templateId
      ? await this.requireTemplateName({
          workspaceId,
          channel: data.channel,
          templateId: data.templateId,
          integrationWhatsappId: data.integrationWhatsappId,
          integrationMessengerId: data.integrationMessengerId,
        })
      : null

    return templateName ?? flowName ?? DEFAULT_BROADCAST_NAME
  }

  private async requireFlowName(
    workspaceId: string,
    flowId: string,
  ): Promise<string> {
    const flow = await db.query.flowModel.findFirst({
      where: { workspaceId, id: flowId },
      columns: { name: true },
    })

    if (!flow) {
      throw new ChatbotXException("Flow not found")
    }
    return flow.name
  }

  private async requireTemplateName(input: {
    workspaceId: string
    channel: ChannelType
    templateId: string
    integrationWhatsappId?: string | null
    integrationMessengerId?: string | null
  }): Promise<string> {
    const name = await this.resolveTemplateBroadcastName(input)

    if (!name) {
      throw new ChatbotXException("Template not found")
    }
    return name
  }

  async listForCalendar(input: {
    workspaceId: string
    from: Date
    to: Date
    status?: BroadcastStatus
    name?: string
  }): Promise<BroadcastCalendarRow[]> {
    return await db.query.broadcastModel.findMany({
      where: {
        workspaceId: input.workspaceId,
        schedulesAt: { gte: input.from, lte: input.to },
        status: input.status,
        name: input.name ? { ilike: likeContains(input.name) } : undefined,
        deletedAt: { isNull: true },
      },
      with: {
        flow: { columns: { id: true, name: true } },
        integrationWhatsapp: { columns: { id: true, name: true } },
        integrationMessenger: { columns: { id: true, name: true } },
      },
      orderBy: { schedulesAt: "asc" },
      limit: CALENDAR_LIST_LIMIT,
    })
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
        deletedAt: { isNull: true },
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

  /**
   * Validates channel/subaction/flow-or-template rules, verifies any
   * integration ids and the flow/template actually belong to the workspace,
   * resolves the broadcast's stored `name`, inserts it, and audits — the
   * full `createBroadcastAction` body. Every validation failure throws
   * `validationException(field, message)` so the action can re-map it to a
   * `returnValidationErrors` payload on the same field.
   */
  async create(
    input: UpdateDraftBroadcastData & {
      workspaceId: string
      canViewEmailAndPhone: boolean
    },
  ): Promise<BroadcastModel> {
    const { workspaceId, canViewEmailAndPhone, buttons, saveAsDraft, ...rest } =
      input

    const capability = findBroadcastChannelCapability(rest.channel)
    if (!capability) {
      throw validationException("channel", "Unsupported broadcast channel")
    }
    if (!capability.subactions.includes(rest.subaction)) {
      throw validationException("subaction", "Unsupported broadcast subaction")
    }
    if (!(rest.flowId || rest.templateId)) {
      throw validationException(
        "flowId",
        "Either flow or template must be selected",
      )
    }
    if (rest.templateId && !capability.supportsTemplateBroadcast) {
      throw validationException(
        "templateId",
        "Template broadcasts are not supported for this channel",
      )
    }

    // Never trust integration ids from the client: they scope the audience,
    // so a foreign id would let a broadcast target another workspace's pages.
    // Checked independently so the validation error lands on the field that
    // actually failed (the original action validated each id on its own).
    if (rest.integrationMessengerId) {
      await this.assertBroadcastIntegrationsOwned({
        workspaceId,
        integrationMessengerId: rest.integrationMessengerId,
      }).catch(() => {
        throw validationException(
          "integrationMessengerId",
          "Integration not found",
        )
      })
    }
    if (rest.integrationWhatsappId) {
      await this.assertBroadcastIntegrationsOwned({
        workspaceId,
        integrationWhatsappId: rest.integrationWhatsappId,
      }).catch(() => {
        throw validationException(
          "integrationWhatsappId",
          "Integration not found",
        )
      })
    }

    let broadcastName = DEFAULT_BROADCAST_NAME
    if (rest.flowId) {
      broadcastName = await this.requireFlowName(
        workspaceId,
        rest.flowId,
      ).catch(() => {
        throw validationException("flowId", "Flow not found")
      })
    }

    if (rest.templateId) {
      const templateBroadcastName = await this.resolveTemplateBroadcastName({
        workspaceId,
        channel: rest.channel,
        templateId: rest.templateId,
        integrationMessengerId: rest.integrationMessengerId,
        integrationWhatsappId: rest.integrationWhatsappId,
      })

      if (!templateBroadcastName) {
        throw validationException("templateId", "Template not found")
      }

      broadcastName = templateBroadcastName
    }

    const contactFilter = pruneEmailPhoneFilterConditions(
      rest.contactFilter,
      canViewEmailAndPhone,
    )

    const [broadcast] = await db
      .insert(broadcastModel)
      .values({
        ...rest,
        contactFilter,
        name: broadcastName,
        workspaceId,
        status: saveAsDraft ? "draft" : "scheduled",
        schedulesAt: startOfMinute(new Date(rest.schedulesAt ?? new Date())),
        templateData: rest.templateData
          ? {
              ...(rest.templateData as Record<string, unknown>),
              buttons: buttons ?? [],
            }
          : null,
      })
      .returning()

    await this.audit("create", `created a new broadcast (#${broadcast.id})`)

    // A draft is never launched — it only leaves `draft` through
    // `scheduleBroadcastAction`, which records its own `launch` entry.
    if (rest.schedulesType === "now" && !saveAsDraft) {
      await this.audit("launch", `launched a broadcast (#${broadcast.id})`)
    }

    return broadcast
  }

  /**
   * Clones a `sent`/`failed` broadcast as a new immediately-scheduled one.
   * The transaction wraps a single insert — kept verbatim rather than
   * simplified, to avoid any semantic argument about what belongs inside it.
   */
  async resend(input: {
    workspaceId: string
    id: string
    contactFilter?: ContactFilterCriteriaInput | null
  }): Promise<BroadcastModel> {
    const broadcast = await findOrFail({
      table: broadcastModel,
      where: {
        id: input.id,
        workspaceId: input.workspaceId,
        deletedAt: { isNull: true },
      },
    })
    if (broadcast.status !== "sent" && broadcast.status !== "failed") {
      throw new ChatbotXException("Broadcast is not sent")
    }

    const newBroadcast = await db.transaction(async (tx) => {
      const inserted = await tx
        .insert(broadcastModel)
        .values({
          workspaceId: input.workspaceId,
          flowId: broadcast.flowId,
          integrationWhatsappId: broadcast.integrationWhatsappId,
          integrationMessengerId: broadcast.integrationMessengerId,
          channel: broadcast.channel,
          subaction: broadcast.subaction,
          templateId: broadcast.templateId,
          templateData: broadcast.templateData,
          status: "scheduled",
          schedulesType: "now",
          schedulesAt: new Date(),
          contactFilter: input.contactFilter,
          name: `${broadcast.name} (Resend)`,
          id: createId(),
        })
        .returning()
        .then((result) => result[0])

      return inserted
    })

    await this.audit("launch", `launched a broadcast (#${newBroadcast.id})`)

    return newBroadcast
  }
}

export const broadcastService = new BroadcastService()
