import {
  possibleErrorsOnCreatingPostSnippet,
  possibleErrorsOnCreatingPostTargetSet,
  possibleErrorsOnDeletingResource,
  possibleErrorsOnFindingResource,
  possibleErrorsOnListingResource,
  possibleErrorsOnMutatingPostSnippet,
  possibleErrorsOnMutatingPostTargetSet,
} from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import {
  postSnippetOperations,
  postTargetSetOperations,
} from "../lib/operations"
import {
  createPostSnippetRequest,
  createPostTargetSetRequest,
  listPostSnippetsRequest,
  listPostSnippetsResponse,
  listPostTargetSetsResponse,
  postSnippetIdRequest,
  postSnippetResource,
  postTargetSetIdRequest,
  postTargetSetResource,
  updatePostSnippetRequest,
  updatePostTargetSetRequest,
} from "../schema"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("posts")
const tags = ["Posts"]

/** Reusable post text: signatures, hashtag sets and plain snippets. */
export const postSnippetsPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/post-snippets",
      summary: "List post snippets",
      description:
        "Lists the workspace's reusable post text (kind `signature`, `hashtags` or `text`), at most 100, in picker order. Give a `signature` id as `signatureId` to `socialPosts.create` to append it to a new post's text.",
      tags,
    })
    .input(listPostSnippetsRequest)
    .output(listPostSnippetsResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(
      async ({ context, input }) =>
        await postSnippetOperations.list(context.workspace.id, input.kind),
    ),

  create: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/post-snippets",
      summary: "Create post snippet",
      description:
        "Creates a snippet. The name must be unique in the workspace (409 `snippetNameTaken`); a workspace can have at most 100. Not allowed in a workspace whose plan has expired.",
      successStatus: 201,
      tags,
    })
    .input(createPostSnippetRequest)
    .output(postSnippetResource)
    .errors(possibleErrorsOnCreatingPostSnippet)
    .handler(
      async ({ context, input }) =>
        await postSnippetOperations.create(context.workspace, input),
    ),

  get: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/post-snippets/{id}",
      summary: "Get post snippet",
      description: "Returns one snippet. Get the id from `postSnippets.list`.",
      tags,
    })
    .input(postSnippetIdRequest)
    .output(postSnippetResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(
      async ({ context, input }) =>
        await postSnippetOperations.get(context.workspace.id, input.id),
    ),

  update: workspaceTokenAuthAPI
    .route({
      method: "PATCH",
      path: "/v1/post-snippets/{id}",
      summary: "Update post snippet",
      description:
        "Changes a snippet's name, text, kind or position. A post already created from it keeps the text it was made with. Not allowed in a workspace whose plan has expired.",
      tags,
    })
    .input(updatePostSnippetRequest)
    .output(postSnippetResource)
    .errors(possibleErrorsOnMutatingPostSnippet)
    .handler(
      async ({ context, input }) =>
        await postSnippetOperations.update(context.workspace, input),
    ),

  delete: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/post-snippets/{id}",
      summary: "Delete post snippet",
      description:
        "Deletes a snippet. Posts already created keep their text. Get the id from `postSnippets.list`.",
      successStatus: 204,
      tags,
    })
    .input(postSnippetIdRequest)
    .errors(possibleErrorsOnDeletingResource)
    .handler(async ({ context, input }) => {
      await postSnippetOperations.delete(context.workspace.id, input.id)
    }),
}

/** Named selections of destinations a composer applies in one step. */
export const postTargetSetsPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/post-target-sets",
      summary: "List post target sets",
      description:
        "Lists the workspace's saved selections of destinations, at most 50, by name, each destination with its current `state`. To post to a set, pass its ready destinations as `targets` to `socialPosts.create` (skip the ones that are not `ready`).",
      tags,
    })
    .output(listPostTargetSetsResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(
      async ({ context }) =>
        await postTargetSetOperations.list(context.workspace.id),
    ),

  create: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/post-target-sets",
      summary: "Create post target set",
      description:
        "Saves a selection of 1 to 30 destinations (ids from `publishDestinations.list`) under a name unique in the workspace (409 `targetSetNameTaken`); a workspace can have at most 50. Not allowed in a workspace whose plan has expired.",
      successStatus: 201,
      tags,
    })
    .input(createPostTargetSetRequest)
    .output(postTargetSetResource)
    .errors(possibleErrorsOnCreatingPostTargetSet)
    .handler(
      async ({ context, input }) =>
        await postTargetSetOperations.create(context.workspace, input),
    ),

  get: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/post-target-sets/{id}",
      summary: "Get post target set",
      description:
        "Returns one set with each destination's current `state`. Get the id from `postTargetSets.list`.",
      tags,
    })
    .input(postTargetSetIdRequest)
    .output(postTargetSetResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(
      async ({ context, input }) =>
        await postTargetSetOperations.get(context.workspace.id, input.id),
    ),

  update: workspaceTokenAuthAPI
    .route({
      method: "PATCH",
      path: "/v1/post-target-sets/{id}",
      summary: "Update post target set",
      description:
        "Renames a set or replaces its destinations. Not allowed in a workspace whose plan has expired.",
      tags,
    })
    .input(updatePostTargetSetRequest)
    .output(postTargetSetResource)
    .errors(possibleErrorsOnMutatingPostTargetSet)
    .handler(
      async ({ context, input }) =>
        await postTargetSetOperations.update(context.workspace, input),
    ),

  delete: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/post-target-sets/{id}",
      summary: "Delete post target set",
      description:
        "Deletes a set; the destinations and posts are not affected. Get the id from `postTargetSets.list`.",
      successStatus: 204,
      tags,
    })
    .input(postTargetSetIdRequest)
    .errors(possibleErrorsOnDeletingResource)
    .handler(async ({ context, input }) => {
      await postTargetSetOperations.delete(context.workspace.id, input.id)
    }),
}
