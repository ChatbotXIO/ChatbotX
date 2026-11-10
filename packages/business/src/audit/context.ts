import { AsyncLocalStorage } from "node:async_hooks"
import type { AuditActor } from "./actor"

export { type AuditActor, SYSTEM_ACTOR } from "./actor"

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
