import { z } from "zod"
import {
  possibleErrorsOnDeletingResource,
  possibleErrorsOnFindingResource,
  possibleErrorsOnMutatingResource,
} from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import { disconnectInstagram } from "../actions/disconnect-instagram"
import { updateInstagram } from "../lib/update-instagram-settings"
import { findIntegrationInstagram } from "../queries"
import {
  instagramChannelIdSchema,
  instagramSettingsPublicResource,
  patchInstagramSettingsPublicRequest,
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
        "Returns an Instagram account's welcome flow, ice breakers and persistent menu. Use `instagramChannels.patchSettings` to change some of them, or `instagramChannels.updateSettings` to replace all of them.",
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
        "Saves an Instagram account's welcome flow, ice breakers and persistent menu, and pushes them to Instagram. Replaces every field, so read them with `instagramChannels.getSettings` first, or use `instagramChannels.patchSettings` to change only some.",
      successStatus: 204,
      tags: ["Channels"],
    })
    .input(updateInstagramSettingsPublicRequest)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const { id, ...settings } = input
      await updateInstagram({ workspaceId: context.workspace.id, id }, settings)
    }),

  patchSettings: workspaceTokenAuthAPI
    .route({
      method: "PATCH",
      path: "/v1/instagram-channels/{id}/settings",
      summary: "Update Instagram channel settings",
      description:
        "Changes only the settings you send (welcome flow, ice breakers, persistent menu, mark-read) and keeps the others as saved, then pushes them to Instagram. Use `instagramChannels.updateSettings` to replace everything at once.",
      successStatus: 204,
      tags: ["Channels"],
    })
    .input(patchInstagramSettingsPublicRequest)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const { id, ...changes } = input
      const workspaceId = context.workspace.id
      const saved = instagramSettingsPublicResource.parse(
        await findIntegrationInstagram({ workspaceId, id }),
      )
      await updateInstagram(
        { workspaceId, id },
        {
          ...saved,
          ...Object.fromEntries(
            Object.entries(changes).filter(([, value]) => value !== undefined),
          ),
        },
      )
    }),

  disconnect: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/instagram-channels/{id}",
      summary: "Disconnect Instagram channel",
      description:
        "Disconnects an Instagram account from this workspace, as the Disconnect button in Settings → Channels does: unsubscribes it from Instagram (unless its Facebook Page is still connected to Messenger here), ends its running history sync and removes its Conversions API events; a running contact scan stops at its next page. Contacts and conversations are kept. Works on a trial-expired workspace. A Meta error other than an already revoked token fails the request; retry it. Find its id with `instagramChannels.list`.",
      successStatus: 204,
      tags: ["Channels"],
    })
    .input(z.object({ id: instagramChannelIdSchema }))
    .errors(possibleErrorsOnDeletingResource)
    .handler(async ({ context, input }) => {
      await disconnectInstagram({
        workspaceId: context.workspace.id,
        integrationInstagramId: input.id,
      })
    }),
}
