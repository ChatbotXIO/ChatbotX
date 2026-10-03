import {
  type ChannelIntegrationChannel,
  channelIntegrationChannels,
  channelIntegrationService,
  coexistService,
  integrationWhatsappService,
  messengerIntegrationService,
} from "@chatbotx.io/business"
import {
  ChatbotXException,
  notFoundException,
} from "@chatbotx.io/business/errors"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { triggerSync as triggerWhatsappCoexistSync } from "@/features/integration-whatsapp/lib/coexist-trigger-sync"
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

type CoexistChannel = Extract<
  ChannelIntegrationChannel,
  "whatsapp" | "messenger" | "instagram"
>

const coexistResponse = z.object({
  success: z.boolean(),
  runId: z.string().optional(),
  reason: z.string().optional(),
})

/**
 * `PUT /v1/<channel>-channels/{id}/coexist`: enables or disables coexistence
 * sync (history import) for a channel, through the same services as the
 * builder's toggle.
 */
export const createCoexistRoute = (channel: CoexistChannel) => {
  const label = channelLabels[channel]
  return {
    setCoexist: workspaceTokenAuthAPI
      .route({
        method: "PUT",
        path: `/v1/${channel}-channels/{id}/coexist` as const,
        summary: `Set ${label} coexist sync`,
        description: `Turns coexistence history sync on or off for a ${label} channel. Enabling starts (or reuses) a sync run (\`runId\` is returned for Messenger and Instagram); \`aiReadsSyncedHistory\` lets the AI read the synced history (default false). Disabling stops active runs. Read the current state from the channel list route (\`coexistEnabled\`).`,
        tags: ["Channels"],
      })
      .input(
        z.object({
          id: zodBigintAsString().describe(
            `${label} channel (integration) id. Get it from the channel list route.`,
          ),
          enabled: z.boolean().describe("Whether coexist sync is on."),
          aiReadsSyncedHistory: z
            .boolean()
            .optional()
            .default(false)
            .describe("Only when enabling: let the AI read synced history."),
        }),
      )
      .output(coexistResponse)
      .errors(possibleErrorsOnMutatingResource)
      .handler(async ({ context, input }) => {
        const base = {
          workspaceId: context.workspace.id,
          integrationId: input.id,
        }
        const result =
          channel === "whatsapp"
            ? await integrationWhatsappService.setCoexist({
                ...base,
                enabled: input.enabled,
                aiReadsSyncedHistory: input.aiReadsSyncedHistory,
                triggerSync: triggerWhatsappCoexistSync,
              })
            : await (input.enabled
                ? coexistService.enable({
                    ...base,
                    channel,
                    aiReadsSyncedHistory: input.aiReadsSyncedHistory,
                  })
                : coexistService.disable({ ...base, channel }))
        if (!result.success) {
          const cause = "cause" in result ? result.cause : "notFound"
          const reason = "reason" in result ? result.reason : undefined
          if (cause === "invalidAuth") {
            throw new ChatbotXException(
              "The channel's credentials are invalid: reconnect the channel.",
              "coexistInvalidAuth",
              409,
            )
          }
          if (cause === "triggerRejected" || cause === "triggerThrew") {
            // Coexist is already switched on and its run exists; Meta refused
            // the sync request, which the caller can retry.
            throw new ChatbotXException(
              `Coexist is on, but Meta did not start the sync (${typeof reason === "string" ? reason : cause}). Try again.`,
              "coexistSyncNotStarted",
              502,
            )
          }
          throw notFoundException(
            typeof reason === "string" ? reason : "Channel not found",
          )
        }
        const runId = "runId" in result ? result.runId : undefined
        return {
          success: true,
          runId: typeof runId === "string" ? runId : undefined,
        }
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
