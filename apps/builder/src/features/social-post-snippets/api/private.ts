import { z } from "zod"
import {
  workspaceAuthorizedMidddleware,
  workspacePermissionMiddleware,
} from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
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

const tags = ["Posts"]
const inWorkspace = { workspaceId: z.string() }
const base = "/workspaces/{workspaceId}"

/**
 * The Posts page's session procedures for snippets and sets: the public
 * request shape plus the workspace id, the same operations, behind the
 * `broadcast` page permission.
 */
export const postSnippetsAPIs = {
  privateListPostSnippetsAPI: authorizedAPI
    .route({
      method: "GET",
      path: `${base}/post-snippets`,
      summary: "List post snippets",
      tags,
    })
    .input(listPostSnippetsRequest.extend(inWorkspace))
    .output(listPostSnippetsResponse)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .use(
      workspacePermissionMiddleware("broadcast"),
      (input) => input.workspaceId,
    )
    .handler(
      async ({ input }) =>
        await postSnippetOperations.list(input.workspaceId, input.kind),
    ),

  privateCreatePostSnippetAPI: authorizedAPI
    .route({
      method: "POST",
      path: `${base}/post-snippets`,
      summary: "Create post snippet",
      tags,
    })
    .input(createPostSnippetRequest.extend(inWorkspace))
    .output(postSnippetResource)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .use(
      workspacePermissionMiddleware("broadcast"),
      (input) => input.workspaceId,
    )
    .handler(async ({ context, input }) => {
      const { workspaceId: _workspaceId, ...body } = input
      return await postSnippetOperations.create(context.workspace, body)
    }),

  privateUpdatePostSnippetAPI: authorizedAPI
    .route({
      method: "PATCH",
      path: `${base}/post-snippets/{id}`,
      summary: "Update post snippet",
      tags,
    })
    .input(updatePostSnippetRequest.extend(inWorkspace))
    .output(postSnippetResource)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .use(
      workspacePermissionMiddleware("broadcast"),
      (input) => input.workspaceId,
    )
    .handler(async ({ context, input }) => {
      const { workspaceId: _workspaceId, ...body } = input
      return await postSnippetOperations.update(context.workspace, body)
    }),

  privateDeletePostSnippetAPI: authorizedAPI
    .route({
      method: "DELETE",
      path: `${base}/post-snippets/{id}`,
      summary: "Delete post snippet",
      successStatus: 204,
      tags,
    })
    .input(postSnippetIdRequest.extend(inWorkspace))
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .use(
      workspacePermissionMiddleware("broadcast"),
      (input) => input.workspaceId,
    )
    .handler(async ({ input }) => {
      await postSnippetOperations.delete(input.workspaceId, input.id)
    }),

  privateListPostTargetSetsAPI: authorizedAPI
    .route({
      method: "GET",
      path: `${base}/post-target-sets`,
      summary: "List post target sets",
      tags,
    })
    .input(z.object(inWorkspace))
    .output(listPostTargetSetsResponse)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .use(
      workspacePermissionMiddleware("broadcast"),
      (input) => input.workspaceId,
    )
    .handler(
      async ({ input }) =>
        await postTargetSetOperations.list(input.workspaceId),
    ),

  privateCreatePostTargetSetAPI: authorizedAPI
    .route({
      method: "POST",
      path: `${base}/post-target-sets`,
      summary: "Create post target set",
      tags,
    })
    .input(createPostTargetSetRequest.extend(inWorkspace))
    .output(postTargetSetResource)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .use(
      workspacePermissionMiddleware("broadcast"),
      (input) => input.workspaceId,
    )
    .handler(async ({ context, input }) => {
      const { workspaceId: _workspaceId, ...body } = input
      return await postTargetSetOperations.create(context.workspace, body)
    }),

  privateUpdatePostTargetSetAPI: authorizedAPI
    .route({
      method: "PATCH",
      path: `${base}/post-target-sets/{id}`,
      summary: "Update post target set",
      tags,
    })
    .input(updatePostTargetSetRequest.extend(inWorkspace))
    .output(postTargetSetResource)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .use(
      workspacePermissionMiddleware("broadcast"),
      (input) => input.workspaceId,
    )
    .handler(async ({ context, input }) => {
      const { workspaceId: _workspaceId, ...body } = input
      return await postTargetSetOperations.update(context.workspace, body)
    }),

  privateDeletePostTargetSetAPI: authorizedAPI
    .route({
      method: "DELETE",
      path: `${base}/post-target-sets/{id}`,
      summary: "Delete post target set",
      successStatus: 204,
      tags,
    })
    .input(postTargetSetIdRequest.extend(inWorkspace))
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .use(
      workspacePermissionMiddleware("broadcast"),
      (input) => input.workspaceId,
    )
    .handler(async ({ input }) => {
      await postTargetSetOperations.delete(input.workspaceId, input.id)
    }),
}
