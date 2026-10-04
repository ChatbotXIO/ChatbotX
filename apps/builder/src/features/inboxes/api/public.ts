import { inboxService } from "@chatbotx.io/business"
import {
  possibleErrorsOnListingResource,
  possibleErrorsOnMutatingResource,
} from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import { listInboxes } from "../queries"
import {
  publicInboxResource,
  publicListInboxesResponse,
  publicListInboxResponse,
  publishInboxesRequest,
  updateInboxPublicRequest,
} from "../schema/action"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("inbox")

export const inboxesPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/inboxes",
      summary: "List inboxes",
      description:
        "List connected inboxes with their internal IDs. Use `id` as the `inboxId` parameter when sending messages or flows to a contact. The external/platform-side id (e.g. a TikTok username) is available as `sourceId` — the deprecated `inboxes.listChannels` alias returned that value as `id` instead.",
      tags: ["Channels"],
    })
    .input(publishInboxesRequest)
    .output(publicListInboxResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(
      async ({ context, input }) =>
        await listInboxes({
          ...input,
          workspaceId: context.workspace.id,
        }),
    ),

  update: workspaceTokenAuthAPI
    .route({
      method: "PATCH",
      path: "/v1/inboxes/{id}",
      summary: "Update inbox settings",
      description:
        "Changes an inbox setting that applies to every channel. Currently `markReadOnOutbound`: mark the conversation read when a message is sent to it. Read the current value from `inboxes.list`.",
      tags: ["Channels"],
    })
    .input(updateInboxPublicRequest)
    .output(publicInboxResource)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const workspaceId = context.workspace.id
      const inbox =
        input.markReadOnOutbound === undefined
          ? await inboxService.findByIdOrFail({ workspaceId, id: input.id })
          : await inboxService.updateMarkReadOnOutbound({
              workspaceId,
              id: input.id,
              enabled: input.markReadOnOutbound,
            })
      return publicInboxResource.parse(inbox)
    }),

  listChannels: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/channels",
      summary: "List channels",
      description:
        "Deprecated — use `inboxes.list` instead; its `id` is the internal inbox id, while this route returned the external/platform-side id (e.g. a TikTok username) as `id`, now exposed there as `sourceId`. Kept for backward compatibility; hidden from MCP/CLI tool listings.",
      deprecated: true,
      tags: ["Channels"],
    })
    .input(publishInboxesRequest)
    .output(publicListInboxesResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(async ({ context, input }) => {
      const result = await listInboxes({
        ...input,
        workspaceId: context.workspace.id,
      })
      return {
        ...result,
        data: result.data.map(({ sourceId, ...inbox }) => ({
          ...inbox,
          id: sourceId,
        })),
      }
    }),
}
