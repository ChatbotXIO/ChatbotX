import { isNumericId } from "@chatbotx.io/utils/id"
import type { FlowExportedFlow } from "./schema"

export type FlowReferenceWarning = {
  entityKind: string
  path: string
  value: string
}

/**
 * Field names that hold a workspace-scoped entity id. Matched by exact key
 * name while walking the exported graph — not a per-stepType table — so a new
 * step referencing an existing entity kind (e.g. another `sequenceId`) is
 * covered automatically. Missing an entry here only costs a warning, never
 * correctness for warnings — but the importer *does* now write based on the
 * `"customField"` entries (see `collectCustomFieldReferences` /
 * `remapCustomFieldReferences` below), so a new custom-field-holding key must
 * be added here to be remapped, not just warned about.
 */
const REFERENCE_FIELD_ENTITY_KIND: Record<string, string> = {
  inputFieldId: "customField",
  outputFieldId: "customField",
  outputCustomFieldId: "customField",
  customFieldId: "customField",
  dateTimeFieldId: "customField",
  startDateFieldId: "customField",
  endDateFieldId: "customField",
  contactFieldId: "customField",
  sequenceId: "sequence",
  aiAgentId: "aiAgent",
  integrationId: "integration",
  integrationSmtpId: "integration",
  integrationMessengerId: "integration",
  calendarId: "calendar",
  questionnaireId: "questionnaire",
  topicId: "couponTopic",
  inboxId: "inbox",
  personaId: "messengerPersona",
  spreadsheetId: "spreadsheet",
}

// `flowId` shows up both as a cross-flow jump target (steps/start-external-flow.ts,
// steps/start-external-node.ts) and inside the unrelated WA template flow-token
// encoding — both are still workspace-scoped flow references, so both warn.
const FLOW_REFERENCE_FIELD = "flowId"
// Cross-flow node jump target (steps/start-external-node.ts). Sibling field
// `nodeId` on steps/start-another-node.ts points at the *same* flow being
// imported, so it is never stale and must not be warned about — it is only
// treated as a reference when found alongside a sibling `flowId` key.
const CROSS_FLOW_NODE_FIELD = "nodeId"

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const toWarningValue = (value: unknown): string | null => {
  if (typeof value === "string" && value.trim().length > 0) {
    return value
  }
  return null
}

const walk = (
  value: unknown,
  path: string,
  warnings: FlowReferenceWarning[],
): void => {
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      walk(item, `${path}[${index}]`, warnings)
    }
    return
  }
  if (!isPlainObject(value)) {
    return
  }

  const hasCrossFlowJump = typeof value[FLOW_REFERENCE_FIELD] === "string"

  for (const [key, child] of Object.entries(value)) {
    const childPath = path ? `${path}.${key}` : key
    const entityKind = REFERENCE_FIELD_ENTITY_KIND[key]
    if (entityKind) {
      const stringValue = toWarningValue(child)
      if (stringValue) {
        warnings.push({ entityKind, path: childPath, value: stringValue })
      }
    } else if (key === FLOW_REFERENCE_FIELD) {
      const stringValue = toWarningValue(child)
      if (stringValue) {
        warnings.push({
          entityKind: "flow",
          path: childPath,
          value: stringValue,
        })
      }
    } else if (key === CROSS_FLOW_NODE_FIELD && hasCrossFlowJump) {
      const stringValue = toWarningValue(child)
      if (stringValue) {
        warnings.push({
          entityKind: "flowNode",
          path: childPath,
          value: stringValue,
        })
      }
    }

    walk(child, childPath, warnings)
  }
}

/**
 * Read-only: finds fields that point at workspace-scoped entities so the
 * caller can report which pickers to repoint after import. Never mutates the
 * graph and never gates the import — an unresolvable reference is reported,
 * not rejected. See packages/flow-config/src/import-export/schema.ts for the
 * envelope this walks.
 */
export const collectFlowReferenceWarnings = (
  flow: FlowExportedFlow,
): FlowReferenceWarning[] => {
  const warnings: FlowReferenceWarning[] = []
  walk(flow.nodes, "nodes", warnings)
  walk(flow.edges, "edges", warnings)
  return warnings
}

const isCustomFieldReferenceKey = (key: string): boolean =>
  REFERENCE_FIELD_ENTITY_KIND[key] === "customField"

const collectCustomFieldIds = (value: unknown, ids: Set<string>): void => {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectCustomFieldIds(item, ids)
    }
    return
  }
  if (!isPlainObject(value)) {
    return
  }

  for (const [key, child] of Object.entries(value)) {
    if (
      isCustomFieldReferenceKey(key) &&
      typeof child === "string" &&
      isNumericId(child)
    ) {
      ids.add(child)
    }
    collectCustomFieldIds(child, ids)
  }
}

/**
 * Read-only: finds every custom-field id referenced by a reference slot
 * (`REFERENCE_FIELD_ENTITY_KIND[key] === "customField"`), deduplicated.
 * System-field slugs (`first_name`, `user_tags`) and merge-tag text share the
 * same slots but are excluded by `isNumericId`, which is fully anchored
 * (`/^\d+$/`) — unlike `zodBigintAsString`'s unanchored pattern, so this
 * filter is a sound discriminator on its own.
 *
 * Accepts `nodes`/`edges` as `unknown[]` (not the strict `FlowExportedFlow`
 * shape) so callers can pass a flow-version row straight from the DB — those
 * columns are typed loosely (`{ id: string; [x: string]: unknown }[]`) at the
 * jsonb boundary, before `parseFlowExport` narrows them.
 */
export const collectCustomFieldReferences = (flow: {
  nodes: readonly unknown[]
  edges: readonly unknown[]
}): string[] => {
  const ids = new Set<string>()
  collectCustomFieldIds(flow.nodes, ids)
  collectCustomFieldIds(flow.edges, ids)
  return [...ids]
}

const remapCustomFieldIds = (
  value: unknown,
  idMap: ReadonlyMap<string, string>,
): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => remapCustomFieldIds(item, idMap))
  }
  if (!isPlainObject(value)) {
    return value
  }

  const next: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value)) {
    if (
      isCustomFieldReferenceKey(key) &&
      typeof child === "string" &&
      idMap.has(child)
    ) {
      // biome-ignore lint/style/noNonNullAssertion: idMap.has(child) just checked above
      next[key] = idMap.get(child)!
    } else {
      next[key] = remapCustomFieldIds(child, idMap)
    }
  }
  return next
}

/**
 * Structural clone of `flow` with every custom-field reference slot rewritten
 * from a source-workspace id to a target-workspace id via `idMap`. An id
 * absent from the map passes through unchanged (so it still surfaces as an
 * unresolved-reference warning downstream). Never mutates the input.
 *
 * Rebuilds every plain object key-by-key rather than special-casing known
 * step shapes, so sibling keys on the same row — e.g. a `condition` case's
 * `customFieldType` / `valueType` alongside `customFieldId` — are preserved
 * automatically instead of needing to be threaded through by hand.
 */
export const remapCustomFieldReferences = <
  T extends Pick<FlowExportedFlow, "edges" | "nodes">,
>(
  flow: T,
  idMap: ReadonlyMap<string, string>,
): T => ({
  ...flow,
  nodes: remapCustomFieldIds(flow.nodes, idMap) as T["nodes"],
  edges: remapCustomFieldIds(flow.edges, idMap) as T["edges"],
})
