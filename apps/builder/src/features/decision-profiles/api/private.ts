import {
  decisionProfileContractSchema,
  decisionProfileService,
} from "@chatbotx.io/business"
import { ORPCError } from "@orpc/server"
import { z } from "zod"
import { withWorkspaceIdSchema } from "@/features/workspaces/schema/resource"
import { hasWorkspacePermission } from "@/lib/auth/permission-routes"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"

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

export const decisionProfilesAuthenticatedAPI = {
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
