// Zero-dependency indirection so `BaseService` and other files reachable from
// the Edge-safe `packages/business/src/index.ts` barrel never statically
// import `./service` (which pulls `./context`'s `node:async_hooks` via
// AsyncLocalStorage). `./service` wires the real implementation into
// `globalForAudit.__chatbotxAuditRecord` as a side effect of module
// evaluation — see the bottom of `service.ts`.
//
// The `../logger` import below is fine here: it's already imported by many
// other files reachable from the barrel (e.g. `appointment/service.ts`,
// `contact/service.ts`) — the indirection this file exists for is narrowly
// about `./service`/`./context`'s `node:async_hooks`, not about logging.
import { logger } from "../logger"

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

/**
 * `dispatchAuditRecord`, but a failing dispatch is logged and swallowed
 * instead of rejecting — for post-commit audit calls where the underlying
 * write already succeeded and a failing "record that it happened" side
 * effect must never turn into a bogus action failure.
 */
export async function dispatchAuditRecordSafely(
  input: AuditRecordDispatcherInput,
  logMessage: string,
): Promise<void> {
  try {
    await dispatchAuditRecord(input)
  } catch (err) {
    logger.warn({ err }, logMessage)
  }
}
