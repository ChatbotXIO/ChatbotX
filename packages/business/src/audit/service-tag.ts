import type { AuditRecordDispatcherInput } from "./dispatcher"

/**
 * Name of the service that raised an audit record, carried alongside the input
 * but never as one of its enumerable fields. It is only read by the
 * `AUDIT_LOG_STDOUT` log line (`<Service>.<action>`); the queued job and the
 * `audit_log` row keep the bare `action`, and the input the dispatcher receives
 * stays exactly `{ action, detail, ... }`.
 *
 * Kept out of `./dispatcher` on purpose: that module is mocked wholesale by many
 * service tests, and this stays a zero-dependency leaf (Edge-safe, no node APIs).
 */
export const AUDIT_SERVICE = Symbol.for("chatbotx.audit.service")

export type AuditRecordWithService = AuditRecordDispatcherInput & {
  [AUDIT_SERVICE]?: string
}

export function withAuditService(
  input: AuditRecordDispatcherInput,
  service: string,
): AuditRecordDispatcherInput {
  return Object.defineProperty(input, AUDIT_SERVICE, {
    value: service,
    enumerable: false,
  })
}
