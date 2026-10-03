import { zaloIntegrationService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { possibleErrorsOnMutatingResource } from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPIForScope } from "@/orpc"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("channels")

export const zaloChannelsPublicRouter = {
  updateTagSync: workspaceTokenAuthAPI
    .route({
      method: "PATCH",
      path: "/v1/zalo-channels/{id}/tag-sync",
      summary: "Enable or disable tag sync for Zalo channel",
      description:
        "Toggles whether this Zalo channel's tags sync into the workspace as contact tags.",
      tags: ["Channels"],
    })
    .input(
      z.object({
        id: zodBigintAsString().describe(
          "Zalo channel (integration) id. Get it from `integrations.list`.",
        ),
        enabled: z.boolean().describe("Whether tag sync should be enabled."),
      }),
    )
    .output(z.object({ syncTagEnabledAt: z.date().nullable() }))
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const syncTagEnabledAt = await zaloIntegrationService.updateTagSync({
        workspaceId: context.workspace.id,
        integrationId: input.id,
        enabled: input.enabled,
      })
      return { syncTagEnabledAt }
    }),
}
