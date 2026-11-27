/** The audit actor of work no user started. Edge-safe: no `node:` imports. */
export const SYSTEM_ACTOR = "system"

export type AuditActor = {
  userId?: string | typeof SYSTEM_ACTOR
  workspaceId?: string
  ipAddress?: string
  userAgent?: string
  source?: string
}

/** The one method of `AsyncLocalStorage` that reading an actor needs, so this file imports nothing from `node:`. */
type AuditActorStore = { getStore(): AuditActor | undefined }

/**
 * The actor of the current request or job, if any. The Edge-safe counterpart of
 * `getAuditActor`: it reads the store `context.ts` keeps on `globalThis`
 * instead of importing it, so files reachable from the Edge-safe business
 * barrel can attribute a write to its caller (the same reason `dispatcher.ts`
 * exists). `context.ts` creates the store, so this is `undefined` until a
 * request or job has entered `withAuditContext`.
 */
export function readAuditActor(): AuditActor | undefined {
  const globalWithStorage = globalThis as typeof globalThis & {
    __chatbotxAuditStorage?: AuditActorStore
  }
  return globalWithStorage.__chatbotxAuditStorage?.getStore()
}
