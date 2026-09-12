import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import {
  possibleErrorsOnCreatingResource,
  possibleErrorsOnDeletingResource,
  possibleErrorsOnListingResource,
  possibleErrorsOnMutatingResource,
} from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import { createIgStory } from "../actions/create-ig-story.action"
import { deleteIgStory } from "../actions/delete-ig-story.action"
import { updateIgStory } from "../actions/update-ig-story.action"
import { listIgStories } from "../queries"
import {
  createIgStoryPublicRequest,
  igStoryPublicResource,
  listIgStoriesPublicRequest,
  listIgStoriesPublicResponse,
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
        await listIgStories({
          ...input,
          workspaceId: context.workspace.id,
        }),
    ),

  create: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/ig-stories",
      summary: "Create Instagram Story Automation",
      tags: ["IG Stories"],
    })
    .input(createIgStoryPublicRequest)
    .output(igStoryPublicResource)
    .errors(possibleErrorsOnCreatingResource)
    .handler(
      async ({ context, input }) =>
        await createIgStory(context.workspace.id, input),
    ),

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
      const { id, ...data } = input
      return await updateIgStory(
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
    .input(z.object({ id: zodBigintAsString() }))
    .errors(possibleErrorsOnDeletingResource)
    .handler(async ({ context, input }) => {
      await deleteIgStory({ workspaceId: context.workspace.id, id: input.id })
    }),
}
