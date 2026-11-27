import type { HTTPMethod } from "@orpc/server"

/**
 * The only `/v1` operations a mobile (member) principal may call, as
 * `"METHOD /v1/path"` exactly as declared on the route.
 *
 * Why an allowlist instead of "every route, scoped": the public router has
 * hundreds of operations written for workspace-level API tokens, most of which
 * read or write workspace data with no notion of a member's contact/inbox
 * scope. A mobile principal is a *member* — possibly an agent restricted to
 * their own conversations — so any operation not reviewed for member scoping
 * must be unreachable. A route missing from this list fails closed (403); a
 * route in the list MUST apply member scoping in its handler
 * (`lib/public-api/member-scope.ts`), which `member-route-allowlist.test.ts`
 * enforces by listing the reviewed handlers.
 *
 * Workspace API tokens and MCP OAuth never reach this list: it is consulted
 * only when `context.member` is set.
 */
export const MOBILE_MEMBER_ROUTES = [
  // Conversations — scoped by the member's chat scope.
  "GET /v1/conversations",
  "GET /v1/conversations/{id}",
  "POST /v1/conversations/{id}/assign",
  "POST /v1/conversations/{id}/archive",
  "POST /v1/conversations/{id}/unarchive",
  "POST /v1/conversations/{id}/read",
  "POST /v1/conversations/{id}/unread",
  "POST /v1/conversations/{id}/follow",
  "POST /v1/conversations/{id}/unfollow",
  "POST /v1/conversations/{id}/enable-bot",
  "POST /v1/conversations/{id}/disable-bot",
  // Messages — scoped through their conversation.
  "GET /v1/conversations/{conversationId}/messages",
  "GET /v1/conversations/{conversationId}/messages/{messageId}",
  "POST /v1/conversations/{conversationId}/messages",
  "PUT /v1/conversations/{conversationId}/messages/{messageId}",
  "DELETE /v1/conversations/{conversationId}/messages/{messageId}",
  "POST /v1/conversations/{conversationId}/messages/{messageId}/attributes",
  // Contacts — scoped by the member's contact permission scope.
  "GET /v1/contacts",
  "GET /v1/contacts/{identifier}",
  "PATCH /v1/contacts/{identifier}",
  "DELETE /v1/contacts/{identifier}",
  "POST /v1/contacts/{identifier}/block",
  "POST /v1/contacts/{identifier}/unblock",
  "GET /v1/contacts/{identifier}/tags",
  "POST /v1/contacts/{identifier}/tags",
  "DELETE /v1/contacts/{identifier}/tags",
  "GET /v1/contacts/{identifier}/custom-fields",
  "PUT /v1/contacts/{identifier}/custom-fields/{idOrName}",
  "POST /v1/contacts/{identifier}/custom-fields/{customFieldId}",
  "DELETE /v1/contacts/{identifier}/custom-fields/{idOrName}",
  "GET /v1/contacts/{identifier}/sequences",
  "POST /v1/contacts/{identifier}/sequences",
  "DELETE /v1/contacts/{identifier}/sequences",
  "POST /v1/contacts/{identifier}/flows",
  // Workspace catalogs the inbox needs (names/ids only; gated by contacts access).
  "GET /v1/members",
  "GET /v1/teams",
  "GET /v1/flows",
  "GET /v1/sequences",
  "GET /v1/tags",
  "GET /v1/custom-fields",
  "GET /v1/saved-replies",
  // Attachments for outgoing messages.
  "POST /v1/media-library/files/upload-url",
  "POST /v1/media-library/files",
  // Realtime connect token (rejects workspace API keys itself).
  "GET /v1/realtime/connect-token",
] as const

const MOBILE_MEMBER_ROUTE_SET: ReadonlySet<string> = new Set(
  MOBILE_MEMBER_ROUTES,
)

export const isMobileMemberRoute = (
  method: HTTPMethod | undefined,
  path: string | undefined,
): boolean => MOBILE_MEMBER_ROUTE_SET.has(`${method ?? "POST"} ${path ?? ""}`)
