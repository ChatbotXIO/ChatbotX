import { connectAuditContextMiddleware } from "@/features/channel-connect/api/audit-context"
import {
  type ConnectActionResultWire,
  connectActionResultSchemaDefault,
} from "@/features/channel-connect/schema"
import { authorizedAPI } from "@/orpc"
import { connectMessengerPage } from "../actions/connect-page"
import { selectPageRequest } from "../schema/action"

/**
 * The picker's connect transport, and the only one this channel has: the
 * page connect used to be a server action, but Next.js serializes server
 * actions from one browser, so the batch dialog could only ever connect one
 * page at a time. Over this route it runs `CONNECT_CONCURRENCY` at once.
 *
 * Auth is the signed-in user (`authorizedAPI`) — the workspace and the user
 * token still come ONLY from the pending-auth cookie, read server-side by
 * `resolveConnectSession`, never from the request body. Every failure,
 * session-level or per-page, is a typed outcome in the 200 response: this
 * route must not turn a `ChatbotXException` into a 500 the batch cannot
 * classify (`connectMessengerPage` catches through `toConnectActionFailure`).
 */
export const integrationMessengerConnectAPIs = {
  connectMessengerPageAPI: authorizedAPI
    .route({
      method: "POST",
      path: "/channels/messenger/connect",
      summary: "Connect one Facebook page from the pending connect session",
      tags: ["Integrations"],
    })
    .input(selectPageRequest)
    .use(connectAuditContextMiddleware)
    .output(connectActionResultSchemaDefault)
    .handler(
      ({ input, context }): Promise<ConnectActionResultWire> =>
        connectMessengerPage({
          userId: context.user.id,
          pageId: input.pageId,
        }),
    ),
}
