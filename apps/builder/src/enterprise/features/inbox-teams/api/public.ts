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

const inboxTeamIdPathParam = z.object({ id: zodBigintAsString() })

export const inboxTeamsPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/teams",
      summary: "List teams",
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
      summary: "Get a team by id",
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
      summary: "Create a team",
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
      method: "PUT",
      path: "/v1/teams/{id}",
      summary: "Update a team",
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
      summary: "Delete a team",
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
      summary: "Add members to a team",
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
      summary: "Remove members from a team",
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
