import {
  systemFieldTypes,
  type TemplateResourceCategory,
} from "@chatbotx.io/database/partials"
import {
  collectReferencesByKind,
  forEachStringLeaf,
} from "@chatbotx.io/flow-config"
import { isNumericId } from "@chatbotx.io/utils/id"
import { VARIABLE_PLACEHOLDER_SOURCE } from "@chatbotx.io/utils/variables"
import { z } from "zod"
import type { TemplateHardDependency } from "./adapters/types"
import {
  collectTriggerConditionReferences,
  triggerConditionRowSchema,
} from "./trigger-conditions"

/**
 * Resource kinds a flow or trigger can name by id whose rows a template ships
 * as their own category: the install remaps them by id, so the row has to
 * travel with whatever points at it.
 */
const DEPENDENCY_CATEGORY_BY_KIND = {
  flow: "flows",
  aiAgent: "aiAgents",
  calendar: "calendars",
  sequence: "sequences",
  questionnaire: "questionnaires",
  couponTopic: "couponTopics",
} as const satisfies Partial<Record<string, TemplateResourceCategory>>

/** The shipped-category rows `value` names, as hard dependencies of its owner. */
export const collectResourceDependencies = (
  value: unknown,
): TemplateHardDependency[] => {
  const kinds = Object.keys(
    DEPENDENCY_CATEGORY_BY_KIND,
  ) as (keyof typeof DEPENDENCY_CATEGORY_BY_KIND)[]
  const byKind = collectReferencesByKind(value, kinds)
  return kinds.flatMap((kind) =>
    [...(byKind.get(kind) ?? [])].map((sourceId) => ({
      category: DEPENDENCY_CATEGORY_BY_KIND[kind],
      sourceId,
    })),
  )
}

const COUPON_PREFIX = "coupon:"
const BOT_FIELD_PREFIX = "bot_field:"
const PIPELINE_PREFIX = "pipelines."
const RAW_PREFIX = "raw:"

export type ManifestReferences = {
  tagIds: Set<string>
  customFieldIds: Set<string>
  /** Custom-field names used as `{{name}}` / `{{raw:name}}` tokens. */
  customFieldNames: Set<string>
  /**
   * Bot-field ids named by a reference slot or a `{{bot_field:<id>}}` token in
   * any string, in every kind of entry (flows, triggers, keywords, AI prompts,
   * ...), so the field ships whatever points at it.
   */
  botFieldIds: Set<string>
}

/**
 * The custom-field name a `{{token}}` addresses, or `null` when the token is
 * something else. Mirrors the runtime's resolver order
 * (`variables/src/contact-variable.ts`): a system field wins over a custom
 * field of the same name, and coupon / pipeline / bot-field tokens never reach
 * the custom-field resolver.
 */
export const customFieldNameFromToken = (token: string): string | null => {
  const name = token.trim()
  if (
    name.startsWith(COUPON_PREFIX) ||
    name.startsWith(BOT_FIELD_PREFIX) ||
    name.startsWith(PIPELINE_PREFIX)
  ) {
    return null
  }
  const customName = name.startsWith(RAW_PREFIX)
    ? name.slice(RAW_PREFIX.length)
    : name
  if (
    !customName ||
    (systemFieldTypes.options as readonly string[]).includes(name)
  ) {
    return null
  }
  return customName
}

/** Calls `visit` with the inside of every `{{...}}` placeholder in any string leaf of `value`. */
const forEachToken = (value: unknown, visit: (token: string) => void): void =>
  forEachStringLeaf(value, (text) => {
    for (const match of text.matchAll(
      new RegExp(VARIABLE_PLACEHOLDER_SOURCE, "g"),
    )) {
      visit(match[1] ?? "")
    }
  })

const collectTokenNames = (value: unknown, names: Set<string>): void =>
  forEachToken(value, (token) => {
    const name = customFieldNameFromToken(token)
    if (name) {
      names.add(name)
    }
  })

export const collectBotFieldTokenIds = (
  value: unknown,
  ids: Set<string>,
): void =>
  forEachToken(value, (token) => {
    const trimmed = token.trim()
    if (trimmed.startsWith(BOT_FIELD_PREFIX)) {
      // Only a real id: anything else would reach a bigint column as a query.
      const id = trimmed.slice(BOT_FIELD_PREFIX.length).trim()
      if (isNumericId(id)) {
        ids.add(id)
      }
    }
  })

/** The ids a trigger entry's condition rows name; empty for any other entry. */
const conditionReferencesOf = (entry: unknown) => {
  const rows = z
    .array(triggerConditionRowSchema)
    .safeParse((entry as { conditions?: unknown } | null)?.conditions)
  return collectTriggerConditionReferences(rows.success ? rows.data : [])
}

/**
 * Every tag and custom field a set of collected resource entries refers to,
 * read the same two ways the install remaps them: from reference slots (the
 * shared walker, so collection and remap cannot drift) and from `{{name}}`
 * tokens embedded in any string. System-field slugs sharing a slot with a real
 * id are excluded by `isNumericId`.
 */
export const collectManifestReferences = (
  entries: readonly unknown[],
): ManifestReferences => {
  const references: ManifestReferences = {
    tagIds: new Set(),
    customFieldIds: new Set(),
    customFieldNames: new Set(),
    botFieldIds: new Set(),
  }
  for (const entry of entries) {
    const byKind = collectReferencesByKind(entry, [
      "tag",
      "customField",
      "botField",
    ])
    for (const id of byKind.get("botField") ?? []) {
      if (isNumericId(id)) {
        references.botFieldIds.add(id)
      }
    }
    collectBotFieldTokenIds(entry, references.botFieldIds)
    for (const id of byKind.get("tag") ?? []) {
      references.tagIds.add(id)
    }
    for (const id of byKind.get("customField") ?? []) {
      if (isNumericId(id)) {
        references.customFieldIds.add(id)
      }
    }
    collectTokenNames(entry, references.customFieldNames)
    for (const [kind, ids] of conditionReferencesOf(entry)) {
      const target =
        kind === "tag" ? references.tagIds : references.customFieldIds
      if (kind === "tag" || kind === "customField") {
        for (const id of ids) {
          target.add(id)
        }
      }
    }
  }
  return references
}
