import {
  isSingleValueOperator,
  PIPELINE_ACTIVITY_KINDS_BY_GROUP,
  PIPELINE_FIELD_PRESENCE_OPERATORS,
  type PipelineActivityGroup,
  type PipelineActivityKind,
  pipelineActivityGroups,
} from "@chatbotx.io/database/partials"
import { toLocalDateKey } from "@/features/ads/lib/ads-date-key"
import {
  type DatePreset,
  type ResolvablePreset,
  resolveDatePreset,
} from "../../lib/date-presets"
import type { BoardFilterInput, BoardFilterRequest } from "./types"

export type DateRangeValue = { from?: Date; to?: Date } | undefined

// Day bounds are the viewer's local days, matching what the date input shows.
export const toDateInput = (date: Date | undefined): string =>
  date ? toLocalDateKey(date) : ""

export const fromDateInput = (value: string, endOfDay = false) =>
  value
    ? new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}`)
    : undefined

export const toggle = <T>(list: T[] | undefined, value: T): T[] => {
  const current = list ?? []
  return current.includes(value)
    ? current.filter((entry) => entry !== value)
    : [...current, value]
}

const countRange = (range: DateRangeValue) => (range?.from || range?.to ? 1 : 0)

/** Whether the value filter holds a usable condition. */
const hasValueCondition = (value: BoardFilterInput["value"]): boolean => {
  if (!value) {
    return false
  }
  if (isSingleValueOperator(value.operator)) {
    return value.amount !== undefined
  }
  return value.min !== undefined || value.max !== undefined
}

/** Operators of a custom field that need no value input. */
export const VALUELESS_FIELD_OPERATORS: ReadonlySet<string> = new Set(
  PIPELINE_FIELD_PRESENCE_OPERATORS,
)

export type FieldCondition = NonNullable<
  BoardFilterInput["fieldConditions"]
>[string]

const isFilled = (text: string | undefined): text is string =>
  text !== undefined && text !== ""

/** Whether a condition holds what its operator needs (the server also checks it against the field type). */
const hasFieldConditionValue = (condition: FieldCondition): boolean => {
  if (VALUELESS_FIELD_OPERATORS.has(condition.operator)) {
    return true
  }
  if (condition.operator === "between") {
    return isFilled(condition.value) || isFilled(condition.valueTo)
  }
  return isFilled(condition.value)
}

/** Row ids whose date is chosen from presets or a custom range. */
const RANGE_ROW_KEYS = [
  "dueDate",
  "createdAt",
  "updatedAt",
  "statusChangedAt",
  "stageEnteredAt",
  "lastCommentAt",
] as const
type RangeRowKey = (typeof RANGE_ROW_KEYS)[number]

const CLOSED_AS_PREFIX = "closedAs-"
/** Row id of the "When" date of the activity condition. */
export const ACTIVITY_WHEN_ROW = "activityWhen"
export const ACTIVITY_KINDS_ROW = "activityKinds"
export const ACTIVITY_ACTORS_ROW = "activityActors"

export type ActivityMatch = NonNullable<BoardFilterInput["activityMatch"]>
/** Row id of a custom field in the filter sheet. */
const FIELD_PREFIX = "field-"

export type DateRowState = { preset?: DatePreset; range?: DateRangeValue }

export const without = <T>(
  record: Record<string, T> | undefined,
  key: string,
): Record<string, T> => {
  const { [key]: _removed, ...others } = record ?? {}
  return others
}

/** The preset and from/to range currently held by a date row. */
export function readDateRow(
  filter: BoardFilterInput,
  rowId: string,
): DateRowState {
  const preset = filter.presets?.[rowId]
  if (rowId.startsWith(CLOSED_AS_PREFIX)) {
    const status = rowId.slice(CLOSED_AS_PREFIX.length) as "won" | "lost"
    return { preset, range: filter.closedAs?.[status] }
  }
  if (rowId === ACTIVITY_WHEN_ROW) {
    return { preset, range: filter.activityMatch?.occurredAt }
  }
  return { preset, range: filter[rowId as RangeRowKey] }
}

/** A new filter with the date row set (preset and range are kept consistent by the caller). */
export function writeDateRow(
  filter: BoardFilterInput,
  rowId: string,
  next: DateRowState,
): BoardFilterInput {
  const presets = next.preset
    ? { ...filter.presets, [rowId]: next.preset }
    : without(filter.presets, rowId)
  const base = { ...filter, presets }
  if (rowId.startsWith(CLOSED_AS_PREFIX)) {
    const status = rowId.slice(CLOSED_AS_PREFIX.length)
    return {
      ...base,
      closedAs: next.range
        ? { ...filter.closedAs, [status]: next.range }
        : without(filter.closedAs, status),
    }
  }
  if (rowId === ACTIVITY_WHEN_ROW) {
    return {
      ...base,
      activityMatch: { ...filter.activityMatch, occurredAt: next.range },
    }
  }
  return { ...base, [rowId]: next.range }
}

/** A new filter with the activity condition's parts replaced. */
export const writeActivityMatch = (
  filter: BoardFilterInput,
  patch: Partial<ActivityMatch>,
): BoardFilterInput => ({
  ...filter,
  activityMatch: { ...filter.activityMatch, ...patch },
})

/** Activity groups whose every kind is selected (groups never share kinds). */
export const selectedActivityGroups = (
  kinds: ActivityMatch["kinds"],
): PipelineActivityGroup[] =>
  pipelineActivityGroups.options.filter((group) =>
    PIPELINE_ACTIVITY_KINDS_BY_GROUP[group].every((kind) =>
      kinds?.includes(kind),
    ),
  )

/** Selects or deselects every kind of an activity group. */
export function toggleActivityGroup(
  kinds: ActivityMatch["kinds"],
  group: PipelineActivityGroup,
): PipelineActivityKind[] {
  const groupKinds = PIPELINE_ACTIVITY_KINDS_BY_GROUP[group]
  const current = kinds ?? []
  return selectedActivityGroups(current).includes(group)
    ? current.filter((kind) => !groupKinds.includes(kind))
    : [...new Set([...current, ...groupKinds])]
}

/** The condition on a custom field. */
export const readFieldCondition = (
  filter: BoardFilterInput,
  fieldId: string,
): FieldCondition | undefined => filter.fieldConditions?.[fieldId]

/** A new filter with the field's condition set (or removed). */
export function writeFieldCondition(
  filter: BoardFilterInput,
  fieldId: string,
  condition: FieldCondition | undefined,
): BoardFilterInput {
  return {
    ...filter,
    fieldConditions: condition
      ? { ...filter.fieldConditions, [fieldId]: condition }
      : without(filter.fieldConditions, fieldId),
  }
}

/** Choice of a date row's radio list. */
export type DateChoice = ResolvablePreset | "all" | "custom"

export function dateChoiceOf(
  filter: BoardFilterInput,
  rowId: string,
): DateChoice {
  const { preset, range } = readDateRow(filter, rowId)
  if (preset) {
    return preset
  }
  return countRange(range) > 0 ? "custom" : "all"
}

/** A new filter after the user picked `choice` on a date row. */
export function applyDateChoice(
  filter: BoardFilterInput,
  rowId: string,
  choice: DateChoice,
): BoardFilterInput {
  const { range } = readDateRow(filter, rowId)
  if (choice === "all") {
    return writeDateRow(filter, rowId, {})
  }
  if (choice === "custom") {
    return writeDateRow(filter, rowId, { preset: "custom", range })
  }
  return writeDateRow(filter, rowId, { preset: choice })
}

const countDateRow = (filter: BoardFilterInput, rowId: string): number => {
  const { preset, range } = readDateRow(filter, rowId)
  return (preset && preset !== "custom") || countRange(range) > 0 ? 1 : 0
}

/** Filter rows holding a value, opened expanded when the filter sheet opens. */
export const openFilterRowIds = (filter: BoardFilterInput): string[] =>
  Object.entries(filterRowCounts(filter)).flatMap(([id, count]) =>
    count > 0 ? [id] : [],
  )

const DATE_ROW_IDS: readonly string[] = [
  "dueDate",
  "createdAt",
  "updatedAt",
  "closedAs-won",
  "closedAs-lost",
  "statusChangedAt",
  "stageEnteredAt",
  "lastCommentAt",
]

/**
 * Active-condition count of every filter row, keyed by the row id the filter
 * sheet renders. The sheet badges and the toolbar total both sum from here.
 */
export function filterRowCounts(
  filter: BoardFilterInput,
): Record<string, number> {
  const counts: Record<string, number> = {
    assignees:
      (filter.assigneeMemberIds?.length ?? 0) +
      (filter.assigneeTeamIds?.length ?? 0),
    status: filter.statuses?.length ?? 0,
    priority: filter.priorities?.length ?? 0,
    value: hasValueCondition(filter.value) ? 1 : 0,
  }
  for (const rowId of DATE_ROW_IDS) {
    counts[rowId] = countDateRow(filter, rowId)
  }
  const activity = filter.activityMatch
  counts[ACTIVITY_KINDS_ROW] = selectedActivityGroups(activity?.kinds).length
  counts[ACTIVITY_ACTORS_ROW] =
    (activity?.actorUserIds?.length ?? 0) + (activity?.automation ? 1 : 0)
  counts[ACTIVITY_WHEN_ROW] = countDateRow(filter, ACTIVITY_WHEN_ROW)
  for (const [fieldId, condition] of Object.entries(
    filter.fieldConditions ?? {},
  )) {
    counts[`${FIELD_PREFIX}${fieldId}`] = hasFieldConditionValue(condition)
      ? 1
      : 0
  }
  return counts
}

export const countActiveFilters = (filter: BoardFilterInput): number =>
  Object.values(filterRowCounts(filter)).reduce((sum, count) => sum + count, 0)

const cleanRange = (range: DateRangeValue): DateRangeValue =>
  range?.from || range?.to ? range : undefined

/** Keeps only the non-empty ranges of a keyed record (closedAs, activity). */
const pruneRanges = (
  ranges: Partial<Record<string, DateRangeValue>> | undefined,
): Record<string, NonNullable<DateRangeValue>> | undefined => {
  const kept: Record<string, NonNullable<DateRangeValue>> = {}
  for (const [key, value] of Object.entries(ranges ?? {})) {
    const range = cleanRange(value)
    if (range) {
      kept[key] = range
    }
  }
  return Object.keys(kept).length > 0 ? kept : undefined
}

/** The activity condition without its empty parts; undefined when nothing is set. */
const cleanActivityMatch = (
  match: BoardFilterInput["activityMatch"],
): BoardFilterInput["activityMatch"] => {
  if (!match) {
    return
  }
  const cleaned: ActivityMatch = {
    ...(match.kinds?.length ? { kinds: match.kinds } : {}),
    ...(match.actorUserIds?.length ? { actorUserIds: match.actorUserIds } : {}),
    ...(match.automation ? { automation: true } : {}),
    ...(cleanRange(match.occurredAt)
      ? { occurredAt: cleanRange(match.occurredAt) }
      : {}),
  }
  return Object.keys(cleaned).length > 0 ? cleaned : undefined
}

/** Drops incomplete conditions and the operands their operator does not use. */
const cleanFieldConditions = (
  conditions: BoardFilterInput["fieldConditions"],
): BoardFilterInput["fieldConditions"] => {
  const entries = Object.entries(conditions ?? {}).flatMap(
    ([fieldId, condition]) => {
      if (!hasFieldConditionValue(condition)) {
        return []
      }
      const { operator, value, valueTo } = condition
      if (VALUELESS_FIELD_OPERATORS.has(operator)) {
        return [[fieldId, { operator }] as const]
      }
      return [
        [
          fieldId,
          operator === "between"
            ? {
                operator,
                ...(isFilled(value) ? { value } : {}),
                ...(isFilled(valueTo) ? { valueTo } : {}),
              }
            : { operator, value },
        ] as const,
      ]
    },
  )
  return entries.length > 0 ? Object.fromEntries(entries) : undefined
}

const cleanValue = (
  value: BoardFilterInput["value"],
): BoardFilterInput["value"] => {
  if (!hasValueCondition(value) || value === undefined) {
    return
  }
  if (isSingleValueOperator(value.operator)) {
    return { operator: value.operator, amount: value.amount }
  }
  return {
    ...(value.operator ? { operator: value.operator } : {}),
    min: value.min,
    max: value.max,
  }
}

/**
 * Keeps the presets that stand for a relative range. `custom` is implied by a
 * from/to range, so it is dropped (an empty custom range is no filter).
 */
const cleanPresets = (
  presets: BoardFilterInput["presets"],
): BoardFilterInput["presets"] => {
  const entries = Object.entries(presets ?? {}).filter(
    ([, preset]) => preset !== "custom",
  )
  return entries.length > 0 ? Object.fromEntries(entries) : undefined
}

/** A date row picking a preset must not also carry the range of an earlier custom choice. */
const dropRangesOfPresetRows = (filter: BoardFilterInput): BoardFilterInput =>
  Object.keys(filter.presets ?? {}).reduce(
    (current, rowId) =>
      writeDateRow(current, rowId, {
        preset: current.presets?.[rowId],
        range: undefined,
      }),
    filter,
  )

/** Drops empty arrays, empty ranges and blank values so the filter count stays honest. */
export function cleanFilter(draft: BoardFilterInput): BoardFilterInput {
  const presets = cleanPresets(draft.presets)
  const withPresets = dropRangesOfPresetRows({ ...draft, presets })
  const next: BoardFilterInput = {
    ...withPresets,
    presets: cleanPresets(withPresets.presets),
    value: cleanValue(draft.value),
    ...Object.fromEntries(
      RANGE_ROW_KEYS.map((key) => [key, cleanRange(withPresets[key])]),
    ),
    closedAt: cleanRange(draft.closedAt),
    closedAs: pruneRanges(withPresets.closedAs),
    activity: pruneRanges(draft.activity),
    activityMatch: cleanActivityMatch(withPresets.activityMatch),
    fieldConditions: cleanFieldConditions(draft.fieldConditions),
  }
  return Object.fromEntries(
    Object.entries(next).filter(([, value]) =>
      Array.isArray(value) ? value.length > 0 : value !== undefined,
    ),
  ) as BoardFilterInput
}

/**
 * The API filter for a board filter: every relative preset is resolved to a
 * concrete range as of `now`, and the preset keys themselves are not sent.
 */
export function toRequestFilter(
  filter: BoardFilterInput,
  now: Date,
  timezone?: string,
): BoardFilterRequest {
  const { presets, ...rest } = filter
  let resolved: BoardFilterInput = rest
  for (const [rowId, preset] of Object.entries(presets ?? {})) {
    if (preset !== "custom") {
      resolved = writeDateRow(resolved, rowId, {
        range: resolveDatePreset(preset, now),
      })
    }
  }
  const { presets: _dropped, ...request } = resolved
  // Date conditions compare calendar days, in the viewer's zone.
  return timezone && request.fieldConditions
    ? { ...request, timezone }
    : request
}

/** Feature whose filter row disappears when the pipeline hides it. */
const FILTER_KEY_BY_FEATURE = {
  value: "value",
  priority: "priorities",
  dueDate: "dueDate",
} as const satisfies Record<string, keyof BoardFilterInput>

const keepFields = <T>(
  record: Record<string, T> | undefined,
  fieldIds: ReadonlySet<string>,
): Record<string, T> | undefined => {
  if (!record) {
    return
  }
  const kept = Object.entries(record).filter(([id]) => fieldIds.has(id))
  return kept.length > 0 ? Object.fromEntries(kept) : undefined
}

/**
 * The part of a filter the pipeline can still apply: conditions on a hidden
 * feature or on a deleted custom field are dropped, since their rows are gone
 * from the filter sheet and the server rejects unknown date fields.
 */
export function applicableFilter(
  filter: BoardFilterInput,
  context: {
    hiddenFeatures: ReadonlySet<string>
    fieldIds: ReadonlySet<string>
  },
): BoardFilterInput {
  const hiddenKeys = new Set<string>(
    Object.entries(FILTER_KEY_BY_FEATURE)
      .filter(([feature]) => context.hiddenFeatures.has(feature))
      .map(([, key]) => key),
  )
  const visible = Object.fromEntries(
    Object.entries(filter).filter(([key]) => !hiddenKeys.has(key)),
  ) as BoardFilterInput
  const presets = Object.entries(filter.presets ?? {}).filter(
    ([rowId]) =>
      !(context.hiddenFeatures.has("dueDate") && rowId === "dueDate"),
  )
  return cleanFilter({
    ...visible,
    presets: presets.length > 0 ? Object.fromEntries(presets) : undefined,
    fieldConditions: keepFields(filter.fieldConditions, context.fieldIds),
  })
}
