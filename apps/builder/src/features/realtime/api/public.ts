import { resolveTenantSettings } from "@chatbotx.io/business"
import { ORPCError } from "@orpc/server"
import { possibleErrorsOnFindingResource } from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import { mintMemberConnectToken } from "../lib/mint-member-connect-token"
import { realtimeConnectTokenResponse } from "../schema/public"

const REALTIME_SOCKET_PATH = "rt/workspaces"

/** `https://host/ws/` -> `wss://host/ws/rt/workspaces/<id>`. */
const toSocketUrl = (
  publicRealtimeUrl: string,
  workspaceId: string,
): string => {
  const url = new URL(
    `${REALTIME_SOCKET_PATH}/${encodeURIComponent(workspaceId)}`,
    publicRealtimeUrl,
  )
  url.protocol = url.protocol === "http:" ? "ws:" : "wss:"
  return url.toString()
}

export const realtimePublicRouter = {
  getConnectToken: workspaceTokenAuthAPIForScope("inbox")
    .route({
      method: "GET",
      path: "/v1/realtime/connect-token",
      summary: "Mint realtime connect token",
      description:
        "Mints a 60-second realtime connect token for the signed-in member of the workspace given by `x-workspace-id`, scoped to the conversations they may see, and returns the realtime URL of that workspace's tenant. Only mobile app access tokens are accepted: a workspace API token or MCP token has no member identity and gets 403. Must stay GET so it still works for trial-expired workspaces.",
      tags: ["Realtime"],
    })
    .output(realtimeConnectTokenResponse)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context }) => {
      const { member } = context
      if (!member) {
        throw new ORPCError("FORBIDDEN", {
          message: "A signed-in member session is required",
        })
      }
      const [token, settings] = await Promise.all([
        mintMemberConnectToken({
          workspaceId: context.workspace.id,
          userId: member.userId,
          permissions: member.permissions,
          issuedAtMs: context.requestIssuedAtMs ?? Date.now(),
        }),
        resolveTenantSettings({ workspaceId: context.workspace.id }),
      ])
      return {
        token,
        url: settings.publicRealtimeUrl,
        socketUrl: toSocketUrl(
          settings.publicRealtimeUrl,
          context.workspace.id,
        ),
      }
    }),
}
