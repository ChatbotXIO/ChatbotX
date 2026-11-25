import { z } from "zod"
import { possibleErrorsOnGeneratingPostText } from "@/lib/orpc/orpc-error-helper"
import {
  workspaceAuthorizedMidddleware,
  workspacePermissionMiddleware,
} from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { generatePostText } from "../lib/generate-post-text"
import {
  checkGeneratePostTextRequest,
  generatePostTextFields,
  generatePostTextResource,
} from "../schema"

/** The composer's session procedure: same function as the public API, behind the `broadcast` page permission. */
export const socialPostsAiAPIs = {
  privateGeneratePostTextAPI: authorizedAPI
    .route({
      method: "POST",
      path: "/workspaces/{workspaceId}/social-posts/ai/generate",
      summary: "Write post text with AI",
      tags: ["Posts"],
    })
    .input(
      generatePostTextFields
        .extend({ workspaceId: z.string() })
        .superRefine(checkGeneratePostTextRequest),
    )
    .output(generatePostTextResource)
    .errors(possibleErrorsOnGeneratingPostText)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .use(
      workspacePermissionMiddleware("broadcast"),
      (input) => input.workspaceId,
    )
    .handler(async ({ context, input }) => {
      const { workspaceId: _workspaceId, ...request } = input
      return await generatePostText({
        actorId: context.user.id,
        request,
        workspace: context.workspace,
      })
    }),
}
