import { messengerIntegrationService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { possibleErrorsOnMutatingResource } from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPIForScope } from "@/orpc"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("channels")

export const messengerChannelsPublicRouter = {
  updateTagSync: workspaceTokenAuthAPI
    .route({
      method: "PATCH",
      path: "/v1/messenger-channels/{id}/tag-sync",
      summary: "Enable or disable tag sync for a Messenger channel",
      tags: ["Channels"],
    })
    .input(z.object({ id: zodBigintAsString(), enabled: z.boolean() }))
    .output(z.object({ syncTagEnabledAt: z.date().nullable() }))
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const syncTagEnabledAt = await messengerIntegrationService.updateTagSync({
        workspaceId: context.workspace.id,
        integrationId: input.id,
        enabled: input.enabled,
      })
      return { syncTagEnabledAt }
    }),
}
