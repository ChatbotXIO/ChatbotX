/** Fields the installer owns: a sync never writes them, and they never enter the fingerprint. */
export const FLOW_INSTALLER_OWNED_FIELDS = [
  "active",
  "enableInInbox",
  "folderId",
] as const

/** Kinds already resolvable when flows insert (their categories or manifests come first). */
export const FLOW_INSERT_KINDS = [
  "customField",
  "botField",
  "sequence",
  "aiAgent",
  "integration",
  "calendar",
  "questionnaire",
  "couponTopic",
  "inbox",
  "messengerPersona",
  "spreadsheet",
  "tag",
  "product",
  "webhook",
  "aiFunction",
  "aiFile",
  "aiMcpServer",
  "pipeline",
  "pipelineStage",
  "pipelineField",
  // Found or created by name from `manifests.placeCategories`.
  "placeCategory",
  "workspaceMember",
  "inboxTeam",
  // Not remapped through an id map; reported when unresolved so the sanitizer
  // can verify each against the target workspace.
  "vendor",
  "productCategory",
  "decisionProfile",
  "userPersistentMenu",
  "leaderboard",
  "miniApp",
]

// `trigger` cannot be in `FLOW_INSERT_KINDS`: `triggers` inserts *after*
// flows in Phase 1 (a trigger's own actions can reference a flow), so a
// flow -> trigger reference (e.g. `Condition.sourceId` with
// `sourceType: "trigger"`) would create a real dependency cycle between the
// `flows` and `triggers` categories if resolved eagerly. Deferred to the
// same Phase-2 patch task as `flow`/`flowNode`.
export const FLOW_DEFERRED_KINDS = ["flow", "flowNode", "trigger"]

/** Every kind a flow's references can name: what a sync resolves in one pass. */
export const FLOW_ALL_KINDS = [...FLOW_INSERT_KINDS, ...FLOW_DEFERRED_KINDS]
