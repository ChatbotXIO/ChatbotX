import { postTopicService } from "@chatbotx.io/business"
import {
  possibleErrorsOnCreatingPostTopic,
  possibleErrorsOnDeletingResource,
  possibleErrorsOnListingResource,
  possibleErrorsOnMutatingPostTopic,
} from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import {
  createPostTopicRequest,
  listPostTopicsRequest,
  listPostTopicsResponse,
  postTopicIdRequest,
  postTopicResource,
  updatePostTopicRequest,
} from "../schema"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("posts")
const tags = ["Posts"]

export const postTopicsPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/post-topics",
      summary: "List post topics",
      description:
        "Lists the workspace's post topics (labels that group posts), ordered by name, at most 200. Use the ids to filter or label posts in `channelPostManagement`.",
      tags,
    })
    .input(listPostTopicsRequest)
    .output(listPostTopicsResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(
      async ({ context, input }) =>
        await postTopicService.list({
          ...input,
          workspaceId: context.workspace.id,
        }),
    ),

  create: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/post-topics",
      summary: "Create post topic",
      description:
        "Creates a topic. The name must be unique in the workspace (409 `topicNameTaken` otherwise); a workspace can have at most 200 topics.",
      tags,
    })
    .input(createPostTopicRequest)
    .output(postTopicResource)
    .errors(possibleErrorsOnCreatingPostTopic)
    .handler(
      async ({ context, input }) =>
        await postTopicService.create({
          ...input,
          workspaceId: context.workspace.id,
        }),
    ),

  update: workspaceTokenAuthAPI
    .route({
      method: "PATCH",
      path: "/v1/post-topics/{id}",
      summary: "Update post topic",
      description:
        "Renames or recolors a topic. Get the id from `postTopics.list`.",
      tags,
    })
    .input(updatePostTopicRequest)
    .output(postTopicResource)
    .errors(possibleErrorsOnMutatingPostTopic)
    .handler(
      async ({ context, input }) =>
        await postTopicService.update({
          ...input,
          workspaceId: context.workspace.id,
        }),
    ),

  delete: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/post-topics/{id}",
      summary: "Delete post topic",
      description:
        "Deletes a topic and removes it from every post that carried it. Get the id from `postTopics.list`.",
      successStatus: 204,
      tags,
    })
    .input(postTopicIdRequest)
    .errors(possibleErrorsOnDeletingResource)
    .handler(async ({ context, input }) => {
      await postTopicService.delete({
        id: input.id,
        workspaceId: context.workspace.id,
      })
    }),
}
