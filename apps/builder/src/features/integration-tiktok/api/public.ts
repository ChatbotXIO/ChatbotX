import { tiktokIntegrationService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import {
  possibleErrorsOnFindingResource,
  possibleErrorsOnMutatingResource,
} from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPIForScope } from "@/orpc"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("channels")

const tiktokChannelIdSchema = zodBigintAsString().describe(
  "TikTok channel (integration) id. Get it from `tiktokChannels.list`.",
)

const commentToMessageStatusSchema = z
  .enum(["ENABLE", "DISABLE"])
  .nullable()
  .describe(
    "Comment-to-Message state on TikTok, or null when TikTok did not say.",
  )

export const tiktokChannelsPublicRouter = {
  getCommentToMessage: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/tiktok-channels/{id}/comment-to-message",
      summary: "Get TikTok Comment-to-Message state",
      description:
        "Reads, live from TikTok, whether Comment-to-Message (DMing people who comment) is on for this account; it can be changed in the TikTok app too. Use `tiktokChannels.updateCommentToMessage` to change it.",
      tags: ["Channels"],
    })
    .input(z.object({ id: tiktokChannelIdSchema }))
    .output(z.object({ status: commentToMessageStatusSchema }))
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) => ({
      status: await tiktokIntegrationService.refreshCommentToMessage({
        workspaceId: context.workspace.id,
        id: input.id,
      }),
    })),

  updateCommentToMessage: workspaceTokenAuthAPI
    .route({
      method: "PATCH",
      path: "/v1/tiktok-channels/{id}/comment-to-message",
      summary: "Enable or disable TikTok Comment-to-Message",
      description:
        "Turns Comment-to-Message on or off for a TikTok account. TikTok only allows it for eligible accounts (region, age, business account, messaging permissions) and its rejection reason is returned as-is. Check the result with `tiktokChannels.getCommentToMessage`.",
      tags: ["Channels"],
    })
    .input(
      z.object({
        id: tiktokChannelIdSchema,
        enabled: z
          .boolean()
          .describe("Whether Comment-to-Message should be on."),
      }),
    )
    .output(z.object({ status: commentToMessageStatusSchema }))
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => ({
      status: await tiktokIntegrationService.setCommentToMessage({
        workspaceId: context.workspace.id,
        id: input.id,
        enabled: input.enabled,
      }),
    })),
}
