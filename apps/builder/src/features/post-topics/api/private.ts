import { postTopicService } from "@chatbotx.io/business"
import { z } from "zod"
import {
  workspaceAuthorizedMidddleware,
  workspacePermissionMiddleware,
} from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import {
  createPostTopicRequest,
  listPostTopicsRequest,
  listPostTopicsResponse,
  postTopicResource,
} from "../schema"

const tags = ["Posts"]
const inWorkspace = { workspaceId: z.string() }
const base = "/workspaces/{workspaceId}"

/**
 * The Posts page's session-authed topic procedures. Spread into the
 * `channelPostManagementAPIs` router so the procedure names and RPC paths stay
 * stable for the UI.
 */
export const postTopicPrivateAPIs = {
  privateListPostTopicsAPI: authorizedAPI
    .route({
      method: "GET",
      path: `${base}/post-topics`,
      summary: "List post topics",
      tags,
    })
    .input(listPostTopicsRequest.extend(inWorkspace))
    .output(listPostTopicsResponse)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .use(
      workspacePermissionMiddleware("broadcast"),
      (input) => input.workspaceId,
    )
    .handler(
      async ({ input }) =>
        await postTopicService.list({
          search: input.search,
          workspaceId: input.workspaceId,
        }),
    ),

  privateCreatePostTopicAPI: authorizedAPI
    .route({
      method: "POST",
      path: `${base}/post-topics`,
      summary: "Create a post topic",
      tags,
    })
    .input(createPostTopicRequest.extend(inWorkspace))
    .output(postTopicResource)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .use(
      workspacePermissionMiddleware("broadcast"),
      (input) => input.workspaceId,
    )
    .handler(
      async ({ input }) =>
        await postTopicService.create({
          color: input.color,
          name: input.name,
          workspaceId: input.workspaceId,
        }),
    ),
}
