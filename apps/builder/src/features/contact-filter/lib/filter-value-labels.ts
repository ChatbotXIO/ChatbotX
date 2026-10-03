import type { SelectOption } from "@chatbotx.io/ui/components/form/select-field"
import {
  CONTACT_FILTER_FIELD_DEFINITIONS,
  type ContactFilterOptionSource,
} from "../schema"
import {
  isFilterValueId,
  MAX_FILTER_VALUE_LABEL_IDS,
  type ResolveFilterValueLabelsResponse,
} from "../schema/value-labels"

type FilterValueLabelType = keyof ResolveFilterValueLabelsResponse

type FilterValueLabelSource = {
  /** Where the ids behind a condition value are looked up. */
  lookups: { type: FilterValueLabelType; valuePrefix?: string }[]
  /** Values that are never ids; their label stays the one already in `options`. */
  fixedValues?: string[]
}

/**
 * Option sources whose condition values are workspace entity ids that can be
 * looked up by id (see `resolveFilterValueLabelsAPI`). The picker lists for
 * these are capped or filtered, so labels never come from them.
 */
const FILTER_VALUE_LABEL_SOURCES: Partial<
  Record<ContactFilterOptionSource, FilterValueLabelSource>
> = {
  tags: { lookups: [{ type: "tags" }] },
  sequences: { lookups: [{ type: "sequences" }] },
  broadcasts: { lookups: [{ type: "broadcasts" }] },
  reflinks: { lookups: [{ type: "reflinks" }] },
  inboxes: { lookups: [{ type: "inboxes" }] },
  assignees: {
    lookups: [
      { type: "members", valuePrefix: "u_" },
      { type: "inboxTeams", valuePrefix: "t_" },
    ],
    fixedValues: ["unassigned"],
  },
}

const optionSourceByField = new Map(
  CONTACT_FILTER_FIELD_DEFINITIONS.map((definition) => [
    definition.field as string,
    definition.optionSource,
  ]),
)

export type FilterValueCondition = {
  field: string
  value?: string | string[]
}

export type FilterValueIds = Partial<Record<FilterValueLabelType, string[]>>

const toValueList = (value: FilterValueCondition["value"]): string[] => {
  if (value === undefined) {
    return []
  }
  return Array.isArray(value) ? value : [value]
}

/**
 * Ids a filter references, grouped by lookup type. `undefined` when there is
 * nothing to look up, or when a type holds more ids than one request allows
 * (labels then fall back to the picker lists rather than flagging real
 * entities as unknown).
 */
export const collectFilterValueIds = (
  conditions: readonly FilterValueCondition[],
): FilterValueIds | undefined => {
  const ids: Record<string, Set<string>> = {}

  for (const condition of conditions) {
    const source =
      FILTER_VALUE_LABEL_SOURCES[
        optionSourceByField.get(condition.field) ?? "none"
      ]
    if (!source) {
      continue
    }
    for (const value of toValueList(condition.value)) {
      if (source.fixedValues?.includes(value)) {
        continue
      }
      for (const { type, valuePrefix } of source.lookups) {
        const id = valuePrefix
          ? value.startsWith(valuePrefix) && value.slice(valuePrefix.length)
          : value
        // A value that is not a valid id (e.g. `u_undefined`) can never match
        // a row, and sending it would fail the whole lookup.
        if (id && isFilterValueId(id)) {
          ids[type] = (ids[type] ?? new Set()).add(id)
        }
      }
    }
  }

  const entries = Object.entries(ids).map(
    ([type, values]) => [type, [...values]] as const,
  )
  if (
    entries.length === 0 ||
    entries.some(([, values]) => values.length > MAX_FILTER_VALUE_LABEL_IDS)
  ) {
    return
  }
  return Object.fromEntries(entries)
}

/**
 * Options holding every value the filter references that still exists, for
 * display only. A condition value missing from them no longer exists.
 * `undefined` for option sources that are not looked up by id.
 */
export const buildFilterValueLabels = (
  optionSource: ContactFilterOptionSource,
  resolved: ResolveFilterValueLabelsResponse,
  options: SelectOption[] | undefined,
): SelectOption[] | undefined => {
  const source = FILTER_VALUE_LABEL_SOURCES[optionSource]
  if (!source) {
    return
  }
  const resolvedOptions = source.lookups.flatMap(({ type, valuePrefix }) =>
    resolved[type].map(({ id, name }) => ({
      value: `${valuePrefix ?? ""}${id}`,
      label: name,
    })),
  )
  const fixedOptions = (options ?? []).filter((option) =>
    source.fixedValues?.includes(option.value),
  )
  return [...resolvedOptions, ...fixedOptions]
}
