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
   * Mints a short-lived (60s) realtime connect token bound to
   * `{ userId, workspaceId }` for the calling, already-workspace-member
   * user. It is a signed JWT, not a single-use ticket: within its 60-second
   * lifetime it can be presented more than once, so the security it provides
   * is the binding (this user, this workspace room) plus the short expiry,
   * never unrepeatability.
   *
   * Declared GET on purpose, and it must stay GET. It mints a stateless token
   * and writes nothing, but more importantly `workspaceAuthorizedMidddleware`
   * reads this declared method: anything other than GET/HEAD/DELETE counts as
   * a mutation and is refused for a trial-expired or MAC-limited cloud owner
   * (`assertWorkspaceOwnerAccessForMethod`). Every inbox websocket — for every
   * channel, not just calling — connects through this token, so declaring it a
   * mutation would black out live messages for exactly the workspaces that
   * AGENTS.md invariant #14 says must stay readable. `workspaceAuthorizedMidddleware` is what does the actual
   * membership check — this handler only signs the token once that has
   * passed, it never re-derives membership itself. The realtime `workspaces`
   * party rejects the connection outright if the token's `workspaceId`
   * claim does not match the room being connected to, or if the `userId`
   * claim is missing.
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
