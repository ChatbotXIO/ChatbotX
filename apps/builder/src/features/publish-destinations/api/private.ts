import { z } from "zod"
import { socialAccountOperations } from "@/features/social-accounts/lib/social-account-operations"
import { socialDestinationPublishingSettingsResource } from "@/features/social-accounts/schema"
import { postingScheduleOperations } from "@/features/social-posts/lib/posting-schedule-operations"
import {
  listFreeSlotsRequest,
  listFreeSlotsResponse,
  postingScheduleResource,
  updatePostingScheduleRequest,
  updatePostingScheduleResponse,
} from "@/features/social-posts/schema"
import {
  workspaceAuthorizedMidddleware,
  workspacePermissionMiddleware,
} from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { publishDestinationOperations } from "../lib/operations"
import {
  listPublishDestinationsRequest,
  listPublishDestinationsResponse,
  publishDestinationIdRequest,
  recheckPublishPermissionsRequest,
  recheckPublishPermissionsResponse,
} from "../schema"

const tags = ["Post destinations"]
const inWorkspace = { workspaceId: z.string() }
const base = "/workspaces/{workspaceId}/post-destinations"

/**
 * The Posts page's session procedures. They call the same operations as the
 * public API (`api/public.ts`), behind the `broadcast` page permission.
 */
export const publishDestinationsAPIs = {
  privateListPublishDestinationsAPI: authorizedAPI
    .route({
      method: "GET",
      path: `${base}`,
      summary: "List post destinations",
      tags,
    })
    .input(listPublishDestinationsRequest.extend(inWorkspace))
    .output(listPublishDestinationsResponse)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .use(
      workspacePermissionMiddleware("broadcast"),
      (input) => input.workspaceId,
    )
    .handler(
      async ({ input }) => await publishDestinationOperations.list(input),
    ),

  privateGetPublishingSettingsAPI: authorizedAPI
    .route({
      method: "GET",
      path: `${base}/{id}/publishing-settings`,
      summary: "Get destination publishing settings",
      tags,
    })
    .input(publishDestinationIdRequest.extend(inWorkspace))
    .output(socialDestinationPublishingSettingsResource)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .use(
      workspacePermissionMiddleware("broadcast"),
      (input) => input.workspaceId,
    )
    .handler(
      async ({ input }) =>
        await socialAccountOperations.publishingSettings({
          destinationId: input.id,
          workspaceId: input.workspaceId,
        }),
    ),

  privateGetPostingScheduleAPI: authorizedAPI
    .route({
      method: "GET",
      path: `${base}/{id}/posting-schedule`,
      summary: "Get posting schedule",
      tags,
    })
    .input(publishDestinationIdRequest.extend(inWorkspace))
    .output(postingScheduleResource)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .use(
      workspacePermissionMiddleware("broadcast"),
      (input) => input.workspaceId,
    )
    .handler(
      async ({ input }) =>
        await postingScheduleOperations.get(input.workspaceId, input),
    ),

  privateUpdatePostingScheduleAPI: authorizedAPI
    .route({
      method: "PUT",
      path: `${base}/{id}/posting-schedule`,
      summary: "Set posting schedule",
      tags,
    })
    .input(updatePostingScheduleRequest.extend(inWorkspace))
    .output(updatePostingScheduleResponse)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .use(
      workspacePermissionMiddleware("broadcast"),
      (input) => input.workspaceId,
    )
    .handler(async ({ context, input }) => {
      const { workspaceId: _workspaceId, ...body } = input
      return await postingScheduleOperations.update(context.workspace, body)
    }),

  privateListFreeSlotsAPI: authorizedAPI
    .route({
      method: "GET",
      path: `${base}/{id}/free-slots`,
      summary: "List free posting times",
      tags,
    })
    .input(listFreeSlotsRequest.extend(inWorkspace))
    .output(listFreeSlotsResponse)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .use(
      workspacePermissionMiddleware("broadcast"),
      (input) => input.workspaceId,
    )
    .handler(
      async ({ input }) =>
        await postingScheduleOperations.freeSlots(input.workspaceId, input),
    ),

  privateRecheckPublishPermissionsAPI: authorizedAPI
    .route({
      method: "POST",
      path: `${base}/recheck-permissions`,
      summary: "Re-check publishing permissions",
      tags,
    })
    .input(recheckPublishPermissionsRequest.extend(inWorkspace))
    .output(recheckPublishPermissionsResponse)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .use(
      workspacePermissionMiddleware("broadcast"),
      (input) => input.workspaceId,
    )
    .handler(
      async ({ input }) =>
        await publishDestinationOperations.recheckPermissions(input),
    ),
}
