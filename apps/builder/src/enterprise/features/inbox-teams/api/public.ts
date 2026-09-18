import { inboxTeamService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import {
  possibleErrorsOnCreatingResource,
  possibleErrorsOnDeletingResource,
  possibleErrorsOnFindingResource,
  possibleErrorsOnListingResource,
  possibleErrorsOnMutatingResource,
} from "@/lib/orpc/orpc-error-helper"
import { paginateInMemory, publicListRequest } from "@/lib/public-api/list"
import { assertWorkspaceNotBlocked } from "@/lib/workspace-quota"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import { listInboxTeams } from "../queries"
import {
  addInboxTeamMemberRequest,
  createInboxTeamRequest,
  publicListInboxTeamsResponse,
  updateInboxTeamRequest,
} from "../schema/action"
import { inboxTeamResource } from "../schema/resource"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("inbox")

const inboxTeamIdPathParam = z.object({
  id: zodBigintAsString().describe("Team id. Get it from `inboxTeams.list`."),
})

export const inboxTeamsPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/teams",
      summary: "List teams",
      description:
        "Use this to find inbox-team ids before inspecting one with `inboxTeams.get` or assigning a conversation to it. Returns the teams in this workspace.",
      tags: ["Teams"],
    })
    .input(publicListRequest)
    .output(publicListInboxTeamsResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(async ({ context, input }) => {
      const { data } = await listInboxTeams({
        workspaceId: context.workspace.id,
      })
      return paginateInMemory(data, input)
    }),

  get: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/teams/{id}",
      summary: "Get team",
      description:
        "Returns one inbox team and its members. Use `inboxTeams.list` to find its id first.",
      tags: ["Teams"],
    })
    .input(inboxTeamIdPathParam)
    .output(inboxTeamResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(
      async ({ context, input }) =>
        await inboxTeamService.findByIdOrFail({
          workspaceId: context.workspace.id,
          inboxTeamId: input.id,
        }),
    ),

  create: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/teams",
      summary: "Create team",
      description:
        "Adds an inbox team that a conversation can be assigned to. Use `inboxTeams.list` first to avoid duplicating an existing team.",
      successStatus: 201,
      tags: ["Teams"],
    })
    .input(createInboxTeamRequest)
    .output(inboxTeamResource)
    .errors(possibleErrorsOnCreatingResource)
    .handler(async ({ context, input }) => {
      await assertWorkspaceNotBlocked(context.workspace.ownerId)
      return await inboxTeamService.create({
        workspaceId: context.workspace.id,
        data: input,
      })
    }),

  update: workspaceTokenAuthAPI
    .route({
      method: "PATCH",
      path: "/v1/teams/{id}",
      summary: "Update team",
      description:
        "Changes an inbox team's settings. Call `inboxTeams.get` to inspect current values first.",
      tags: ["Teams"],
    })
    .input(updateInboxTeamRequest.and(inboxTeamIdPathParam))
    .output(inboxTeamResource)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      await assertWorkspaceNotBlocked(context.workspace.ownerId)
      const { id, ...data } = input
      return await inboxTeamService.update(
        { workspaceId: context.workspace.id, inboxTeamId: id },
        data,
      )
    }),

  delete: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/teams/{id}",
      summary: "Delete team",
      description:
        "Permanently deletes an inbox team. Use `inboxTeams.list` to find its id first.",
      successStatus: 204,
      tags: ["Teams"],
    })
    .input(inboxTeamIdPathParam)
    .errors(possibleErrorsOnDeletingResource)
    .handler(async ({ context, input }) => {
      await inboxTeamService.delete({
        workspaceId: context.workspace.id,
        ids: [input.id],
      })
    }),

  addMembers: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/teams/{id}/members",
      summary: "Add members to team",
      description:
        "Adds the given user ids to an inbox team's membership. Use `inboxTeams.removeMembers` to remove them.",
      tags: ["Teams"],
    })
    .input(addInboxTeamMemberRequest.and(inboxTeamIdPathParam))
    .output(inboxTeamResource)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      await assertWorkspaceNotBlocked(context.workspace.ownerId)
      return await inboxTeamService.addMembers(
        { workspaceId: context.workspace.id, inboxTeamId: input.id },
        input.userIds,
      )
    }),

  removeMembers: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/teams/{id}/members",
      summary: "Remove members from team",
      description:
        "Removes the given user ids from an inbox team's membership. Use `inboxTeams.addMembers` to add them.",
      tags: ["Teams"],
    })
    .input(addInboxTeamMemberRequest.and(inboxTeamIdPathParam))
    .output(inboxTeamResource)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) =>
      inboxTeamService.removeMembersByUserIds(
        { workspaceId: context.workspace.id, inboxTeamId: input.id },
        input.userIds,
      ),
    ),
}
