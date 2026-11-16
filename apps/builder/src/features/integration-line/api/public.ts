import { lineIntegrationService } from "@chatbotx.io/business"
import { z } from "zod"
import {
  possibleErrorsOnConnectingLine,
  possibleErrorsOnDeletingResource,
  possibleErrorsOnFindingResource,
  possibleErrorsOnListingResource,
  possibleErrorsOnMutatingResource,
} from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import { connectLine } from "../lib/connect-line"
import { disconnectLineChannel, testLineWebhook } from "../lib/manage-line"
import { toLineChannelResource } from "../lib/to-line-channel-resource"
import { connectLineRequest, lineChannelIdRequest } from "../schema/request"
import {
  connectLineResponse,
  lineChannelResource,
  testLineWebhookResponse,
} from "../schema/resource"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("channels")

export const lineChannelsPublicRouter = {
  connect: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/line-channels",
      summary: "Connect LINE channel",
      description:
        'Connects a LINE Official Account (Messaging API channel) to this workspace from its Channel ID and Channel secret, both found in the LINE Developers console. Registers the webhook on the channel and returns the inbox id plus the webhook status. If `webhook.active` is false, switch on "Use webhook" in the LINE Developers console. Use `lineChannels.testWebhook` to re-check.',
      successStatus: 201,
      tags: ["Channels"],
    })
    .input(connectLineRequest)
    .output(connectLineResponse)
    .errors(possibleErrorsOnConnectingLine)
    .handler(async ({ context, input }) => {
      const result = await connectLine({
        workspaceId: context.workspace.id,
        user: null,
        channelId: input.channelId,
        channelSecret: input.channelSecret,
      })
      return {
        id: result.integrationId,
        inboxId: result.inboxId,
        name: result.name,
        basicId: result.basicId,
        webhook: result.webhook,
      }
    }),

  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/line-channels",
      summary: "List LINE channels",
      description:
        "Lists the connected LINE channels of this workspace with the ids other routes need (integration id, inbox id). Credentials are never returned.",
      tags: ["Channels"],
    })
    .output(z.object({ data: z.array(lineChannelResource) }))
    .errors(possibleErrorsOnListingResource)
    .handler(async ({ context }) => {
      const rows = await lineIntegrationService.listByWorkspace({
        workspaceId: context.workspace.id,
      })
      return { data: rows.map(toLineChannelResource) }
    }),

  get: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/line-channels/{id}",
      summary: "Get LINE channel",
      description:
        "Returns one connected LINE channel. Get its id from `lineChannels.list`.",
      tags: ["Channels"],
    })
    .input(lineChannelIdRequest)
    .output(lineChannelResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) =>
      toLineChannelResource(
        await lineIntegrationService.findById({
          id: input.id,
          workspaceId: context.workspace.id,
        }),
      ),
    ),

  delete: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/line-channels/{id}",
      summary: "Disconnect LINE channel",
      description:
        "Disconnects a LINE channel and its inbox. The LINE webhook URL is left in place; events for the removed channel are ignored. Get the id from `lineChannels.list`.",
      successStatus: 204,
      tags: ["Channels"],
    })
    .input(lineChannelIdRequest)
    .errors(possibleErrorsOnDeletingResource)
    .handler(async ({ context, input }) => {
      await disconnectLineChannel({
        workspaceId: context.workspace.id,
        id: input.id,
      })
    }),

  testWebhook: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/line-channels/{id}/test-webhook",
      summary: "Test LINE webhook",
      description:
        "Asks LINE to send a test event to the channel's webhook and reports whether this app received it, plus whether the console's \"Use webhook\" toggle is on (`active`). Get the id from `lineChannels.list`. Does not send messages or use quota.",
      tags: ["Channels"],
    })
    .input(lineChannelIdRequest)
    .output(testLineWebhookResponse)
    .errors(possibleErrorsOnMutatingResource)
    .handler(({ context, input }) =>
      testLineWebhook({ workspaceId: context.workspace.id, id: input.id }),
    ),
}
