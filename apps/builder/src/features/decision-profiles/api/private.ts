import {
  aiAgentService,
  customFieldService,
  decisionProfileContractSchema,
  decisionProfileService,
  flowService,
  inboxTeamService,
  workspaceMemberService,
} from "@chatbotx.io/business"
import { ORPCError } from "@orpc/server"
import { z } from "zod"
import { loadAllActionOptions } from "@/features/ai-agents/lib/load-action-options"
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
  listGlobalRouterDestinations: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/decision-profiles/global-router-destinations",
      summary: "List private Global Router destinations",
      tags: ["Decision"],
    })
    .input(withWorkspaceIdSchema)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(
      z.object({
        agents: z.array(z.object({ id: z.string(), name: z.string() })),
        customFields: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            type: z.enum(["longText", "number", "shortText"]),
          }),
        ),
        flows: z.array(z.object({ id: z.string(), name: z.string() })),
        teams: z.array(z.object({ id: z.string(), name: z.string() })),
        users: z.array(z.object({ id: z.string(), name: z.string() })),
      }),
    )
    .handler(async ({ input, context }) => {
      if (
        !hasWorkspacePermission(
          context.workspaceMember.permissions,
          "superAdmin",
        )
      ) {
        throw new ORPCError("FORBIDDEN")
      }
      const [flows, agents, customFields, members, teams] = await Promise.all([
        flowService.listPublishedOptions({ workspaceId: input.workspaceId }),
        loadAllActionOptions((page) =>
          aiAgentService.listAIAgents({
            page,
            perPage: 100,
            sort: [],
            workspaceId: input.workspaceId,
          }),
        ),
        loadAllActionOptions((page) =>
          customFieldService.list({
            page,
            perPage: 100,
            workspaceId: input.workspaceId,
          }),
        ),
        workspaceMemberService.listByWorkspaceId({
          workspaceId: input.workspaceId,
        }),
        inboxTeamService.listByWorkspace({ workspaceId: input.workspaceId }),
      ])
      return {
        agents: agents.map((agent) => ({
          id: agent.id,
          name: agent.name,
        })),
        customFields: customFields.flatMap((field) =>
          field.type === "shortText" ||
          field.type === "longText" ||
          field.type === "number"
            ? [{ id: field.id, name: field.name, type: field.type }]
            : [],
        ),
        flows,
        teams: teams.map((team) => ({ id: team.id, name: team.name })),
        users: members.map((member) => ({
          id: member.userId,
          name: member.user.name ?? member.user.email,
        })),
      }
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
