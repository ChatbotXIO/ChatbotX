import { resolveBroadcastSecret } from "@chatbotx.io/business"
import { signMemberConnectToken } from "@chatbotx.io/partysocket-config/auth"
import { z } from "zod"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"

const mintWorkspaceConnectTokenInput = z.object({
  workspaceId: z.string(),
})

const mintWorkspaceConnectTokenOutput = z.object({
  token: z.string(),
})

export const realtimeAuthenticatedAPI = {
  /**
   * Mints a short-lived (60s) realtime connect token bound to { userId,
   * workspaceId }. A signed JWT, not single-use — reusable within its
   * lifetime, so security comes from the binding plus short expiry, not
   * unrepeatability.
   *
   * Must stay GET: workspaceAuthorizedMidddleware treats anything else as a
   * mutation and refuses it for a trial-expired/MAC-limited cloud owner, and
   * every inbox websocket connects through this token (AGENTS.md invariant
   * #14).
   */
  mintWorkspaceConnectTokenAuthenticatedAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/realtime/connect-token",
      summary: "Mint a realtime connect token for the current user",
      tags: ["Realtime"],
    })
    .input(mintWorkspaceConnectTokenInput)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(mintWorkspaceConnectTokenOutput)
    .handler(async ({ context }) => ({
      token: await signMemberConnectToken(
        { workspaceId: context.workspace.id, userId: context.user.id },
        resolveBroadcastSecret({ workspaceId: context.workspace.id }),
      ),
    })),
}
