import {
  aiAgentService,
  customFieldService,
  flowService,
  inboxTeamService,
  workspaceMemberService,
} from "@chatbotx.io/business"
import { z } from "zod"
import { loadAllActionOptions } from "@/features/ai-agents/lib/load-action-options"

export const globalRouterDestinationsSchema = z
  .object({
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
  })
  .strict()

/** Shared source of valid Global Router references for session and token APIs. */
export async function listGlobalRouterDestinations(workspaceId: string) {
  const [flows, agents, customFields, members, teams] = await Promise.all([
    flowService.listPublishedOptions({ workspaceId }),
    loadAllActionOptions((page) =>
      aiAgentService.listAIAgents({
        page,
        perPage: 100,
        sort: [],
        workspaceId,
      }),
    ),
    loadAllActionOptions((page) =>
      customFieldService.list({
        page,
        perPage: 100,
        workspaceId,
      }),
    ),
    workspaceMemberService.listByWorkspaceId({ workspaceId }),
    inboxTeamService.listByWorkspace({ workspaceId }),
  ])

  return globalRouterDestinationsSchema.parse({
    agents: agents.map((agent) => ({ id: agent.id, name: agent.name })),
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
  })
}
