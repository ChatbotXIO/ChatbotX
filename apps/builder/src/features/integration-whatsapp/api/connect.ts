import { connectAuditContextMiddleware } from "@/features/channel-connect/api/audit-context"
import { authorizedAPI } from "@/orpc"
import { connectWhatsappNumber } from "../actions/connect-number"
import {
  CONNECT_WHATSAPP_RESULT_TYPES,
  type ConnectWhatsappResult,
  type ConnectWhatsappViaSessionResponse,
  connectWhatsappViaSessionRequest,
  connectWhatsappViaSessionResponse,
} from "../schema"

/**
 * Narrows the core's full result union to what this route can answer with.
 * The three selection-flow results are unreachable for a concrete phone
 * number id (`prepareConnectInput` only produces them when none was
 * supplied); one arriving anyway is reported as an item failure rather than
 * crashing response validation with a 500.
 */
function toSessionResponse(
  result: ConnectWhatsappResult,
  phoneNumberId: string,
): ConnectWhatsappViaSessionResponse {
  if (
    "kind" in result ||
    result.type === CONNECT_WHATSAPP_RESULT_TYPES.CONNECTED
  ) {
    return result
  }

  return {
    kind: "outcome",
    outcome: {
      sourceId: phoneNumberId,
      name: phoneNumberId,
      status: "failed",
      reason: "unknown",
      coexistEligible: false,
    },
  }
}

/**
 * The phone-number picker's connect transport, one request per number. The
 * batch runs `CONNECT_CONCURRENCY` of these at once, which a server action
 * cannot do (Next serializes them per browser) — the top-level connect form
 * keeps `connectWhatsappAction` for its manual / OAuth / auto-select paths.
 *
 * Only the session path is reachable here: the input carries a signup
 * session id and one candidate phone number, so `manualConnect` is pinned
 * false and no token, WABA or workspace id can arrive from the client — the
 * session row (read and row-locked server-side) is the only source for those.
 * Every failure comes back as a typed result in the 200 response, never a
 * 500 the batch cannot classify.
 */
export const integrationWhatsappConnectAPIs = {
  connectWhatsappNumberAPI: authorizedAPI
    .route({
      method: "POST",
      path: "/channels/whatsapp/connect",
      summary: "Connect one phone number from a pending signup session",
      tags: ["Integrations"],
    })
    .input(connectWhatsappViaSessionRequest)
    .use(connectAuditContextMiddleware)
    .output(connectWhatsappViaSessionResponse)
    .handler(async ({ input, context }) => {
      const result = await connectWhatsappNumber({
        userId: context.user.id,
        input: { ...input, manualConnect: false },
      })
      return toSessionResponse(result, input.phoneNumberId)
    }),
}
