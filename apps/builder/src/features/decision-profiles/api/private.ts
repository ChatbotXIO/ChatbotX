import {
  decisionConnectionService,
  decisionProfileContractSchema,
  decisionProfileService,
} from "@chatbotx.io/business"
import { ORPCError } from "@orpc/server"
import { z } from "zod"
import { withWorkspaceIdSchema } from "@/features/workspaces/schema/resource"
import { hasWorkspacePermission } from "@/lib/auth/permission-routes"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import {
  globalRouterDestinationsSchema,
  listGlobalRouterDestinations,
} from "../lib/list-global-router-destinations"

const activeDecisionProfileSchema = z
  .object({
    connectionAvailable: z.boolean(),
    contract: decisionProfileContractSchema,
    id: z.string(),
    model: z.string(),
    name: z.string(),
    profileEnabled: z.boolean(),
  })
  .strict()

const moderationConnectionSchema = z
  .object({
    defaultModel: z.string().nullable(),
    id: z.string(),
    modelCatalog: z.array(z.string()),
    name: z.string(),
  })
  .strict()

export const decisionProfilesAuthenticatedAPI = {
  /**
   * The enabled AI Router connections a comment automation's AI moderation
   * can run on — credential-safe, the same rows `decisionConnections.list`
   * returns publicly.
   */
  listModerationConnections: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/decision-profiles/moderation-connections",
      summary: "List AI Router connections for comment moderation",
      tags: ["Decision"],
    })
    .input(withWorkspaceIdSchema)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(z.array(moderationConnectionSchema))
    .handler(async ({ input }) => {
      const connections = await decisionConnectionService.listSafe(
        input.workspaceId,
      )
      return connections
        .filter((connection) => connection.status === "enabled")
        .map(({ defaultModel, id, modelCatalog, name }) => ({
          defaultModel,
          id,
          modelCatalog,
          name,
        }))
    }),

  listGlobalRouterDestinations: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/decision-profiles/global-router-destinations",
      summary: "List private Global Router destinations",
      tags: ["Decision"],
    })
    .input(withWorkspaceIdSchema)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(globalRouterDestinationsSchema)
    .handler(async ({ input, context }) => {
      if (
        !hasWorkspacePermission(
          context.workspaceMember.permissions,
          "superAdmin",
        )
      ) {
        throw new ORPCError("FORBIDDEN")
      }
      return await listGlobalRouterDestinations(input.workspaceId)
    }),
  listActiveForFlow: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/decision-profiles/active",
      summary: "List active Decision profiles for Flow authoring",
      tags: ["Decision"],
    })
    .input(withWorkspaceIdSchema)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(z.array(activeDecisionProfileSchema))
    .handler(async ({ input, context }) => {
      if (
        !hasWorkspacePermission(context.workspaceMember.permissions, "flows")
      ) {
        throw new ORPCError("FORBIDDEN")
      }
      const profiles = await decisionProfileService.listForFlow(
        input.workspaceId,
      )

      return profiles.map(
        ({ connectionAvailable, profile, profileEnabled }) => ({
          connectionAvailable,
          contract: decisionProfileContractSchema.parse(profile.contract),
          id: profile.id,
          model: profile.model,
          name: profile.name,
          profileEnabled,
        }),
      )
    }),
}
