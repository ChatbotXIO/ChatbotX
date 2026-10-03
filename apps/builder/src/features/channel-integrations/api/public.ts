import {
  type ChannelIntegrationChannel,
  channelIntegrationChannels,
  channelIntegrationService,
} from "@chatbotx.io/business"
import { z } from "zod"
import {
  possibleErrorsOnFindingResource,
  possibleErrorsOnListingResource,
} from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import {
  channelIntegrationIdRequest,
  channelIntegrationResource,
} from "../schema/resource"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("channels")

const channelLabels: Record<ChannelIntegrationChannel, string> = {
  whatsapp: "WhatsApp",
  messenger: "Messenger",
  instagram: "Instagram",
  zalo: "Zalo",
  tiktok: "TikTok",
}

/**
 * Read routes (`list`, `get`) for one channel's integrations, mounted under
 * its `/v1/<channel>-channels` path. Never exposes credentials.
 */
export const createChannelReadRoutes = (channel: ChannelIntegrationChannel) => {
  const label = channelLabels[channel]
  const basePath = `/v1/${channel}-channels` as const
  return {
    list: workspaceTokenAuthAPI
      .route({
        method: "GET",
        path: basePath,
        summary: `List ${label} channels`,
        description: `Lists the connected ${label} channels of this workspace with the ids other routes need (integration id, inbox id, account id). Credentials are never returned.`,
        tags: ["Channels"],
      })
      .output(z.array(channelIntegrationResource))
      .errors(possibleErrorsOnListingResource)
      .handler(
        async ({ context }) =>
          await channelIntegrationService.list({
            workspaceId: context.workspace.id,
            channel,
          }),
      ),
    get: workspaceTokenAuthAPI
      .route({
        method: "GET",
        path: `${basePath}/{id}`,
        summary: `Get ${label} channel`,
        description: `Returns one connected ${label} channel. Find its id with the list route.`,
        tags: ["Channels"],
      })
      .input(channelIntegrationIdRequest)
      .output(channelIntegrationResource)
      .errors(possibleErrorsOnFindingResource)
      .handler(
        async ({ context, input }) =>
          await channelIntegrationService.get({
            workspaceId: context.workspace.id,
            channel,
            id: input.id,
          }),
      ),
  }
}

export const channelIntegrationsPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/channel-integrations",
      summary: "List channel integrations",
      description:
        "Lists connected WhatsApp, Messenger, Instagram, Zalo and TikTok channels with the ids other routes need (integration id, inbox id, account id, CAPI and tag-sync state). Pass `channel` to narrow. Credentials are never returned.",
      tags: ["Channels"],
    })
    .input(
      z.object({
        channel: channelIntegrationChannels
          .optional()
          .describe("Only this channel. Omit for every connected channel."),
      }),
    )
    .output(z.array(channelIntegrationResource))
    .errors(possibleErrorsOnListingResource)
    .handler(
      async ({ context, input }) =>
        await channelIntegrationService.list({
          workspaceId: context.workspace.id,
          channel: input.channel,
        }),
    ),
}
