/**
 * Reviewed inputs for the OpenAI profile manifest. v1 exposes 36 API tools
 * (28 read, 8 write) plus `get_guide`. Flow authoring/sending and sequence
 * update/subscribe are deferred to v2 (see `OPENAI_DEFERRED_TOOLS`).
 */
export const OPENAI_CONTRACT_VERSION = "1.0.0"

export const OPENAI_READ_TOOLS = [
  "ai_agents_list",
  "ai_files_list",
  "analytics_new_contact_counts_per_day",
  "analytics_blocked_contacts_per_day",
  "analytics_broadcast_stats",
  "analytics_sequence_step_stats",
  "analytics_flow_stats",
  "broadcasts_list",
  "broadcasts_get",
  "capabilities_get",
  "contacts_list",
  "contacts_get",
  "contacts_list_tags",
  "contacts_list_custom_fields",
  "contacts_list_messages",
  "contacts_list_sequences",
  "conversations_list",
  "conversations_get",
  "flows_list",
  "flows_get",
  "keywords_list",
  "messages_list",
  "mini_apps_list",
  "pipelines_list",
  "pipelines_list_items",
  "sequences_list",
  "sequences_get",
  "token_get",
] as const

export const OPENAI_WRITE_TOOLS = [
  "contacts_create",
  "contacts_add_tags_by_name",
  "contacts_set_custom_field",
  "contacts_send_message",
  "conversations_assign",
  "broadcasts_stop",
  "pipelines_create_item",
  "pipelines_move_item",
] as const

export const OPENAI_API_TOOLS = [
  ...OPENAI_READ_TOOLS,
  ...OPENAI_WRITE_TOOLS,
] as const

/** Removed from v1: they only support deferred flow authoring. */
export const OPENAI_EXCLUDED_TOOLS = [
  "flows_validate",
  "schemas_flow_spec",
] as const

export const OPENAI_DEFERRED_TOOLS = [
  "flows_create",
  "flows_update_draft",
  "flows_publish",
  "sequences_update",
  "contacts_send_flow",
  "contacts_subscribe_sequences",
] as const

/**
 * Approval policies that keep the server-side `_confirm` round trip. ChatGPT
 * already asks the user before any tool without `readOnlyHint`, so an ordinary
 * update (`confirm_diff`) would be approved twice; only actions that reach a
 * real person or stop live sending get the extra review of current state.
 */
export const OPENAI_CONFIRMED_POLICIES = [
  "confirm_outbound",
  "confirm_destructive",
] as const

export type OpenAiToolOverride = {
  adapterBody?: Record<string, unknown>
  annotations?: Partial<{
    destructiveHint: boolean
    idempotentHint: boolean
    openWorldHint: boolean
    readOnlyHint: boolean
  }>
  description?: string
  removeProperties?: string[]
}

export const OPENAI_TOOL_OVERRIDES: Record<string, OpenAiToolOverride> = {
  analytics_broadcast_stats: {
    description:
      "Get delivery statistics for one broadcast. Resolve the broadcast with `broadcasts.list` first.",
  },
  analytics_flow_stats: {
    description:
      "Get run statistics for one flow. Resolve the flow with `flows.list` first.",
  },
  capabilities_get: {
    description:
      "Discover workspace reference data such as channels, inboxes and tags. Use `include` (comma-separated) to narrow the response.",
  },
  contacts_add_tags_by_name: {
    description:
      'Add tags to a contact by tag name. Existing tags with a matching name are reused; unmatched names are created. Example: `{"tags":["VIP"]}`.',
  },
  contacts_send_message: {
    description:
      "Send one message to a contact on a chosen inbox. This delivers the message to a real person on a real channel and cannot be undone. Show the user the exact text and recipient before confirming. Delivery is asynchronous: a message the channel rejects is removed from the conversation.",
  },
  flows_list: {
    description:
      "List active flows in the workspace, newest first unless `sort` is given. Filter by `name` (substring), `folderId`, or `startType`. This profile reads flows only; it cannot create, edit, publish or send them.",
  },
  keywords_list: {
    description:
      "List keyword automations. Inbound keywords match messages from contacts; outbound keywords match messages sent by the page or agent.",
  },
  // The API requires `gender`; the profile never accepts or infers it.
  // Free-form maps are not permitted by the profile's input rules.
  pipelines_list_items: { removeProperties: ["fieldConditions"] },
  pipelines_create_item: { removeProperties: ["fieldValues"] },
  contacts_create: {
    adapterBody: { gender: "unknown" },
    removeProperties: ["gender"],
  },
}
