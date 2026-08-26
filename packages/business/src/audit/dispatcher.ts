// Zero-dependency indirection so `BaseService` and other files reachable from
// the Edge-safe `packages/business/src/index.ts` barrel never statically
// import `./service` (which pulls `./context`'s `node:async_hooks` via
// AsyncLocalStorage). `./service` wires the real implementation into
// `globalForAudit.__chatbotxAuditRecord` as a side effect of module
// evaluation — see the bottom of `service.ts`.
export type AuditRecordDispatcherInput = {
  action: string
  detail: string
  userId?: string
  workspaceId?: string
  ipAddress?: string
  userAgent?: string
  source?: string
}

type AuditRecordDispatcher = (
  input: AuditRecordDispatcherInput,
) => Promise<void> | void

const globalForAudit = globalThis as typeof globalThis & {
  __chatbotxAuditRecord?: AuditRecordDispatcher
}

export function dispatchAuditRecord(
  input: AuditRecordDispatcherInput,
): Promise<void> | void {
  const dispatcher = globalForAudit.__chatbotxAuditRecord
  if (dispatcher) {
    return dispatcher(input)
  }

  if (process.env.NODE_ENV !== "production") {
    throw new Error(
      'Audit recorder is not registered. Import "@chatbotx.io/business/audit" before dispatching explicit audit records.',
    )
  }
}
