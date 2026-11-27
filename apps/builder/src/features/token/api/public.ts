import {
  type WorkspaceApiTokenPermission,
  workspaceApiTokenScopes,
} from "@chatbotx.io/database/partials"
import { z } from "zod"
import { mcpSpec } from "@/lib/orpc/mcp-annotations"
import { possibleErrorsOnListingResource } from "@/lib/orpc/orpc-error-helper"
import type { RequestApiToken } from "@/middlewares/context"
import { workspaceTokenAuthAPIForScope } from "@/orpc"

// Same scope and rationale as `capabilities.get`
// (`features/capabilities/api/public.ts`): endpoint discovery, not a
// resource read, so it reuses the most common scope rather than adding a
// 13th one just for this. `alwaysVisible` exempts it from scope-based
// `tools/list` filtering — a token missing `contacts` still sees this
// tool, whose whole job is telling it exactly that.
const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("contacts")

const tokenPublicResponse = z.object({
  workspaceId: z.string(),
  permission: z.enum(["read_only", "full"]),
  scopes: z
    .array(workspaceApiTokenScopes)
    .nullable()
    .describe("null means unrestricted — every scope."),
  principal: z
    .discriminatedUnion("credentialType", [
      z.object({
        credentialType: z.literal("oauth"),
        audience: z.string(),
        clientId: z.string(),
        issuer: z.string(),
        subject: z.string(),
      }),
      z.object({ credentialType: z.literal("workspace_token") }),
      z.object({ credentialType: z.literal("mobile") }),
    ])
    .describe(
      "Verified identity of the caller. MCP connector transports use it to bind a session to one identity.",
    ),
})

export const tokenPublicRouter = {
  get: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/token",
      summary: "Get calling token workspace id, permission, and scopes",
      description:
        "Reports the calling token's workspace id, permission, and scopes, including whether `scopes: null` grants unrestricted access. Call `capabilities.get` to discover useful resources before using the token with another operation.",
      tags: ["Capabilities"],
      spec: mcpSpec({
        alwaysVisible: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
        readOnlyHint: true,
        visibility: "default",
      }),
    })
    .input(z.object({}))
    .output(tokenPublicResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(({ context }) => {
      // `apiToken` is always set here in practice — this route is built
      // from `workspaceTokenAuthAPIForScope`, which always chains
      // `workspaceTokenAuthMidddleware` first (see the identical note on
      // `requireTokenScope` in `@/orpc`).
      const apiToken = context.apiToken as RequestApiToken
      const oauth = context.oauthPrincipal
      return {
        workspaceId: context.workspace.id,
        permission: apiToken.permission as WorkspaceApiTokenPermission,
        scopes: apiToken.scopes,
        principal: oauth
          ? { credentialType: "oauth" as const, ...oauth }
          : {
              credentialType: context.mobileDeviceId
                ? ("mobile" as const)
                : ("workspace_token" as const),
            },
      }
    }),
}
