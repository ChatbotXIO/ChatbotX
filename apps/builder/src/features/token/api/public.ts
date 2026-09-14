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
})

export const tokenPublicRouter = {
  get: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/token",
      summary: "Get the calling token's workspace id, permission, and scopes",
      description:
        "Returns the workspace id, permission (`read_only`/`full`), and scopes of the token making this request. `scopes: null` means unrestricted (every scope). Check this before attempting a write to see whether the token is allowed to make it.",
      tags: ["Capabilities"],
      spec: mcpSpec({ visibility: "default", alwaysVisible: true }),
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
      return {
        workspaceId: context.workspace.id,
        permission: apiToken.permission as WorkspaceApiTokenPermission,
        scopes: apiToken.scopes,
      }
    }),
}
