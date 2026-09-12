import { igStoryAutomationService } from "@chatbotx.io/business"
import {
  possibleErrorsOnCreatingResource,
  possibleErrorsOnDeletingResource,
  possibleErrorsOnFindingResource,
  possibleErrorsOnListingResource,
  possibleErrorsOnMutatingResource,
} from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import {
  listInstagramFacebookStories,
  listInstagramLoginStories,
} from "../lib/instagram-stories"
import {
  createIgStoryPublicRequest,
  deleteIgStoryPublicRequest,
  getIgStoryPublicRequest,
  igStoryPublicResource,
  listIgStoriesPublicRequest,
  listIgStoriesPublicResponse,
  listInstagramStoriesPublicRequest,
  listInstagramStoriesPublicResponse,
  updateIgStoryPublicRequest,
} from "../schema/public"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("automation")

export const igStoriesPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/ig-stories",
      summary: "List Instagram Story Automations",
      tags: ["IG Stories"],
    })
    .input(listIgStoriesPublicRequest)
    .output(listIgStoriesPublicResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(
      async ({ context, input }) =>
        await igStoryAutomationService.list({
          ...input,
          workspaceId: context.workspace.id,
          includeAllFolders: true,
        }),
    ),

  get: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/ig-stories/{id}",
      summary: "Get a specific Instagram Story Automation",
      tags: ["IG Stories"],
    })
    .input(getIgStoryPublicRequest)
    .output(igStoryPublicResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(
      async ({ context, input }) =>
        await igStoryAutomationService.findOrFail({
          workspaceId: context.workspace.id,
          id: input.id,
        }),
    ),

  create: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/ig-stories",
      summary: "Create Instagram Story Automation",
      successStatus: 201,
      tags: ["IG Stories"],
    })
    .input(createIgStoryPublicRequest)
    .output(igStoryPublicResource)
    .errors(possibleErrorsOnCreatingResource)
    .handler(async ({ context, input }) => {
      const { type, ...data } = input
      return await igStoryAutomationService.create({
        workspaceId: context.workspace.id,
        type,
        data,
      })
    }),

  update: workspaceTokenAuthAPI
    .route({
      method: "PUT",
      path: "/v1/ig-stories/{id}",
      summary: "Update Instagram Story Automation",
      tags: ["IG Stories"],
    })
    .input(updateIgStoryPublicRequest)
    .output(igStoryPublicResource)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const { id, type: _type, ...data } = input
      return await igStoryAutomationService.update(
        { workspaceId: context.workspace.id, id },
        data,
      )
    }),

  delete: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/ig-stories/{id}",
      summary: "Delete Instagram Story Automation",
      successStatus: 204,
      tags: ["IG Stories"],
    })
    .input(deleteIgStoryPublicRequest)
    .errors(possibleErrorsOnDeletingResource)
    .handler(async ({ context, input }) => {
      await igStoryAutomationService.delete({
        workspaceId: context.workspace.id,
        id: input.id,
      })
    }),

  listStories: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/ig-stories/instagram-stories",
      summary: "List Instagram stories eligible for IG story automation",
      tags: ["IG Stories"],
    })
    .input(listInstagramStoriesPublicRequest)
    .output(listInstagramStoriesPublicResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(async ({ context, input }) =>
      input.variant === "instagram"
        ? await listInstagramLoginStories(context.workspace.id)
        : await listInstagramFacebookStories(context.workspace.id),
    ),
}
