import { fbCommentAutomationService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import z from "zod"
import { withWorkspaceIdSchema } from "@/features/workspaces/schema/resource"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import {
  listInstagramFacebookMedia,
  listInstagramLoginMedia,
} from "../lib/instagram-media"
import {
  createIgCommentRequest,
  igCommentVariants,
  listIgCommentsRequest,
  listIgCommentsResponse,
  updateIgCommentRequest,
} from "../schema/action"
import { igCommentResource } from "../schema/resource"

export const igCommentsPrivateAPI = {
  listIgCommentsAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/ig-comments",
      summary: "List Instagram Comment Automations",
      tags: ["IG Comments"],
    })
    .input(listIgCommentsRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(listIgCommentsResponse)
    .handler(
      async ({ input }) =>
        await fbCommentAutomationService.listIgComments(input),
    ),

  createIgCommentAPI: authorizedAPI
    .route({
      method: "POST",
      path: "/workspaces/{workspaceId}/ig-comments",
      summary: "Create Instagram Comment Automation",
      tags: ["IG Comments"],
    })
    .input(createIgCommentRequest.and(withWorkspaceIdSchema))
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(igCommentResource)
    .handler(async ({ input }) => {
      const { workspaceId, type, ...data } = input
      return await fbCommentAutomationService.createInstagram({
        workspaceId,
        type,
        data,
      })
    }),

  updateIgCommentAPI: authorizedAPI
    .route({
      method: "PUT",
      path: "/workspaces/{workspaceId}/ig-comments/{id}",
      summary: "Update Instagram Comment Automation",
      tags: ["IG Comments"],
    })
    .input(
      updateIgCommentRequest
        .and(withWorkspaceIdSchema)
        .and(z.object({ id: zodBigintAsString() })),
    )
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(igCommentResource)
    .handler(async ({ input }) => {
      const { workspaceId, id, type: _type, ...rest } = input
      return await fbCommentAutomationService.updateInstagram(
        { workspaceId, id },
        rest,
      )
    }),

  deleteIgCommentAPI: authorizedAPI
    .route({
      method: "DELETE",
      path: "/workspaces/{workspaceId}/ig-comments/{id}",
      summary: "Delete Instagram Comment Automation",
      tags: ["IG Comments"],
    })
    .input(withWorkspaceIdSchema.and(z.object({ id: zodBigintAsString() })))
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(z.void())
    .handler(async ({ input }) => {
      await fbCommentAutomationService.deleteInstagram({
        workspaceId: input.workspaceId,
        id: input.id,
      })
    }),

  instagramMediaAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/ig-comments/instagram-media",
      summary: "List Instagram media for IG Comment Automation",
      tags: ["IG Comments"],
    })
    .input(withWorkspaceIdSchema.and(z.object({ variant: igCommentVariants })))
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(
      z.object({
        posts: z.array(
          z.object({
            id: z.string(),
            message: z.string().optional(),
            full_picture: z.string().optional(),
            created_time: z.string(),
            permalink_url: z.string().optional(),
            media_product_type: z.string().optional(),
            accountId: z.string(),
          }),
        ),
        pages: z.array(z.object({ id: z.string(), name: z.string() })),
      }),
    )
    .handler(async ({ input }) =>
      input.variant === "instagram"
        ? await listInstagramLoginMedia(input.workspaceId)
        : await listInstagramFacebookMedia(input.workspaceId),
    ),
}
