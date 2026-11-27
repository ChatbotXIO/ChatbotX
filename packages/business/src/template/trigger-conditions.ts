import type { TriggerEventType } from "@chatbotx.io/database/partials"
import { isNumericId } from "@chatbotx.io/utils/id"
import { z } from "zod"

/**
 * A trigger fires only through its condition rows (a trigger with none never
 * matches), so a template that shipped a trigger without them would install an
 * inert copy. The rows travel inside the trigger's entry as `conditions`.
 */
export const triggerConditionRowSchema = z.object({
  type: z.string(),
  sourceId: z.string().nullable(),
  operator: z.string().nullable(),
  value: z.unknown(),
})
export type TriggerConditionRow = z.infer<typeof triggerConditionRowSchema>

/** The resource kinds a condition row can name by id. */
export type ConditionReferenceKind =
  | "tag"
  | "customField"
  | "sequence"
  | "product"
  | "productCategory"
  | "pipeline"
  | "pipelineStage"
  | "inbox"
  | "channelPost"

const PIPELINE_EVENT_TYPES = [
  "pipelineItemCreated",
  "pipelineItemMovedToStage",
  "pipelineItemValueChanged",
  "pipelineItemStatusChanged",
  "pipelineItemPriorityChanged",
] as const satisfies readonly TriggerEventType[]

const PRODUCT_EVENT_TYPES = [
  "shoppingCartSent",
  "userAskedAboutProduct",
  "productOrdered",
  "productAddedToCart",
  "productRemovedFromCart",
] as const satisfies readonly TriggerEventType[]

const POST_COMMENT_EVENT_TYPES = [
  "contactCommentedOnPost",
  "contactFirstCommentedOnPost",
] as const satisfies readonly TriggerEventType[]

const kindForEvents = (
  kind: ConditionReferenceKind,
  types: readonly TriggerEventType[],
): [TriggerEventType, ConditionReferenceKind][] =>
  types.map((type) => [type, kind])

/**
 * What a condition row's `sourceId` is, by its event type. Every other type
 * (including `contactInfoUpdated`, whose `sourceId` is a field name) names no
 * resource. Adding an event with a resource-valued `sourceId` is one entry.
 */
const SOURCE_KIND_BY_EVENT_TYPE: Readonly<
  Partial<Record<TriggerEventType, ConditionReferenceKind>>
> = Object.fromEntries([
  ...kindForEvents("tag", ["tagApplied", "tagRemoved"]),
  ...kindForEvents("customField", [
    "customFieldValueChanged",
    "dateTimeBasedTrigger",
  ]),
  ...kindForEvents("sequence", [
    "subscribedToSequence",
    "unsubscribedFromSequence",
  ]),
  ...kindForEvents("product", PRODUCT_EVENT_TYPES),
  ...kindForEvents("productCategory", ["categoryAddedToCart"]),
  ...kindForEvents("pipeline", PIPELINE_EVENT_TYPES),
  // A post-comment condition pins a page or account of the source workspace.
  ...kindForEvents("inbox", POST_COMMENT_EVENT_TYPES),
])

const stageIdOf = (row: TriggerConditionRow): string | null => {
  if (row.type !== "pipelineItemMovedToStage") {
    return null
  }
  const { value } = row
  if (typeof value !== "object" || value === null) {
    return null
  }
  const { stageId } = value as { stageId?: unknown }
  return typeof stageId === "string" && stageId !== "" ? stageId : null
}

/**
 * The stored posts a post-comment condition names in `value.channelPostIds`.
 * Posts belong to a channel of the source workspace and never travel in a
 * template, so a row that names one cannot be installed as it is.
 */
const channelPostIdsOf = (row: TriggerConditionRow): string[] => {
  if (!(POST_COMMENT_EVENT_TYPES as readonly string[]).includes(row.type)) {
    return []
  }
  const { value } = row
  if (typeof value !== "object" || value === null) {
    return []
  }
  const { channelPostIds } = value as { channelPostIds?: unknown }
  return Array.isArray(channelPostIds)
    ? channelPostIds.filter(
        (id): id is string => typeof id === "string" && id !== "",
      )
    : []
}

const sourceKindOf = (
  row: TriggerConditionRow,
): ConditionReferenceKind | null =>
  SOURCE_KIND_BY_EVENT_TYPE[row.type as TriggerEventType] ?? null

/**
 * Every id a row names, with its kind. Collecting wants real (numeric) ids
 * only; remapping also takes anything else in a resource slot, so a value that
 * cannot be a real id is reported as unresolvable instead of being kept.
 */
const referencesOf = (
  row: TriggerConditionRow,
  { numericOnly }: { numericOnly: boolean },
): { kind: ConditionReferenceKind; id: string }[] => {
  const usable = (id: string | null): id is string =>
    Boolean(id) && (!numericOnly || isNumericId(id as string))
  const references: { kind: ConditionReferenceKind; id: string }[] = []
  const kind = sourceKindOf(row)
  if (kind && usable(row.sourceId)) {
    references.push({ kind, id: row.sourceId })
  }
  const stageId = stageIdOf(row)
  if (usable(stageId)) {
    references.push({ kind: "pipelineStage", id: stageId })
  }
  for (const postId of channelPostIdsOf(row)) {
    if (usable(postId)) {
      references.push({ kind: "channelPost", id: postId })
    }
  }
  return references
}

/** The ids the rows name, grouped by kind. */
export const collectTriggerConditionReferences = (
  rows: readonly TriggerConditionRow[],
): Map<ConditionReferenceKind, Set<string>> => {
  const byKind = new Map<ConditionReferenceKind, Set<string>>()
  for (const row of rows) {
    for (const { kind, id } of referencesOf(row, { numericOnly: true })) {
      const bucket = byKind.get(kind) ?? new Set<string>()
      bucket.add(id)
      byKind.set(kind, bucket)
    }
  }
  return byKind
}

/**
 * How many rows name something the template does not carry (a product that was
 * not selected, a deleted pipeline, ...). The install drops such a row, so the
 * publisher is told while editing. Only the kinds in `shipped` are checked: a
 * kind left out is counted elsewhere (tags and custom fields already are, by
 * the manifest count), so it must not be counted twice.
 */
export const countRowsWithUnshippedReferences = (
  rows: readonly TriggerConditionRow[],
  shipped: Readonly<
    Partial<Record<ConditionReferenceKind, ReadonlySet<string>>>
  >,
): number =>
  rows.filter((row) =>
    referencesOf(row, { numericOnly: true }).some(({ kind, id }) => {
      const carried = shipped[kind]
      return carried !== undefined && !carried.has(id)
    }),
  ).length

const withStageId = (
  row: TriggerConditionRow,
  stageId: string,
): TriggerConditionRow => ({
  ...row,
  value: { ...(row.value as Record<string, unknown>), stageId },
})

const withMappedChannelPostId = (
  row: TriggerConditionRow,
  fromId: string,
  toId: string,
): TriggerConditionRow => {
  const value = row.value as { channelPostIds: string[] }
  return {
    ...row,
    value: {
      ...value,
      channelPostIds: value.channelPostIds.map((id) =>
        id === fromId ? toId : id,
      ),
    },
  }
}

export type RemapConditionsResult = {
  conditions: TriggerConditionRow[]
  /** Rows left out because something they name did not make it to this workspace. */
  dropped: { index: number; kind: ConditionReferenceKind; id: string }[]
}

/**
 * Points every row at this workspace's copies through `idMaps`. A row whose
 * reference cannot be resolved is dropped, never widened: an unpinned product
 * or pipeline means "any", so keeping the row with the id removed would make
 * the trigger fire on events the publisher never meant.
 */
export const remapTriggerConditions = (
  rows: readonly TriggerConditionRow[],
  idMaps: Readonly<Record<string, ReadonlyMap<string, string>>>,
): RemapConditionsResult => {
  const conditions: TriggerConditionRow[] = []
  const dropped: RemapConditionsResult["dropped"] = []
  rows.forEach((row, index) => {
    let next = row
    for (const { kind, id } of referencesOf(row, { numericOnly: false })) {
      const target = idMaps[kind]?.get(id)
      if (target === undefined) {
        dropped.push({ index, kind, id })
        return
      }
      if (kind === "channelPost") {
        next = withMappedChannelPostId(next, id, target)
      } else if (kind === "pipelineStage") {
        next = withStageId(next, target)
      } else {
        next = { ...next, sourceId: target }
      }
    }
    conditions.push(next)
  })
  return { conditions, dropped }
}

/** Order-independent form of a row set, for comparing a copy with what a sync would write. */
export const canonicalConditionRows = (
  rows: readonly TriggerConditionRow[],
): TriggerConditionRow[] =>
  rows
    .map((row) => ({
      type: row.type,
      sourceId: row.sourceId ?? null,
      operator: row.operator ?? null,
      value: row.value ?? null,
    }))
    .sort((left, right) =>
      JSON.stringify(left) < JSON.stringify(right) ? -1 : 1,
    )
