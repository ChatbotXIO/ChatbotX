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
   * Mints a short-lived (60s), single-use realtime connect token bound to
   * `{ userId, workspaceId }` for the calling, already-workspace-member
   * user. `workspaceAuthorizedMidddleware` is what does the actual
   * membership check — this handler only signs the token once that has
   * passed, it never re-derives membership itself. The realtime `workspaces`
   * party rejects the connection outright if the token's `workspaceId`
   * claim does not match the room being connected to, or if the `userId`
   * claim is missing.
   */
  mintWorkspaceConnectTokenAuthenticatedAPI: authorizedAPI
    .route({
      method: "POST",
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
