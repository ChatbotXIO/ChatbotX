import {
  and,
  asc,
  count,
  type DatabaseClient,
  db,
  desc,
  eq,
  findOrFail,
  gt,
  ilike,
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
  broadcastSendsFlow,
  broadcastSendsTemplate,
  broadcastStatuses,
  type ChannelType,
  contactFilterFields,
  dmConversationUsesSourceId,
  findBroadcastChannelCapability,
  hasDuplicateBroadcastTarget,
  hasFlowAndTemplate,
  isTargetsFlowSendWithoutFlow,
  isTargetsTemplateSendWithoutTemplate,
  isTemplateSendWithoutPage,
  requiresRecentInteractionWindow,
  resolveBroadcastTargetMode,
  resolveBroadcastTemplateSend,
  usesBroadcastTargets,
  withBroadcastTargets,
} from "@chatbotx.io/database/partials"
import {
  buildContactInboxContactFilterSQL,
  type ContactFilterCriteriaInput,
  contactInboxInteractedWithin24hSQL,
  pruneEmailPhoneFilterConditions,
} from "@chatbotx.io/database/queries"
import {
  type BroadcastListInput,
  broadcastRepository,
} from "@chatbotx.io/database/repositories"
import {
  broadcastModel,
  broadcastTargetModel,
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
  BroadcastTargetModel,
  FlowModel,
  InboxModel,
  IntegrationMessengerModel,
  IntegrationWhatsappModel,
} from "@chatbotx.io/database/types"
import {
  chunkById,
  escapeLikePattern,
  getPaginationWithDefaults,
  likeContains,
} from "@chatbotx.io/database/utils"
import {
  findTemplateStartStep,
  stepTypes,
  type WaTemplateParams,
} from "@chatbotx.io/flow-config"
import { createId } from "@chatbotx.io/utils"
import { startOfMinute } from "date-fns"
import { BaseService } from "../base.service"
import { ChatbotXException, notFoundException } from "../errors"
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
// Separates the per-page segments of a multi-page broadcast name.
const BROADCAST_NAME_TARGET_SEPARATOR = " / "
const BROADCAST_NAME_MAX_LENGTH = 255
const APPROVED_TEMPLATE_STATUS = "APPROVED"

// A clone is named `"<base> (Copy N)"`. The label is the literal text between
// the base name and the copy number; the suffix regex strips an existing copy
// tag so a clone of a clone keeps a single, incrementing suffix.
const BROADCAST_COPY_LABEL = " (Copy "
const BROADCAST_COPY_SUFFIX = / \(Copy \d+\)$/
/** Escapes a string for safe interpolation into a `RegExp` source. */
const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

// The template start step each template-capable channel's flows open with;
// a channel without one has no page-bound flows to validate.
const templateStepTypeByChannel: Partial<Record<ChannelType, string>> = {
  whatsapp: stepTypes.enum.sendWaTemplateMessage,
  messenger: stepTypes.enum.sendMessengerTemplateMessage,
}

type ContactInboxRow = typeof contactInboxModel.$inferSelect
type SelectOptionRow = { id: string; name: string }

// Scopes a template lookup to a workspace, optionally narrowing it to the chosen
// integration so a template can only be paired with its own page.
type BroadcastTemplateLookup = {
  workspaceId: string
  templateIds: string[]
  integrationWhatsappId?: string | null
  integrationMessengerId?: string | null
}

type BroadcastTemplateLoader = (
  lookup: BroadcastTemplateLookup,
) => Promise<BroadcastTemplateDetail[]>

/**
 * One chosen template of a broadcast. A multi-page broadcast pins each
 * template to the page (`inboxId`) it was picked for; a legacy single-page
 * broadcast scopes by the integration id columns instead.
 */
export type BroadcastTemplateSelection = {
  templateId: string
  inboxId?: string | null
  integrationWhatsappId?: string | null
  integrationMessengerId?: string | null
}

/** One page of a multi-page broadcast as submitted by the form. */
export type BroadcastTargetInput = {
  inboxId: string
  /** The flow this page runs (a flow's template start step is bound to one page). */
  flowId?: string
  templateId?: string
  templateData?: Record<string, unknown>
  buttons?: BroadcastTemplateButton[]
}

/**
 * What the ownership check loaded about a payload's pages and flows: reused
 * by the name resolution so nothing is queried twice.
 */
type BroadcastTargetContext = {
  inboxes: Pick<InboxModel, "id" | "name">[]
  flows: Pick<FlowModel, "id" | "name">[]
}

const NO_TARGET_CONTEXT: BroadcastTargetContext = { inboxes: [], flows: [] }

/**
 * An editable draft: its target rows plus the inbox of each legacy
 * integration column, so a single-page draft saved before targets existed
 * can be reopened as a one-target form.
 */
export type BroadcastDraftRow = BroadcastModel & {
  targets: BroadcastTargetModel[]
  integrationWhatsapp: Pick<IntegrationWhatsappModel, "inboxId"> | null
  integrationMessenger: Pick<IntegrationMessengerModel, "inboxId"> | null
}

type BroadcastTargetRow = BroadcastTargetModel & {
  inbox: Pick<InboxModel, "id" | "name">
}

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
  /** Pages (with their own template) of a multi-page broadcast. */
  targets?: BroadcastTargetInput[]
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
  targets: BroadcastTargetRow[]
}

/**
 * Selections to validate/name a payload by: one per target that carries a
 * template, else the legacy single template scoped by its integration ids.
 */
export const broadcastTemplateSelections = (
  data: Pick<
    UpdateDraftBroadcastData,
    | "templateId"
    | "integrationWhatsappId"
    | "integrationMessengerId"
    | "targets"
  >,
): BroadcastTemplateSelection[] => {
  const targetSelections = (data.targets ?? []).flatMap((target) =>
    target.templateId
      ? [{ templateId: target.templateId, inboxId: target.inboxId }]
      : [],
  )
  if (targetSelections.length > 0 || !data.templateId) {
    return targetSelections
  }
  return [
    {
      templateId: data.templateId,
      integrationWhatsappId: data.integrationWhatsappId,
      integrationMessengerId: data.integrationMessengerId,
    },
  ]
}

// Only a template send stores params. Without a templateId the payload is a
// flow send, so a `templateData` the form left behind (switching template ->
// flow) must not survive.
const buildStoredTemplateData = (input: {
  templateId?: string | null
  templateData?: Record<string, unknown> | null
  buttons?: BroadcastTemplateButton[]
}): Record<string, unknown> | null =>
  input.templateId && input.templateData
    ? { ...input.templateData, buttons: input.buttons ?? [] }
    : null

/** The request field a broadcast validation failure points at. */
export type BroadcastValidationField =
  | "channel"
  | "subaction"
  | "flowId"
  | "templateId"
  | "targets"
  | "integrationWhatsappId"
  | "integrationMessengerId"

/**
 * A rejected create/edit payload. Carries the offending field so the app
 * layer can surface it as a field-level form error instead of a toast.
 * `code` must stay `"validation"` — `isValidationException`
 * (`apps/builder/src/lib/errors/validation-exception.ts`) narrows on that
 * exact code before trusting `.field`.
 */
export class BroadcastValidationException extends ChatbotXException {
  readonly field: BroadcastValidationField

  constructor(message: string, field: BroadcastValidationField) {
    super(message, "validation", 422)
    this.field = field
  }
}

type BroadcastPayloadRule = {
  violated: boolean
  message: string
  field: BroadcastValidationField
}

/**
 * The single normalization `create` and `updateDraft` both apply to an
 * already-validated payload before it is persisted — ownership checks,
 * naming, column build, and the target rows themselves all read from the
 * result, never from the raw payload again. Only a TARGETS-FORM send is
 * touched (template or flow, symmetrically):
 * - A draft (`saveAsDraft`) keeps every target, empty ones included, so
 *   reopening the draft preserves the page selection.
 * - A non-draft (scheduled/sending) drops targets with neither a
 *   `templateId` nor a `flowId` — they have nothing to deliver — and, if
 *   that empties the list entirely, throws rather than falling through:
 *   `buildBroadcastColumns`/`resolveBroadcastTargetMode` treats an empty
 *   `targets` array as `targetMode: "channel"` and restores the legacy
 *   single-page columns, which would blast the whole channel audience
 *   instead of the intended pages. `assertDraftPayload`'s
 *   `isTargetsTemplateSendWithoutTemplate`/`isTargetsFlowSendWithoutFlow`
 *   rules already refuse this payload before it reaches here for anything
 *   routed through `create`/`updateDraft`'s own validation; this throw is
 *   defense-in-depth so no other caller of this helper can silently fall
 *   back to channel mode.
 * A legacy channel-mode payload (no targets at all) passes through
 * unchanged.
 */
export const resolveBroadcastTargetsToPersist = (
  data: UpdateDraftBroadcastData,
): UpdateDraftBroadcastData => {
  const targets = data.targets ?? []
  const dropsEmptyTargets = targets.length > 0 && !data.saveAsDraft
  if (!dropsEmptyTargets) {
    return data
  }

  const readyTargets = targets.filter(
    (target) => target.templateId || target.flowId,
  )
  if (readyTargets.length === 0) {
    throw new BroadcastValidationException(
      "Select a template or flow for at least one page",
      "targets",
    )
  }
  return { ...data, targets: readyTargets }
}

/**
 * Runtime shape-check for `Broadcast.contactFilter`, an untyped jsonb column
 * (`unknown`, not `ContactFilterCriteriaInput`) — used by
 * `resendWithPruning` before handing a persisted filter to
 * `pruneEmailPhoneFilterConditions`.
 *
 * `operator` is checked against the exact `"and" | "or"` union the type
 * declares, not merely for presence: `applyContactFilter` branches only on
 * `=== "or"`, so any other stored value would silently degrade to `AND` and
 * resend to a *different* audience than the one the filter describes.
 *
 * Every condition's `field` is checked against `contactFilterFields`
 * (`@chatbotx.io/database/partials`) — the same enum the SQL builder's
 * `buildConditionWhere` switch is written against. This is NOT optional:
 * `buildConditionWhere`'s `default` case returns `{}` for an unrecognised
 * field, `applyContactFilter` then filters out every empty where, and an
 * all-conditions-unknown filter collapses to `{}` — i.e. *no* filtering at
 * all, silently sending to the full workspace audience instead of the
 * narrower one the stored filter describes. Rejecting the whole filter here
 * reproduces the pre-refactor behaviour, where a failed
 * `contactFilterCriteriaSchema.safeParse` dropped the whole filter and the
 * resend fell back to the full eligible audience — the same fallback, just
 * reached deliberately instead of by accident.
 *
 * Per-field `value`/`timezone` shape (e.g. `timezone` string length) is
 * still unvalidated here — the full per-condition schema lives in
 * `apps/builder`, which this package cannot import — but an unknown/renamed
 * `field` is exactly the case that previously produced a silently-widened
 * audience, so it is the one this function must not let through.
 */
const isContactFilterShape = (
  value: unknown,
): value is ContactFilterCriteriaInput => {
  if (typeof value !== "object" || value === null) {
    return false
  }
  const { operator, conditions } = value as {
    operator?: unknown
    conditions?: unknown
  }
  if (
    !((operator === "and" || operator === "or") && Array.isArray(conditions))
  ) {
    return false
  }
  return conditions.every((condition) => {
    if (typeof condition !== "object" || condition === null) {
      return false
    }
    const { field } = condition as { field?: unknown }
    return contactFilterFields.safeParse(field).success
  })
}

class BroadcastService extends BaseService {
  /**
   * Paginated broadcast list with relations — shared by the public API
   * (`GET /v1/broadcasts`) and the builder's broadcasts page.
   */
  async list(input: BroadcastListInput) {
    const pagination = getPaginationWithDefaults(input)

    const [data, total] = await Promise.all([
      broadcastRepository.listWithRelations(input),
      broadcastRepository.count(input),
    ])

    return { data, pageCount: Math.ceil(total / pagination.limit) }
  }

  /**
   * Gates the audience read behind a non-deleted broadcast owned by this
   * workspace (resolved by id-or-name), then returns the paginated audience
   * rows. A single existence gate — callers must not re-resolve the
   * broadcast separately before calling this.
   */
  async listAudience(input: {
    idOrName: string
    workspaceId: string
    page?: number | null
    perPage?: number | null
  }) {
    const { limit, offset } = getPaginationWithDefaults(input)

    const broadcast = await broadcastRepository.findByIdOrName({
      idOrName: input.idOrName,
      workspaceId: input.workspaceId,
    })

    if (!broadcast) {
      throw notFoundException("Broadcast not found")
    }

    const [rows, total] = await Promise.all([
      broadcastRepository.listAudience({
        broadcastId: broadcast.id,
        limit,
        offset,
      }),
      broadcastRepository.countAudience(broadcast.id),
    ])

    return {
      data: rows.map((row) => ({
        contactId: row.contactId,
        contact: {
          id: row.contact.id,
          firstName: row.contact.firstName,
          lastName: row.contact.lastName,
          fullName: row.contact.fullName,
          email: row.contact.email,
          phoneNumber: row.contact.phoneNumber,
          avatar: row.contact.avatar,
          gender: row.contact.gender,
        },
        sent: row.sent,
      })),
      pageCount: Math.ceil(total / limit),
    }
  }

  async findByIdOrName(input: { workspaceId: string; idOrName: string }) {
    const broadcast = await broadcastRepository.findByIdOrName(input)

    if (!broadcast) {
      throw notFoundException("Broadcast not found")
    }

    return broadcast
  }

  /**
   * The template params a contact on `inboxId` was sent with — a multi-page
   * broadcast keeps them per target, a legacy row on the broadcast itself.
   * `integrationWhatsappId` is the legacy column only; a multi-page broadcast
   * leaves it null so the caller derives the integration from the inbox.
   */
  async findByIdForResponse(input: {
    workspaceId: string
    broadcastId: string
    inboxId: string
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
        templateId: true,
        templateData: true,
        targetMode: true,
      },
      with: {
        targets: {
          columns: { inboxId: true, templateId: true, templateData: true },
        },
      },
    })

    if (!row) {
      return null
    }

    const templateSend = resolveBroadcastTemplateSend(row, input.inboxId)
    return {
      id: row.id,
      integrationWhatsappId: row.integrationWhatsappId,
      templateData: (templateSend?.templateData ??
        null) as WaTemplateParams | null,
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
    const result = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(broadcastModel)
        .set({
          status: broadcastStatuses.enum.scheduled,
          schedulesType: input.schedulesType,
          schedulesAt: input.schedulesAt,
        })
        .where(this.draftScope(input.workspaceId, input.broadcastId))
        .returning({
          id: broadcastModel.id,
          targetMode: broadcastModel.targetMode,
        })

      if (!row) {
        throw new ChatbotXException("Broadcast is not a draft")
      }

      // A draft keeps every picked page, empty ones included, so it can be
      // reopened. Scheduling is the point of no return: a page left without a
      // template (or flow) can deliver nothing, so it is dropped here — the
      // same normalization `create`/`updateDraft` apply to a non-draft — and
      // the worker never enrols, then fails, its recipients.
      await this.dropUndeliverableTargets(tx, row)

      return { id: row.id }
    })

    // Mirrors `createBroadcastAction`: only an immediate send is audited as a
    // launch. A future-scheduled broadcast is NOT audited here, and the
    // worker send path (`prepare-broadcast`/`enqueue-broadcast`/
    // `process-broadcast-contacts`) emits no audit record either — so a
    // future schedule currently produces no "launch" entry at any point.
    // Reconstructing launch history from the audit log will miss those.
    // Run post-commit (mirrors `update`/`updateDraft`/`resendWithPruning`) so
    // the audit enqueue's Redis round-trip never holds the Postgres
    // transaction — and its row locks — open.
    if (input.schedulesType === "now") {
      await this.audit("launch", `launched a broadcast (#${result.id})`)
    }

    return result
  }

  /**
   * Removes a targets-mode broadcast's rows that can deliver nothing — neither
   * a template nor a flow — so an unconfigured page is skipped at send time
   * instead of failing every recipient on it. Throws rather than schedule a
   * targets-mode broadcast with no deliverable page at all (an empty target
   * list is a real "nobody" audience, not a channel fallback), including the
   * case where every page's row has already cascaded away with its inbox. A
   * legacy channel-mode broadcast has no target rows by design and is left
   * untouched.
   */
  private async dropUndeliverableTargets(
    tx: DatabaseClient,
    broadcast: { id: string; targetMode: string | null },
  ): Promise<void> {
    if (!usesBroadcastTargets(broadcast)) {
      return
    }
    const targets = await tx.query.broadcastTargetModel.findMany({
      where: { broadcastId: broadcast.id },
      columns: { inboxId: true, flowId: true, templateId: true },
    })
    const undeliverableInboxIds = targets
      .filter((target) => !(target.templateId || target.flowId))
      .map((target) => target.inboxId)
    if (undeliverableInboxIds.length === targets.length) {
      throw new BroadcastValidationException(
        "Select a template or flow for at least one page",
        "targets",
      )
    }
    if (undeliverableInboxIds.length === 0) {
      return
    }
    await tx
      .delete(broadcastTargetModel)
      .where(
        and(
          eq(broadcastTargetModel.broadcastId, broadcast.id),
          inArray(broadcastTargetModel.inboxId, undeliverableInboxIds),
        ),
      )
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

    await this.audit(
      "broadcast_moved_to_draft",
      `moved broadcast (#${row.id}) to draft`,
    )

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

    await this.audit("broadcast_stopped", `stopped a broadcast (#${row.id})`)

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

    await this.audit("broadcast_resumed", `resumed a broadcast (#${row.id})`)

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

    // Some requested ids can be silently skipped (already deleted, foreign,
    // or `sending`) — only audit when something actually changed.
    if (rows.length > 0) {
      await this.audit("delete", `deleted ${rows.length} broadcast(s)`)
    }

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
  }): Promise<BroadcastDraftRow | null> {
    const row = await db.query.broadcastModel.findFirst({
      where: {
        id: input.broadcastId,
        workspaceId: input.workspaceId,
        status: broadcastStatuses.enum.draft,
        deletedAt: { isNull: true },
      },
      with: {
        targets: true,
        integrationWhatsapp: { columns: { inboxId: true } },
        integrationMessenger: { columns: { inboxId: true } },
      },
    })
    return row ?? null
  }

  /** Renames a broadcast. Distinct from `updateDraft`, which re-applies a full create payload. */
  async update(
    ctx: { workspaceId: string; id: string },
    data: { name: string },
  ): Promise<void> {
    const broadcast = await findOrFail({
      table: broadcastModel,
      where: {
        id: ctx.id,
        workspaceId: ctx.workspaceId,
        deletedAt: { isNull: true },
      },
    })

    await db
      .update(broadcastModel)
      .set(data)
      .where(eq(broadcastModel.id, broadcast.id))

    await this.audit("update", `updated a broadcast (#${broadcast.id})`)
  }

  /**
   * Validates a create payload exactly like a draft edit (channel/subaction
   * rules, page and integration ownership, template-to-page pairing, name)
   * and inserts the broadcast together with its per-page targets in one
   * transaction, so a broadcast can never exist with half of its pages.
   * Throws `BroadcastValidationException` for a rejected payload.
   */
  async create(
    input: UpdateDraftBroadcastData & {
      workspaceId: string
      canViewEmailAndPhone: boolean
    },
  ): Promise<BroadcastModel> {
    const { workspaceId, canViewEmailAndPhone, ...data } = input

    this.assertDraftPayload(data)
    const resolved = resolveBroadcastTargetsToPersist(data)
    const context = await this.assertBroadcastTargetsOwned({
      workspaceId,
      data: resolved,
    })
    const name = await this.resolveDraftBroadcastName({
      workspaceId,
      data: resolved,
      context,
    })
    const status = resolved.saveAsDraft
      ? broadcastStatuses.enum.draft
      : broadcastStatuses.enum.scheduled

    const broadcast = await db.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(broadcastModel)
        .values({
          workspaceId,
          name,
          status,
          ...this.buildBroadcastColumns(resolved, canViewEmailAndPhone),
        })
        .returning()

      await this.replaceTargets(tx, inserted.id, resolved.targets ?? [])
      return inserted
    })

    await this.audit("create", `created a new broadcast (#${broadcast.id})`)

    // A draft is never launched — it only leaves `draft` through
    // `scheduleBroadcastAction`, which records its own `launch` entry.
    if (resolved.schedulesType === "now" && !resolved.saveAsDraft) {
      await this.audit("launch", `launched a broadcast (#${broadcast.id})`)
    }

    return broadcast
  }

  /**
   * The editable columns a create and a draft edit both write from the same
   * payload. Once a payload carries targets, the pages and templates live on
   * those rows: `targetMode` is pinned to `targets` and every legacy
   * single-page column stays null, so no reader can fall back to a stale
   * page even if the target rows are later cascaded away.
   */
  private buildBroadcastColumns(
    data: UpdateDraftBroadcastData,
    canViewEmailAndPhone: boolean,
  ) {
    const targetMode = resolveBroadcastTargetMode(data.targets)
    const legacyColumns =
      targetMode === "targets"
        ? {
            flowId: null,
            templateId: null,
            templateData: null,
            integrationWhatsappId: null,
            integrationMessengerId: null,
          }
        : {
            flowId: data.flowId ?? null,
            templateId: data.templateId ?? null,
            templateData: buildStoredTemplateData(data),
            integrationWhatsappId: data.integrationWhatsappId ?? null,
            integrationMessengerId: data.integrationMessengerId ?? null,
          }

    return {
      channel: data.channel,
      subaction: data.subaction,
      targetMode,
      ...legacyColumns,
      contactFilter:
        pruneEmailPhoneFilterConditions(
          data.contactFilter,
          canViewEmailAndPhone,
        ) ?? null,
      schedulesType: data.schedulesType,
      // Persist the minute-truncated time the schema validated against.
      schedulesAt: startOfMinute(new Date(data.schedulesAt ?? new Date())),
    }
  }

  /** Replaces the page rows of a broadcast; a delete + insert keeps removed pages from lingering. */
  private async replaceTargets(
    tx: DatabaseClient,
    broadcastId: string,
    targets: BroadcastTargetInput[],
  ): Promise<void> {
    await tx
      .delete(broadcastTargetModel)
      .where(eq(broadcastTargetModel.broadcastId, broadcastId))

    if (targets.length === 0) {
      return
    }

    await tx.insert(broadcastTargetModel).values(
      targets.map((target) => ({
        broadcastId,
        inboxId: target.inboxId,
        flowId: target.flowId ?? null,
        templateId: target.templateId ?? null,
        templateData: buildStoredTemplateData(target),
      })),
    )
  }

  /** Copies the page rows of `sourceBroadcastId` onto a new broadcast (resend/clone). */
  async copyTargets(
    tx: DatabaseClient,
    input: { sourceBroadcastId: string; broadcastId: string },
  ): Promise<void> {
    const targets = await tx.query.broadcastTargetModel.findMany({
      where: { broadcastId: input.sourceBroadcastId },
    })
    if (targets.length === 0) {
      return
    }
    await tx.insert(broadcastTargetModel).values(
      targets.map(({ inboxId, flowId, templateId, templateData }) => ({
        broadcastId: input.broadcastId,
        inboxId,
        flowId,
        templateId,
        templateData,
      })),
    )
  }

  /**
   * Clones a broadcast into a NEW `draft`, copying its channel/subaction, the
   * legacy single-page columns or the per-page `BroadcastTarget` rows (via
   * `copyTargets`, so `targetMode` travels with them), the contact filter and
   * the schedule. The copy starts with fresh send state — a new id, no
   * counters, `draft` status — so it never inherits the source's delivery
   * history, and its name continues the `(Copy N)` numbering of the source.
   * The clone is editable and only leaves `draft` when the user sends it.
   */
  async cloneBroadcast(input: {
    workspaceId: string
    broadcastId: string
    canViewEmailAndPhone: boolean
  }): Promise<BroadcastModel> {
    const source = await db.query.broadcastModel.findFirst({
      where: {
        id: input.broadcastId,
        workspaceId: input.workspaceId,
        deletedAt: { isNull: true },
      },
    })
    if (!source) {
      throw new ChatbotXException("Broadcast not found")
    }

    const name = await this.resolveCloneBroadcastName({
      workspaceId: input.workspaceId,
      sourceName: source.name,
    })
    const contactFilter =
      pruneEmailPhoneFilterConditions(
        source.contactFilter as ContactFilterCriteriaInput | null,
        input.canViewEmailAndPhone,
      ) ?? null

    return await db.transaction(async (tx) => {
      const [clone] = await tx
        .insert(broadcastModel)
        .values({
          workspaceId: input.workspaceId,
          name,
          status: broadcastStatuses.enum.draft,
          channel: source.channel,
          subaction: source.subaction,
          // The layout travels with the copied target rows, so a cloned
          // multi-page broadcast can never fall back to the whole channel.
          targetMode: source.targetMode,
          flowId: source.flowId,
          templateId: source.templateId,
          templateData: source.templateData,
          integrationWhatsappId: source.integrationWhatsappId,
          integrationMessengerId: source.integrationMessengerId,
          contactFilter,
          // A draft keeps the source schedule verbatim; a past time is only
          // rejected later, when the draft is scheduled or sent.
          schedulesType: source.schedulesType,
          schedulesAt: source.schedulesAt,
        })
        .returning()

      await this.copyTargets(tx, {
        sourceBroadcastId: source.id,
        broadcastId: clone.id,
      })
      return clone
    })
  }

  /**
   * The name for a clone: the source name (stripped of any trailing
   * `(Copy N)` so a clone of a clone keeps one suffix) with the next free
   * copy number, continuing the sequence of existing copies of the same base.
   *
   * The highest existing number is taken in Postgres over an index-usable
   * prefix filter (no leading wildcard), so the candidate names never leave the
   * database and the scan stays cheap however many copies a workspace holds.
   * `name` is not unique, so two concurrent clones can still pick the same
   * number and produce duplicate names — acceptable for a manual, low-frequency
   * action where the result is an editable draft.
   */
  private async resolveCloneBroadcastName(input: {
    workspaceId: string
    sourceName: string
  }): Promise<string> {
    const base = input.sourceName.replace(BROADCAST_COPY_SUFFIX, "")
    // Prefix match `"<base> (Copy %"`; the exact `(Copy N)` shape and its
    // number are extracted in SQL. `base` is escaped for both the LIKE pattern
    // and the POSIX regex, and both are bound as parameters (no injection).
    const namePrefix = `${escapeLikePattern(`${base}${BROADCAST_COPY_LABEL}`)}%`
    const copyNumberPattern = `^${escapeRegExp(base)}${escapeRegExp(
      BROADCAST_COPY_LABEL,
    )}([0-9]+)\\)$`

    const [row] = await db
      .select({
        highestCopy: sql<number>`coalesce(max(substring(${broadcastModel.name} from ${copyNumberPattern})::int), 0)`,
      })
      .from(broadcastModel)
      .where(
        and(
          eq(broadcastModel.workspaceId, input.workspaceId),
          isNull(broadcastModel.deletedAt),
          ilike(broadcastModel.name, namePrefix),
        ),
      )

    return `${base}${BROADCAST_COPY_LABEL}${(row?.highestCopy ?? 0) + 1})`
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
    const { workspaceId } = input

    this.assertDraftPayload(input.data)
    const data = resolveBroadcastTargetsToPersist(input.data)
    const context = await this.assertBroadcastTargetsOwned({
      workspaceId,
      data,
    })

    const name = await this.resolveDraftBroadcastName({
      workspaceId,
      data,
      context,
    })
    const status = data.saveAsDraft
      ? broadcastStatuses.enum.draft
      : broadcastStatuses.enum.scheduled

    const row = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(broadcastModel)
        .set({
          name,
          status,
          ...this.buildBroadcastColumns(data, input.canViewEmailAndPhone),
        })
        .where(this.draftScope(workspaceId, input.broadcastId))
        .returning({ id: broadcastModel.id })

      if (updated) {
        await this.replaceTargets(tx, updated.id, data.targets ?? [])
      }
      return updated
    })

    if (!row) {
      throw new ChatbotXException("Broadcast is not a draft")
    }

    // Mirrors `createBroadcastAction`: only an immediate send is audited as a
    // launch, and an edit that stays a draft never launches at all. As in
    // `scheduleDraft`, a future-scheduled broadcast produces no "launch"
    // audit entry at any point — the worker send path emits none.
    if (
      status === broadcastStatuses.enum.scheduled &&
      data.schedulesType === "now"
    ) {
      await this.audit("launch", `launched a broadcast (#${row.id})`)
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
    const sendsFlow = broadcastSendsFlow(data)
    const sendsTemplate = broadcastSendsTemplate(data)
    const rules: readonly BroadcastPayloadRule[] = [
      {
        violated: !capability,
        message: "Unsupported broadcast channel",
        field: "channel",
      },
      {
        violated: !capability?.subactions.includes(data.subaction),
        message: "Unsupported broadcast subaction",
        field: "subaction",
      },
      {
        violated: !(sendsFlow || sendsTemplate),
        message: "Either flow or template must be selected",
        field: "flowId",
      },
      {
        violated: hasFlowAndTemplate(data),
        message: "A broadcast sends either a flow or a template, not both",
        field: "flowId",
      },
      {
        violated: sendsTemplate && !capability?.supportsTemplateBroadcast,
        message: "Template broadcasts are not supported for this channel",
        field: "templateId",
      },
      {
        violated: isTargetsTemplateSendWithoutTemplate(data),
        message: "Select a template for at least one page",
        field: "targets",
      },
      {
        violated: isTargetsFlowSendWithoutFlow(data),
        message: "Select a flow for at least one page",
        field: "targets",
      },
      {
        violated: hasDuplicateBroadcastTarget(data),
        message: "A page can only be selected once",
        field: "targets",
      },
      {
        violated: isTemplateSendWithoutPage(data),
        message: "Select the page the template belongs to",
        field: "targets",
      },
    ]

    const failed = rules.find((rule) => rule.violated)
    if (failed) {
      throw new BroadcastValidationException(failed.message, failed.field)
    }
  }

  /**
   * Integration ids and target inboxes scope the audience, so a foreign id
   * would let a broadcast target another workspace's pages. Never trust them
   * from the client. Every target inbox must belong to the workspace and
   * the broadcast's channel; a target's template must belong to that very
   * page (checked by `resolveTemplateBroadcastName` through the selection's
   * `inboxId`).
   */
  async assertBroadcastTargetsOwned(input: {
    workspaceId: string
    data: Pick<
      UpdateDraftBroadcastData,
      "channel" | "integrationWhatsappId" | "integrationMessengerId" | "targets"
    >
  }): Promise<BroadcastTargetContext> {
    const { workspaceId, data } = input
    const [messenger, whatsapp, inboxes, flows] = await Promise.all([
      data.integrationMessengerId
        ? db.query.integrationMessengerModel.findFirst({
            where: { id: data.integrationMessengerId, workspaceId },
            columns: { id: true },
          })
        : true,
      data.integrationWhatsappId
        ? db.query.integrationWhatsappModel.findFirst({
            where: { id: data.integrationWhatsappId, workspaceId },
            columns: { id: true },
          })
        : true,
      this.listOwnedTargetInboxes({
        workspaceId,
        channel: data.channel,
        inboxIds: (data.targets ?? []).map((target) => target.inboxId),
      }),
      this.listOwnedTargetFlows({
        workspaceId,
        channel: data.channel,
        targets: data.targets ?? [],
      }),
    ])

    if (!messenger) {
      throw new BroadcastValidationException(
        "Integration not found",
        "integrationMessengerId",
      )
    }
    if (!whatsapp) {
      throw new BroadcastValidationException(
        "Integration not found",
        "integrationWhatsappId",
      )
    }

    const ownedInboxIds = new Set(inboxes.map((inbox) => inbox.id))
    const everyTargetOwned = (data.targets ?? []).every((target) =>
      ownedInboxIds.has(target.inboxId),
    )
    if (!everyTargetOwned) {
      throw new BroadcastValidationException("Inbox not found", "targets")
    }

    return { inboxes, flows }
  }

  private async listOwnedTargetInboxes(input: {
    workspaceId: string
    channel: ChannelType
    inboxIds: string[]
  }): Promise<Pick<InboxModel, "id" | "name">[]> {
    const inboxIds = Array.from(new Set(input.inboxIds))
    if (inboxIds.length === 0) {
      return []
    }
    return await db.query.inboxModel.findMany({
      where: {
        id: { in: inboxIds },
        workspaceId: input.workspaceId,
        channel: input.channel,
      },
      columns: { id: true, name: true },
    })
  }

  /**
   * The flows the targets run, loaded in one batch. Each must belong to the
   * workspace, and its published version must start with the channel's
   * template step whose template lives on that very page — the send handler
   * would reject any other pairing per contact, so it is refused up front.
   */
  private async listOwnedTargetFlows(input: {
    workspaceId: string
    channel: ChannelType
    targets: readonly BroadcastTargetInput[]
  }): Promise<Pick<FlowModel, "id" | "name">[]> {
    const flowTargets = input.targets.flatMap((target) =>
      target.flowId ? [{ inboxId: target.inboxId, flowId: target.flowId }] : [],
    )
    if (flowTargets.length === 0) {
      return []
    }

    const flows = await db.query.flowModel.findMany({
      where: {
        id: { in: Array.from(new Set(flowTargets.map((t) => t.flowId))) },
        workspaceId: input.workspaceId,
      },
      columns: { id: true, name: true },
      with: {
        flowVersions: { where: { isLatest: true }, columns: { nodes: true } },
      },
    })
    const flowsById = new Map(flows.map((flow) => [flow.id, flow]))
    if (flowTargets.some((target) => !flowsById.has(target.flowId))) {
      throw new BroadcastValidationException("Flow not found", "flowId")
    }

    const stepType = templateStepTypeByChannel[input.channel]
    if (!stepType) {
      return flows
    }
    const startTemplateIdByFlowId = new Map(
      flows.map((flow) => [
        flow.id,
        findTemplateStartStep(flow.flowVersions[0]?.nodes, stepType)
          ?.templateId,
      ]),
    )
    const startTemplateIds = Array.from(
      new Set(
        flows.flatMap((flow) => {
          const templateId = startTemplateIdByFlowId.get(flow.id)
          return templateId ? [templateId] : []
        }),
      ),
    )
    const templates = await this.loadTemplateDetails(input.channel, {
      workspaceId: input.workspaceId,
      templateIds: startTemplateIds,
    })
    const inboxIdByTemplateId = new Map(
      templates.map((template) => [template.id, template.inboxId]),
    )

    const everyFlowOnItsPage = flowTargets.every((target) => {
      const templateId = startTemplateIdByFlowId.get(target.flowId)
      return (
        templateId !== undefined &&
        inboxIdByTemplateId.get(templateId) === target.inboxId
      )
    })
    if (!everyFlowOnItsPage) {
      throw new BroadcastValidationException(
        "The flow's template does not belong to the selected page",
        "targets",
      )
    }

    return flows.map(({ id, name }) => ({ id, name }))
  }

  /**
   * The stored name: page-prefixed template names, else page-prefixed flow
   * names (multi-page), else the legacy flow's name, else the default.
   */
  private async resolveDraftBroadcastName(input: {
    workspaceId: string
    data: UpdateDraftBroadcastData
    context?: BroadcastTargetContext
  }): Promise<string> {
    const { data, workspaceId, context = NO_TARGET_CONTEXT } = input

    const selections = broadcastTemplateSelections(data)
    if (selections.length > 0) {
      return await this.requireTemplateName({
        workspaceId,
        channel: data.channel,
        selections,
      })
    }

    const flowTargetName = this.resolveFlowTargetsName(data, context)
    if (flowTargetName) {
      return flowTargetName
    }

    return data.flowId
      ? await this.requireFlowName(workspaceId, data.flowId)
      : DEFAULT_BROADCAST_NAME
  }

  /** `"Page - flow"` per flow target, joined like the template naming. */
  private resolveFlowTargetsName(
    data: UpdateDraftBroadcastData,
    context: BroadcastTargetContext,
  ): string | null {
    const inboxNameById = new Map(context.inboxes.map((i) => [i.id, i.name]))
    const flowNameById = new Map(context.flows.map((f) => [f.id, f.name]))
    const segments = (data.targets ?? []).flatMap((target) => {
      const flowName = target.flowId ? flowNameById.get(target.flowId) : null
      if (!flowName) {
        return []
      }
      const pageName = inboxNameById.get(target.inboxId)
      return [
        pageName
          ? `${pageName}${BROADCAST_NAME_SEPARATOR}${flowName}`
          : flowName,
      ]
    })
    return segments.length > 0
      ? segments
          .join(BROADCAST_NAME_TARGET_SEPARATOR)
          .slice(0, BROADCAST_NAME_MAX_LENGTH)
      : null
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
      throw new BroadcastValidationException("Flow not found", "flowId")
    }
    return flow.name
  }

  private async requireTemplateName(input: {
    workspaceId: string
    channel: ChannelType
    selections: BroadcastTemplateSelection[]
  }): Promise<string> {
    const details = await this.resolveSelectedTemplates(input)
    if (details.length === 0 || details.length !== input.selections.length) {
      throw new BroadcastValidationException("Template not found", "templateId")
    }
    // A pending or rejected template is stored but must never be scheduled:
    // the send handler would fail every recipient of that page.
    if (details.some((detail) => detail.status !== APPROVED_TEMPLATE_STATUS)) {
      throw new BroadcastValidationException(
        "Template is not approved",
        "targets",
      )
    }
    return this.joinTemplateNames(details)
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
        ...withBroadcastTargets,
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
      inboxIds: input.inboxIds,
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

  private loadTemplateDetails(
    channel: ChannelType,
    lookup: BroadcastTemplateLookup,
  ): Promise<BroadcastTemplateDetail[]> {
    const loadDetails = this.templateLoaders[channel]
    return loadDetails && lookup.templateIds.length > 0
      ? loadDetails(lookup)
      : Promise.resolve([])
  }

  private async loadWhatsappTemplateDetail(
    lookup: BroadcastTemplateLookup,
  ): Promise<BroadcastTemplateDetail[]> {
    const conditions = [
      inArray(whatsappMessageTemplateModel.id, lookup.templateIds),
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

    const templates = await db
      .select({
        id: whatsappMessageTemplateModel.id,
        name: whatsappMessageTemplateModel.name,
        language: whatsappMessageTemplateModel.language,
        category: whatsappMessageTemplateModel.category,
        status: whatsappMessageTemplateModel.status,
        components: whatsappMessageTemplateModel.components,
        inboxId: integrationWhatsappModel.inboxId,
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
      .limit(lookup.templateIds.length)

    return templates.map((template) => ({ ...template, channel: "whatsapp" }))
  }

  private async loadMessengerTemplateDetail(
    lookup: BroadcastTemplateLookup,
  ): Promise<BroadcastTemplateDetail[]> {
    const conditions = [
      inArray(messengerMessageTemplateModel.id, lookup.templateIds),
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

    const templates = await db
      .select({
        id: messengerMessageTemplateModel.id,
        name: messengerMessageTemplateModel.name,
        language: messengerMessageTemplateModel.language,
        category: messengerMessageTemplateModel.category,
        status: messengerMessageTemplateModel.status,
        parameterFormat: messengerMessageTemplateModel.parameterFormat,
        components: messengerMessageTemplateModel.components,
        inboxId: integrationMessengerModel.inboxId,
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
      .limit(lookup.templateIds.length)

    return templates.map((template) => ({ ...template, channel: "messenger" }))
  }

  /**
   * The templates a broadcast sends, one per page, in target order — a
   * legacy single-page broadcast yields one element. Empty for flow sends.
   */
  async listTemplateDetails(input: {
    workspaceId: string
    broadcastId: string
  }): Promise<BroadcastTemplateDetail[]> {
    const broadcast = await db.query.broadcastModel.findFirst({
      where: {
        id: input.broadcastId,
        workspaceId: input.workspaceId,
        deletedAt: { isNull: true },
      },
      columns: {
        templateId: true,
        integrationWhatsappId: true,
        integrationMessengerId: true,
        channel: true,
      },
      with: { targets: { columns: { inboxId: true, templateId: true } } },
    })

    if (!broadcast) {
      return []
    }

    const selections = broadcastTemplateSelections({
      templateId: broadcast.templateId ?? undefined,
      integrationWhatsappId: broadcast.integrationWhatsappId ?? undefined,
      integrationMessengerId: broadcast.integrationMessengerId ?? undefined,
      targets: broadcast.targets.map((target) => ({
        inboxId: target.inboxId,
        templateId: target.templateId ?? undefined,
      })),
    })

    return this.resolveSelectedTemplates({
      workspaceId: input.workspaceId,
      channel: broadcast.channel as ChannelType,
      selections,
    })
  }

  /**
   * Loads every selected template in one query and pairs it back with its
   * selection. A selection pinned to a page (`inboxId`) only matches the
   * template of that page — a template picked for page A can never be sent
   * from page B. Legacy selections are scoped by their integration ids in
   * SQL. Returns fewer rows than selections when any is missing.
   */
  private async resolveSelectedTemplates(input: {
    workspaceId: string
    channel: ChannelType
    selections: BroadcastTemplateSelection[]
  }): Promise<BroadcastTemplateDetail[]> {
    const { selections } = input
    if (selections.length === 0) {
      return []
    }

    const details = await this.loadTemplateDetails(input.channel, {
      workspaceId: input.workspaceId,
      templateIds: Array.from(
        new Set(selections.map((selection) => selection.templateId)),
      ),
      integrationWhatsappId: selections[0].integrationWhatsappId,
      integrationMessengerId: selections[0].integrationMessengerId,
    })

    return selections.flatMap((selection) => {
      const detail = details.find(
        (candidate) =>
          candidate.id === selection.templateId &&
          (!selection.inboxId || candidate.inboxId === selection.inboxId),
      )
      return detail ? [detail] : []
    })
  }

  // Builds the stored broadcast name from the chosen templates, each prefixed
  // with its page name so broadcasts from different pages stay distinguishable
  // in the list ("Page A - promo / Page B - promo"). Returns null when any
  // selected template does not belong to the workspace/page, letting the
  // caller surface a "template not found" validation error.
  async resolveTemplateBroadcastName(input: {
    workspaceId: string
    channel: ChannelType
    selections: BroadcastTemplateSelection[]
  }): Promise<string | null> {
    const details = await this.resolveSelectedTemplates(input)
    if (details.length === 0 || details.length !== input.selections.length) {
      return null
    }
    return this.joinTemplateNames(details)
  }

  private joinTemplateNames(details: BroadcastTemplateDetail[]): string {
    return details
      .map((detail) =>
        detail.integrationName
          ? `${detail.integrationName}${BROADCAST_NAME_SEPARATOR}${detail.name}`
          : detail.name,
      )
      .join(BROADCAST_NAME_TARGET_SEPARATOR)
      .slice(0, BROADCAST_NAME_MAX_LENGTH)
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
   * Runs the resend existence/status guards up front so the caller can
   * safely read `contactFilter` for pruning before the resend write — a
   * foreign or soft-deleted id, or a broadcast that isn't sent/failed,
   * throws here instead of the caller processing a row it shouldn't see.
   * Private: the only caller is `resendWithPruning` below, and a caller
   * with a pre-loaded row could otherwise bypass this guard entirely.
   */
  private async assertResendable(input: {
    workspaceId: string
    id: string
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
    return broadcast
  }

  /**
   * Clones a `sent`/`failed` broadcast as a new immediately-scheduled one,
   * pruning the email/phone contact-filter fields the private
   * `resendBroadcastAction` used to prune inline, so the public API and the
   * builder UI share one code path (invariant #9). A caller with
   * `canViewEmailAndPhone: true` (every workspace-token caller, per plan
   * decision) short-circuits `pruneEmailPhoneFilterConditions` to
   * `contactFilter ?? undefined` — the persisted filter still needs a
   * minimal runtime shape-check first because `Broadcast.contactFilter` is
   * an untyped jsonb column (`unknown`, not `ContactFilterCriteriaInput`).
   * The transaction wraps the insert plus a copy of the source's per-page
   * `BroadcastTarget` rows, so a multi-page broadcast resends to the same
   * pages instead of falling back to the whole channel.
   */
  async resendWithPruning(input: {
    workspaceId: string
    id: string
    canViewEmailAndPhone: boolean
  }): Promise<BroadcastModel> {
    const broadcast = await this.assertResendable({
      workspaceId: input.workspaceId,
      id: input.id,
    })

    const persisted = broadcast.contactFilter as unknown
    const contactFilter = pruneEmailPhoneFilterConditions(
      isContactFilterShape(persisted) ? persisted : undefined,
      input.canViewEmailAndPhone,
    )

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
          targetMode: broadcast.targetMode,
          status: "scheduled",
          schedulesType: "now",
          schedulesAt: new Date(),
          contactFilter,
          name: `${broadcast.name} (Resend)`,
          id: createId(),
        })
        .returning()
        .then((result) => result[0])

      await this.copyTargets(tx, {
        sourceBroadcastId: broadcast.id,
        broadcastId: inserted.id,
      })

      return inserted
    })

    await this.audit("launch", `launched a broadcast (#${newBroadcast.id})`)

    return newBroadcast
  }
}

export const broadcastService = new BroadcastService()
