import { z } from "zod"
import {
  possibleErrorsOnFindingResource,
  possibleErrorsOnMutatingResource,
} from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import { updateInstagram } from "../lib/update-instagram-settings"
import { findIntegrationInstagram } from "../queries"
import {
  instagramChannelIdSchema,
  instagramSettingsPublicResource,
  updateInstagramSettingsPublicRequest,
} from "../schema/public"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("channels")

export const instagramChannelsPublicRouter = {
  getSettings: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/instagram-channels/{id}/settings",
      summary: "Get Instagram channel settings",
      description:
        "Returns an Instagram account's welcome flow, ice breakers and persistent menu. Call this before `instagramChannels.updateSettings`, which replaces all of them.",
      tags: ["Channels"],
    })
    .input(z.object({ id: instagramChannelIdSchema }))
    .output(instagramSettingsPublicResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) =>
      instagramSettingsPublicResource.parse(
        await findIntegrationInstagram({
          workspaceId: context.workspace.id,
          id: input.id,
        }),
      ),
    ),

  updateSettings: workspaceTokenAuthAPI
    .route({
      method: "PUT",
      path: "/v1/instagram-channels/{id}/settings",
      summary: "Replace Instagram channel settings",
      description:
        "Saves an Instagram account's welcome flow, ice breakers and persistent menu, and pushes them to Instagram. Replaces every field, so read them with `instagramChannels.getSettings` first.",
      successStatus: 204,
      tags: ["Channels"],
    })
    .input(updateInstagramSettingsPublicRequest)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const { id, ...settings } = input
      await updateInstagram({ workspaceId: context.workspace.id, id }, settings)
    }),
}
