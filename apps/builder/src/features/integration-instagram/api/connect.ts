import { connectAuditContextMiddleware } from "@/features/channel-connect/api/audit-context"
import {
  type ConnectActionResultWire,
  connectActionResultSchemaDefault,
} from "@/features/channel-connect/schema"
import { authorizedAPI } from "@/orpc"
import { connectInstagramAccount } from "../actions/connect-account"
import { connectInstagramAccountViaFacebook } from "../actions/connect-account-facebook"
import { selectAccountRequest } from "../schema/action"
import { selectFacebookAccountRequest } from "../schema/action-facebook"

/**
 * The two Instagram pickers' connect transport — one route per login, same
 * contract as Messenger's: the signed-in user authorizes the call, the
 * workspace and user token come only from that login's pending-auth cookie
 * (server-side, never the body), and every failure is a typed outcome in the
 * 200 response rather than a 500 the batch cannot classify. Server actions
 * are serialized per browser by Next, which is why the batch posts here
 * instead.
 */
export const integrationInstagramConnectAPIs = {
  connectInstagramFacebookAccountAPI: authorizedAPI
    .route({
      method: "POST",
      path: "/channels/instagram-facebook/connect",
      summary:
        "Connect one Instagram account via its Facebook page from the pending connect session",
      tags: ["Integrations"],
    })
    .input(selectFacebookAccountRequest)
    .use(connectAuditContextMiddleware)
    .output(connectActionResultSchemaDefault)
    .handler(
      ({ input, context }): Promise<ConnectActionResultWire> =>
        connectInstagramAccountViaFacebook({
          userId: context.user.id,
          igId: input.igId,
        }),
    ),

  connectInstagramAccountAPI: authorizedAPI
    .route({
      method: "POST",
      path: "/channels/instagram/connect",
      summary:
        "Connect the Instagram account from the pending direct-login session",
      tags: ["Integrations"],
    })
    .input(selectAccountRequest)
    .use(connectAuditContextMiddleware)
    .output(connectActionResultSchemaDefault)
    .handler(
      ({ input, context }): Promise<ConnectActionResultWire> =>
        connectInstagramAccount({
          userId: context.user.id,
          igId: input.igId,
        }),
    ),
}
