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
    .handler(
      async ({ context, input }) =>
        await inboxTeamService.create({
          workspaceId: context.workspace.id,
          data: input,
        }),
    ),

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
      const workspaceId = context.workspace.id
      const { id, ...data } = input
      await inboxTeamService.update({ workspaceId, inboxTeamId: id }, data)
      return await inboxTeamService.findByIdOrFail({
        workspaceId,
        inboxTeamId: id,
      })
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
      const workspaceId = context.workspace.id
      await inboxTeamService.addMembers(
        { workspaceId, inboxTeamId: input.id },
        input.userIds,
      )
      return await inboxTeamService.findByIdOrFail({
        workspaceId,
        inboxTeamId: input.id,
      })
    }),

  removeMembers: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/teams/{id}/members",
      summary: "Remove members from a team",
      tags: ["Teams"],
    })
    .input(
      z
        .object({ memberIds: z.array(zodBigintAsString()) })
        .and(inboxTeamIdPathParam),
    )
    .output(inboxTeamResource)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const workspaceId = context.workspace.id
      await inboxTeamService.removeMembers(
        { workspaceId, inboxTeamId: input.id },
        input.memberIds,
      )
      return await inboxTeamService.findByIdOrFail({
        workspaceId,
        inboxTeamId: input.id,
      })
    }),
}
