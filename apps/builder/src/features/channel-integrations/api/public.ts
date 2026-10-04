import {
  CapiTestEventError,
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
import { CAPI_TEST_MESSAGING_ID_MAX_LENGTH } from "@chatbotx.io/utils/meta-capi"
import { z } from "zod"
import { triggerSync as triggerWhatsappCoexistSync } from "@/features/integration-whatsapp/lib/coexist-trigger-sync"
import {
  saveCapiDataset,
  saveCapiTestEventCodeFor,
  sendCapiTestEventFor,
} from "@/features/meta-conversions/lib/capi-operations"
import {
  possibleErrorsOnFindingResource,
  possibleErrorsOnListingResource,
  possibleErrorsOnMutatingResource,
  possibleErrorsOnSendingCapiTestEvent,
  possibleErrorsOnSettingCoexist,
} from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import {
  channelIntegrationIdRequest,
  channelIntegrationResource,
} from "../schema/resource"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("channels")

const channelListOperations: Record<ChannelIntegrationChannel, string> = {
  whatsapp: "whatsappChannels.list",
  messenger: "messengerChannels.list",
  instagram: "instagramChannels.list",
  tiktok: "tiktokChannels.list",
  zalo: "zaloChannels.list",
}

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
  const listOperation = channelListOperations[channel]
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
            `${label} channel (integration) id. Get it from \`${listOperation}\`.`,
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

const coexistRunResource = z.object({
  id: z.string(),
  status: z
    .string()
    .describe(
      "init, running, waiting, succeeded, partial or failed (a live run is init, running or waiting). Error details stay in the builder.",
    ),
  startedAt: z.date().nullable(),
  finishedAt: z.date().nullable(),
  totalScan: z.number().describe("Items planned (e.g. conversations)."),
  currentScan: z.number().describe("Items processed so far."),
  currentStep: z.string().nullable().describe("Human-readable progress."),
  syncProgress: z
    .number()
    .describe("Meta's history progress, 0-100 (100 = Meta finished pushing)."),
  importedContactCount: z.number(),
  importedMessageCount: z.number(),
  skippedCount: z.number(),
  failedCount: z.number(),
})

const coexistStatusResponse = z.object({
  run: coexistRunResource
    .nullable()
    .describe("The newest sync run, or null if none has run yet."),
})

/**
 * `PUT /v1/<channel>-channels/{id}/coexist`: enables or disables coexistence
 * sync (history import) for a channel, through the same services as the
 * builder's toggle.
 */
export const createCoexistRoute = (channel: CoexistChannel) => {
  const label = channelLabels[channel]
  const listOperation = channelListOperations[channel]
  return {
    getCoexistStatus: workspaceTokenAuthAPI
      .route({
        method: "GET",
        path: `/v1/${channel}-channels/{id}/coexist` as const,
        summary: `Get ${label} coexist sync status`,
        description: `Returns the newest history-sync run of a ${label} channel with its progress and counters, or \`run: null\` if it never ran. Poll it after \`${channel}Channels.setCoexist\` returned a \`runId\` (Messenger and Instagram only).`,
        tags: ["Channels"],
      })
      .input(
        z.object({
          id: zodBigintAsString().describe(
            `${label} channel (integration) id. Get it from \`${listOperation}\`.`,
          ),
        }),
      )
      .output(coexistStatusResponse)
      .errors(possibleErrorsOnFindingResource)
      .handler(async ({ context, input }) => {
        const base = {
          workspaceId: context.workspace.id,
          integrationId: input.id,
          channel,
        }
        if (!(await coexistService.findIntegrationForCoexist(base))) {
          throw notFoundException("Channel not found")
        }
        const run = await coexistService.findLatestRun(base)
        return { run: run ? coexistRunResource.parse(run) : null }
      }),

    setCoexist: workspaceTokenAuthAPI
      .route({
        method: "PUT",
        path: `/v1/${channel}-channels/{id}/coexist` as const,
        summary: `Set ${label} coexist sync`,
        description: `Turns coexistence history sync on or off for a ${label} channel. Enabling starts (or reuses) a sync run (\`runId\` is returned for Messenger and Instagram); \`aiReadsSyncedHistory\` lets the AI read the synced history (default false). Disabling stops active runs. Read the current state from \`${listOperation}\` (\`coexistEnabled\`).`,
        tags: ["Channels"],
      })
      .input(
        z.object({
          id: zodBigintAsString().describe(
            `${label} channel (integration) id. Get it from \`${listOperation}\`.`,
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
      .errors(possibleErrorsOnSettingCoexist)
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
          throw notFoundException("Channel not found")
        }
        const runId = "runId" in result ? result.runId : undefined
        return {
          success: true,
          runId: typeof runId === "string" ? runId : undefined,
        }
      }),
  }
}

type CapiChannel = Extract<
  ChannelIntegrationChannel,
  "whatsapp" | "messenger" | "instagram"
>

const capiTestEventErrorMessages: Record<string, string> = {
  testEventCodeRequired:
    "Save a test event code first (`setCapiTestEventCode` of the same channel group), then send a test event.",
  capiDisconnected:
    "Conversions API is disconnected for this channel. Save a dataset to reconnect it.",
  invalidMessagingId: "`messagingId` is not a valid messaging id.",
}

const TEST_EVENT_CODE_PATTERN = /^[A-Za-z0-9_-]*$/

const capiSuccessResponse = z.object({ success: z.literal(true) })

/**
 * Meta Conversions API routes of a channel: dataset selection, the Events
 * Manager test event code and a sample test event. Provisioning a dataset,
 * disconnecting and custom connect stay private (they handle credentials).
 */
export const createCapiRoutes = (channel: CapiChannel) => {
  const label = channelLabels[channel]
  const listOperation = channelListOperations[channel]
  const base = `/v1/${channel}-channels/{id}/capi` as const
  const idParam = z.object({
    id: zodBigintAsString().describe(
      `${label} channel (integration) id. Get it from \`${listOperation}\`.`,
    ),
  })
  return {
    setCapiDataset: workspaceTokenAuthAPI
      .route({
        method: "PUT",
        path: `${base}/dataset` as const,
        summary: `Set ${label} CAPI dataset`,
        description: `Selects the Meta dataset used for Conversions API events on a ${label} channel. The dataset is validated with Meta using the channel's token, then stored, and a disconnected Conversions API is reconnected. Read the current \`datasetId\` and \`hasCapiScope\` from \`${listOperation}\`.`,
        successStatus: 204,
        tags: ["Channels"],
      })
      .input(
        idParam.extend({
          datasetId: z
            .string()
            .trim()
            .min(1)
            .describe("Meta dataset (pixel) id from Events Manager."),
        }),
      )
      .errors(possibleErrorsOnMutatingResource)
      .handler(async ({ context, input }) => {
        await saveCapiDataset({
          channel,
          workspaceId: context.workspace.id,
          integrationId: input.id,
          datasetId: input.datasetId,
        })
      }),

    setCapiTestEventCode: workspaceTokenAuthAPI
      .route({
        method: "PUT",
        path: `${base}/test-event-code` as const,
        summary: `Set ${label} CAPI test event code`,
        description: `Sets (or clears with null) the Events Manager test_event_code. While it is set, every Conversions API event of this channel goes to the dataset's Test Events view instead of production, so clear it when you are done testing.`,
        successStatus: 204,
        tags: ["Channels"],
      })
      .input(
        idParam.extend({
          testEventCode: z
            .string()
            .trim()
            .max(64)
            .regex(TEST_EVENT_CODE_PATTERN)
            .nullable()
            .describe(
              "The Test Events code (e.g. TEST12345); null or empty clears it.",
            ),
        }),
      )
      .errors(possibleErrorsOnMutatingResource)
      .handler(async ({ context, input }) => {
        await saveCapiTestEventCodeFor({
          channel,
          workspaceId: context.workspace.id,
          integrationId: input.id,
          testEventCode: input.testEventCode?.length
            ? input.testEventCode
            : null,
        })
      }),

    sendCapiTestEvent: workspaceTokenAuthAPI
      .route({
        method: "POST",
        path: `${base}/test-event` as const,
        summary: `Send ${label} CAPI test event`,
        description: `Posts one sample Purchase to Meta for the given messaging id so it shows up under Events Manager → Test events. Needs a saved test event code (\`${channel}Channels.setCapiTestEventCode\`) and a connected Conversions API. If the channel has no dataset yet, one is created at Meta and saved first, exactly as in the builder.`,
        tags: ["Channels"],
      })
      .input(
        idParam.extend({
          messagingId: z
            .string()
            .trim()
            .min(1)
            .max(CAPI_TEST_MESSAGING_ID_MAX_LENGTH)
            .describe(
              "The contact's messaging id (phone number, PSID or IGSID) to attribute the sample event to.",
            ),
        }),
      )
      .output(capiSuccessResponse)
      .errors(possibleErrorsOnSendingCapiTestEvent)
      .handler(async ({ context, input }) => {
        try {
          await sendCapiTestEventFor({
            channel,
            workspaceId: context.workspace.id,
            integrationId: input.id,
            messagingId: input.messagingId,
          })
        } catch (error) {
          if (error instanceof CapiTestEventError) {
            throw new ChatbotXException(
              capiTestEventErrorMessages[error.reason] ?? error.reason,
              "capiTestEventRefused",
              422,
            )
          }
          throw error
        }
        return { success: true as const }
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
