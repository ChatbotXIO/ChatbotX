import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { possibleErrorsOnFindingResource } from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import { createBotSimulatorLink } from "../lib/create-simulator-link"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("channels")

export const botSimulatorPublicRouter = {
  getLink: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/bot-simulator/link",
      summary: "Get bot simulator link",
      description:
        "Returns a shareable link that opens the given website with a webchat widget on top, to preview the bot on a real page. The webchat must be enabled and the website on its allowed domains. Get webchat ids from `webchats.list`.",
      tags: ["Bot Simulator"],
    })
    .input(
      z.object({
        webchatId: zodBigintAsString().describe(
          "Webchat id to show on the page. Get it from `webchats.list`.",
        ),
        websiteUrl: z
          .string()
          .trim()
          .max(2000)
          .describe(
            "Absolute http(s) URL of the website to preview the webchat on, e.g. `https://example.com/pricing`.",
          ),
      }),
    )
    .output(
      z.object({
        url: z
          .string()
          .describe("Bot simulator link; anyone with it can open the preview."),
      }),
    )
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) => ({
      url: await createBotSimulatorLink({
        workspaceId: context.workspace.id,
        webchatId: input.webchatId,
        websiteUrl: input.websiteUrl,
      }),
    })),
}
