import {
  CONNECT_WHATSAPP_RESULT_TYPES,
  type ConnectWhatsappResult,
  type WhatsappConnectActionResultWire,
  type WhatsappConnectOutcome,
} from "../schema"

/** The subset of next-safe-action's direct-call result the adapter needs (mirrors `use-connect-batch.ts`'s `ExecuteAsyncLikeResult`). */
type WhatsappActionCallResult = {
  data?: ConnectWhatsappResult
  serverError?: string
  validationErrors?: unknown
}

/** Info handed back once a per-id fan-out call actually connects a number — every number in one signup session shares the same workspace. */
export type WhatsappConnectedInfo = {
  outcome: WhatsappConnectOutcome
  workspaceId: string
  redirectUrl: string
}

/** `WhatsappConnectActionResultWire` plus, on a `type: "connected"` result, the extra workspace/redirect detail `useConnectFlow`'s `onFinished` payload and the batch fan-out's own bookkeeping both need. */
export type WhatsappConnectActionResultWithInfo =
  WhatsappConnectActionResultWire & { connected?: WhatsappConnectedInfo }

/**
 * Adapts `connectWhatsappAction`'s direct-call result (called once per id by
 * the picker's fan-out — never through the hook-form adapter) to the shared
 * `{ kind: "outcome" | "sessionError" }` wire shape `useConnectFlow` /
 * `ConnectManyDialog` expect. A `type: "connected"` result additionally
 * fills `connected` with the workspace/outcome/redirect detail the generic
 * outcome shape has no room for — the caller reads it back off the result
 * (via `useConnectFlow`'s `onFinished`, or its own per-item bookkeeping for
 * the batch path) instead of threading it through a side-channel callback.
 *
 * `phoneNumberSelection` / `noPhoneNumberCandidates` /
 * `phoneNumbersAlreadyConnected` never come back from a per-id call (a
 * concrete id is always supplied) — treated defensively as an unknown
 * failure rather than crashing the batch.
 */
export function adaptWhatsappConnectActionResult(
  result: WhatsappActionCallResult,
  item: { id: string; name: string },
): WhatsappConnectActionResultWithInfo {
  const { data } = result

  if (!data) {
    // Intentional — classification stays silent for the operator; the
    // translated reason/validation detail is not surfaced anywhere
    // client-side (mirrors `use-connect-batch.ts`'s
    // `transportFailureOutcome`). There is no client-safe logger in this
    // app, so an unexpected `serverError`/`validationErrors` result is
    // dropped rather than logged.
    return unknownFailure(item)
  }

  if ("kind" in data) {
    return data
  }

  if (data.type === CONNECT_WHATSAPP_RESULT_TYPES.CONNECTED) {
    return {
      kind: "outcome",
      outcome: data.outcome,
      connected: {
        outcome: data.outcome,
        workspaceId: data.workspaceId,
        redirectUrl: data.redirectUrl,
      },
    }
  }

  return unknownFailure(item)
}

function unknownFailure(item: {
  id: string
  name: string
}): WhatsappConnectActionResultWithInfo {
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
