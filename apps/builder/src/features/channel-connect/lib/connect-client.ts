import { ORPCError } from "@orpc/client"
import type { ConnectActionResultWire } from "../schema"
import type { ConnectTarget } from "./picker-items"
import type { ConnectRoute } from "./registry"

/** Statuses that mean the app session itself is gone, not that this one row failed. */
const UNAUTHENTICATED_STATUSES: readonly number[] = [401, 403]

/** The oRPC error codes that mean the same thing, whatever status they carry. */
const UNAUTHENTICATED_CODES: readonly string[] = ["UNAUTHORIZED", "FORBIDDEN"]

/**
 * Whether a thrown call failed because the caller is no longer authenticated —
 * the app session expired, or the user signed out in another tab. Every
 * remaining row would fail identically, so this speaks for the whole batch
 * rather than for its own row.
 *
 * Both the code and the status are checked: a procedure that throws
 * `ORPCError("UNAUTHORIZED")` and a middleware rejection that only sets a 401
 * are the same event to the operator. Channel-agnostic on purpose — it
 * classifies the transport error and nothing else.
 */
export function isSessionExpiredError(error: unknown): boolean {
  return (
    error instanceof ORPCError &&
    (UNAUTHENTICATED_CODES.includes(error.code) ||
      UNAUTHENTICATED_STATUSES.includes(error.status))
  )
}

/**
 * What a row shows when its connect never produced a typed answer: the
 * request failed at the transport (network, a 5xx) or came back in a
 * shape its channel's contract does not accept. Deliberately the same
 * `failed`/`unknown` outcome any other unclassifiable failure gets, so the
 * dialog renders and retries it like the rest — the operator has no use for
 * the distinction, and there is no client-safe logger in this app to record
 * it (Pino-backed `@/lib/log` is server-only).
 */
function transportFailureOutcome(item: ConnectTarget): ConnectActionResultWire {
  return {
    kind: "outcome",
    outcome: {
      sourceId: item.id,
      name: item.name,
      status: "failed",
      reason: "unknown",
      coexistEligible: false,
    },
  }
}

export type ConnectViaApiParams<TBody, TResult> = {
  /** `CONNECT_CHANNEL_REGISTRY[channel].connectRoute`, or `INSTAGRAM_DIRECT_CONNECT_ROUTE` — never a procedure named at the call site. */
  route: ConnectRoute<TBody>
  /** Ids only, and only the ones this route accepts. The workspace and the provider token stay server-side (pending-auth cookie / signup session). */
  body: TBody
  /** Validates the procedure's answer — a channel whose result carries more than the shared outcome shape passes its own schema. */
  parse: (data: unknown) => TResult
  /** Identifies the row a transport failure is reported against. */
  item: ConnectTarget
}

/**
 * Runs one account's connect through its oRPC procedure. This replaced the
 * server action the pickers used to call: Next serializes server actions from
 * one browser, so the batch could only ever connect one account at a time no
 * matter what concurrency the hook asked for. The four connect procedures are
 * also in `UNBATCHED_PROCEDURE_PATHS`, so oRPC's own batch link cannot merge
 * the fan-out back into one request.
 *
 * Every failure the batch can meet — a network error, a 401/403/500, or a
 * body that does not match the channel's contract — becomes
 * `transportFailureOutcome`, so the dialog classifies and retries it exactly
 * as it does any other unclassifiable failure.
 */
export async function connectViaApi<TBody, TResult>({
  route,
  body,
  parse,
  item,
}: ConnectViaApiParams<TBody, TResult>): Promise<
  TResult | ConnectActionResultWire
> {
  try {
    // No client-side timeout on purpose: `useConnectBatch` already races every
    // request against `CONNECT_REQUEST_TIMEOUT_MS` and renders a `timedOut`
    // row with its own Retry. A second, shorter deadline here would fire first
    // on a slow provider call and report a transport failure while the server
    // kept going — two timeouts, one of them lying.
    const data = await route.call(body)
    return parse(data)
  } catch (error) {
    // A lost app session is not this row's failure: reported as the same
    // session error a cookie-less request produces, so the batch aborts and
    // shows one "Your session expired. Please reconnect." alert instead of
    // N retryable rows that would each fail the same way.
    if (isSessionExpiredError(error)) {
      return { kind: "sessionError", code: "sessionExpired" }
    }

    // Intentionally silent otherwise: there is no client-safe logger in this
    // app, and the operator already sees the row's own failed state plus its
    // Retry.
    return transportFailureOutcome(item)
  }
}
