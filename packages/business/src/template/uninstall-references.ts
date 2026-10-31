import type { DatabaseClient } from "@chatbotx.io/database/client"
import type { TemplateResourceKind } from "@chatbotx.io/database/partials"
// The subpath, not the barrel: this module sits on every guarded write's
// import graph, and the barrel drags in every repository.
import {
  type InboundEdge,
  templateUninstallReferenceRepository,
} from "@chatbotx.io/database/repositories/template-uninstall-references"
import {
  CONTACT_FILTER_FIELD_REFERENCE,
  contactFilterReferences,
  FLOW_REFERENCE_FIELD,
  PREFIXED_REFERENCE_ENTITY_KIND,
  REFERENCE_ARRAY_FIELD_ENTITY_KIND,
  REFERENCE_FIELD_ENTITY_KIND,
  REFERENCE_KIND_POLICY,
} from "@chatbotx.io/flow-config"

/** A resource that is being deleted, as the closure and `protectedDependents` see it. */
export const uninstallKey = (kind: TemplateResourceKind, id: string): string =>
  `${kind}:${id}`

/**
 * The tracked kinds the reference registry (`REFERENCE_KIND_POLICY`) says an
 * install copies. Anything else (tags, fields, folders, inboxes...) is
 * resolved by natural key or verified, never deleted by an uninstall, so
 * nothing can be left dangling by it.
 */
const COPIED_POLICIES: ReadonlySet<string> = new Set(["copy"])
/** Registry kinds with `verifyInTarget` that an install nevertheless copies. */
const COPIED_VERIFY_KINDS: readonly string[] = ["sequence", "product"]

/** The tracked kinds an uninstall can delete and so must probe for inbound references. */
export const COPIED_REFERENCE_KINDS: readonly TemplateResourceKind[] = [
  ...Object.entries(REFERENCE_KIND_POLICY)
    .filter(([, policy]) => COPIED_POLICIES.has(policy))
    .map(([kind]) => kind),
  ...COPIED_VERIFY_KINDS,
  "pipeline",
].filter((kind) => kind !== "flowNode") as TemplateResourceKind[]

/**
 * The registry's reference slots that point at `kind`: scalar and array field
 * names, `prefix:id` tokens, and contact-filter condition types. Derived, so a
 * slot added to the registry is probed without touching this file.
 */
export type ReferenceSlots = {
  scalars: string[]
  arrays: string[]
  prefixes: string[]
  conditionTypes: string[]
}

export const referenceSlotsOf = (kind: string): ReferenceSlots => {
  const keysOf = (map: Readonly<Record<string, string>>) =>
    Object.entries(map)
      .filter(([, value]) => value === kind)
      .map(([key]) => key)
  return {
    scalars: [
      ...keysOf(REFERENCE_FIELD_ENTITY_KIND),
      ...(kind === "flow" ? [FLOW_REFERENCE_FIELD] : []),
    ],
    arrays: keysOf(REFERENCE_ARRAY_FIELD_ENTITY_KIND),
    prefixes: keysOf(PREFIXED_REFERENCE_ENTITY_KIND),
    conditionTypes: Object.entries(CONTACT_FILTER_FIELD_REFERENCE)
      .filter(([, ref]) => ref.kind === kind)
      .map(([field]) => field),
  }
}

/** True when the registry has at least one slot pointing at `kind`. */
export const isReferencedByRegistry = (kind: string): boolean => {
  const slots = referenceSlotsOf(kind)
  return (
    slots.scalars.length +
      slots.arrays.length +
      slots.prefixes.length +
      slots.conditionTypes.length >
    0
  )
}

/** One column that holds the id of a parent (an FK or a plain id column). */
type ColumnSlot = {
  parent: TemplateResourceKind
  /**
   * The tracked kind of the row that holds the reference, or null when the
   * holder is installer data an install never creates (broadcasts, orders,
   * channel settings...): such a holder is never part of the deleting set.
   */
  inboundKind: TemplateResourceKind | null
  table: string
  column: string
  /** The column that is the inbound resource's id (the row's own `id` by default). */
  inboundIdColumn?: string
  /** The workspace column of the holder, when it has one: scopes the probe. */
  workspaceColumn?: string
  /** The column is text, not bigint (`Condition.sourceId`). */
  textColumn?: boolean
}

const WS = "workspaceId"

/**
 * Column references: every FK (and plain id column) that points at a copied
 * kind and would cascade away or be nulled by its deletion. Policy: installer
 * data that a delete would destroy or null out makes the parent
 * `keptHasDependents`. A test compares this list with the foreign keys of the
 * Drizzle schema, so a new FK to a copied kind fails until it is listed here
 * or in `OWN_CHILD_TABLES`.
 */
export const COLUMN_SLOTS: readonly ColumnSlot[] = [
  {
    parent: "flow",
    inboundKind: "reflink",
    table: "Reflink",
    column: "flowId",
    workspaceColumn: WS,
  },
  {
    parent: "flow",
    inboundKind: "automatedResponse",
    table: "AutomatedResponse",
    column: "flowId",
    workspaceColumn: WS,
  },
  {
    parent: "flow",
    inboundKind: "integrationWebchat",
    table: "IntegrationWebchat",
    column: "welcomeFlowId",
    workspaceColumn: WS,
  },
  {
    parent: "flow",
    inboundKind: "aiFunction",
    table: "AIFunction",
    column: "triggerFlowId",
    workspaceColumn: WS,
  },
  {
    parent: "flow",
    inboundKind: "sequence",
    table: "SequenceStep",
    column: "flowId",
    inboundIdColumn: "sequenceId",
  },
  {
    parent: "flow",
    inboundKind: "calendar",
    table: "AppointmentCalendar",
    column: "confirmationFlowId",
    workspaceColumn: WS,
  },
  {
    parent: "flow",
    inboundKind: "calendar",
    table: "AppointmentCalendar",
    column: "cancellationFlowId",
    workspaceColumn: WS,
  },
  {
    parent: "flow",
    inboundKind: "calendar",
    table: "AppointmentCalendarReminder",
    column: "flowId",
    inboundIdColumn: "calendarId",
  },
  {
    parent: "flow",
    inboundKind: "questionnaire",
    table: "Questionnaire",
    column: "triggerFlowId",
    workspaceColumn: WS,
  },
  // Installer data below: deleting the flow would cascade it away or null it.
  {
    parent: "flow",
    inboundKind: null,
    table: "Broadcast",
    column: "flowId",
    workspaceColumn: WS,
  },
  {
    parent: "flow",
    inboundKind: null,
    table: "BroadcastTarget",
    column: "flowId",
  },
  {
    parent: "flow",
    inboundKind: null,
    table: "AIHandoverSettings",
    column: "gotoFlowId",
    workspaceColumn: WS,
  },
  {
    parent: "flow",
    inboundKind: null,
    table: "EcommerceSettings",
    column: "abandonedCartFlowId",
    workspaceColumn: WS,
  },
  {
    parent: "flow",
    inboundKind: null,
    table: "EcommerceSettings",
    column: "checkoutFlowId",
    workspaceColumn: WS,
  },
  {
    parent: "flow",
    inboundKind: null,
    table: "EcommerceSettings",
    column: "orderConfirmationFlowId",
    workspaceColumn: WS,
  },
  {
    parent: "flow",
    inboundKind: null,
    table: "IntegrationInstagram",
    column: "welcomeFlowId",
    workspaceColumn: WS,
  },
  {
    parent: "flow",
    inboundKind: null,
    table: "IntegrationMessenger",
    column: "welcomeFlowId",
    workspaceColumn: WS,
  },
  {
    parent: "flow",
    inboundKind: null,
    table: "IntegrationMessenger",
    column: "handoverResumeFlowId",
    workspaceColumn: WS,
  },
  {
    parent: "flow",
    inboundKind: null,
    table: "IntegrationWhatsapp",
    column: "handoverResumeFlowId",
    workspaceColumn: WS,
  },
  {
    parent: "flow",
    inboundKind: null,
    table: "IntegrationZalo",
    column: "fallbackFlowId",
    workspaceColumn: WS,
  },
  {
    parent: "flow",
    inboundKind: null,
    table: "Leaderboard",
    column: "referralWelcomeFlowId",
    workspaceColumn: WS,
  },
  {
    parent: "trigger",
    inboundKind: "trigger",
    table: "Condition",
    column: "sourceId",
    inboundIdColumn: "triggerId",
    textColumn: true,
  },
  {
    parent: "aiAgent",
    inboundKind: null,
    table: "IntegrationOpenai",
    column: "aiAgentId",
    workspaceColumn: WS,
  },
  // Order history and catalog sync rows of a product the installer sold or synced.
  {
    parent: "product",
    inboundKind: null,
    table: "OrderItem",
    column: "productId",
    workspaceColumn: WS,
  },
  {
    parent: "product",
    inboundKind: null,
    table: "MetaCatalogItem",
    column: "productId",
  },
  // A deal is installer data: a pipeline with any item is kept whole.
  {
    parent: "pipeline",
    inboundKind: null,
    table: "PipelineItem",
    column: "pipelineId",
    workspaceColumn: WS,
  },
]

/**
 * Tables with an FK to a copied kind that are NOT dependents: the kind's own
 * children (removed with it, or drained in bounded batches on purpose) and
 * soft-deleted kinds whose children survive. Used by the completeness test.
 */
export const OWN_CHILD_TABLES: readonly { table: string; column: string }[] = [
  { table: "FlowRun", column: "flowId" },
  { table: "FlowVersion", column: "flowId" },
  { table: "AIEmbedding", column: "aiFileId" },
  // Calendars and questionnaires are soft-deleted, so these rows survive.
  { table: "Appointment", column: "calendarId" },
  { table: "AppointmentCalendarAvailability", column: "calendarId" },
  { table: "AppointmentCalendarReminder", column: "calendarId" },
  { table: "QuestionnaireQuestion", column: "questionnaireId" },
  { table: "QuestionnaireSubmission", column: "questionnaireId" },
  { table: "Coupon", column: "topicId" },
  { table: "CommentAutomationEvent", column: "automationId" },
  { table: "CommentAutomationMiss", column: "automationId" },
  { table: "CommentAutomationReply", column: "automationId" },
  { table: "Condition", column: "triggerId" },
  { table: "TriggerContactHistory", column: "triggerId" },
  { table: "TriggerExecution", column: "triggerId" },
  { table: "TriggerStat", column: "triggerId" },
  { table: "RefLinkStat", column: "linkId" },
  { table: "SavedReplyImage", column: "savedReplyId" },
  { table: "ContactOnSequence", column: "sequenceId" },
  { table: "SequenceDispatch", column: "sequenceId" },
  { table: "SequenceStep", column: "sequenceId" },
  { table: "PipelineField", column: "pipelineId" },
  { table: "PipelineItemActivity", column: "pipelineId" },
  { table: "PipelineMember", column: "pipelineId" },
  { table: "PipelineStage", column: "pipelineId" },
  { table: "ProductAddon", column: "productId" },
  { table: "ProductVariant", column: "productId" },
  { table: "ProductVariantOption", column: "productId" },
]

/** A table whose JSON columns embed ids under the registry's field names. */
type JsonContainer = {
  /** The tracked kind of the holder, or null for installer data an install never creates. */
  inboundKind: TemplateResourceKind | null
  table: string
  /** The column that is the inbound resource's id. */
  inboundIdColumn: string
  jsonColumns: readonly string[]
  /** The column holding the workspace, when the table has one. */
  workspaceColumn?: string
  /**
   * No workspace column: scoped through the live broadcast the row belongs to
   * (`BroadcastTarget`).
   */
  scopeThroughBroadcast?: boolean
  /** Condition rows carry their contact-filter field in `type`. */
  conditionTypeColumn?: string
  /**
   * The (single) JSON column is a contact filter `{ operator, conditions:
   * [{ field, value }] }`: only the conditions whose `field` is an id-valued
   * filter field of the probed kind are matched, on their `value`.
   */
  contactFilterColumn?: string
  /** An extra predicate on the holding row (a flow's current and draft versions only). */
  restrictSql?: string
}

export const JSON_CONTAINERS: readonly JsonContainer[] = [
  {
    inboundKind: "flow",
    table: "FlowVersion",
    inboundIdColumn: "flowId",
    jsonColumns: ["nodes", "edges"],
    workspaceColumn: WS,
    // Older published versions are history, not live references.
    restrictSql: '("isDraft" OR "isLatest")',
  },
  {
    inboundKind: "trigger",
    table: "Trigger",
    inboundIdColumn: "id",
    jsonColumns: ["actions"],
    workspaceColumn: WS,
  },
  {
    // No workspace column: scoped through the trigger or webhook it belongs to.
    inboundKind: "trigger",
    table: "Condition",
    inboundIdColumn: "triggerId",
    jsonColumns: ["value"],
    conditionTypeColumn: "type",
  },
  {
    // Installer data: a broadcast's audience, typed per field.
    table: "Broadcast",
    inboundKind: null,
    inboundIdColumn: "id",
    jsonColumns: ["contactFilter"],
    workspaceColumn: WS,
    contactFilterColumn: "contactFilter",
    restrictSql: '"deletedAt" IS NULL',
  },
  {
    // Installer data: the channel menus and ice breakers point at flows.
    table: "IntegrationMessenger",
    inboundKind: null,
    inboundIdColumn: "id",
    jsonColumns: ["persistentMenus", "conversationStarters"],
    workspaceColumn: WS,
  },
  {
    table: "IntegrationInstagram",
    inboundKind: null,
    inboundIdColumn: "id",
    jsonColumns: ["persistentMenus", "conversationStarters"],
    workspaceColumn: WS,
  },
  {
    // Installer data: template button flow ids of a broadcast and of its pages.
    table: "Broadcast",
    inboundKind: null,
    inboundIdColumn: "id",
    jsonColumns: ["templateData"],
    workspaceColumn: WS,
    restrictSql: '"deletedAt" IS NULL',
  },
  {
    table: "BroadcastTarget",
    inboundKind: null,
    inboundIdColumn: "broadcastId",
    jsonColumns: ["templateData"],
    scopeThroughBroadcast: true,
  },
  {
    // Installer data: a discount code's customer audience, the same shape.
    table: "DiscountCode",
    inboundKind: null,
    inboundIdColumn: "id",
    jsonColumns: ["customerFilter"],
    workspaceColumn: WS,
    contactFilterColumn: "customerFilter",
  },
  {
    inboundKind: "fbCommentAutomation",
    table: "CommentAutomation",
    inboundIdColumn: "id",
    jsonColumns: ["privateReply", "publicReply", "options"],
    workspaceColumn: WS,
  },
  {
    inboundKind: "aiAgent",
    table: "AIAgent",
    inboundIdColumn: "id",
    jsonColumns: ["tools", "actionRules", "messages"],
    workspaceColumn: WS,
  },
  {
    inboundKind: "integrationWebchat",
    table: "IntegrationWebchat",
    inboundIdColumn: "id",
    jsonColumns: ["conversationStarters", "persistentMenus"],
    workspaceColumn: WS,
  },
]

/**
 * Which kinds may hold a reference to each copied parent, derived from the
 * column slots and the JSON containers: the shape `assertReferencable` is
 * keyed by. Installer-data holders (null kind) are not creators of tracked
 * kinds, so they appear only in the probes. A parent the registry never
 * points at has no entry.
 */
export const INBOUND_REFERENCE_KINDS: Partial<
  Record<TemplateResourceKind, readonly TemplateResourceKind[]>
> = Object.fromEntries(
  COPIED_REFERENCE_KINDS.map((parent) => {
    const kinds = new Set<TemplateResourceKind>(
      COLUMN_SLOTS.filter((slot) => slot.parent === parent).flatMap((slot) =>
        slot.inboundKind ? [slot.inboundKind] : [],
      ),
    )
    if (isReferencedByRegistry(parent)) {
      for (const container of JSON_CONTAINERS) {
        if (container.inboundKind) {
          kinds.add(container.inboundKind)
        }
      }
    }
    return [parent, [...kinds]] as const
  }).filter(([, kinds]) => kinds.length > 0),
)

export type InboundParentKind = TemplateResourceKind

/**
 * The inbound references of a parent kind are read ONCE per closure (see
 * `withInboundEdgeCache`) as an edge set; which parents are protected is then
 * decided in memory against the shrinking deleting set.
 */
const edgeCache = new WeakMap<
  DatabaseClient,
  Map<string, { ids: Set<string>; edges: InboundEdge[] }>
>()

/**
 * Runs `fn` with the inbound edges memoized per `(workspace, parent kind)` on
 * this transaction. Meant for one closure computation (the passes repeat the
 * same probe over a shrinking id set): the cache is dropped when `fn` ends.
 */
export const withInboundEdgeCache = async <T>(
  tx: DatabaseClient,
  fn: () => Promise<T>,
): Promise<T> => {
  if (edgeCache.has(tx)) {
    return await fn()
  }
  edgeCache.set(tx, new Map())
  try {
    return await fn()
  } finally {
    edgeCache.delete(tx)
  }
}

const loadEdges = async (
  tx: DatabaseClient,
  parentKind: TemplateResourceKind,
  parentIds: readonly string[],
  workspaceId: string,
): Promise<InboundEdge[]> => {
  const cache = edgeCache.get(tx)
  const key = `${workspaceId}:${parentKind}`
  const entry = cache?.get(key) ?? { ids: new Set<string>(), edges: [] }
  const missing = parentIds.filter((id) => !entry.ids.has(id))
  if (missing.length > 0) {
    const fetched = await templateUninstallReferenceRepository.findInboundEdges(
      {
        workspaceId,
        parentIds: missing,
        slots: referenceSlotsOf(parentKind),
        columnProbes: COLUMN_SLOTS.filter(
          (slot) => slot.parent === parentKind,
        ).map((slot) => ({
          holderKind: slot.inboundKind,
          table: slot.table,
          column: slot.column,
          holderIdColumn: slot.inboundIdColumn ?? "id",
          workspaceColumn: slot.workspaceColumn,
          textColumn: slot.textColumn,
        })),
        containerProbes: JSON_CONTAINERS.map((container) => ({
          holderKind: container.inboundKind,
          table: container.table,
          holderIdColumn: container.inboundIdColumn,
          jsonColumns: container.jsonColumns,
          workspaceColumn: container.workspaceColumn,
          scopeThroughBroadcast: container.scopeThroughBroadcast,
          conditionTypeColumn: container.conditionTypeColumn,
          contactFilterColumn: container.contactFilterColumn,
          restrictSql: container.restrictSql,
        })),
      },
      tx,
    )
    for (const id of missing) {
      entry.ids.add(id)
    }
    entry.edges.push(...fetched)
    cache?.set(key, entry)
  }
  const wanted = new Set(parentIds)
  return entry.edges.filter((edge) => wanted.has(edge.parent))
}

/**
 * Parent ids that still have an inbound reference from a row NOT in
 * `deletingSet`. The references come from the repository as edges (one
 * statement per column slot and per JSON container, all ids at once, scoped to
 * the workspace through indexed owner lists); the deleting-set test is in
 * memory. A holder never counts against itself (a flow that mentions its own
 * id); installer data (no tracked kind) always counts.
 */
export const findParentsWithOutsideDependents = async (
  tx: DatabaseClient,
  parentKind: TemplateResourceKind,
  parentIds: readonly string[],
  deletingSet: ReadonlySet<string>,
  scope: { workspaceId: string },
): Promise<Set<string>> => {
  const protectedIds = new Set<string>()
  if (parentIds.length === 0) {
    return protectedIds
  }
  const edges = await loadEdges(tx, parentKind, parentIds, scope.workspaceId)
  for (const edge of edges) {
    const insideDeletingSet =
      edge.holderKind !== null &&
      edge.holderId !== null &&
      deletingSet.has(
        uninstallKey(edge.holderKind as TemplateResourceKind, edge.holderId),
      )
    if (!insideDeletingSet) {
      protectedIds.add(edge.parent)
    }
  }
  return protectedIds
}

const NUMERIC_ID = /^\d+$/
const PREFIXED_TOKEN = /^([a-z]+):(\d+)$/

/**
 * The copied parents a JSON value points at, found with the registry's own
 * slot names (scalar fields, array fields, `prefix:id` tokens): what a write
 * that stores this value must lock with `assertEditable` / `assertReferencable`.
 */
export const referencedParentsOf = (
  value: unknown,
): { kind: TemplateResourceKind; resourceId: string }[] => {
  const found = new Map<
    string,
    { kind: TemplateResourceKind; resourceId: string }
  >()
  const copied = new Set<string>(COPIED_REFERENCE_KINDS)
  const add = (kind: string | undefined, id: unknown) => {
    if (
      kind &&
      copied.has(kind) &&
      typeof id === "string" &&
      NUMERIC_ID.test(id)
    ) {
      found.set(`${kind}:${id}`, {
        kind: kind as TemplateResourceKind,
        resourceId: id,
      })
    }
  }
  const walk = (node: unknown, key?: string): void => {
    if (Array.isArray(node)) {
      for (const item of node) {
        walk(item, key)
      }
      return
    }
    if (node && typeof node === "object") {
      for (const [childKey, child] of Object.entries(node)) {
        walk(child, childKey)
      }
      return
    }
    if (typeof node !== "string" || key === undefined) {
      return
    }
    const scalarKind =
      key === FLOW_REFERENCE_FIELD ? "flow" : REFERENCE_FIELD_ENTITY_KIND[key]
    add(scalarKind, node)
    add(REFERENCE_ARRAY_FIELD_ENTITY_KIND[key], node)
    const prefixed = node.match(PREFIXED_TOKEN)
    if (prefixed && key === "tools") {
      add(PREFIXED_REFERENCE_ENTITY_KIND[prefixed[1]], prefixed[2])
    }
  }
  walk(value)
  return [...found.values()]
}

/**
 * The copied parents a stored contact filter (`Broadcast.contactFilter`,
 * `DiscountCode.customerFilter`) points at: what a write that stores the
 * filter must lock with `assertReferencable`. Same per-field map as the probe.
 */
export const contactFilterParentsOf = (
  filter: unknown,
): { kind: TemplateResourceKind; resourceId: string }[] => {
  const copied = new Set<string>(COPIED_REFERENCE_KINDS)
  return contactFilterReferences(filter).flatMap((reference) =>
    copied.has(reference.kind)
      ? [
          {
            kind: reference.kind as TemplateResourceKind,
            resourceId: reference.id,
          },
        ]
      : [],
  )
}
