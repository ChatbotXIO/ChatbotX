import { AsyncLocalStorage } from "node:async_hooks"

export const SYSTEM_ACTOR = "system"

export type AuditActor = {
  userId?: string | typeof SYSTEM_ACTOR
  workspaceId?: string
  ipAddress?: string
  userAgent?: string
  source?: string
}

const globalForAudit = globalThis as typeof globalThis & {
  __chatbotxAuditStorage?: AsyncLocalStorage<AuditActor>
}

if (!globalForAudit.__chatbotxAuditStorage) {
  globalForAudit.__chatbotxAuditStorage = new AsyncLocalStorage<AuditActor>()
}

const auditStorage = globalForAudit.__chatbotxAuditStorage

export function withAuditContext<T>(actor: AuditActor, fn: () => T): T {
  return auditStorage.run(actor, fn)
}

export function getAuditActor(): AuditActor | undefined {
  return auditStorage.getStore()
}
