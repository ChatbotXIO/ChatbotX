import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { pollOperations } from "../lib/operations"
import {
  hasPollUpdateField,
  hasPollUpdateFieldMessage,
  pollBulkDeleteRequest,
  pollFormRequest,
  pollIdRequest,
  pollPatchRequest,
} from "../schema/action"
import {
  bulkDeletePollsResponse,
  listPollsPublicRequest,
  listPollsPublicResponse,
  pollAnalyticsResource,
  pollLinksResource,
  pollResource,
} from "../schema/public"

const tags = ["Polls"]

const workspaceScope = z.object({ workspaceId: zodBigintAsString() })
const byWorkspace = (input: { workspaceId: string }) => input.workspaceId

/**
 * Session-authenticated twin of `pollsPublicRouter` for the dashboard. Every
 * procedure calls the same `pollOperations` the public router does.
 */
export const pollsAuthenticatedAPI = {
  listPollsAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/polls",
      summary: "List polls",
      tags,
    })
    .input(workspaceScope.extend(listPollsPublicRequest.shape))
    .use(workspaceAuthorizedMidddleware, byWorkspace)
    .output(listPollsPublicResponse)
    .handler(async ({ input }) => await pollOperations.list(input)),

  getPollAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/polls/{id}",
      summary: "Get poll",
      tags,
    })
    .input(workspaceScope.extend(pollIdRequest.shape))
    .use(workspaceAuthorizedMidddleware, byWorkspace)
    .output(pollResource)
    .handler(async ({ input }) => await pollOperations.get(input)),

  createPollAPI: authorizedAPI
    .route({
      method: "POST",
      path: "/workspaces/{workspaceId}/polls",
      summary: "Create poll",
      tags,
    })
    .input(workspaceScope.extend(pollFormRequest.shape))
    .use(workspaceAuthorizedMidddleware, byWorkspace)
    .output(pollResource)
    .handler(async ({ input }) => await pollOperations.create(input)),

  updatePollAPI: authorizedAPI
    .route({
      method: "PATCH",
      path: "/workspaces/{workspaceId}/polls/{id}",
      summary: "Update poll",
      tags,
    })
    .input(
      pollPatchRequest
        .extend(workspaceScope.shape)
        .extend(pollIdRequest.shape)
        .refine(hasPollUpdateField, hasPollUpdateFieldMessage),
    )
    .use(workspaceAuthorizedMidddleware, byWorkspace)
    .output(pollResource)
    .handler(async ({ input }) => await pollOperations.update(input)),

  deletePollAPI: authorizedAPI
    .route({
      method: "DELETE",
      path: "/workspaces/{workspaceId}/polls/{id}",
      summary: "Delete poll",
      successStatus: 204,
      tags,
    })
    .input(workspaceScope.extend(pollIdRequest.shape))
    .use(workspaceAuthorizedMidddleware, byWorkspace)
    .handler(async ({ input }) => {
      await pollOperations.delete(input)
    }),

  bulkDeletePollsAPI: authorizedAPI
    .route({
      method: "POST",
      path: "/workspaces/{workspaceId}/polls/bulk-delete",
      summary: "Delete multiple polls",
      tags,
    })
    .input(workspaceScope.extend(pollBulkDeleteRequest.shape))
    .use(workspaceAuthorizedMidddleware, byWorkspace)
    .output(bulkDeletePollsResponse)
    .handler(async ({ input }) => await pollOperations.bulkDelete(input)),

  getPollLinksAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/polls/{id}/links",
      summary: "Get poll links",
      tags,
    })
    .input(workspaceScope.extend(pollIdRequest.shape))
    .use(workspaceAuthorizedMidddleware, byWorkspace)
    .output(pollLinksResource)
    .handler(async ({ input }) => await pollOperations.getLinks(input)),

  getPollAnalyticsAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/polls/{id}/analytics",
      summary: "Get poll analytics",
      tags,
    })
    .input(workspaceScope.extend(pollIdRequest.shape))
    .use(workspaceAuthorizedMidddleware, byWorkspace)
    .output(pollAnalyticsResource)
    .handler(async ({ input }) => await pollOperations.getAnalytics(input)),
}
