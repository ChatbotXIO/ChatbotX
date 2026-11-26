import { z } from "zod"
import {
  workspaceAuthorizedMidddleware,
  workspacePermissionMiddleware,
} from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import {
  SOCIAL_POST_PREVIEW_POST_PATH,
  SOCIAL_POST_RECURRENCE_PAUSE_POST_PATH,
  SOCIAL_POST_UNSCHEDULE_POST_PATH,
} from "../lib/api-paths"
import { socialPostOperations } from "../lib/social-post-operations"
import {
  countSocialPostsRequest,
  countSocialPostsResponse,
  createSocialPostRequest,
  deleteSocialPostRequest,
  deleteSocialPostResponse,
  listSocialPostContentTypesResponse,
  listSocialPostOccurrencesRequest,
  listSocialPostOccurrencesResponse,
  listSocialPostsRequest,
  listSocialPostsResponse,
  previewSocialPostRequest,
  previewSocialPostResponse,
  rescheduleSocialPostRequest,
  resolveSocialPostTargetRequest,
  setSocialPostOccurrencesSkippedRequest,
  socialPostIdRequest,
  socialPostRecurrenceResource,
  socialPostResource,
  socialPostTargetIdRequest,
  unscheduleSocialPostRequest,
  updateSocialPostRequest,
} from "../schema"

const tags = ["Posts"]
const inWorkspace = { workspaceId: z.string() }
const base = "/workspaces/{workspaceId}"

/** A member's session composes: the post records who. */
const memberAuthor = (userId: string) =>
  ({ createdById: userId, createdVia: "ui" }) as const

/**
 * The Posts page's session procedures. Each parses the public request shape
 * plus the workspace id and calls the same operation, behind the `broadcast`
 * page permission.
 */
export const socialPostsAPIs = {
  privateCreateSocialPostAPI: authorizedAPI
    .route({
      method: "POST",
      path: `${base}/social-posts`,
      summary: "Create post",
      tags,
    })
    .input(createSocialPostRequest.extend(inWorkspace))
    .output(socialPostResource)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .use(
      workspacePermissionMiddleware("broadcast"),
      (input) => input.workspaceId,
    )
    .handler(async ({ context, input }) => {
      const { workspaceId: _workspaceId, ...body } = input
      return await socialPostOperations.create(
        context.workspace,
        memberAuthor(context.user.id),
        body,
      )
    }),

  privateListSocialPostsAPI: authorizedAPI
    .route({
      method: "GET",
      path: `${base}/social-posts`,
      summary: "List posts",
      tags,
    })
    .input(listSocialPostsRequest.extend(inWorkspace))
    .output(listSocialPostsResponse)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .use(
      workspacePermissionMiddleware("broadcast"),
      (input) => input.workspaceId,
    )
    .handler(async ({ input }) => {
      const { workspaceId, ...filters } = input
      return await socialPostOperations.list(workspaceId, filters)
    }),

  privateCountSocialPostsAPI: authorizedAPI
    .route({
      method: "GET",
      path: `${base}/social-posts/counts`,
      summary: "Count posts by state",
      tags,
    })
    .input(countSocialPostsRequest.extend(inWorkspace))
    .output(countSocialPostsResponse)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .use(
      workspacePermissionMiddleware("broadcast"),
      (input) => input.workspaceId,
    )
    .handler(async ({ input }) => {
      const { workspaceId, ...filters } = input
      return await socialPostOperations.counts(workspaceId, filters)
    }),

  privatePreviewSocialPostAPI: authorizedAPI
    .route({
      method: "POST",
      path: SOCIAL_POST_PREVIEW_POST_PATH,
      summary: "Preview post",
      tags,
    })
    .input(previewSocialPostRequest.extend(inWorkspace))
    .output(previewSocialPostResponse)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .use(
      workspacePermissionMiddleware("broadcast"),
      (input) => input.workspaceId,
    )
    .handler(async ({ input }) => {
      const { workspaceId, ...content } = input
      return await socialPostOperations.preview(workspaceId, content)
    }),

  privateListSocialPostContentTypesAPI: authorizedAPI
    .route({
      method: "GET",
      path: `${base}/social-posts/content-types`,
      summary: "List post content types",
      tags,
    })
    .input(z.object(inWorkspace))
    .output(listSocialPostContentTypesResponse)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .use(
      workspacePermissionMiddleware("broadcast"),
      (input) => input.workspaceId,
    )
    .handler(() => socialPostOperations.contentTypes()),

  privateGetSocialPostAPI: authorizedAPI
    .route({
      method: "GET",
      path: `${base}/social-posts/{id}`,
      summary: "Get post",
      tags,
    })
    .input(socialPostIdRequest.extend(inWorkspace))
    .output(socialPostResource)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .use(
      workspacePermissionMiddleware("broadcast"),
      (input) => input.workspaceId,
    )
    .handler(
      async ({ input }) =>
        await socialPostOperations.get(input.workspaceId, input.id),
    ),

  privateUpdateSocialPostAPI: authorizedAPI
    .route({
      method: "PATCH",
      path: `${base}/social-posts/{id}`,
      summary: "Update post",
      tags,
    })
    .input(updateSocialPostRequest.extend(inWorkspace))
    .output(socialPostResource)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .use(
      workspacePermissionMiddleware("broadcast"),
      (input) => input.workspaceId,
    )
    .handler(async ({ context, input }) => {
      const { workspaceId: _workspaceId, ...changes } = input
      return await socialPostOperations.update(context.workspace, changes)
    }),

  privateDeleteSocialPostAPI: authorizedAPI
    .route({
      method: "DELETE",
      path: `${base}/social-posts/{id}`,
      summary: "Delete post",
      successStatus: 200,
      tags,
    })
    .input(deleteSocialPostRequest.extend(inWorkspace))
    .output(deleteSocialPostResponse)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .use(
      workspacePermissionMiddleware("broadcast"),
      (input) => input.workspaceId,
    )
    .handler(
      async ({ context, input }) =>
        await socialPostOperations.delete(context.workspace, {
          id: input.id,
          removeFromChannels: input.removeFromChannels,
        }),
    ),

  privateDuplicateSocialPostAPI: authorizedAPI
    .route({
      method: "POST",
      path: `${base}/social-posts/{id}/duplicate`,
      summary: "Duplicate post",
      successStatus: 201,
      tags,
    })
    .input(socialPostIdRequest.extend(inWorkspace))
    .output(socialPostResource)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .use(
      workspacePermissionMiddleware("broadcast"),
      (input) => input.workspaceId,
    )
    .handler(
      async ({ context, input }) =>
        await socialPostOperations.duplicate(
          context.workspace,
          memberAuthor(context.user.id),
          input.id,
        ),
    ),

  privateRescheduleSocialPostAPI: authorizedAPI
    .route({
      method: "POST",
      path: `${base}/social-posts/{id}/reschedule`,
      summary: "Reschedule post",
      tags,
    })
    .input(rescheduleSocialPostRequest.extend(inWorkspace))
    .output(socialPostResource)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .use(
      workspacePermissionMiddleware("broadcast"),
      (input) => input.workspaceId,
    )
    .handler(async ({ context, input }) => {
      const { workspaceId: _workspaceId, ...change } = input
      return await socialPostOperations.reschedule(context.workspace, change)
    }),

  privateUnscheduleSocialPostAPI: authorizedAPI
    .route({
      method: "POST",
      path: SOCIAL_POST_UNSCHEDULE_POST_PATH,
      summary: "Unschedule post",
      tags,
    })
    .input(unscheduleSocialPostRequest.extend(inWorkspace))
    .output(socialPostResource)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .use(
      workspacePermissionMiddleware("broadcast"),
      (input) => input.workspaceId,
    )
    .handler(async ({ context, input }) => {
      const { workspaceId: _workspaceId, ...request } = input
      return await socialPostOperations.unschedule(context.workspace, request)
    }),

  privateRetrySocialPostTargetAPI: authorizedAPI
    .route({
      method: "POST",
      path: `${base}/social-posts/{id}/targets/{targetId}/retry`,
      summary: "Retry post target",
      tags,
    })
    .input(socialPostTargetIdRequest.extend(inWorkspace))
    .output(socialPostResource)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .use(
      workspacePermissionMiddleware("broadcast"),
      (input) => input.workspaceId,
    )
    .handler(async ({ context, input }) => {
      const { workspaceId: _workspaceId, ...target } = input
      return await socialPostOperations.retryTarget(context.workspace, target)
    }),

  privateResolveSocialPostTargetAPI: authorizedAPI
    .route({
      method: "POST",
      path: `${base}/social-posts/{id}/targets/{targetId}/resolve`,
      summary: "Resolve post target waiting for review",
      tags,
    })
    .input(resolveSocialPostTargetRequest.extend(inWorkspace))
    .output(socialPostResource)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .use(
      workspacePermissionMiddleware("broadcast"),
      (input) => input.workspaceId,
    )
    .handler(async ({ context, input }) => {
      const { workspaceId: _workspaceId, ...resolution } = input
      return await socialPostOperations.resolveTarget(
        context.workspace,
        resolution,
      )
    }),

  privateEndSocialPostRecurrenceAPI: authorizedAPI
    .route({
      method: "DELETE",
      path: `${base}/social-posts/{id}/recurrence`,
      summary: "End post repeat series",
      tags,
    })
    .input(socialPostIdRequest.extend(inWorkspace))
    .output(socialPostRecurrenceResource)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .use(
      workspacePermissionMiddleware("broadcast"),
      (input) => input.workspaceId,
    )
    .handler(async ({ context, input }) => {
      const { workspaceId: _workspaceId, ...request } = input
      return await socialPostOperations.endRecurrence(
        context.workspace.id,
        request,
      )
    }),

  privatePauseSocialPostRecurrenceAPI: authorizedAPI
    .route({
      method: "POST",
      path: SOCIAL_POST_RECURRENCE_PAUSE_POST_PATH,
      summary: "Pause post repeat series",
      tags,
    })
    .input(socialPostIdRequest.extend(inWorkspace))
    .output(socialPostRecurrenceResource)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .use(
      workspacePermissionMiddleware("broadcast"),
      (input) => input.workspaceId,
    )
    .handler(async ({ context, input }) => {
      const { workspaceId: _workspaceId, ...request } = input
      return await socialPostOperations.pauseRecurrence(
        context.workspace.id,
        request,
      )
    }),

  privateResumeSocialPostRecurrenceAPI: authorizedAPI
    .route({
      method: "POST",
      path: `${base}/social-posts/{id}/recurrence/resume`,
      summary: "Resume post repeat series",
      tags,
    })
    .input(socialPostIdRequest.extend(inWorkspace))
    .output(socialPostRecurrenceResource)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .use(
      workspacePermissionMiddleware("broadcast"),
      (input) => input.workspaceId,
    )
    .handler(async ({ context, input }) => {
      const { workspaceId: _workspaceId, ...request } = input
      return await socialPostOperations.resumeRecurrence(
        context.workspace,
        request,
      )
    }),

  privateListSocialPostOccurrencesAPI: authorizedAPI
    .route({
      method: "GET",
      path: `${base}/social-posts/{id}/recurrence/occurrences`,
      summary: "List post repeat runs",
      tags,
    })
    .input(listSocialPostOccurrencesRequest.extend(inWorkspace))
    .output(listSocialPostOccurrencesResponse)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .use(
      workspacePermissionMiddleware("broadcast"),
      (input) => input.workspaceId,
    )
    .handler(async ({ input }) => {
      const { workspaceId, ...request } = input
      return await socialPostOperations.listOccurrences(workspaceId, request)
    }),

  privateSkipSocialPostOccurrencesAPI: authorizedAPI
    .route({
      method: "POST",
      path: `${base}/social-posts/{id}/recurrence/occurrences/skip`,
      summary: "Skip post repeat runs",
      tags,
    })
    .input(setSocialPostOccurrencesSkippedRequest.extend(inWorkspace))
    .output(socialPostRecurrenceResource)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .use(
      workspacePermissionMiddleware("broadcast"),
      (input) => input.workspaceId,
    )
    .handler(async ({ context, input }) => {
      const { workspaceId: _workspaceId, ...request } = input
      return await socialPostOperations.skipOccurrences(
        context.workspace,
        request,
      )
    }),

  privateRestoreSocialPostOccurrencesAPI: authorizedAPI
    .route({
      method: "POST",
      path: `${base}/social-posts/{id}/recurrence/occurrences/restore`,
      summary: "Restore skipped post repeat runs",
      tags,
    })
    .input(setSocialPostOccurrencesSkippedRequest.extend(inWorkspace))
    .output(socialPostRecurrenceResource)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .use(
      workspacePermissionMiddleware("broadcast"),
      (input) => input.workspaceId,
    )
    .handler(async ({ context, input }) => {
      const { workspaceId: _workspaceId, ...request } = input
      return await socialPostOperations.restoreOccurrences(
        context.workspace,
        request,
      )
    }),
}
