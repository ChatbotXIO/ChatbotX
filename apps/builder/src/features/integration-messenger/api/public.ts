import { messengerIntegrationService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import {
  possibleErrorsOnFindingResource,
  possibleErrorsOnMutatingResource,
} from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import { updateMessenger } from "../lib/update-messenger-settings"
import { findIntegrationMessenger } from "../queries"
import {
  messengerChannelIdSchema,
  messengerSettingsPublicResource,
  updateMessengerSettingsPublicRequest,
} from "../schema/public"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("channels")

export const messengerChannelsPublicRouter = {
  updateTagSync: workspaceTokenAuthAPI
    .route({
      method: "PATCH",
      path: "/v1/messenger-channels/{id}/tag-sync",
      summary: "Enable or disable tag sync for Messenger channel",
      description:
        "Toggles whether this Messenger channel's page tags sync into the workspace as contact tags.",
      tags: ["Channels"],
    })
    .input(
      z.object({
        id: zodBigintAsString().describe(
          "Messenger channel (integration) id. Get it from `integrations.list`.",
        ),
        enabled: z.boolean().describe("Whether tag sync should be enabled."),
      }),
    )
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

  getSettings: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/messenger-channels/{id}/settings",
      summary: "Get Messenger channel settings",
      description:
        "Returns a Messenger page's welcome flow, persistent menu, personas and ice breakers. Call this before `messengerChannels.updateSettings`, which replaces all of them.",
      tags: ["Channels"],
    })
    .input(z.object({ id: messengerChannelIdSchema }))
    .output(messengerSettingsPublicResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) =>
      messengerSettingsPublicResource.parse(
        await findIntegrationMessenger({
          workspaceId: context.workspace.id,
          id: input.id,
        }),
      ),
    ),

  updateSettings: workspaceTokenAuthAPI
    .route({
      method: "PUT",
      path: "/v1/messenger-channels/{id}/settings",
      summary: "Replace Messenger channel settings",
      description:
        "Saves a Messenger page's welcome flow, persistent menu, personas and ice breakers, and pushes them to Facebook. Replaces every field, so read them with `messengerChannels.getSettings` first.",
      successStatus: 204,
      tags: ["Channels"],
    })
    .input(updateMessengerSettingsPublicRequest)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const { id, ...settings } = input
      await updateMessenger({ workspaceId: context.workspace.id, id }, settings)
    }),
}
