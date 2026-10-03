import {
  type ChannelIntegrationChannel,
  channelIntegrationChannels,
  channelIntegrationService,
  integrationWhatsappService,
  messengerIntegrationService,
} from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import {
  possibleErrorsOnFindingResource,
  possibleErrorsOnListingResource,
  possibleErrorsOnMutatingResource,
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

type HandoverResumeFlowChannel = Extract<
  ChannelIntegrationChannel,
  "whatsapp" | "messenger"
>

type HandoverResumeFlowUpdater = (input: {
  id: string
  workspaceId: string
  handoverResumeFlowId: string | null
}) => Promise<void>

// Channels whose conversation routing can resume a flow when a partner hands
// a conversation back; each service validates the flow is an active flow of
// the workspace.
const handoverResumeFlowUpdaters: Record<
  HandoverResumeFlowChannel,
  HandoverResumeFlowUpdater
> = {
  whatsapp: (input) =>
    integrationWhatsappService.updateHandoverResumeFlow(input),
  messenger: (input) =>
    messengerIntegrationService.updateHandoverResumeFlow(input),
}

/**
 * `PATCH /v1/<channel>-channels/{id}/handover-resume-flow`: sets or clears the
 * flow that runs when a partner hands a conversation back to this app. The
 * builder gates this on super admin; a token has no member, so the `channels`
 * scope replaces that check.
 */
export const createHandoverResumeFlowRoute = (
  channel: HandoverResumeFlowChannel,
) => {
  const label = channelLabels[channel]
  return {
    updateHandoverResumeFlow: workspaceTokenAuthAPI
      .route({
        method: "PATCH",
        path: `/v1/${channel}-channels/{id}/handover-resume-flow` as const,
        summary: `Set ${label} handover resume flow`,
        description: `Sets or clears the flow that runs when a partner app (e.g. Meta AI) hands a ${label} conversation back to this app. Pass \`handoverResumeFlowId: null\` to clear it, in which case the handover only shows its context. The flow must be an active flow of this workspace; find it with \`flows.list\`.`,
        successStatus: 204,
        tags: ["Channels"],
      })
      .input(
        z.object({
          id: zodBigintAsString().describe(
            `${label} channel (integration) id. Get it from the channel list route.`,
          ),
          handoverResumeFlowId: zodBigintAsString()
            .nullable()
            .describe("Flow to run after a handover, or null to clear."),
        }),
      )
      .errors(possibleErrorsOnMutatingResource)
      .handler(async ({ context, input }) => {
        await handoverResumeFlowUpdaters[channel]({
          id: input.id,
          workspaceId: context.workspace.id,
          handoverResumeFlowId: input.handoverResumeFlowId,
        })
      }),
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
