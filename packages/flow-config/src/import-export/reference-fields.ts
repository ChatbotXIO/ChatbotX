/**
 * Single source of truth for every workspace-scoped entity reference the
 * flow/template exporters know how to find, warn about, or remap. Extracted
 * from `references.ts` so both the flow-import path (which only ever remaps
 * `customField`) and the template-install path (which remaps every kind)
 * share one map instead of drifting.
 */

/**
 * Field names that hold a workspace-scoped entity id, matched by exact key
 * name while walking the exported graph — not a per-stepType table — so a
 * new step referencing an existing entity kind (e.g. another `sequenceId`)
 * is covered automatically. Missing an entry here only costs a warning,
 * never correctness for warnings — but the importer *does* write based on
 * `"customField"` entries, so a new custom-field-holding key must be added
 * here to be remapped, not just warned about.
 */
export const REFERENCE_FIELD_ENTITY_KIND: Record<string, string> = {
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
export const FLOW_REFERENCE_FIELD = "flowId"
// Cross-flow node jump target (steps/start-external-node.ts). Sibling field
// `nodeId` on steps/start-another-node.ts points at the *same* flow being
// imported, so it is never stale and must not be warned about — it is only
// treated as a reference when found alongside a sibling `flowId` key.
export const CROSS_FLOW_NODE_FIELD = "nodeId"

/**
 * Array-valued keys whose *elements* are ids of a given kind — as opposed to
 * `REFERENCE_FIELD_ENTITY_KIND`, where the key's own scalar value is the id.
 * `toWarningValue` only accepts a scalar string, so these need a dedicated
 * element-wise pass.
 */
export const REFERENCE_ARRAY_FIELD_ENTITY_KIND: Record<string, string> = {
  tagIds: "tag",
  addonProductIds: "product",
}

/**
 * Discriminated-union reference fields: the key itself carries no kind
 * information, so the entity kind is looked up from a sibling field's value
 * on the same object. Example: `Condition.sourceId` is a trigger id when
 * `sourceType === "trigger"` and a webhook id when `sourceType === "webhook"`.
 * An unknown discriminator value is left untouched (safely — no remap, no
 * warning), never treated as an error.
 */
export type DiscriminatedReferenceField = {
  /** Sibling key whose value selects the entity kind. */
  readonly discriminatorKey: string
  /** Discriminator value -> entity kind. */
  readonly kindByDiscriminator: Readonly<Record<string, string>>
}

export const DISCRIMINATED_REFERENCE_FIELDS: Readonly<
  Record<string, DiscriminatedReferenceField>
> = {
  sourceId: {
    discriminatorKey: "sourceType",
    kindByDiscriminator: {
      trigger: "trigger",
      webhook: "webhook",
    },
  },
}

/**
 * Prefixed-string reference fields: the id is embedded after a literal
 * prefix inside a free-form string (or array of strings), e.g.
 * `AIAgent.tools` holding `"fn:12345"` / `"file:67890"` / `"mcp:11111"`.
 * Gated to an explicit key allowlist below — rewriting *any* string matching
 * `prefix:id` would corrupt free text that happens to contain `"fn:..."`.
 */
export const PREFIXED_REFERENCE_ENTITY_KIND: Readonly<Record<string, string>> =
  {
    fn: "aiFunction",
    file: "aiFile",
    mcp: "aiMcpServer",
  }

/** Keys whose string/array-of-string values may hold `prefix:id` tokens. */
export const PREFIXED_REFERENCE_FIELDS: ReadonlySet<string> = new Set(["tools"])

/**
 * Depth ceiling for every walker in this module and in `remap.ts`.
 *
 * These recurse over attacker-supplied JSON. A few step schemas keep an
 * unconstrained escape hatch — `steps: z.array(z.any())` on a null-typed
 * button (`steps/button.ts`), the same on `steps/email.ts`, and
 * `flow_action_data: z.record(z.string(), z.unknown())` on
 * `steps/send-wa-message-template.ts` — so validated input can still carry
 * arbitrary nesting. Node's stack blows around ~10k frames, well inside the
 * 5MB upload cap (a ~100KB file reaches 50k levels), which would surface as
 * an opaque RangeError instead of a readable failure.
 *
 * Anything deeper than this is not a real flow, so the read-only walkers
 * stop descending (costing only a missed warning) and the write-path walker
 * returns the remaining subtree unchanged (never dropping data).
 */
export const MAX_WALK_DEPTH = 512

export const isPlainObject = (
  value: unknown,
): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
