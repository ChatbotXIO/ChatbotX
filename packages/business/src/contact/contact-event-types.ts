/**
 * Tipos de evento registrados na tabela ContactEvent.
 * Espelham os auditLogActions de contato — mas vivem aqui pra serem importáveis
 * sem trazer toda a dependência de audit-log no caller.
 *
 * NOVA Camada 3 (2026-05-26): expandido pra cobrir created/deleted/blocked/
 * tag_added/tag_removed/field_updated/merged além do lifecycle.changed que
 * já vinha do trigger SQL.
 */
export const contactEventTypes = {
  CREATED: "contact.created",
  DELETED: "contact.deleted",
  BLOCKED: "contact.blocked",
  UNBLOCKED: "contact.unblocked",
  LIFECYCLE_CHANGED: "contact.lifecycle.changed",
  TAG_ADDED: "contact.tag.added",
  TAG_REMOVED: "contact.tag.removed",
  FIELD_UPDATED: "contact.field.updated",
  MERGED: "contact.merged",
} as const

export type ContactEventType =
  (typeof contactEventTypes)[keyof typeof contactEventTypes]
