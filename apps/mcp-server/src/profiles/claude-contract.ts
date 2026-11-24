/**
 * The Claude connector profile (`/mcp/claude`): the fixed tool surface
 * submitted to Anthropic's connector and plugin directory.
 *
 * Directory rules this profile is built around
 * (https://claude.com/docs/connectors/building/review-criteria):
 * - no catch-all tool: there is no `search_tools` / `call_tool`; every
 *   operation is its own tool, so reads and writes are separate tools;
 * - every tool has a `title`, and `readOnlyHint: true` (reads) or
 *   `destructiveHint: true` (anything that changes data);
 * - tool names are 64 characters or fewer.
 *
 * The tools are executed from the live OpenAPI spec (same request path,
 * argument handling and `_confirm` approval step as the default profile).
 * Every name below must stay a `visibility: "default"` operation; the
 * builder test `public-spec-mcp.test.ts` fails when one disappears.
 */

export const CLAUDE_READ_TOOLS = [
  "ai_agents_list",
  "ai_files_list",
  "ai_functions_list",
  "analytics_blocked_contacts_per_day",
  "analytics_broadcast_stats",
  "analytics_flow_stats",
  "analytics_new_contact_counts_per_day",
  "analytics_sequence_step_stats",
  "broadcasts_get",
  "broadcasts_list",
  "capabilities_get",
  "contacts_get",
  "contacts_list",
  "contacts_list_custom_fields",
  "contacts_list_messages",
  "contacts_list_sequences",
  "contacts_list_tags",
  "conversations_get",
  "conversations_list",
  "error_logs_list",
  "flows_get",
  "flows_list",
  "flows_validate",
  "keywords_list",
  "messages_list",
  "mini_apps_list",
  "pipelines_list",
  "pipelines_list_items",
  "schemas_flow_spec",
  "sequences_get",
  "sequences_list",
  "token_get",
] as const

export const CLAUDE_WRITE_TOOLS = [
  "ai_agents_create",
  "ai_agents_update",
  "broadcasts_stop",
  "contacts_add_tags_by_name",
  "contacts_create",
  "contacts_send_flow",
  "contacts_send_message",
  "contacts_set_custom_field",
  "contacts_subscribe_sequences",
  "conversations_assign",
  "flows_create",
  "flows_publish",
  "flows_update_draft",
  "mini_apps_create",
  "pipelines_create_item",
  "pipelines_move_item",
  "sequences_update",
] as const

export const CLAUDE_API_TOOLS = [
  ...CLAUDE_READ_TOOLS,
  ...CLAUDE_WRITE_TOOLS,
] as const

/**
 * Default-visible operations deliberately left out: connecting a channel
 * hands the user a provider sign-in link and is done in the web app.
 */
export const CLAUDE_EXCLUDED_TOOLS = [
  "connection_providers_list",
  "connections_create",
  "connect_sessions_get",
] as const
