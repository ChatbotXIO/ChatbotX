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
 * correctness: nothing in the importer writes based on this table.
 */
const REFERENCE_FIELD_ENTITY_KIND: Record<string, string> = {
  inputFieldId: "customField",
  outputFieldId: "customField",
  outputCustomFieldId: "customField",
  customFieldId: "customField",
  dateTimeFieldId: "customField",
  startDateFieldId: "customField",
  endDateFieldId: "customField",
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
