export const auditLogActions = {
  WORKSPACE_CREATED: "workspace.created",
  WORKSPACE_UPDATED: "workspace.updated",
  WORKSPACE_DELETED: "workspace.deleted",

  TEAM_CREATED: "team.created",
  TEAM_UPDATED: "team.updated",
  TEAM_DELETED: "team.deleted",
  TEAM_MEMBER_ADDED: "team.member.added",
  TEAM_MEMBER_REMOVED: "team.member.removed",

  USER_INVITED: "user.invited",
  USER_ROLE_UPDATED: "user.role.updated",
  USER_PERMISSIONS_UPDATED: "user.permissions.updated",
  USER_REVOKED: "user.revoked",

  CONTACT_CREATED: "contact.created",
  CONTACT_DELETED: "contact.deleted",
  CONTACT_LIFECYCLE_CHANGED: "contact.lifecycle.changed",
  CONTACT_BLOCKED: "contact.blocked",
  CONTACT_UNBLOCKED: "contact.unblocked",
  CONTACT_TAG_ADDED: "contact.tag.added",
  CONTACT_TAG_REMOVED: "contact.tag.removed",
  CONTACT_FIELD_UPDATED: "contact.field.updated",
  CONTACT_MERGED: "contact.merged",
  CONTACT_IMPORTED: "contact.imported",

  AUTH_LOGIN: "auth.login",
  AUTH_LOGOUT: "auth.logout",

  DATA_EXPORTED: "data.exported",

  INTEGRATION_CONNECTED: "integration.connected",
  INTEGRATION_DISCONNECTED: "integration.disconnected",

  TAG_CREATED: "tag.created",
  TAG_UPDATED: "tag.updated",
  TAG_DELETED: "tag.deleted",

  CUSTOM_FIELD_CREATED: "customField.created",
  CUSTOM_FIELD_UPDATED: "customField.updated",
  CUSTOM_FIELD_DELETED: "customField.deleted",

  BOT_FIELD_CREATED: "botField.created",
  BOT_FIELD_UPDATED: "botField.updated",
  BOT_FIELD_DELETED: "botField.deleted",

  SNIPPET_CREATED: "snippet.created",
  SNIPPET_UPDATED: "snippet.updated",
  SNIPPET_DELETED: "snippet.deleted",

  // Closing Notes — paridade Respond.io Camada 2 (gap #15 2026-05-27).
  CONVERSATION_CATEGORY_CREATED: "conversationCategory.created",
  CONVERSATION_CATEGORY_UPDATED: "conversationCategory.updated",
  CONVERSATION_CATEGORY_DELETED: "conversationCategory.deleted",
  CLOSING_NOTES_MODE_UPDATED: "closingNotesMode.updated",
  CONVERSATION_CLOSED_WITH_NOTE: "conversation.closedWithNote",
} as const

export type AuditLogAction =
  (typeof auditLogActions)[keyof typeof auditLogActions]
