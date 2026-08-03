import { zodBigintAsString } from "@chatbotx.io/utils"
import z from "zod"
import { withWorkspaceIdSchema } from "@/features/workspaces/schema/resource"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { createIgStory } from "../actions/create-ig-story.action"
import { deleteIgStory } from "../actions/delete-ig-story.action"
import { updateIgStory } from "../actions/update-ig-story.action"
import { listIgStories } from "../queries"
import {
  listInstagramFacebookStories,
  listInstagramLoginStories,
} from "../queries/instagram-stories"
import {
  createIgStoryRequest,
  igStoryVariants,
  listIgStoriesRequest,
  listIgStoriesResponse,
  updateIgStoryRequest,
} from "../schema/action"
import { igStoryResource } from "../schema/resource"

export const igStoriesPrivateAPI = {
  listIgStoriesAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/ig-stories",
      summary: "List Instagram Story Automations",
      tags: ["IG Stories"],
    })
    .input(listIgStoriesRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(listIgStoriesResponse)
    .handler(async ({ input }) => await listIgStories(input)),

  createIgStoryAPI: authorizedAPI
    .route({
      method: "POST",
      path: "/workspaces/{workspaceId}/ig-stories",
      summary: "Create Instagram Story Automation",
      tags: ["IG Stories"],
    })
    .input(createIgStoryRequest.and(withWorkspaceIdSchema))
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(igStoryResource)
    .handler(async ({ input }) => {
      const { workspaceId, ...rest } = input
      return await createIgStory(workspaceId, rest)
    }),

  updateIgStoryAPI: authorizedAPI
    .route({
      method: "PUT",
      path: "/workspaces/{workspaceId}/ig-stories/{id}",
      summary: "Update Instagram Story Automation",
      tags: ["IG Stories"],
    })
    .input(
      updateIgStoryRequest
        .and(withWorkspaceIdSchema)
        .and(z.object({ id: zodBigintAsString() })),
    )
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(igStoryResource)
    .handler(async ({ input }) => {
      const { workspaceId, id, ...rest } = input
      return await updateIgStory({ workspaceId, id }, rest)
    }),

  deleteIgStoryAPI: authorizedAPI
    .route({
      method: "DELETE",
      path: "/workspaces/{workspaceId}/ig-stories/{id}",
      summary: "Delete Instagram Story Automation",
      tags: ["IG Stories"],
    })
    .input(withWorkspaceIdSchema.and(z.object({ id: zodBigintAsString() })))
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(z.void())
    .handler(async ({ input }) => {
      await deleteIgStory({ workspaceId: input.workspaceId, id: input.id })
    }),

  instagramStoriesAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/ig-stories/instagram-stories",
      summary: "List Instagram stories for IG Story Automation",
      tags: ["IG Stories"],
    })
    .input(withWorkspaceIdSchema.and(z.object({ variant: igStoryVariants })))
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(
      z.object({
        stories: z.array(
          z.object({
            id: z.string(),
            message: z.string().optional(),
            full_picture: z.string().optional(),
            created_time: z.string(),
            permalink_url: z.string().optional(),
            accountId: z.string(),
          }),
        ),
        pages: z.array(z.object({ id: z.string(), name: z.string() })),
      }),
    )
    .handler(async ({ input }) =>
      input.variant === "instagram"
        ? await listInstagramLoginStories(input.workspaceId)
        : await listInstagramFacebookStories(input.workspaceId),
    ),
}
