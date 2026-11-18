import { z } from "zod"
import { withWorkspaceIdSchema } from "@/features/workspaces/schema/resource"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { listDecisionConnections } from "../queries/list-decision-connections.query"

const enabledDecisionConnectionSchema = z
  .object({
    defaultModel: z.string().nullable(),
    id: z.string(),
    modelCatalog: z.array(z.string()),
    name: z.string(),
  })
  .strict()

export const decisionConnectionsAuthenticatedAPI = {
  /**
   * The enabled AI Router connections, for pickers in client forms (comment
   * automation AI moderation). Same read as the settings page and the public
   * `decisionConnections.list`, trimmed to what a picker shows. Any member
   * can pick one, like an AI agent; nothing credential-bearing is returned.
   */
  listEnabled: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/decision-connections/enabled",
      summary: "List enabled AI Router connections",
      tags: ["AI Router"],
    })
    .input(withWorkspaceIdSchema)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(z.array(enabledDecisionConnectionSchema))
    .handler(async ({ input }) => {
      const connections = await listDecisionConnections(input.workspaceId)
      return connections
        .filter((connection) => connection.status === "enabled")
        .map(({ defaultModel, id, modelCatalog, name }) => ({
          defaultModel,
          id,
          modelCatalog,
          name,
        }))
    }),
}
